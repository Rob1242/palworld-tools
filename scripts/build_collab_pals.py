import json
import os

from js_data_writer import write_js_consts

DEX_PATH = "palworld_dex_data.json"
COMBAT_PATH = "palworld_combat_stats.json"
JS_OUTPUT_PATH = "game_data/dex_data.js"

STAT_KEYS = [
    "hp", "melee_attack", "shot_attack", "defense", "support", "craft_speed",
    "max_full_stomach", "food_amount", "type1", "type2", "rarity", "size",
    "run_speed", "ride_sprint_speed", "partner_skill_desc",
]

TYPE_EN_TO_JP = {
    "Dark": "闇", "Dragon": "竜", "Earth": "地", "Electricity": "雷",
    "Fire": "炎", "Ice": "氷", "Leaf": "草", "Normal": "無", "Water": "水",
}

# Terrariaコラボイベント(Yakushima)のパル11体。paldb.cc/ja/<asset>で日本語フィールドを
# 個別に実在確認済み(2026-07-14)。287体の図鑑データ(GameWith由来)には存在しないため
# id=288以降として新規追加する。
# 除外した5体(CandleWitch, VolcanicTurtle, Astralym, Dragostrophe/BlackFurDragon,
# Boltmane/ElecLion)は、JP名が確認できない、または`partner_skill_desc`が
# "This Pal is under investigation."という未実装プレースホルダ文言だったため、
# 未完成コンテンツと判断し追加を見送った。
COLLAB_PALS = [
    {
        "asset": "YakushimaBoss001", "name": "クトゥルフのめだま", "en_name": "Eye of Cthulhu",
        "types": ["闇"], "active_time": "夜",
        "ride": {"rideable": True, "fly": False, "swim": True},
        "work": {"運搬": 4},
        "partner_skill": {"name": "クトゥルフのめだまの突進", "effect": "発動すると、狙いを定めた敵に向かってクトゥルフのめだまが突進で攻撃する。"},
    },
    {
        "asset": "YakushimaBoss001_Small", "name": "あくまのめだま", "en_name": "Demon Eye",
        "types": ["闇"], "active_time": "夜",
        "ride": {"rideable": False, "fly": False, "swim": True},
        "work": {"運搬": 1},
        "partner_skill": {"name": "悪魔の視界", "effect": "手持ちにいる間、闇属性のパルの攻撃力が15%増加する。(重複不可)"},
    },
    {
        "asset": "YakushimaMonster001", "name": "グリーンスライム", "en_name": "Green Slime",
        "types": ["草"], "active_time": "両方",
        "ride": {"rideable": True, "fly": False, "swim": True},
        "work": {"運搬": 1},
        "partner_skill": {"name": "スライムボディ", "effect": "背中に乗って移動できる。ライド中、高くジャンプできる。"},
    },
    {
        "asset": "YakushimaMonster001_Blue", "name": "ブルースライム", "en_name": "Blue Slime",
        "types": ["水"], "active_time": "両方",
        "ride": {"rideable": True, "fly": False, "swim": True},
        "work": {"運搬": 1},
        "partner_skill": {"name": "スライムボディ", "effect": "背中に乗って移動できる。ライド中、高くジャンプできる。"},
    },
    {
        "asset": "YakushimaMonster001_Pink", "name": "かがやくスライム", "en_name": "Illuminant Slime",
        "types": ["無"], "active_time": "両方",
        "ride": {"rideable": True, "fly": False, "swim": True},
        "work": {"運搬": 1},
        "partner_skill": {"name": "スライムボディ", "effect": "背中に乗って移動できる。ライド中、高くジャンプできる。"},
    },
    {
        "asset": "YakushimaMonster001_Purple", "name": "パープルスライム", "en_name": "Purple Slime",
        "types": ["闇"], "active_time": "夜",
        "ride": {"rideable": True, "fly": False, "swim": True},
        "work": {"運搬": 1},
        "partner_skill": {"name": "スライムボディ", "effect": "背中に乗って移動できる。ライド中、高くジャンプできる。"},
    },
    {
        "asset": "YakushimaMonster001_Rainbow", "name": "レインボースライム", "en_name": "Rainbow Slime",
        "types": ["無"], "active_time": "両方",
        "ride": {"rideable": True, "fly": False, "swim": True},
        "work": {"運搬": 1},
        "partner_skill": {"name": "スライムボディ", "effect": "背中に乗って移動できる。ライド中、高くジャンプできる。"},
    },
    {
        "asset": "YakushimaMonster001_Red", "name": "レッドスライム", "en_name": "Red Slime",
        "types": ["炎"], "active_time": "両方",
        "ride": {"rideable": True, "fly": False, "swim": False},
        "work": {"運搬": 1},
        "partner_skill": {"name": "スライムボディ", "effect": "背中に乗って移動できる。ライド中、高くジャンプできる。"},
    },
    {
        "asset": "YakushimaMonster002", "name": "まほうのつるぎ", "en_name": "Enchanted Sword",
        "types": ["無"], "active_time": "両方",
        "ride": {"rideable": False, "fly": False, "swim": True},
        "work": {"伐採": 1},
        "partner_skill": {"name": "エンチャント", "effect": "手持ちにいる間、闇属性のパルを倒した際のドロップアイテム獲得量が40%増える。(重複不可)"},
    },
    {
        "asset": "YakushimaMonster003", "name": "どうくつコウモリ", "en_name": "Cave Bat",
        "types": ["無"], "active_time": "両方",
        "ride": {"rideable": False, "fly": False, "swim": False},
        "work": {"採集": 1},
        "partner_skill": {"name": "コウモリサポート", "effect": "手持ちにいる間、プレイヤーの近くに出現する。自動で近くにあるアイテムを拾いに行く。"},
    },
    {
        "asset": "YakushimaMonster003_Purple", "name": "かがやくコウモリ", "en_name": "Illuminant Bat",
        "types": ["無"], "active_time": "両方",
        "ride": {"rideable": False, "fly": False, "swim": False},
        "work": {"採集": 1},
        "partner_skill": {"name": "コウモリサポート", "effect": "手持ちにいる間、プレイヤーの近くに出現する。自動で近くにあるアイテムを拾いに行く。"},
    },
]


def pick_stats(entry):
    stats = {k: entry.get(k) for k in STAT_KEYS}
    return stats


def main():
    dex = json.load(open(DEX_PATH, encoding="utf-8"))
    combat = json.load(open(COMBAT_PATH, encoding="utf-8"))
    combat_by_asset = {e["asset"]: e for e in combat}

    existing_assets = {p["en_name"] for p in dex}
    existing_ids = {int(p["id"]) for p in dex}
    next_id = max(existing_ids) + 1

    added = 0
    for cp in COLLAB_PALS:
        if cp["en_name"] in existing_assets:
            print(f"  スキップ({cp['en_name']}は既に図鑑に存在)")
            continue
        combat_entry = combat_by_asset[cp["asset"]]
        stats = pick_stats(combat_entry)
        icon = f"game_data/icons/pals/T_{cp['asset']}_icon_normal.webp"
        if not os.path.exists(icon):
            raise FileNotFoundError(f"icon not found: {icon}")

        dex.append({
            "id": str(next_id),
            "name": cp["name"],
            "en_name": cp["en_name"],
            "icon": icon,
            "types": cp["types"],
            "active_time": cp["active_time"],
            "is_dark_type": "闇" in cp["types"],
            "ride": cp["ride"],
            "work": cp["work"],
            "meal_amount": combat_entry["food_amount"],
            "partner_skill": cp["partner_skill"],
            "stats": stats,
            "stats_status": "exact",
            "detail_url": f"https://paldb.cc/ja/{cp['asset']}",
        })
        next_id += 1
        added += 1

    json.dump(dex, open(DEX_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"{added}体を追加、図鑑合計{len(dex)}体。{DEX_PATH}を更新しました。")

    write_js_consts(JS_OUTPUT_PATH, [("PAL_DEX_DATA", dex)])
    print(f"{JS_OUTPUT_PATH} を更新しました(palworld_palbox.htmlはPAL_BOX_DATA = PAL_DEX_DATAとしてこのファイルを共有)")


if __name__ == "__main__":
    main()
