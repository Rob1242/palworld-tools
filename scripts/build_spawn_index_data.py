"""出現マップのパル選択欄に出す「どのパルが出現するか」だけの索引を作る。

2026-08-12に追加。出現マップは起動時に spawn_data.js(1,180KB)と
worldtree_spawn_data.js(164KB)を読み、**パル選択欄の候補を作るためだけに**
全件を舐めていた。座標が要るのは「パルを選んだあと」だけ。

    PAL_LISTS = { palpagos: buildPalList(SPAWN_DATA), worldtree: buildPalList(...) }
    → 使うのは dexId / 名前 / アイコン。名前とアイコンは PAL_DEX_DATA 側にある

つまり索引に要るのは **出現するパルの dexId の並び** だけ。

■ 効くのはパル選択以外の使い方

出現マップは4つのビューを持つ(地図 / パル像 / ミッション / 拠点おすすめ)。
パル像やミッションを見に来た人は座標データを一切使わないのに、
今までは全員が1.3MBを落としていた。

■ 順序を保つこと

索引は spawn_data.js の pals の並び順をそのまま保つ。検索結果の並びが
今までと変わらないようにするため。
"""
import json
from pathlib import Path

from js_data_writer import write_js_consts

ROOT = Path(__file__).resolve().parent.parent
SOURCES = {
    "palpagos": ROOT / "game_data" / "spawn_data.js",
    "worldtree": ROOT / "game_data" / "worldtree_spawn_data.js",
}
OUT = ROOT / "game_data" / "spawn_index_data.js"


def main():
    index, total, landmarks = {}, 0, []
    for region, path in SOURCES.items():
        src = path.read_text(encoding="utf-8")
        data = json.loads(src[src.index("=") + 1:].strip().rstrip(";"))
        # 並び順は元のまま(検索結果の順序を変えないため)
        index[region] = [str(p["dexId"]) for p in data["pals"]]
        # 世界樹エリアの目印(15件・2KB)は地域を切り替えた瞬間に要る。
        # これだけのために164KBを読ませたくないので索引に同梱する。
        if region == "worldtree":
            landmarks = data.get("landmarks") or []
        total += path.stat().st_size
        print(f"  {region:10} {len(index[region])}体  ({path.name} {path.stat().st_size/1024:.0f}KB)")

    write_js_consts(OUT, [("SPAWN_INDEX_DATA", index),
                          ("WORLDTREE_LANDMARKS_DATA", landmarks)])
    print(f"  世界樹の目印 {len(landmarks)}件を同梱")
    print(f"  -> {OUT.name} {OUT.stat().st_size/1024:.1f}KB")
    print(f"  起動時の削減: {(total - OUT.stat().st_size)/1024:.0f}KB")


if __name__ == "__main__":
    main()
