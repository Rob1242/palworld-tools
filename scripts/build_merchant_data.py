import json

from js_data_writer import write_js_consts

# ══════════════════════════════════════════════════════════════
# 2026-07-27 商人(NPC行商)データ新規追加
#
# 出現マップ統合作業の一環。paldb.ccの本島マップデータ(map_data_ja.js、
# build_curated_landmarks.pyと同じ出典)から type="Wandering Merchant"/
# "Black Marketeer" の15件を抽出する。本島限定(世界樹エリアに該当データなし)。
#
# パルワールド配合・攻略ラボの商人マップは36件とより多いが、生のワールド座標を
# 保持しておらず(そのサイト自身の地図画像のピクセル座標のみ)、自サイトの地図
# 画像に正確に変換できないため採用しなかった。メダル商人・自警団の指名手配係は
# 既存のBounty(懸賞金対象)カテゴリと役割が重複するため対象外とする。
# ══════════════════════════════════════════════════════════════

MAP_DATA_URL = "https://paldb.cc/js/map_data_ja.js"
OUTPUT_PATH = "palworld_merchant_data.json"
JS_OUTPUT_PATH = "game_data/merchant_data.js"

MAIN_NX_Y = 6.91855497e-07
MAIN_NX_C = 0.510293691
MAIN_NY_X = -6.94723059e-07
MAIN_NY_C = 0.308358181

MERCHANT_TYPES = {"Wandering Merchant", "Black Marketeer"}


def fetch_text(url):
    import urllib.request
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8")


def extract_fixed_dungeon(text):
    marker = "var fixedDungeon = "
    start = text.find(marker) + len(marker)
    depth = 0
    i = start
    while True:
        c = text[i]
        if c == "[":
            depth += 1
        elif c == "]":
            depth -= 1
            if depth == 0:
                break
        i += 1
    return json.loads(text[start : i + 1])


def normalize_main(raw_x, raw_y):
    nx = MAIN_NX_Y * raw_y + MAIN_NX_C
    ny = MAIN_NY_X * raw_x + MAIN_NY_C
    return max(0.0, min(1.0, nx)), max(0.0, min(1.0, ny))


def main():
    print("map_data_ja.js 取得中...")
    fixed_dungeon = extract_fixed_dungeon(fetch_text(MAP_DATA_URL))
    merchants = [d for d in fixed_dungeon if d["type"] in MERCHANT_TYPES]
    print(f"商人抽出数: {len(merchants)}")

    out = []
    for m in merchants:
        raw_x, raw_y = m["pos"]["X"], m["pos"]["Y"]
        nx, ny = normalize_main(raw_x, raw_y)
        out.append({
            "id": m.get("id") or f"merchant_{round(raw_x)}_{round(raw_y)}",
            "name": m["item"], "level": m.get("lv"), "region": "palpagos",
            "x": round(nx, 5), "y": round(ny, 5),
        })

    json.dump(out, open(OUTPUT_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"{OUTPUT_PATH} written")
    for t in out:
        print(f"  {t['name']}(Lv{t['level']})")

    write_js_consts(JS_OUTPUT_PATH, [("MERCHANT_DATA", out)])
    print(f"{JS_OUTPUT_PATH} written")


if __name__ == "__main__":
    main()
