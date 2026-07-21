import json

from js_data_writer import write_js_consts

# ===== パッシブスキル詳細ページ用データ生成 =====
# gamewith等の競合サイトには個別パッシブの詳細ページが無い(一覧記事のみ)ため、
# 差別化として全115件(SortDisplayable、game_data/passives_data.js)に
# 個別詳細ページを作る(2026-07-21、ユーザー依頼)。
# アイコンはgame_data/skills.json生データの"passives"配列から突き合わせ、
# 入手方法はgame_data/implant_obtain_raw.json(インプラント購入元、35件)で
# 分かる範囲だけ具体的に表示し、それ以外は「野生個体・配合で入手」という
# 一般的な説明に留める(個別の入手法データが無いものを断定しないため)。

PASSIVES_PATH = "game_data/passives_data.js"
SKILLS_RAW_PATH = "game_data/skills.json"
IMPLANT_OBTAIN_PATH = "game_data/implant_obtain_raw.json"
OUTPUT_PATH = "game_data/passives_page_data.js"

SOURCE_JP = {
    ("Wandering Merchant", "Arena_Shop_1"): "放浪の商人(アリーナショップ)",
    ("Wandering Merchant", "Bounty_Shop_1"): "放浪の商人(賞金稼ぎショップ)",
    ("Treasure Box", "Ancient Ruin"): "宝箱(古代遺跡)",
}
# AncientRelicRecycler_WorldTreeRelic_01〜05は同一入手手段のティア違いなので1つに畳み込む
WORLD_TREE_RELIC_JP = "宝箱(世界樹の遺物リサイクル)"


def icon_stem(path):
    return path.rsplit("/", 1)[-1].removesuffix(".webp")


def resolve_implant_asset(key, passive_assets):
    cand = key
    if cand.startswith("PalPassiveSkillChange_"):
        cand = cand[len("PalPassiveSkillChange_"):]
    if cand.startswith("Consumable_"):
        cand = cand[len("Consumable_"):]
    return cand if cand in passive_assets else None


def main():
    passives = json.loads(open(PASSIVES_PATH, encoding="utf-8").read().split("=", 1)[1].strip().rstrip(";"))
    raw = json.load(open(SKILLS_RAW_PATH, encoding="utf-8"))
    raw_by_asset = {p["asset"]: p for p in raw["passives"]}
    implants_raw = json.load(open(IMPLANT_OBTAIN_PATH, encoding="utf-8"))

    passive_assets = set(p["asset"] for p in passives)
    obtain_by_asset = {}
    for key, entries in implants_raw.items():
        asset = resolve_implant_asset(key, passive_assets)
        if not asset:
            continue
        obtain_by_asset[asset] = entries

    out = []
    with_obtain = 0
    for p in passives:
        r = raw_by_asset.get(p["asset"], {})
        stem = icon_stem(r.get("icon", "")) if r.get("icon") else None
        obtain = obtain_by_asset.get(p["asset"])
        obtain_jp = None
        if obtain:
            with_obtain += 1
            seen = []
            for o in obtain:
                if o["source"].startswith("AncientRelicRecycler_WorldTreeRelic_"):
                    label = WORLD_TREE_RELIC_JP
                else:
                    label = SOURCE_JP.get((o["type"], o["source"]), f"{o['type']}({o['source']})")
                if label not in seen:
                    seen.append(label)
            obtain_jp = "・".join(seen) + "で入手できるインプラントを使用"

        out.append({
            "asset": p["asset"],
            "name_jp": p["name"],
            "rank": p["rank"],
            "effect_jp": p["effect_text_jp"],
            "icon": ("game_data/icons/passives/" + stem + ".webp") if stem else "game_data/icons/T_icon_unknown.webp",
            "obtain_jp": obtain_jp,
        })

    out.sort(key=lambda x: (-x["rank"], x["name_jp"]))

    print(f"total passives: {len(out)}, with implant obtain info: {with_obtain}")
    write_js_consts(OUTPUT_PATH, [("PASSIVES_PAGE_DATA", out)])
    print(f"wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
