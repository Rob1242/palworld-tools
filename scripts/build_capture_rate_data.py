import json, re

from js_data_writer import write_js_consts

# paldb.ccの捕獲率計算機(/ja/Capture_Rate)は実際の捕獲成功率をサーバーAPI
# (/api/captureRate)で計算しており、その正確な計算式(球種ごとの補正・HP%・Lv・
# 女神像レベルの絡み合い方)はページソースに露出していない。API自体を直接呼んで
# 系統的にサンプリングし、パルごとのCaptureRate倍率が単純な比例関係で効いていないこと
# (SheepBall:1.5倍 と MimicDog:0.8倍を同条件で比較すると、結果の比率は1.875倍ではなく
# 約1.57〜1.58倍で頭打ちになる非線形な応答だった)を実測で確認済み。
# 正確な再現式を検証できる自信が持てなかったため、確率計算機としての実装は行わず、
# 代わりに数値として確実なCaptureRate/BossCaptureRate倍率そのものをパル図鑑に
# 参考値として表示する(2026-07-20、捕獲率「計算機」ではなく「目安」として妥当な範囲に
# スコープを縮小)。
SRC_PATH = "game_data/paldb_iv_ja_raw.json"
DEX_PATH = "game_data/dex_data.js"
OUT_PATH = "game_data/capture_rate_data.js"


def main():
    iv_data = json.load(open(SRC_PATH, encoding="utf-8"))
    by_code = {p["Code"]: p for p in iv_data}

    content = open(DEX_PATH, encoding="utf-8").read()
    dex = json.loads(content.split("=", 1)[1].strip().rstrip(";"))

    out = {}
    unresolved = []
    for p in dex:
        m = re.search(r"T_(.+?)_icon_normal\.webp", p["icon"])
        asset = m.group(1) if m else None
        entry = by_code.get(asset) if asset else None
        if not entry:
            unresolved.append(p["name"])
            continue
        out[asset] = {
            "capture_rate": entry["CaptureRate"],
            "boss_capture_rate": entry["BossCaptureRate"],
        }

    write_js_consts(OUT_PATH, [("CAPTURE_RATE_DATA", out)])
    print(f"{len(out)}件 -> {OUT_PATH} (未解決: {len(unresolved)} {unresolved[:5]})")


if __name__ == "__main__":
    main()
