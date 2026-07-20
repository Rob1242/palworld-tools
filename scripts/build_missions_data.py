import json

from js_data_writer import write_js_consts

# paldb.cc「/ja/Mission」ページから手動抽出したミッション一覧(117件、メイン58+サブ59)。
# タイトル・分類・説明文・報酬・次のミッションへの連鎖情報を持つ(2026-07-20)。
SRC_PATH = "game_data/missions_raw.json"
OUT_PATH = "game_data/missions_data.js"


def main():
    data = json.load(open(SRC_PATH, encoding="utf-8"))
    for d in data:
        d.pop("icon", None)
    write_js_consts(OUT_PATH, [("MISSIONS_DATA", data)])
    from collections import Counter
    print(f"{len(data)}件 -> {OUT_PATH}")
    print(Counter(d["category"] for d in data))


if __name__ == "__main__":
    main()
