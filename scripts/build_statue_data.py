import html
import json
import re
import urllib.request

from js_data_writer import write_js_consts

# ══════════════════════════════════════════════════════════════
# 2026-07-27 データソース刷新(世界樹エリア対応・新種追加)
#
# 旧実装はpaldb.ccの本島限定データ(360件)のみを使っていたが、ユーザーが
# palworld-lab.com/map/relic/ で確認したところ、実際には世界樹エリアにも
# 47件(クルリス像15/ヤクモマル像2/ツッパニャン像30)存在し、うち
# ツッパニャン像は本島には一体も無い、旧データに無かった12種目だと判明した。
#
# palworld-lab.comの当該ページはAstroの島(props属性)にピン座標データを
# 生データのまま埋め込んでおり(relicData、407件、本島+世界樹の両方を含む)、
# 内部のraw world座標(internal_x/internal_y)はpaldb.cc由来の座標と数値が
# ほぼ一致することを確認済み(同じゲームファイルが最終的な出典)。
# 像の種族はsub3フィールド(内部アセット名、例:"Carbunclo")で識別でき、
# 自サイトのアイコンファイル名(T_<アセット名>_icon_normal.webp)と直接
# 突き合わせられる。
#
# 座標変換式は本島=build_curated_landmarks.pyと同一の実測フィット式、
# 世界樹=Nifrendil/pal-atlas(build_worldtree_data.pyで導入済み)のworldToUv
# 式をそのまま使う(自サイトの世界樹背景画像と同じ座標系のため)。
# ══════════════════════════════════════════════════════════════

SOURCE_URL = "https://palworld-lab.com/map/relic/"
DEX_PATH = "palworld_dex_data.json"
OUTPUT_PATH = "palworld_statue_data.json"
JS_OUTPUT_PATH = "game_data/statue_data.js"

# 本島座標変換(build_curated_landmarks.pyと同一、誤差5e-6以下)
MAIN_NX_Y = 6.91855497e-07
MAIN_NX_C = 0.510293691
MAIN_NY_X = -6.94723059e-07
MAIN_NY_C = 0.308358181

# 世界樹座標変換(Nifrendil/pal-atlas coords.ts worldToUv、build_worldtree_data.pyと同じ出典)
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


def extract_relic_data(page_html):
    idx = page_html.find("relicData")
    start = page_html.rfind('props="', 0, idx) + len('props="')
    end = page_html.find('"', start)
    data = json.loads(html.unescape(page_html[start:end]))
    return [unwrap(x) for x in data["relicData"][1]]


def build_asset_index(dex):
    idx = {}
    for p in dex:
        m = re.match(r"game_data/icons/pals/T_(.+?)_icon_normal\.webp", p.get("icon") or "")
        if m:
            idx[m.group(1)] = p
    return idx


def normalize_main(raw_x, raw_y):
    nx = MAIN_NX_Y * raw_y + MAIN_NX_C
    ny = MAIN_NY_X * raw_x + MAIN_NY_C
    return max(0.0, min(1.0, nx)), max(0.0, min(1.0, ny))


def normalize_tree(raw_x, raw_y):
    nx = (raw_y - TREE_WORLD_MIN_Y) / (TREE_WORLD_MAX_Y - TREE_WORLD_MIN_Y)
    ny = 1 - (raw_x - TREE_WORLD_MIN_X) / (TREE_WORLD_MAX_X - TREE_WORLD_MIN_X)
    return max(0.0, min(1.0, nx)), max(0.0, min(1.0, ny))


def main():
    print("palworld-lab.com パル像マップ取得中...")
    recs = extract_relic_data(fetch_text(SOURCE_URL))
    print(f"取得件数: {len(recs)}")

    dex = json.load(open(DEX_PATH, encoding="utf-8"))
    asset_idx = build_asset_index(dex)

    points = []
    type_meta = {}
    unmatched_assets = set()
    for r in recs:
        asset = r.get("sub3") or ""
        pal = asset_idx.get(asset)
        if not pal:
            unmatched_assets.add(asset or r["name"])
            continue

        region = "worldtree" if r["map"] == "tree" else "palpagos"
        raw_x, raw_y = r["internal_x"], r["internal_y"]
        nx, ny = normalize_tree(raw_x, raw_y) if region == "worldtree" else normalize_main(raw_x, raw_y)

        point_id = f"{asset}|{round(raw_x)}|{round(raw_y)}"
        points.append({
            "id": point_id, "type": asset, "region": region,
            "x": round(nx, 5), "y": round(ny, 5),
        })
        if asset not in type_meta:
            type_meta[asset] = {
                "type": asset,
                "jp_name": r["name"],
                "dex_id": pal["id"],
                "effect": r.get("sub2") or "",
            }

    if unmatched_assets:
        print(f"警告: 図鑑と紐付かなかった像 {len(unmatched_assets)}件: {unmatched_assets}")

    types_out = []
    for asset, meta in type_meta.items():
        count = sum(1 for p in points if p["type"] == asset)
        region_counts = {
            "palpagos": sum(1 for p in points if p["type"] == asset and p["region"] == "palpagos"),
            "worldtree": sum(1 for p in points if p["type"] == asset and p["region"] == "worldtree"),
        }
        types_out.append({**meta, "count": count, "regionCounts": region_counts})
    types_out.sort(key=lambda t: int(t["dex_id"]))

    out = {"effigyTypes": types_out, "points": points}
    json.dump(out, open(OUTPUT_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"{OUTPUT_PATH} written")

    for t in types_out:
        print(f"  {t['jp_name']} ({t['type']}): 本島{t['regionCounts']['palpagos']} / 世界樹{t['regionCounts']['worldtree']} = 計{t['count']}件 [{t['effect']}]")
    print(f"合計: {len(points)}件")

    write_js_consts(JS_OUTPUT_PATH, [("STATUE_DATA", out)])
    print(f"{JS_OUTPUT_PATH} written")


if __name__ == "__main__":
    main()
