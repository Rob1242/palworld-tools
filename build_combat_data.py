import json

from js_data_writer import write_js_consts

DEX_PATH = "palworld_dex_data.json"
BREEDING_PATH = "palworld_breeding_data.json"
LEARNSET_PATH = "game_data/pals_learnset.json"
SKILLS_PATH = "game_data/skills.json"
SKILLS_JP_PATH = "game_data/skills_jp.json"
JS_OUTPUT_PATH = "game_data/combat_data.js"
JSON_OUTPUT_PATH = "palworld_combat_data.json"

# ===== 「1体最強ビルド」計算の前提(理想値、いずれもゲーム内で実際に到達可能な上限) =====
# 6章の優先タスク「戦闘計算式の確定」を受けて、3.14で確定した瞬間火力の式
# (瞬間火力 = 威力 × 攻撃力 × 属性増加 × 属性一致 × パートナー補正)のうち、
# ユーザー指示により「相手属性を指定しない、個体としてのDPSに集中する」設計とした。
# そのため属性増加(相手属性による有利/不利)は含めず、属性一致(STAB, ×1.2)のみを採用。
# パートナー補正(手持ちパルからのバフ等)も個体単体の評価から外れるため対象外。
REF_LEVEL = 80  # 現行の実質上限レベル
IV_PCT = 1.00  # 才能値100(0.3%刻みで最大+30%、3.2参照)
STAR_ATK_PCT = 0.20  # 濃縮★4、戦闘ステータス上限+20%(3.3参照)
SOUL_ATK_PCT = 0.60  # ソウル強化上限+60%(3.4、天落アップデートで30%→60%に拡張済み)
STAB_MULT = 1.2  # 属性一致ボーナス(3.7・3.14で複数ソース一致、確度高)
MIN_CYCLE_SECONDS = 2.5  # 技と技の間の実機AIラグ下限。palworld-lab.comの火力指数計算機が
# 「技と技の間の待機時間、実機計測では2〜3秒程度」として採用している値を踏襲。
# これが無いとCT1〜2秒の技(パルの本来の「基本技」に近い性質の技)がDPS指数で
# 不自然に過大評価されるため、単純な威力÷CTではなく威力÷max(CT, 2.5)とする。

# 攻撃力を伸ばすパッシブの理想4枠(3.6・3.14で確認済みの上位4種、додаток防御/HP等の
# デメリットはDPS指数には影響しないため無視して純粋に攻撃%が高い順に採用)。
# 「諸刃の聖剣」「破壊神」は世界樹パッシブ(手術台で移植可能)。
IDEAL_ATTACK_PASSIVES_PCT = 0.50 + 0.40 + 0.30 + 0.30  # 諸刃の聖剣+破壊神+鬼神+脳筋 = +150%


def compute_ideal_attack(species_shot_attack):
    base = (100 + species_shot_attack * 0.075 * REF_LEVEL * (1 + IV_PCT)) * (1 + STAR_ATK_PCT) * (1 + SOUL_ATK_PCT)
    return base * (1 + IDEAL_ATTACK_PASSIVES_PCT)


def main():
    dex = json.load(open(DEX_PATH, encoding="utf-8"))
    dex_by_id = {p["id"]: p for p in dex}

    breeding = json.load(open(BREEDING_PATH, encoding="utf-8"))
    asset_by_dex_id = {}
    for asset, info in breeding["pals"].items():
        if info.get("dex_id"):
            asset_by_dex_id.setdefault(info["dex_id"], asset)

    learnset = json.load(open(LEARNSET_PATH, encoding="utf-8"))["learnset"]
    skills_by_asset = {s["asset"]: s for s in json.load(open(SKILLS_PATH, encoding="utf-8"))["skills"]}
    skills_jp = json.load(open(SKILLS_JP_PATH, encoding="utf-8"))["active_skills"]

    results = []
    no_stats = 0
    no_learnset = 0
    no_valid_skill = 0

    for p in dex:
        if not p.get("stats"):
            no_stats += 1
            continue
        asset = asset_by_dex_id.get(p["id"])
        if not asset or asset not in learnset:
            no_learnset += 1
            continue

        pal_types = set(t for t in [p["stats"]["type1"], p["stats"]["type2"]] if t and t != "None")
        ideal_attack = compute_ideal_attack(p["stats"]["shot_attack"])

        candidates = []
        for entry in learnset[asset]:
            if entry["source"] != "levelup":
                continue
            waza_asset = entry["WazaID"].replace("EPalWazaID::", "")
            skill = skills_by_asset.get(waza_asset)
            if not skill or not skill.get("power") or not skill.get("cooldown"):
                continue
            stab = STAB_MULT if skill["element"] in pal_types else 1.0
            effective_cycle = max(skill["cooldown"], MIN_CYCLE_SECONDS)
            dps_proxy = skill["power"] * ideal_attack * stab / effective_cycle
            jp = skills_jp.get(waza_asset)
            candidates.append({
                "asset": waza_asset,
                "jp_name": jp["jp_name"] if jp else None,
                "en_name": skill["name"],
                "element": skill["element"],
                "power": skill["power"],
                "cooldown": skill["cooldown"],
                "level": entry.get("level"),
                "stab": stab == STAB_MULT,
                "dps_proxy": round(dps_proxy, 1),
            })

        if not candidates:
            no_valid_skill += 1
            continue

        candidates.sort(key=lambda c: -c["dps_proxy"])
        best = candidates[0]

        results.append({
            "dex_id": p["id"],
            "name": p["name"],
            "en_name": p["en_name"],
            "icon": p["icon"],
            "types": p["types"],
            "ideal_attack": round(ideal_attack, 1),
            "best_skill": best,
            "skills": candidates,
        })

    results.sort(key=lambda r: -r["best_skill"]["dps_proxy"])

    json.dump(results, open(JSON_OUTPUT_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    write_js_consts(JS_OUTPUT_PATH, [("COMBAT_DATA", results)])

    print(f"dex total: {len(dex)}")
    print(f"no stats: {no_stats}, no learnset match: {no_learnset}, no valid levelup skill: {no_valid_skill}")
    print(f"ranked: {len(results)}")
    print(f"top5: {[(r['name'], r['best_skill']['jp_name'] or r['best_skill']['en_name'], r['best_skill']['dps_proxy']) for r in results[:5]]}")
    print(f"{JSON_OUTPUT_PATH} / {JS_OUTPUT_PATH} written")


if __name__ == "__main__":
    main()
