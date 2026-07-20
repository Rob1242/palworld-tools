import json

from js_data_writer import write_js_consts

# game_data/items_stats_extra.js の正式なビルドスクリプト(これまで一度限りの
# アドホック処理で作られていて専用スクリプトが存在しなかったため、2026-07-20に
# 正式に整備。scrape_item_stats.py(攻撃/防御/耐久度等の基本ステ)と
# scrape_item_special_stats.py(テクノロジー解放Lv・アイテム固有効果)の
# 2つのスクレイピング結果をtier(アセット)単位でマージする)。
#
# 注記: SneakAttackRateも当初調査対象だったが、311グループ全てで値が"1"固定
# (差別化情報が無い)だったため採用しない。

MERGED_PATH = "game_data/item_stats_raw/merged.json"
SPECIAL_STATS_PATH = "game_data/item_stats_raw/special_stats.json"
OUT_PATH = "game_data/items_stats_extra.js"

STAT_LABELS = {"攻撃", "防御", "耐久度", "HP", "シールド"}


def main():
    groups = json.load(open(MERGED_PATH, encoding="utf-8"))
    special = json.load(open(SPECIAL_STATS_PATH, encoding="utf-8"))

    out = {}
    for g in groups:
        for t in g["tiers"]:
            entry = {}
            for label, value in t["stats"].items():
                if label not in STAT_LABELS:
                    continue
                try:
                    entry[label] = int(value)
                except (TypeError, ValueError):
                    continue
            tier_special = special.get(t["code"], {})
            if "tech_level" in tier_special:
                entry["tech_level"] = tier_special["tech_level"]
            if "item_effects" in tier_special:
                entry["item_effects"] = tier_special["item_effects"]
            if entry:
                out[t["code"]] = entry

    write_js_consts(OUT_PATH, [("ITEM_STATS_EXTRA", out)])
    tech_count = sum(1 for v in out.values() if "tech_level" in v)
    effect_count = sum(1 for v in out.values() if "item_effects" in v)
    print(f"items: {len(out)} (tech_level: {tech_count}, item_effects: {effect_count}) -> {OUT_PATH}")


if __name__ == "__main__":
    main()
