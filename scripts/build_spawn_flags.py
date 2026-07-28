"""
palworld_dex.html・palworld_breeding.htmlは「このパルに出現地点データがあるか」の
真偽値だけを使うために、1.2MBあるspawn_data.js(全パルの詳細な出現座標)を丸ごと
読み込んでいた(2026-07-28、颯太からの重い指摘で発覚)。実際に必要なのはdexId/asset
単位の真偽値だけなので、軽量なフラグ一覧を別途生成する。

(palworld_party_guide.htmlは各出現ゾーンのminLevelを実際に使っているため対象外、
そちらは引き続きspawn_data.js本体を読み込む)
"""
import json
import re
from pathlib import Path

from js_data_writer import write_js_consts

ROOT = Path(__file__).resolve().parent.parent
SPAWN_JSON = ROOT / "palworld_spawn_data.json"
WORLDTREE_JS = ROOT / "game_data" / "worldtree_spawn_data.js"
OUT_PATH = ROOT / "game_data" / "spawn_flags_data.js"


def load_js_const(path, name):
    content = open(path, encoding="utf-8").read()
    m = re.search(rf"const {name}\s*=\s*(.*);\s*$", content, re.S)
    return json.loads(m.group(1))


def main():
    main_data = json.load(open(SPAWN_JSON, encoding="utf-8"))
    worldtree_data = load_js_const(WORLDTREE_JS, "WORLDTREE_SPAWN_DATA")

    by_dexid = {}
    by_asset = {}
    for p in main_data["pals"]:
        if p.get("wildZones") or p.get("alphaZones"):
            by_dexid[p["dexId"]] = True
            by_asset[p["asset"]] = True
    for p in worldtree_data.get("pals", []):
        if p.get("wildZones") or p.get("alphaZones"):
            by_asset[p["asset"]] = True

    write_js_consts(OUT_PATH, [
        ("SPAWN_FLAGS_DATA", by_dexid),
        ("SPAWN_FLAGS_BY_ASSET_DATA", by_asset),
    ])
    print(f"dexId基準: {len(by_dexid)}件 / asset基準(本土+世界樹): {len(by_asset)}件 -> {OUT_PATH}")


if __name__ == "__main__":
    main()
