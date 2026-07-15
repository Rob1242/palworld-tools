import json
import urllib.request

from js_data_writer import write_js_consts

# ===== 世界樹エリア(Ver1.0新エリア)出現マップ用データ生成 =====
# データ元: https://github.com/Awy64/palworld-atlas-data (MITライセンス、本編マップと同じソース)。
# "tree"リージョンのspawns.jsonレスポンス自体に含まれる`extent`フィールド
# ([minWorldY, minWorldX, maxWorldY, maxWorldX])を使い、線形正規化だけで
# 0〜1のスキーマティック座標に変換する(本編マップのような回転済み画像へのフィッティングではない)。
#
# 世界樹エリアは本編と違い、合法的に再配布可能な背景地図画像のソースが見つからなかった
# (ARXII-13リポジトリには世界樹対応が無く、他に画像を配布しているオープンソースプロジェクトも無い)。
# そのため本ツールでは画像を使わず、ファストトラベル地点(game_data/fast_travel_points.json、
# ユーザー提供の内部データ)を固定アンカーとした「路線図」的なスキーマティック表示にする。

MANIFEST_URL = "https://awy64.github.io/palworld-atlas-data/v1/latest.json"
SPAWN_URL_TEMPLATE = "https://awy64.github.io/palworld-atlas-data/v1/builds/{build}/maps/tree/spawns.json"

BREEDING_PATH = "palworld_breeding_data.json"
FAST_TRAVEL_PATH = "game_data/fast_travel_points.json"
JS_OUTPUT_PATH = "game_data/worldtree_spawn_data.js"

CLUSTER_RADIUS = 0.02  # 正規化座標系(0〜1)での距離


def fetch_json(url):
    with urllib.request.urlopen(url) as resp:
        return json.load(resp)


def cluster_points(points, radius):
    n = len(points)
    parent = list(range(n))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i, j):
        ri, rj = find(i), find(j)
        if ri != rj:
            parent[ri] = rj

    cell = radius
    grid = {}
    for i, p in enumerate(points):
        key = (int(p["nx"] // cell), int(p["ny"] // cell))
        grid.setdefault(key, []).append(i)

    for (gx, gy), idxs in grid.items():
        neighbor_idxs = []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                neighbor_idxs.extend(grid.get((gx + dx, gy + dy), []))
        for i in idxs:
            pi = points[i]
            for j in neighbor_idxs:
                if j <= i:
                    continue
                pj = points[j]
                dx = pi["nx"] - pj["nx"]
                dy = pi["ny"] - pj["ny"]
                if dx * dx + dy * dy <= radius * radius:
                    union(i, j)

    groups = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(i)

    results = []
    for idxs in groups.values():
        count = len(idxs)
        nx = sum(points[i]["nx"] for i in idxs) / count
        ny = sum(points[i]["ny"] for i in idxs) / count
        results.append({
            "x": round(nx, 5),
            "y": round(ny, 5),
            "count": count,
            "minLevel": min(points[i]["minLevel"] for i in idxs),
            "maxLevel": max(points[i]["maxLevel"] for i in idxs),
            "availability": (
                points[idxs[0]]["availability"]
                if len({points[i]["availability"] for i in idxs}) == 1
                else "mixed"
            ),
        })
    results.sort(key=lambda r: -r["count"])
    return results


def main():
    print("manifest取得中…")
    manifest = fetch_json(MANIFEST_URL)
    build_id = manifest["buildPath"].split("/")[-1]
    print(f"build {build_id}")

    spawn_url = SPAWN_URL_TEMPLATE.format(build=build_id)
    print("tree spawns.json取得中…")
    data = fetch_json(spawn_url)
    print(f"取得完了: {len(data['spawns'])}件, extent={data['extent']}")

    min_y, min_x, max_y, max_x = data["extent"]

    def normalize(world_x, world_y):
        nx = (world_y - min_y) / (max_y - min_y)
        ny = 1 - (world_x - min_x) / (max_x - min_x)
        return nx, ny

    breeding = json.load(open(BREEDING_PATH, encoding="utf-8"))
    assets = breeding["pals"]

    by_pal = {}
    for s in data["spawns"]:
        nx, ny = normalize(s["worldX"], s["worldY"])
        entry = {
            "nx": nx, "ny": ny,
            "minLevel": s["minLevel"], "maxLevel": s["maxLevel"],
            "availability": s["availability"], "kind": s["kind"],
        }
        by_pal.setdefault(s["palId"], []).append(entry)

    results = []
    skipped = []
    for pal_id, points in sorted(by_pal.items()):
        info = assets.get(pal_id)
        if not info or not info.get("dex_id"):
            skipped.append(pal_id)
            continue
        wild = [p for p in points if p["kind"] == "wild"]
        alpha = [p for p in points if p["kind"] == "alpha"]
        entry = {"asset": pal_id, "dexId": info["dex_id"]}
        if wild:
            entry["wildZones"] = cluster_points(wild, CLUSTER_RADIUS)
        if alpha:
            entry["alphaZones"] = cluster_points(alpha, CLUSTER_RADIUS)
        results.append(entry)

    results.sort(key=lambda r: int(r["dexId"]))

    fast_travel_raw = json.load(open(FAST_TRAVEL_PATH, encoding="utf-8"))
    landmarks = []
    for point in fast_travel_raw.values():
        if not point["id"].startswith("WorldTree"):
            continue
        nx, ny = normalize(point["x"], point["y"])
        kind = "boss" if "Boss" in point["id"] or point["id"] == "WorldTree_lab" else "fasttravel"
        landmarks.append({
            "id": point["id"],
            "name_en": point["localized_name"],
            "x": round(nx, 5),
            "y": round(ny, 5),
            "kind": kind,
        })

    output = {
        "steamBuildId": build_id,
        "generatedAt": manifest["generatedAt"],
        "extent": data["extent"],
        "landmarks": landmarks,
        "pals": results,
    }
    write_js_consts(JS_OUTPUT_PATH, [("WORLDTREE_SPAWN_DATA", output)])

    print(f"パルID総数: {len(by_pal)}, 突き合わせ成功: {len(results)}, スキップ: {len(skipped)}")
    print(f"landmarks: {len(landmarks)}")
    print(f"{JS_OUTPUT_PATH} 書き出し完了")


if __name__ == "__main__":
    main()
