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
ITEM_JP_RAW_PATH = "game_data/item_jp_raw/jp_0_2466.json"
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

# SkillUnlock_DarkMutantは元データ自体が壊れている(name="en_text's Power Converter"という
# 翻訳テンプレート漏れ文字列、icon=汎用DUMMY画像)。対応するパル「Dark Mutant」は
# 図鑑にもpaldb.ccにも存在せず(2026-07-21確認)、正規の名前・アイコンを復元不可能なため、
# 他の騎乗ギア系アイテムと同じ体裁の汎用値に差し替える
# (表示自体はpalworld_items.html側でicon="dummy"のものを除外済み。念のためデータ側も直す)。
ITEM_OVERRIDES = {
    "SkillUnlock_DarkMutant": {
        "name": "Dark Mutant's Gear",
        "icon": "/icons/items/T_itemicon_Essential_SkillUnlock_Saddle.webp",
    },
}


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

    # paldb.ccの各アイテムページ(og:title/og:description)から取得したJP名/JP説明文
    # (scripts/scrape_item_jp_names.pyで2026-07-21取得、2414/2466件ヒット)。
    # ページが無くog:titleがEN名やハイフンをそのまま返しているケースは「未取得」扱いにする。
    with open(ITEM_JP_RAW_PATH, encoding="utf-8") as f:
        jp_raw = json.load(f)
    name_by_asset = {it["asset"]: it["name"] for it in items}
    INVALID_VALUES = {"-", "#N/A"}
    jp_by_asset = {}
    for asset, v in jp_raw.items():
        jp_name = v.get("name_jp")
        if not jp_name or jp_name in INVALID_VALUES or jp_name == name_by_asset.get(asset):
            continue
        jp_desc = v.get("description_jp")
        if jp_desc in INVALID_VALUES:
            jp_desc = None
        jp_by_asset[asset] = {"name_jp": jp_name, "description_jp": jp_desc}

    for asset, override in ITEM_OVERRIDES.items():
        for it in items:
            if it["asset"] == asset:
                it.update(override)

    asset_to_icon = {it["asset"]: it["icon"] for it in items}

    out = []
    resolved_blueprint_icons = 0
    for it in items:
        blueprint_icon = resolve_blueprint_icon(it["asset"], asset_to_icon)
        icon_source = blueprint_icon if blueprint_icon else it["icon"]
        if blueprint_icon:
            resolved_blueprint_icons += 1
        stem = icon_stem(icon_source)
        jp_info = jp_by_asset.get(it["asset"])
        jp_name = jp_info["name_jp"] if jp_info else stem_to_jp.get(stem)
        description_jp = jp_info["description_jp"] if jp_info else None
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
            "description_jp": description_jp,
        })

    out.sort(key=lambda x: (CATEGORY_ORDER.index(x["category"]), -x["price"]))

    jp_matched = sum(1 for x in out if x["name_jp"])
    desc_jp_matched = sum(1 for x in out if x["description_jp"])
    print(f"total items: {len(out)}, JP name matched: {jp_matched}, JP description matched: {desc_jp_matched}, blueprint icons resolved: {resolved_blueprint_icons}")
    by_cat = {}
    for x in out:
        by_cat[x["category"]] = by_cat.get(x["category"], 0) + 1
    print(by_cat)

    write_js_consts(OUTPUT_PATH, [("ITEMS_DEX_DATA", out)])
    print(f"wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
