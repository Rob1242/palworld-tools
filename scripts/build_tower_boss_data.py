import html
import json
import urllib.request

from js_data_writer import write_js_consts

# ══════════════════════════════════════════════════════════════
# 2026-07-27 塔ボス(封域ボス)データ新規追加
#
# 出現マップ・パル像マップ・ミッション・拠点おすすめガイドを1ページに統合する
# 作業の一環として追加する新規レイヤー。塔ボスは本島8件・世界樹2件の計10件で、
# 自サイトにはこれまで一切データが無かった。
#
# パルワールド配合・攻略ラボの/map/tboss/ページに埋め込まれたraw world座標
# (internal_x/internal_y、build_statue_data.pyと同じ出典・同じ抽出方法)を使う。
# 座標変換式も同スクリプトと同一のもの(本島=実測フィット式、世界樹=Nifrendil/
# pal-atlasのworldToUv式)を再利用する。
# ══════════════════════════════════════════════════════════════

SOURCE_URL = "https://palworld-lab.com/map/tboss/"
OUTPUT_PATH = "palworld_tower_boss_data.json"
JS_OUTPUT_PATH = "game_data/tower_boss_data.js"

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


def normalize_main(raw_x, raw_y):
    nx = MAIN_NX_Y * raw_y + MAIN_NX_C
    ny = MAIN_NY_X * raw_x + MAIN_NY_C
    return max(0.0, min(1.0, nx)), max(0.0, min(1.0, ny))


def normalize_tree(raw_x, raw_y):
    nx = (raw_y - TREE_WORLD_MIN_Y) / (TREE_WORLD_MAX_Y - TREE_WORLD_MIN_Y)
    ny = 1 - (raw_x - TREE_WORLD_MIN_X) / (TREE_WORLD_MAX_X - TREE_WORLD_MIN_X)
    return max(0.0, min(1.0, nx)), max(0.0, min(1.0, ny))


def main():
    print("塔ボスマップ取得中...")
    recs = extract(fetch_text(SOURCE_URL), "tbossData")
    print(f"取得件数: {len(recs)}")

    out = []
    for r in recs:
        region = "worldtree" if r["map"] == "tree" else "palpagos"
        raw_x, raw_y = r["internal_x"], r["internal_y"]
        nx, ny = normalize_tree(raw_x, raw_y) if region == "worldtree" else normalize_main(raw_x, raw_y)
        out.append({
            "id": r["id"], "name": r["name"], "boss": r.get("sub1") or "",
            "level": r.get("sub2") or "", "region": region,
            "x": round(nx, 5), "y": round(ny, 5),
        })
    out.sort(key=lambda t: (t["region"], t["name"]))

    json.dump(out, open(OUTPUT_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"{OUTPUT_PATH} written")
    for t in out:
        print(f"  [{t['region']}] {t['name']}(Lv{t['level']}) - {t['boss']}")

    write_js_consts(JS_OUTPUT_PATH, [("TOWER_BOSS_DATA", out)])
    print(f"{JS_OUTPUT_PATH} written")


if __name__ == "__main__":
    main()
