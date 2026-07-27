import html
import json
import urllib.request

from js_data_writer import write_js_consts

# ══════════════════════════════════════════════════════════════
# 2026-07-27 ファストトラベル/観測塔データを地図レイヤー化
#
# 出現マップ統合作業の一環。座標そのものは以前から game_data/fast_travel_points.json
# (ユーザー提供の内部データ、本島・世界樹合わせて174件、生のワールド座標)を
# 世界樹エリアのランドマーク表示にのみ使っていたが、日本語名を持っておらず
# (localized_nameが英語)、本島側は全く地図表示に使われていなかった。
#
# 日本語名はパルワールド配合・攻略ラボの/map/ft/ページ(build_statue_data.pyと
# 同じ抽出方法)から取得する。同ページのピンID(例: "ft_FTPoint1")は自サイトの
# fast_travel_points.jsonのid("FTPoint1")に"ft_"を付けたものと完全一致するため、
# これをキーに突き合わせる。
# ══════════════════════════════════════════════════════════════

SOURCE_URL = "https://palworld-lab.com/map/ft/"
FT_POINTS_PATH = "game_data/fast_travel_points.json"
OUTPUT_PATH = "palworld_fast_travel_data.json"
JS_OUTPUT_PATH = "game_data/fast_travel_map_data.js"

MAIN_NX_Y = 6.91855497e-07
MAIN_NX_C = 0.510293691
MAIN_NY_X = -6.94723059e-07
MAIN_NY_C = 0.308358181

TREE_WORLD_MIN_X, TREE_WORLD_MAX_X = 347351.5, 689148.5
TREE_WORLD_MIN_Y, TREE_WORLD_MAX_Y = -818197, -476400


def fetch_text(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8")


def unwrap(o):
    if isinstance(o, list) and len(o) == 2 and o[0] in (0, 1):
        v = o[1]
        if isinstance(v, list):
            return [unwrap(x) for x in v]
        if isinstance(v, dict):
            return {k: unwrap(x) for k, x in v.items()}
        return v
    return o


def extract(page_html, key):
    idx = page_html.find(key)
    start = page_html.rfind('props="', 0, idx) + len('props="')
    end = page_html.find('"', start)
    data = json.loads(html.unescape(page_html[start:end]))
    return [unwrap(x) for x in data[key][1]]


def in_tree_bounds(x, y):
    return TREE_WORLD_MIN_X <= x <= TREE_WORLD_MAX_X and TREE_WORLD_MIN_Y <= y <= TREE_WORLD_MAX_Y


def normalize_main(raw_x, raw_y):
    nx = MAIN_NX_Y * raw_y + MAIN_NX_C
    ny = MAIN_NY_X * raw_x + MAIN_NY_C
    return max(0.0, min(1.0, nx)), max(0.0, min(1.0, ny))


def normalize_tree(raw_x, raw_y):
    nx = (raw_y - TREE_WORLD_MIN_Y) / (TREE_WORLD_MAX_Y - TREE_WORLD_MIN_Y)
    ny = 1 - (raw_x - TREE_WORLD_MIN_X) / (TREE_WORLD_MAX_X - TREE_WORLD_MIN_X)
    return max(0.0, min(1.0, nx)), max(0.0, min(1.0, ny))


def main():
    print("ファストトラベルマップ(日本語名)取得中...")
    recs = extract(fetch_text(SOURCE_URL), "ftData")
    jp_by_id = {r["id"]: r["name"] for r in recs}
    print(f"日本語名件数: {len(jp_by_id)}")

    ft_points = json.load(open(FT_POINTS_PATH, encoding="utf-8"))
    print(f"自サイト座標件数: {len(ft_points)}")

    out = []
    missing_jp = []
    for point in ft_points.values():
        raw_x, raw_y = point["x"], point["y"]
        is_tree = in_tree_bounds(raw_x, raw_y)
        region = "worldtree" if is_tree else "palpagos"
        nx, ny = normalize_tree(raw_x, raw_y) if is_tree else normalize_main(raw_x, raw_y)

        jp_name = jp_by_id.get(f"ft_{point['id']}")
        if not jp_name:
            missing_jp.append(point["id"])

        kind = "watchtower" if point["id"].startswith("WatchTower_") else "fasttravel"
        out.append({
            "id": point["id"], "name_jp": jp_name, "name_en": point["localized_name"],
            "kind": kind, "region": region, "x": round(nx, 5), "y": round(ny, 5),
        })

    if missing_jp:
        print(f"警告: 日本語名が見つからなかった{len(missing_jp)}件(英語名で表示): {missing_jp}")

    json.dump(out, open(OUTPUT_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"{OUTPUT_PATH} written")
    from collections import Counter
    print(Counter((t["region"], t["kind"]) for t in out))

    write_js_consts(JS_OUTPUT_PATH, [("FAST_TRAVEL_MAP_DATA", out)])
    print(f"{JS_OUTPUT_PATH} written")


if __name__ == "__main__":
    main()
