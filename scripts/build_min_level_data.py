"""パルごとの「野生で出現する最低レベル」だけを持つ小さな表を作る。

2026-08-12に追加。パーティ編成ガイドは spawn_data.js(1,180KB)を読み込んでいたが、
**使っていたのは1箇所だけ**だった:

    SPAWN_DATA.pals.forEach(s => {
      const levels = (s.wildZones||[]).map(z => z.minLevel).filter(x => x != null);
      if (levels.length) minLevelByAsset[s.dexId] = Math.min(...levels);
    });

つまり dexId -> 最低出現レベル の対応さえあればよく、座標や出現数は一切見ていない。
1,180KB のうち実際に必要なのは数KB。

■ dex_data.js の tier では代用できない

tier は early(<=15) / mid(<=35) / late / special の4段階に丸めた値。
パーティ編成ガイドの序盤タブは **minLevel <= 5** で絞っており、tier より細かい。
だから丸める前の数値が要る。

■ 出現マップ(palworld_map.html)はそのまま

あちらは座標を描くので spawn_data.js 本体が必要。このファイルは
パーティ編成ガイド専用。

■ spawn_data.js を作り直したら、ここも回すこと
"""
import json
from pathlib import Path

from js_data_writer import write_js_consts

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "game_data" / "spawn_data.js"
OUT = ROOT / "game_data" / "min_level_data.js"


def main():
    src = SRC.read_text(encoding="utf-8")
    data = json.loads(src[src.index("=") + 1:].strip().rstrip(";"))

    table = {}
    for p in data["pals"]:
        levels = [z.get("minLevel") for z in (p.get("wildZones") or [])]
        levels = [x for x in levels if x is not None]
        if levels:
            table[str(p["dexId"])] = min(levels)

    write_js_consts(OUT, [("MIN_LEVEL_BY_DEX_ID", table)])

    before = SRC.stat().st_size
    after = OUT.stat().st_size
    print(f"{len(table)}体 の最低出現レベル")
    print(f"  {before/1024:.0f}KB -> {after/1024:.1f}KB({(before-after)/1024:.0f}KB削減)")
    lv5 = sum(1 for v in table.values() if v <= 5)
    print(f"  Lv5以下で出現するパル: {lv5}体(序盤タブの対象)")


if __name__ == "__main__":
    main()
