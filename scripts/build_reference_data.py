import json

from js_data_writer import write_js_consts

# paldb.ccから手動抽出した4種の参照データ(Work Priority/Element Swap/Party Buffs/SAN)を
# それぞれJS化する。いずれも事実データ(数値・分類)であり編集記事ではないため、
# 他ページのpaldb.cc由来データと同じ扱いとする。


def load(path):
    return json.load(open(path, encoding="utf-8"))


def main():
    write_js_consts("game_data/work_priority_data.js", [("WORK_PRIORITY_DATA", load("game_data/work_priority_raw.json"))])
    write_js_consts("game_data/element_swap_data.js", [("ELEMENT_SWAP_DATA", load("game_data/element_swap_raw.json"))])
    write_js_consts("game_data/party_buffs_data.js", [("PARTY_BUFFS_DATA", load("game_data/party_buffs_raw.json"))])
    write_js_consts("game_data/san_system_data.js", [("SAN_SYSTEM_DATA", load("game_data/san_system_raw.json"))])
    print("4件のJSデータファイルを書き出しました")


if __name__ == "__main__":
    main()
