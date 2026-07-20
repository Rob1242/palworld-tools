import json
import urllib.request

from js_data_writer import write_js_consts

# ===== パルワールド スポーンマップ用データ生成 =====
# データ元: https://github.com/Awy64/palworld-atlas-data (MITライセンス)
# Palworld専用サーバーパッケージ自体が持つ生成テーブル(DT_PalWildSpawner /
# DT_PalSpawnerPlacement / DT_BossSpawnerLoactionData)から直接抽出された、
# 野生パルの出現座標データ。6時間ごとに自動更新される。
#
# 座標変換式は https://github.com/ARXII-13/Palworld-Interactive-Map (Apache-2.0ライセンス。
# palworld-atlas-dataとライセンスが異なるので混同しないこと)
# (pal-map/frontend/src/components/map/utils.ts)のworldToMap/worldToLeaflet
# を移植したもの。既知のボス座標(アヌビス・チルレット)で実際に地形と
# 一致することを確認済み。マップ画像はT_WorldMap_85.webp(8192x8192、
# 同リポジトリからそのまま取得・リサイズ)を使用。

MANIFEST_URL = "https://awy64.github.io/palworld-atlas-data/v1/latest.json"
SPAWN_URL_TEMPLATE = "https://awy64.github.io/palworld-atlas-data/v1/builds/{build}/maps/palpagos/spawns.json"

BREEDING_PATH = "palworld_breeding_data.json"
JSON_OUTPUT_PATH = "palworld_spawn_data.json"
JS_OUTPUT_PATH = "game_data/spawn_data.js"

# ARXII-13/Palworld-Interactive-Map の座標変換定数(検証済み)
TRANSLATION_X = 123930.0
TRANSLATION_Y = 157935.0
SCALE = 459.0
REF_IMAGE_SIZE = 8192.0
GAME_MIN_X, GAME_MAX_X = -1951, 1198
GAME_MIN_Y, GAME_MAX_Y = -1893, 1243
MAP_WIDTH = GAME_MAX_X - GAME_MIN_X
MAP_HEIGHT = GAME_MAX_Y - GAME_MIN_Y
TRANSFORM_A = REF_IMAGE_SIZE / MAP_WIDTH
TRANSFORM_B = 5075.45
TRANSFORM_C = -REF_IMAGE_SIZE / MAP_HEIGHT
TRANSFORM_D = 4960.62

CLUSTER_RADIUS = 60  # マップ座標系での距離。点同士の最近傍距離で連結するsingle-linkage方式


def fetch_json(url):
    with urllib.request.urlopen(url) as resp:
        return json.load(resp)


def world_to_map(world_x, world_y):
    map_x = (world_y - TRANSLATION_Y) / SCALE
    map_y = -((world_x + TRANSLATION_X) / SCALE)
    return map_x, map_y


def map_to_normalized(map_x, map_y):
    # ARXII-13のLeaflet実装はCRS.Simple(Y軸が下から上に増える、通常の画像ピクセルとは逆)で
    # bounds=[[0,0],[8192,8192]]を使っているため、Leaflet空間のY(=下から上)を
    # 画像ピクレルのY(=上から下)に変換するには反転が必要(実データで検証して発見)。
    px = TRANSFORM_A * map_x + TRANSFORM_B
    leaflet_y = TRANSFORM_C * map_y + TRANSFORM_D
    py = REF_IMAGE_SIZE - leaflet_y
    return px / REF_IMAGE_SIZE, py / REF_IMAGE_SIZE


def cluster_points(points, radius):
    # 最近傍点同士の距離がradius以内なら同じゾーンとして連結する(single-linkage)。
    # 重心(平均座標)に対する距離で判定する単純な貪欲法だと、海を挟んだ離れ小島同士が
    # 「重心が海上に来る」形で誤って連結されてしまうため(実データで確認済みのバグ)、
    # 必ず「既存クラスタ内の最も近い点」との距離で判定するunion-findを使う。
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

    # グリッドに分割し、同じ/隣接セルの点同士だけ距離判定することでO(n^2)を避ける
    cell = radius
    grid = {}
    for i, p in enumerate(points):
        key = (int(p["mapX"] // cell), int(p["mapY"] // cell))
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
                dx = pi["mapX"] - pj["mapX"]
                dy = pi["mapY"] - pj["mapY"]
                if dx * dx + dy * dy <= radius * radius:
                    union(i, j)

    groups = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(i)

    results = []
    for idxs in groups.values():
        sum_x = sum(points[i]["mapX"] for i in idxs)
        sum_y = sum(points[i]["mapY"] for i in idxs)
        count = len(idxs)
        nx, ny = map_to_normalized(sum_x / count, sum_y / count)
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


# 出現分布を「密度の点群」として細かく見たいという要望向けに、クラスタ集計とは別に
# 生の座標も出力する(2026-07-18)。件数が多いパル(MimicDog等は野生だけで5000件近い)を
# DOM要素で個別描画すると重くなるため、点群はCanvas描画を前提にした軽量フォーマットにする:
# [x, y, availCode] のフラット配列(availCode: 0=昼夜問わず, 1=昼のみ, 2=夜のみ, 3=昼夜混在)。
AVAILABILITY_CODE = {"both": 0, "day": 1, "night": 2, "mixed": 3}


def points_to_flat(points):
    flat = []
    for p in points:
        nx, ny = map_to_normalized(p["mapX"], p["mapY"])
        flat.append(round(nx, 4))
        flat.append(round(ny, 4))
        flat.append(AVAILABILITY_CODE.get(p["availability"], 3))
    return flat


def main():
    print("manifest取得中…")
    manifest = fetch_json(MANIFEST_URL)
    build_id = manifest["buildPath"].split("/")[-1]
    print(f"build {build_id} ({manifest['generatedAt']})")

    spawn_url = SPAWN_URL_TEMPLATE.format(build=build_id)
    print("spawns.json取得中…(17MB程度あります)")
    data = fetch_json(spawn_url)
    print(f"取得完了: {len(data['spawns'])}件")

    breeding = json.load(open(BREEDING_PATH, encoding="utf-8"))
    assets = breeding["pals"]

    by_pal = {}
    for s in data["spawns"]:
        map_x, map_y = world_to_map(s["worldX"], s["worldY"])
        entry = {
            "mapX": map_x, "mapY": map_y,
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
            entry["wildPoints"] = points_to_flat(wild)
        if alpha:
            entry["alphaZones"] = cluster_points(alpha, CLUSTER_RADIUS)
            entry["alphaPoints"] = points_to_flat(alpha)
        results.append(entry)

    results.sort(key=lambda r: int(r["dexId"]))

    output = {
        "steamBuildId": build_id,
        "generatedAt": manifest["generatedAt"],
        "pals": results,
    }
    json.dump(output, open(JSON_OUTPUT_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    write_js_consts(JS_OUTPUT_PATH, [("SPAWN_DATA", output)])

    print(f"パルID総数: {len(by_pal)}, 突き合わせ成功: {len(results)}, スキップ: {len(skipped)}")
    if skipped:
        print("スキップされたpalId(図鑑データと未紐付け):", skipped)
    print(f"{JSON_OUTPUT_PATH} / {JS_OUTPUT_PATH} 書き出し完了")


if __name__ == "__main__":
    main()
