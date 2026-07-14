import json

from js_data_writer import write_js_consts

DEX_PATH = "palworld_dex_data.json"
BREEDING_PATH = "game_data/breedingdata.json"
ITEMS_PATH = "game_data/items.json"
EXTRA_PATH = "game_data/paldb_extra.json"
OUTPUT_PATH = "game_data/item_icons.json"
JS_OUTPUT_PATH = "game_data/item_icons_data.js"

# paldb.cc/ja/Material, /ja/Consumable, /ja/Food カテゴリページ(ブラウザ経由WebFetch)で
# JP名と英語名の対応を実在確認済みの、パル固有ではない汎用アイテムの辞書。
GENERIC_JP_TO_ASSET = {
    "金貨": "Money",
    "木炭": "Charcoal",
    "布": "Cloth",
    "上質な布": "Cloth2",
    "石炭": "Coal",
    "繊維": "Fiber",
    "火薬": "Gunpowder",
    "きれいな花": "Poppy",
    "革": "Leather",
    "硬い木材": "Wood_Fine",
    "羊毛": "Wool",
    "羊毛(ウール)": "Wool",
    "原油": "CrudeOil",
    "ルビー": "Ruby",
    "サファイア": "Sapphire",
    "エメラルド": "Eemerald",
    "ダイヤモンド": "Diamond",
    "硫黄": "Sulfur",
    "ピュアクォーツ": "Quartz",
    "上質なパルオイル": "PalOil",
    "発電器官": "ElectricOrgan",
    "毒腺": "Venom",
    "発火器官": "FireOrgan",
    "氷結器官": "IceOrgan",
    "骨": "Bone",
    "カーボン繊維": "CarbonFiber",
    "角": "Horn",
    "水棲パルの粘液": "PalFluid",
    "パルジウムの欠片": "Pal_crystal_S",
    "古代文明のコア": "AncientParts2",
    "古代文明の光る遺物": "WorldTreeRelic_04",
    "古代文明の朽ちた遺物": "WorldTreeRelic_01",
    "古代文明の眠れる遺物": "WorldTreeRelic_02",
    "古代文明の綺麗な遺物": "WorldTreeRelic_03",
    "古代文明の輝く遺物": "WorldTreeRelic_05",
    "隕石の欠片": "MeteorDrop",
    "夜星砂": "NightStone",
    "小さなパルのソウル": "PalUpgradeStone",
    "中くらいのパルのソウル": "PalUpgradeStone2",
    "大きなパルのソウル": "PalUpgradeStone3",
    "銀のカギ": "TreasureBoxKey02",
    "銅のカギ": "TreasureBoxKey01",
    "低品質の医薬品": "Herbs",
    "記憶リセット薬": "StatusPointResetSan",
    "修練の書(特大)": "ExpBoost_04",
    "世界樹の聖水": "WorldTreeHolyWater",
    "あやしいジュース": "Opium",
    "おかしなジュース": "Narcotic",
    "高度な技術書": "TechnologyBook_G1",
    "革新的な技術書": "TechnologyBook_G2",
    "高品質な回復薬": "Potion_High",
    "にんじん": "Carrot",
    "にんじんの種": "CarrotSeeds",
    "たまねぎの種": "OnionSeeds",
    "じゃがいもの種芋": "PotatoSeeds",
    "レタスの種": "LettuceSeeds",
    "トマトの種": "TomatoSeeds",
    "小麦の種": "WheatSeeds",
    "ベリーの種": "BerrySeeds",
    "赤いベリー": "Berries",
    "キノコ": "Mushroom",
    "卵": "Egg",
    "ミルク": "Milk",
    "ハチミツ": "Honey",
    "ケーキ": "Cake",
    "地の輝石": "PalAwakening_Material_Ground",
    "水の輝石": "PalAwakening_Material_Water",
    "氷の輝石": "PalAwakening_Material_Ice",
    "炎の輝石": "PalAwakening_Material_Fire",
    "雷の輝石": "PalAwakening_Material_Electric",
    "草の輝石": "PalAwakening_Material_Grass",
    "竜の輝石": "PalAwakening_Material_Dragon",
    "闇の輝石": "PalAwakening_Material_Dark",
    "無の輝石": "PalAwakening_Material_Neutral",
    "コラルム鉱石": "ManganeseOre",
    "パルメタルインゴット": "StealIngot",
    "プラスチール": "Plastic",
    "超高熱コア": "Thermal_Core",
    "金属インゴット": "CopperIngot",
    "金属鉱石": "CopperOre",
    "矢": "Arrow",
    "ふしぎなキノコ": "PoisonMushroom",
    "わたあめ": "Sweet",
    "キャラメルわたあめ": "Sweet_Caramel",
    "クインビーナの杖": "Spear_QueenBee",
}

# 個別値・内訳不明な集計ラベルや、JP名の実在確認が取れなかったものはアイコン対象外(捏造しない)
SKIP_ITEMS = {
    "古代文明の遺物(各種、個別値不明)",
    "古代文明の遺物(各種、内訳不明瞭)",
    "極まったパルのソウル",  # items.jsonにティア5が存在せず未確認
    "ドッグコイン",  # items.jsonに該当asset無し、確証取れず
    "クロマイト",  # items.jsonの"Chromite"と一致するか未確認(推測のため保留)
    "ソルライト",  # "Soralite"と一致するか未確認(推測のため保留)
    "ヘクソクォーツ",  # "Hexolite Quartz"と一致するか未確認(推測のため保留)
    "ヘクソライト",  # "Hexolite"と一致するか未確認(推測のため保留)
    "暗の欠片",  # 1.0で追加された新素材で items.json(1.0以前のデータ)に存在しない
    "闇の欠片",  # 同上
    "オオタチウオの切り身",  # items.jsonに該当アイテムなし
}

# パル固有ドロップ(肉・羽・体毛など)の接尾辞と、対応する内部アイテムprefixの候補
PAL_ITEM_PREFIXES = ["Meat_", "PalItem_", "BakedMeat_"]


def build_asset_lookup(items):
    by_asset = {}
    for it in items:
        by_asset.setdefault(it["asset"], it)
    return by_asset


def build_en_to_pal_asset(pal_info):
    lookup = {}
    for asset_key, info in pal_info.items():
        name = info.get("name", "")
        lookup.setdefault(name, asset_key)
        lookup.setdefault(name.replace(" ", "_"), asset_key)
    return lookup


def build_jp_to_en(dex):
    return {p["name"]: p["en_name"] for p in dex}


def try_pal_specific_match(jp_item_name, jp_to_en, en_to_pal_asset, items_by_asset):
    for jp_pal_name, en_name in jp_to_en.items():
        if not jp_item_name.startswith(jp_pal_name):
            continue
        pal_asset = en_to_pal_asset.get(en_name)
        if not pal_asset:
            continue
        for prefix in PAL_ITEM_PREFIXES:
            candidate = f"{prefix}{pal_asset}"
            if candidate in items_by_asset:
                return items_by_asset[candidate]["icon"]
    return None


def main():
    dex = json.load(open(DEX_PATH, encoding="utf-8"))
    bd = json.load(open(BREEDING_PATH, encoding="utf-8"))
    items_data = json.load(open(ITEMS_PATH, encoding="utf-8"))
    extra = json.load(open(EXTRA_PATH, encoding="utf-8"))

    items = items_data["items"]
    items_by_asset = build_asset_lookup(items)
    en_to_pal_asset = build_en_to_pal_asset(bd["pal_info"])
    jp_to_en = build_jp_to_en(dex)
    # 長い名前から順にマッチさせる(短い名前が別パル名の接頭辞になるのを防ぐ)
    jp_to_en_sorted = dict(sorted(jp_to_en.items(), key=lambda kv: -len(kv[0])))

    unique_items = set()
    for pid, info in extra.items():
        for drop in info.get("drops", []):
            unique_items.add(drop["item"])

    def to_game_data_path(icon):
        return "game_data" + icon if icon and icon.startswith("/") else icon

    icon_map = {}
    unresolved = []
    for name in sorted(unique_items):
        if name in SKIP_ITEMS:
            continue
        if name in GENERIC_JP_TO_ASSET:
            asset = GENERIC_JP_TO_ASSET[name]
            if asset in items_by_asset:
                icon_map[name] = to_game_data_path(items_by_asset[asset]["icon"])
                continue
            else:
                unresolved.append((name, f"asset '{asset}' not in items.json"))
                continue
        icon = try_pal_specific_match(name, jp_to_en_sorted, en_to_pal_asset, items_by_asset)
        if icon:
            icon_map[name] = to_game_data_path(icon)
        else:
            unresolved.append((name, "no match"))

    print(f"total unique drop items: {len(unique_items)}")
    print(f"resolved: {len(icon_map)}")
    print(f"skipped (ambiguous label): {len(SKIP_ITEMS & unique_items)}")
    print(f"unresolved: {len(unresolved)}")
    for u in unresolved:
        print(" ", u)

    json.dump(icon_map, open(OUTPUT_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"{OUTPUT_PATH} written ({len(icon_map)} entries)")

    write_js_consts(JS_OUTPUT_PATH, [("ITEM_ICONS", icon_map)])
    print(f"{JS_OUTPUT_PATH} written(palworld_dex.html・palworld_palbox.html共有)")


if __name__ == "__main__":
    main()
