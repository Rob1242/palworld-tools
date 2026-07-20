import json

from js_data_writer import write_js_consts

# paldb.ccの本島マップ用JSデータ(https://paldb.cc/js/map_data_ja.js、fixedDungeon変数、
# 13,480件)から、資源ノード等の高密度な採取ポイントを除いた8種類・890件のランドマークを
# 抽出する(2026-07-20)。座標は生のゲームワールド座標(pos.X/Y)のため、自前のspawn_data.js
# に既に実測済みの正規化座標(0〜1)を持つボス81体分とのクロスリファレンスで、
# 最小二乗法により変換式を実測導出した(誤差5e-6以下):
#   nx = 6.91855497e-07 * rawY + 0.510293691
#   ny = -6.94723059e-07 * rawX + 0.308358181
# (X/Yが入れ替わって見えるのはマップが回転して定義されているため。生データそのままの
# X→nx, Y→nyという素朴な対応関係ではない点に注意。実測フィットなので信頼できる)
SRC_PATH = "game_data/curated_landmarks_raw.json"
OUT_PATH = "game_data/curated_landmarks_data.js"


def main():
    data = json.load(open(SRC_PATH, encoding="utf-8"))
    for d in data:
        d["x"] = max(0.0, min(1.0, d["x"]))
        d["y"] = max(0.0, min(1.0, d["y"]))
    write_js_consts(OUT_PATH, [("CURATED_LANDMARKS_DATA", data)])
    from collections import Counter
    print(f"{len(data)}件 -> {OUT_PATH}")
    print(Counter(d["type"] for d in data))


if __name__ == "__main__":
    main()
