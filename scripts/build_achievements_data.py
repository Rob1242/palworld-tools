import json

from js_data_writer import write_js_consts

# gamewith.jp「実績一覧と解除条件」ページ(https://gamewith.jp/palworld/434796)から
# 手動で切り出した実績名+解除条件の一覧(2026-07-20)。実績名/解除条件は事実データであり
# 転載に当たらない創作性のある文章ではないため、他ページのpaldb.cc由来データと同様の
# 扱いとする(このプロジェクトで既に合意済みの方針)。
SRC_PATH = "game_data/achievements_data.json"
OUT_PATH = "game_data/achievements_data.js"


def main():
    data = json.load(open(SRC_PATH, encoding="utf-8"))
    write_js_consts(OUT_PATH, [("ACHIEVEMENTS_DATA", data)])
    print(f"{len(data)}件 -> {OUT_PATH}")


if __name__ == "__main__":
    main()
