import json
import re

from js_data_writer import write_js_consts

# ===== アイテム図鑑用データ生成 =====
# データ元: game_data/items.json (ユーザー提供の未加工データ、2466件、英語名のみ)。
# JP名はgame_data/item_icons_data.js(パル図鑑のドロップアイテム欄で使っている、
# gamewith.jpから取得済みの「JP名→アイコンパス」109件)とアイコンファイル名で
# 突き合わせて分かる範囲だけ埋める(全件のJP翻訳はデータソースが無く不可能)。

ITEMS_PATH = "game_data/items.json"
ITEM_ICONS_PATH = "game_data/item_icons_data.js"
OUTPUT_PATH = "game_data/items_dex_data.js"

# type_a_display(大分類)が空文字の場合、名前パターンで補完する追加カテゴリ
BLUEPRINT_RE = re.compile(r"schematic|blueprint|design", re.I)
AMMO_RE = re.compile(r"ammo|arrow|bullet|cartridge|fuel|ink\b", re.I)

# 大分類の表示名(日本語)とソート順
CATEGORY_ORDER = [
    "資源・素材",
    "武器",
    "防具",
    "アクセサリー",
    "食料",
    "消耗品",
    "グライダー・盾",
    "弾薬",
    "設計図",
    "その他",
]

RESOURCE_TYPE_A = {"Material", "Essential"}
RESOURCE_TYPE_B_TAGS = {"Ore": "鉱石", "Ingot": "インゴット", "Wood": "木材", "Processing Material": "加工素材"}


def categorize(item):
    a = item["type_a_display"]
    b = item["type_b_display"]
    name = item["name"]

    if a == "Material" or a == "Essential":
        sub = RESOURCE_TYPE_B_TAGS.get(b, "素材")
        return "資源・素材", sub
    if a == "Weapon":
        return "武器", b or "武器"
    if a == "Armor":
        return "防具", b or "防具"
    if a == "Accessory":
        return "アクセサリー", None
    if a == "Food":
        return "食料", b or "食料"
    if a == "Consumable":
        return "消耗品", None
    if a == "Glider":
        return "グライダー・盾", "グライダー"
    if b == "Shield":
        return "グライダー・盾", "シールド"
    if a == "" :
        if BLUEPRINT_RE.search(name):
            return "設計図", None
        if AMMO_RE.search(name):
            return "弾薬", None
        return "その他", None
    return "その他", a or None


def icon_stem(path):
    return path.rsplit("/", 1)[-1].removesuffix(".webp")


def main():
    with open(ITEMS_PATH, encoding="utf-8") as f:
        items = json.load(f)["items"]

    with open(ITEM_ICONS_PATH, encoding="utf-8") as f:
        raw = f.read()
    icon_map = json.loads(raw.split("=", 1)[1].strip().rstrip(";"))
    stem_to_jp = {icon_stem(path): jp for jp, path in icon_map.items()}

    out = []
    for it in items:
        stem = icon_stem(it["icon"])
        jp_name = stem_to_jp.get(stem)
        category, subcategory = categorize(it)
        out.append({
            "asset": it["asset"],
            "name_en": it["name"],
            "name_jp": jp_name,
            "icon": "game_data/icons/items/" + stem + ".webp",
            "category": category,
            "subcategory": subcategory,
            "rarity": it["rarity"],
            "rank": it["rank"],
            "price": it["price"],
            "weight": it["weight"],
            "max_stack": it["max_stack"],
            "description_en": it["description"],
        })

    out.sort(key=lambda x: (CATEGORY_ORDER.index(x["category"]), -x["price"]))

    jp_matched = sum(1 for x in out if x["name_jp"])
    print(f"total items: {len(out)}, JP name matched: {jp_matched}")
    by_cat = {}
    for x in out:
        by_cat[x["category"]] = by_cat.get(x["category"], 0) + 1
    print(by_cat)

    write_js_consts(OUTPUT_PATH, [("ITEMS_DEX_DATA", out)])
    print(f"wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
