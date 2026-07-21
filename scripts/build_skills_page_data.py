import json
import re

from js_data_writer import write_js_consts

# ===== 技(アクティブスキル)詳細ページ用データ生成 =====
# gamewith等の競合サイトが「技一覧」1ページで済ませている部分を、個別詳細ページ化する
# (2026-07-21、ユーザー依頼)。
# 名前・属性・威力・JP効果文はgame_data/skill_details_raw.json(375件全カバー、
# scrape_skill_details.pyでpaldb.cc等から取得済み)、習得可能パルは
# game_data/pals_learnset.json(レベルアップ/卵の習得元、723アセット分・
# BOSS_接頭辞は同じパルの上位個体差分なので実パルへ畳み込む)から作る。

ELEMENT_JP = {
    "Normal": "無", "Fire": "炎", "Water": "水", "Electricity": "電気",
    "Leaf": "草", "Dark": "闇", "Dragon": "竜", "Earth": "土", "Ice": "氷",
}

SKILLS_PATH = "game_data/skills.json"
DETAILS_PATH = "game_data/skill_details_raw.json"
LEARNSET_PATH = "game_data/pals_learnset.json"
BREEDING_PATH = "game_data/breeding_data.js"
OUTPUT_PATH = "game_data/skills_page_data.js"


def load_breeding_pals():
    raw = open(BREEDING_PATH, encoding="utf-8").read()
    m = re.search(r"const BREEDING_DATA\s*=\s*", raw)
    data = json.loads(raw[m.end():].strip().rstrip(";"))
    return data["pals"]


def icon_stem(path):
    return path.rsplit("/", 1)[-1].removesuffix(".webp")


def main():
    raw = json.load(open(SKILLS_PATH, encoding="utf-8"))
    skills = raw["skills"]
    elements = {e["name"]: e for e in raw["elements"]}
    details = json.load(open(DETAILS_PATH, encoding="utf-8"))
    learnset = json.load(open(LEARNSET_PATH, encoding="utf-8"))["learnset"]
    pals = load_breeding_pals()

    # asset(BOSS_接頭辞を畳み込んだ実パル) -> [{asset, source, level}]
    reverse = {}
    for pal_asset, entries in learnset.items():
        base = pal_asset[len("BOSS_"):] if pal_asset.startswith("BOSS_") else pal_asset
        if base not in pals:
            continue
        for e in entries:
            waza = e["WazaID"].replace("EPalWazaID::", "")
            bucket = reverse.setdefault(waza, {})
            # 同じ実パルがBOSS_版と通常版の両方で同じ技を覚える場合は重複させない。
            # レベル情報がある方(通常はlevelup)を優先して残す。
            existing = bucket.get(base)
            if existing is None or (existing.get("level") is None and e.get("level") is not None):
                bucket[base] = {"source": e["source"], "level": e.get("level")}

    out = []
    unresolved_icons = 0
    for s in skills:
        asset = s["asset"]
        d = details.get(asset, {})
        el = elements.get(s["element"], {})
        learners_map = reverse.get(asset, {})
        learners = []
        for pal_asset, info in learners_map.items():
            p = pals[pal_asset]
            learners.append({
                "asset": pal_asset,
                "dex_id": p["dex_id"],
                "name_jp": p["jp_name"],
                "icon": p["icon"],
                "source": info["source"],
                "level": info["level"],
            })
        learners.sort(key=lambda x: (x["level"] if x["level"] is not None else 9999, x["name_jp"] or ""))

        out.append({
            "asset": asset,
            "name_jp": d.get("jp_name") or s["name"],
            "name_en": s["name"],
            "element": s["element"],
            "element_jp": ELEMENT_JP.get(s["element"], s["element"]),
            "element_color": el.get("color", "#9CA3AF"),
            "element_icon": "game_data/icons/elements/" + icon_stem(el.get("icons", {}).get("large", "T_icon_unknown.webp")) + ".webp",
            "power": s["display_power"],
            "cooldown": s["cooldown"],
            "min_range": s["min_range"],
            "max_range": s["max_range"],
            "strength": s["strength"].replace("EPalWazaStrength::", ""),
            "effect_jp": d.get("effect_jp"),
            "description_en": s["description"],
            "learners": learners,
        })

    # element="None"かつ習得パルもJP名も無いものは、Unique_WorldTreeDragon_*等
    # ボス専用の内部固有技(プレイヤーが実際に見聞きすることがない)なので図鑑から除外する
    # (2026-07-21、要素アイコンが解決できずカードが空欄になる不具合の調査で発覚)。
    before = len(out)
    out = [x for x in out if not (x["element"] == "None" and not x["learners"] and x["name_jp"] == x["name_en"])]
    excluded = before - len(out)

    out.sort(key=lambda x: (x["element"], -x["power"]))

    jp_matched = sum(1 for x in out if x["name_jp"] and x["name_jp"] != x["name_en"])
    with_learners = sum(1 for x in out if x["learners"])
    print(f"excluded (boss-internal, no JP/learners): {excluded}")
    print(f"total skills: {len(out)}, JP matched: {jp_matched}, with learners: {with_learners}")

    write_js_consts(OUTPUT_PATH, [("SKILLS_PAGE_DATA", out)])
    print(f"wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
