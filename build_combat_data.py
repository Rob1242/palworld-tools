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

# ===== 戦闘最適化ツール用データ生成 =====
# palworld-lab.com「ステータス・火力指数計算機」(v1.0.0対応)を参考UXとして、
# Lv・才能値・濃縮・ソウル強化・パッシブ4枠をユーザーがその場で調整しながら
# 技ごとの火力を確認できるインタラクティブ計算機をpalworld_combat.htmlに実装する。
# ここでは計算に必要な生データ(種族値・習得技・パッシブ全カタログ)だけを
# クライアント側(JS)に渡す形とし、実際の計算(攻撃力・DPS等)はブラウザ側で
# スライダー操作に応じてリアルタイムに行う。


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
    passives = json.load(open(PASSIVES_PATH, encoding="utf-8"))

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

        pal_types_en = [t for t in [p["stats"]["type1"], p["stats"]["type2"]] if t and t != "None"]

        skills = []
        for entry in learnset[asset]:
            if entry["source"] != "levelup":
                continue
            waza_asset = entry["WazaID"].replace("EPalWazaID::", "")
            skill = skills_by_asset.get(waza_asset)
            if not skill or not skill.get("power") or not skill.get("cooldown"):
                continue
            jp = skills_jp.get(waza_asset)
            skills.append({
                "asset": waza_asset,
                "jp_name": jp["jp_name"] if jp else None,
                "en_name": skill["name"],
                "element": skill["element"],
                "power": skill["power"],
                "cooldown": skill["cooldown"],
                "level": entry.get("level"),
            })

        if not skills:
            no_valid_skill += 1
            continue

        skills.sort(key=lambda s: (s["level"] if s["level"] is not None else 999))

        results.append({
            "dex_id": p["id"],
            "name": p["name"],
            "en_name": p["en_name"],
            "icon": p["icon"],
            "types": p["types"],
            "types_en": pal_types_en,
            "stats": {
                "hp": p["stats"]["hp"],
                "melee_attack": p["stats"]["melee_attack"],
                "shot_attack": p["stats"]["shot_attack"],
                "defense": p["stats"]["defense"],
            },
            "partner_skill": p.get("partner_skill"),
            "skills": skills,
        })

    results.sort(key=lambda r: int(r["dex_id"]))

    json.dump(results, open(JSON_OUTPUT_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    write_js_consts(JS_OUTPUT_PATH, [
        ("COMBAT_PAL_DATA", results),
        ("COMBAT_PASSIVES_DATA", passives),
    ])

    print(f"dex total: {len(dex)}")
    print(f"no stats: {no_stats}, no learnset match: {no_learnset}, no valid levelup skill: {no_valid_skill}")
    print(f"usable: {len(results)}")
    print(f"passives: {len(passives)}")
    print(f"{JSON_OUTPUT_PATH} / {JS_OUTPUT_PATH} written")


if __name__ == "__main__":
    main()
