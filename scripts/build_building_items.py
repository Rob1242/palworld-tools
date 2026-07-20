import json, os

from js_data_writer import write_js_consts

# アイテム図鑑に無かった「建築物」カテゴリ(生産/収納/照明/防衛/家具/インフラ/農園)を、
# テクノロジーツリーデータ(technology_raw.json)の建築物枠196件から新設する。
# 建築物は売却額・重量・最大スタック数という通常アイテムの概念がそのまま当てはまらない
# (設置物であり、インベントリ欄に売れる形で入るものではない)ため、それらは持たせず、
# 代わりに技術解放Lv・コストを表示用に持たせる(2026-07-20)。
# アイコンはbuild_technology_data.pyと同じくgame_data/icons/配下のローカルファイルに
# 解決する(technology_raw.json自体はpaldb.cc CDN URLのまま未加工で保持されているため、
# ここで都度解決が必要。技術データ側だけ解決して満足し、こちらを直接CDN URLのまま
# 使ってしまうミスを最初にしていたので注意)。
TECH_PATH = "game_data/technology_raw.json"
OUT_PATH = "game_data/building_items_data.js"
ICON_DIRS = ["technologies", "structures", "items", "pals"]


def build_icon_index():
    index = {}
    for d in ICON_DIRS:
        path = f"game_data/icons/{d}"
        if not os.path.isdir(path):
            continue
        for fname in os.listdir(path):
            index.setdefault(fname, f"game_data/icons/{d}/{fname}")
    return index

# キーワードは上から優先順位順(複数該当する場合は最初にマッチしたものを採用)
SUBCATEGORY_KEYWORDS = [
    ("農園", ["農園", "牧場", "釣り堀", "養殖"]),
    ("防衛", ["防壁", "門", "罠", "とらばさみ", "地雷", "タレット", "クロスボウ", "マシンガン", "ミサイル", "バリケード", "かかし", "警鐘"]),
    ("照明", ["ランプ", "たいまつ", "灯", "聖火台"]),
    ("収納", ["チェスト", "棚", "キャビネット", "コンテナ", "サイロ", "冷蔵庫", "クーラーボックス", "エサ箱"]),
    ("生産", ["作業台", "製作台", "工場", "ライン", "炉", "製薬台", "栽培器", "粉砕機", "製粉機", "変換機", "生成器", "コンベア", "製図台", "抽出機", "修理台", "工具箱", "キッチン", "調理鍋", "魔女の鍋", "診療所", "手術台", "薬棚"]),
    ("インフラ", ["発電", "送電", "道路", "交通整理", "街灯", "非常口", "採掘ワゴン", "取り出し機", "操作端末", "蓄電器", "波発生装置", "監視台", "パルボックス", "パル遠征所", "パル作業研究所", "フリーマーケット", "パルおめかし装置", "温泉", "クーラー", "ヒーター"]),
    ("建材セット", ["建築セット"]),
    ("装飾", ["旗セット", "像", "模型の", "看板", "雪だるま"]),
    ("家具", ["家具", "椅子", "机", "テーブル", "ベッド", "ソファ", "ピアノ", "鏡", "お風呂", "トイレ", "カーペット", "暖炉", "観葉植物", "樹木セット", "時計", "噴水", "花壇", "墓石"]),
]


def classify(name_jp):
    for subcat, keywords in SUBCATEGORY_KEYWORDS:
        if any(k in name_jp for k in keywords):
            return subcat
    return "その他"


def main():
    tech = json.load(open(TECH_PATH, encoding="utf-8"))
    buildings = [t for t in tech if t["category"] == "建築物"]
    icon_index = build_icon_index()

    out = []
    unresolved = set()
    for b in buildings:
        fname = b["icon"].rsplit("/", 1)[-1]
        local_icon = icon_index.get(fname)
        if not local_icon:
            unresolved.add(fname)
        out.append({
            "asset": b["tech_id"],
            "name_jp": b["name_jp"],
            "icon": local_icon or "game_data/icons/T_icon_unknown.webp",
            "subcategory": classify(b["name_jp"]),
            "tech_level": b["level"],
            "tech_cost": b["cost"],
        })
    if unresolved:
        print(f"未解決アイコン: {len(unresolved)} {sorted(unresolved)}")

    write_js_consts(OUT_PATH, [("BUILDING_ITEMS_DATA", out)])
    from collections import Counter
    print(f"{len(out)}件 -> {OUT_PATH}")
    print(Counter(b["subcategory"] for b in out))


if __name__ == "__main__":
    main()
