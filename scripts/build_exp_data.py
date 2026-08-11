"""経験値計算ツール用のデータを作る。

元は `game_data/pal_exp_table.json`(ユーザー提供の生データマイン、2026-07-11取得)。
すでにリポジトリにあったが、これを使う画面がひとつも無かった(2026-08-11の調査で判明)。

■ Lv80で切っている理由(実測、2026-08-11)

表は Lv100 まであるが、**正式版1.0のレベル上限はプレイヤー・パルとも80**。
81以降は使い物にならないことを数字で確認した:

    NextEXP   Lv81で減少する(Lv80: 4,296,550 → Lv81: それ未満)
    DropEXP   Lv81で減少する
    Lv80まで  NextEXP/TotalEXP/PalNextEXP/PalTotalEXP/DropEXP すべて単調増加

上限を上げた時に表の後ろが作り直されていない、旧データの残骸と見られる。
**表にあるからといって出さない。** 出せば「Lv100まで上げられる」と誤解させる。

■ PalNextEXP が Lv66以降ずっと同じ値(6,896,858)

これは残骸とは断定できない。PalTotalEXP は毎レベル 6,896,858 ずつ正しく
増えており、データとして自己矛盾していない(旧上限が65だったことと関係が
ありそうだが、確かめられていない)。**勝手に補正せず、そのまま出して
画面に注記する。** 推測で数字を作らないこと。

■ 各列の意味

    NextEXP     そのLvから次のLvへ上がるのに必要な経験値(プレイヤー)
    TotalEXP    Lv1からそのLvまでの累計(プレイヤー)
    PalNextEXP  同上(パル)
    PalTotalEXP 同上(パル)
    DropEXP     そのLvの相手を倒したときに得られる経験値
    BuildEXP / CraftEXP / PalBuildEXP / PalCraftEXP
                建築・製作で得られる経験値(プレイヤー / パル)
"""
import json
from pathlib import Path

from js_data_writer import write_js_consts

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "game_data" / "pal_exp_table.json"
OUT = ROOT / "game_data" / "exp_table_data.js"

LEVEL_CAP = 80          # 正式版1.0の上限。ここを上げる前に必ず表の単調性を測り直すこと

COLUMNS = ["NextEXP", "TotalEXP", "PalNextEXP", "PalTotalEXP",
           "DropEXP", "BuildEXP", "CraftEXP", "PalBuildEXP", "PalCraftEXP"]


def check_monotonic(rows):
    """Lv80までが単調増加であることを毎回確かめる。崩れたら止める。

    生データを差し替えたときに、気づかないまま壊れた表を配るのを防ぐため。
    """
    problems = []
    for col in ["NextEXP", "TotalEXP", "PalNextEXP", "PalTotalEXP", "DropEXP"]:
        for lv in range(2, LEVEL_CAP + 1):
            if rows[lv][col] < rows[lv - 1][col]:
                problems.append(f"{col} が Lv{lv} で減少 "
                                f"({rows[lv-1][col]:,} → {rows[lv][col]:,})")
    return problems


def main():
    raw = json.loads(SRC.read_text(encoding="utf-8"))
    rows = {int(k): v for k, v in raw.items()}

    problems = check_monotonic(rows)
    if problems:
        raise SystemExit("Lv80までの表が単調増加になっていない:\n  " + "\n  ".join(problems))

    table = {str(lv): {c: rows[lv][c] for c in COLUMNS}
             for lv in range(1, LEVEL_CAP + 1)}

    # PalNextEXP が横ばいになる区間を、画面の注記用にデータ側から出しておく
    # (画面に数字を直書きすると、生データを差し替えたときにずれる)
    flat_from = None
    for lv in range(2, LEVEL_CAP + 1):
        if rows[lv]["PalNextEXP"] == rows[lv - 1]["PalNextEXP"]:
            if flat_from is None:
                flat_from = lv
        else:
            flat_from = None

    meta = {"levelCap": LEVEL_CAP,
            "palNextFlatFrom": flat_from,
            "palNextFlatValue": rows[flat_from]["PalNextEXP"] if flat_from else None}

    write_js_consts(OUT, [("EXP_TABLE", table), ("EXP_META", meta)])
    print(f"Lv1〜{LEVEL_CAP} の {len(table)}行 -> {OUT}")
    print(f"  単調性チェック: 問題なし")
    print(f"  PalNextEXP は Lv{flat_from} 以降 {meta['palNextFlatValue']:,} で横ばい")
    print(f"  Lv{LEVEL_CAP}到達に必要: プレイヤー {rows[LEVEL_CAP]['TotalEXP']:,} / "
          f"パル {rows[LEVEL_CAP]['PalTotalEXP']:,}")


if __name__ == "__main__":
    main()
