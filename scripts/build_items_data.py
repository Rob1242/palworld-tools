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


# 生データ(items.json)は設計図(Blueprint_*)アイテムのicon欄に、対応する完成品とは
# 無関係な汎用アイコン(T_itemicon_Material_Blueprint.webp)を一律で入れている。
# しかしpaldb.ccの実ページでは、設計図は対応する完成品と同じ専用アイコンで表示されている
# (例: Blueprint_Accessory_AT_1_2 → Accessory_AT_1と同じアイコン)。
# "Blueprint_"を外した残りから末尾の"_数字"セグメントを1つずつ落としながら、
# 実在する完成品アセットに一致するまで遡って探す(2026-07-21、ユーザー報告で発覚)。
def resolve_blueprint_icon(asset, asset_to_icon):
    if not asset.startswith("Blueprint_"):
        return None
    rest = asset[len("Blueprint_"):]
    parts = rest.split("_")
    for cut in range(len(parts), 0, -1):
        candidate = "_".join(parts[:cut])
        if candidate in asset_to_icon and not candidate.startswith("Blueprint"):
            return asset_to_icon[candidate]
    return None


def main():
    with open(ITEMS_PATH, encoding="utf-8") as f:
        items = json.load(f)["items"]

    with open(ITEM_ICONS_PATH, encoding="utf-8") as f:
        raw = f.read()
    icon_map = json.loads(raw.split("=", 1)[1].strip().rstrip(";"))
    stem_to_jp = {icon_stem(path): jp for jp, path in icon_map.items()}
    asset_to_icon = {it["asset"]: it["icon"] for it in items}

    out = []
    resolved_blueprint_icons = 0
    for it in items:
        blueprint_icon = resolve_blueprint_icon(it["asset"], asset_to_icon)
        icon_source = blueprint_icon if blueprint_icon else it["icon"]
        if blueprint_icon:
            resolved_blueprint_icons += 1
        stem = icon_stem(icon_source)
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
    print(f"total items: {len(out)}, JP name matched: {jp_matched}, blueprint icons resolved: {resolved_blueprint_icons}")
    by_cat = {}
    for x in out:
        by_cat[x["category"]] = by_cat.get(x["category"], 0) + 1
    print(by_cat)

    write_js_consts(OUTPUT_PATH, [("ITEMS_DEX_DATA", out)])
    print(f"wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
