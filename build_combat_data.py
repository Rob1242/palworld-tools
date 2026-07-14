import json

from js_data_writer import write_js_consts

DEX_PATH = "palworld_dex_data.json"
BREEDING_PATH = "palworld_breeding_data.json"
LEARNSET_PATH = "game_data/pals_learnset.json"
SKILLS_PATH = "game_data/skills.json"
SKILLS_JP_PATH = "game_data/skills_jp.json"
PASSIVES_PATH = "palworld_passives_merged.json"
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

PASSIVE_SLOTS = 4  # パッシブ枠数


def load_attack_passives():
    """palworld_passives_merged.jsonから、汎用攻撃%パッシブと属性別攻撃%パッシブを抽出する。
    ハードコードせず実データから動的に集計することで、パッシブ追加時も自動追従する。"""
    merged = json.load(open(PASSIVES_PATH, encoding="utf-8"))
    generic = []
    by_element = {}
    for p in merged:
        for e in p.get("effects", []):
            t = e.get("type", "")
            val = e.get("value", 0)
            if val <= 0 or e.get("target") != "ToSelf":
                continue
            if t == "ShotAttack":
                generic.append({"name": p["name"], "pct": val, "is_worldtree": bool(p.get("is_worldtree"))})
            elif t.startswith("ElementBoost_"):
                element = t.replace("ElementBoost_", "")
                by_element.setdefault(element, []).append(
                    {"name": p["name"], "pct": val, "is_worldtree": bool(p.get("is_worldtree"))}
                )
    generic.sort(key=lambda x: -x["pct"])
    for element in by_element:
        by_element[element].sort(key=lambda x: -x["pct"])
    return generic, by_element


def pick_best_passives(generic, element_specific, element):
    """汎用攻撃%パッシブと、指定属性に効く属性攻撃%パッシブを合わせて、
    値が高い順にPASSIVE_SLOTS枠分だけ選ぶ(理想値、デメリットは考慮しない)。
    戻り値: (選んだパッシブ一覧, 汎用%合計, {属性: 属性%合計})
    属性特化パッシブは対応する属性の技にしか効かないため、汎用%とは別に集計する。"""
    candidates = [{**g, "kind": "generic"} for g in generic]
    for e in element_specific.get(element, []):
        candidates.append({**e, "kind": "element", "element": element})
    candidates.sort(key=lambda x: -x["pct"])
    chosen = candidates[:PASSIVE_SLOTS]
    generic_pct = sum(c["pct"] for c in chosen if c["kind"] == "generic") / 100.0
    element_pct_map = {}
    for c in chosen:
        if c["kind"] == "element":
            element_pct_map[c["element"]] = element_pct_map.get(c["element"], 0) + c["pct"] / 100.0
    return chosen, generic_pct, element_pct_map


def compute_attack(species_shot_attack, passive_pct):
    base = (100 + species_shot_attack * 0.075 * REF_LEVEL * (1 + IV_PCT)) * (1 + STAR_ATK_PCT) * (1 + SOUL_ATK_PCT)
    return base * (1 + passive_pct)


def build_skill_candidates(learnset_entries, skills_by_asset, skills_jp, pal_types, base_attack, element_pct_map, min_cycle):
    """base_attack = 汎用攻撃%のみを適用した攻撃力。属性特化パッシブは、そのパッシブの対象属性と
    技の属性が一致する場合のみ、その技のダメージ計算に限定して追加適用する(全技に一律適用しない)。"""
    candidates = []
    for entry in learnset_entries:
        if entry["source"] != "levelup":
            continue
        waza_asset = entry["WazaID"].replace("EPalWazaID::", "")
        skill = skills_by_asset.get(waza_asset)
        if not skill or not skill.get("power") or not skill.get("cooldown"):
            continue
        stab = STAB_MULT if skill["element"] in pal_types else 1.0
        element_bonus = element_pct_map.get(skill["element"], 0)
        effective_attack = base_attack * (1 + element_bonus)
        effective_cycle = max(skill["cooldown"], min_cycle)
        dps_proxy = skill["power"] * effective_attack * stab / effective_cycle
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
            "element_boosted": element_bonus > 0,
            "dps_proxy": round(dps_proxy, 1),
        })
    candidates.sort(key=lambda c: -c["dps_proxy"])
    return candidates


def main():
    dex = json.load(open(DEX_PATH, encoding="utf-8"))

    breeding = json.load(open(BREEDING_PATH, encoding="utf-8"))
    asset_by_dex_id = {}
    for asset, info in breeding["pals"].items():
        if info.get("dex_id"):
            asset_by_dex_id.setdefault(info["dex_id"], asset)

    learnset = json.load(open(LEARNSET_PATH, encoding="utf-8"))["learnset"]
    skills_by_asset = {s["asset"]: s for s in json.load(open(SKILLS_PATH, encoding="utf-8"))["skills"]}
    skills_jp = json.load(open(SKILLS_JP_PATH, encoding="utf-8"))["active_skills"]
    generic_passives, element_passives = load_attack_passives()

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
        species_atk = p["stats"]["shot_attack"]

        # 1st pass: 汎用パッシブのみで暫定攻撃力を出し、最も威力を発揮する技(=属性)を仮決定する
        provisional_pct = sum(c["pct"] for c in generic_passives[:PASSIVE_SLOTS]) / 100.0
        provisional_attack = compute_attack(species_atk, provisional_pct)
        provisional_candidates = build_skill_candidates(
            learnset[asset], skills_by_asset, skills_jp, pal_types, provisional_attack, {}, MIN_CYCLE_SECONDS
        )
        if not provisional_candidates:
            no_valid_skill += 1
            continue
        dominant_element = provisional_candidates[0]["element"]

        # 2nd pass: 仮決定した属性に効く属性特化パッシブも候補に加え、本当に最適な4枠を選び直す。
        # 属性特化%は、その属性に一致する技にのみ適用する(build_skill_candidates内で判定)。
        chosen_passives, generic_pct, element_pct_map = pick_best_passives(generic_passives, element_passives, dominant_element)
        base_attack = compute_attack(species_atk, generic_pct)
        candidates = build_skill_candidates(
            learnset[asset], skills_by_asset, skills_jp, pal_types, base_attack, element_pct_map, MIN_CYCLE_SECONDS
        )
        best = candidates[0]
        best_element_bonus = element_pct_map.get(best["element"], 0)
        ideal_attack = base_attack * (1 + best_element_bonus)

        results.append({
            "dex_id": p["id"],
            "name": p["name"],
            "en_name": p["en_name"],
            "icon": p["icon"],
            "types": p["types"],
            "ideal_attack": round(ideal_attack, 1),
            "passive_pct": round((generic_pct + best_element_bonus) * 100, 1),
            "passives": chosen_passives,
            "best_skill": best,
            "skills": candidates,
        })

    results.sort(key=lambda r: -r["best_skill"]["dps_proxy"])

    json.dump(results, open(JSON_OUTPUT_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    write_js_consts(JS_OUTPUT_PATH, [("COMBAT_DATA", results)])

    print(f"dex total: {len(dex)}")
    print(f"no stats: {no_stats}, no learnset match: {no_learnset}, no valid levelup skill: {no_valid_skill}")
    print(f"ranked: {len(results)}")
    print(f"top5: {[(r['name'], r['best_skill']['jp_name'] or r['best_skill']['en_name'], r['best_skill']['dps_proxy'], [x['name'] for x in r['passives']]) for r in results[:5]]}")
    print(f"{JSON_OUTPUT_PATH} / {JS_OUTPUT_PATH} written")


if __name__ == "__main__":
    main()
