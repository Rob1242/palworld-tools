import json
import urllib.request

from js_data_writer import write_js_consts

# ══════════════════════════════════════════════════════════════
# 2026-07-27 パル像(Effigy)チェックリスト用データ生成
#
# paldb.ccの本島マップ用JSデータ(https://paldb.cc/js/map_data_ja.js、fixedDungeon変数)
# から、type末尾が"Effigy"の11種・360件を抽出する。1.0で新たに7種(ヒノコジカ像/
# コチワニ像/モモンパ像/エテッパ像/ンダコアラ像/ペンタマ像/モコロン像、各30件)と
# 希少3種(ペコドン像4件/ミステリア像4件/ヤクモマル像2件)が追加され、旧来の
# クルリス像(140件)と合わせて計360件になっている。
#
# 座標変換式は build_curated_landmarks.py と同一のもの(自前のspawn_data.jsが持つ
# 実測済み正規化座標(0〜1)を持つボス81体分とのクロスリファレンスで最小二乗法により
# 導出、誤差5e-6以下)を再利用する。全エフィジーの生座標がこの式の対象範囲(本島)
# に収まっていることを確認済み(世界樹エリアには一体も無い)。
#   nx = 6.91855497e-07 * rawY + 0.510293691
#   ny = -6.94723059e-07 * rawX + 0.308358181
# ══════════════════════════════════════════════════════════════

MAP_DATA_URL = "https://paldb.cc/js/map_data_ja.js"
OUTPUT_PATH = "palworld_statue_data.json"
JS_OUTPUT_PATH = "game_data/statue_data.js"

TRANSFORM_NX_Y = 6.91855497e-07
TRANSFORM_NX_C = 0.510293691
TRANSFORM_NY_X = -6.94723059e-07
TRANSFORM_NY_C = 0.308358181

# type -> (表示順, 表示ラベル用の内部キー)。JP名(item)自体はソースデータからそのまま使う。
EFFIGY_TYPES = [
    "Lifmunk Effigy",
    "Rooby Effigy",
    "Munchill Effigy",
    "Herbil Effigy",
    "Tanzee Effigy",
    "Depresso Effigy",
    "Pengullet Effigy",
    "Lamball Effigy",
    "Relaxaurus Effigy",
    "Lunaris Effigy",
    "Yakumo Effigy",
]


def fetch_text(url):
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


def normalize(raw_x, raw_y):
    nx = TRANSFORM_NX_Y * raw_y + TRANSFORM_NX_C
    ny = TRANSFORM_NY_X * raw_x + TRANSFORM_NY_C
    return max(0.0, min(1.0, nx)), max(0.0, min(1.0, ny))


def main():
    print("map_data_ja.js 取得中...")
    text = fetch_text(MAP_DATA_URL)
    fixed_dungeon = extract_fixed_dungeon(text)
    print(f"fixedDungeon総数: {len(fixed_dungeon)}")

    effigies = [d for d in fixed_dungeon if d["type"] in EFFIGY_TYPES]
    print(f"パル像抽出数: {len(effigies)}")

    points = []
    jp_names = {}
    for d in effigies:
        raw_x, raw_y = d["pos"]["X"], d["pos"]["Y"]
        nx, ny = normalize(raw_x, raw_y)
        point_id = f"{d['type']}|{round(raw_x)}|{round(raw_y)}"
        points.append({"id": point_id, "type": d["type"], "x": round(nx, 5), "y": round(ny, 5)})
        jp_names.setdefault(d["type"], d["item"])

    dup_check = len({p["id"] for p in points})
    if dup_check != len(points):
        print(f"警告: IDの重複あり ({len(points)}件中{dup_check}件がユニーク)")

    types_out = []
    for t in EFFIGY_TYPES:
        count = sum(1 for p in points if p["type"] == t)
        types_out.append({"type": t, "jp_name": jp_names.get(t, t), "count": count})

    out = {"effigyTypes": types_out, "points": points}
    json.dump(out, open(OUTPUT_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"{OUTPUT_PATH} written")

    for t in types_out:
        print(f"  {t['jp_name']} ({t['type']}): {t['count']}件")

    write_js_consts(JS_OUTPUT_PATH, [("STATUE_DATA", out)])
    print(f"{JS_OUTPUT_PATH} written")


if __name__ == "__main__":
    main()
