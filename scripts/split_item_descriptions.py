"""アイテムの説明文を、詳細を開いたときだけ読む別ファイルに分ける。

2026-08-12に追加。items_dex_data.js(1,392KB)は一覧のカード描画にも
サイト内検索にも使われるが、**説明文は詳細モーダルでしか読まれない**
(pages/items.js の modal-desc の1箇所だけ。他のページ・共通JSからの参照は無い)。

    description_en  235KB
    description_jp  124KB
    キー名の繰り返し 2,466件 × 2項目分

一覧と検索から外すと、両方が軽くなる(検索は shared/global_search.js が
items_dex_data.js を動的に読むため、そちらにも効く)。

■ name_jp_literal は残す

一見使っていなさそうだが pages/items.js が表示に使っている。**消さないこと。**

■ 再実行について

説明文を分離済みのファイルに対して流すと何も起きない(description_* が無いため)。
元データを作り直したら、このスクリプトも流し直す。
"""
import json
from pathlib import Path

from js_data_writer import write_js_consts

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "game_data" / "items_dex_data.js"
DESC_OUT = ROOT / "game_data" / "items_desc_data.js"

DESC_FIELDS = ("description_jp", "description_en")


def main():
    src = SRC.read_text(encoding="utf-8")
    items = json.loads(src[src.index("=") + 1:].strip().rstrip(";"))

    if not any(any(f in it for f in DESC_FIELDS) for it in items):
        raise SystemExit("説明文は既に分離済み。二重実行を防ぐため中止する")

    desc = {}
    for it in items:
        row = {}
        for f in DESC_FIELDS:
            v = it.pop(f, None)
            if v:
                row[f] = v
        if row:
            desc[it["asset"]] = row

    before = SRC.stat().st_size
    write_js_consts(SRC, [("ITEMS_DEX_DATA", items)])
    write_js_consts(DESC_OUT, [("ITEMS_DESC_DATA", desc)])

    print(f"アイテム {len(items)}件 / 説明文を持つもの {len(desc)}件")
    print(f"  一覧・検索用 {SRC.name}: {before/1024:.0f}KB -> {SRC.stat().st_size/1024:.0f}KB")
    print(f"  詳細用 {DESC_OUT.name}: {DESC_OUT.stat().st_size/1024:.0f}KB(開いたときだけ読む)")


if __name__ == "__main__":
    main()
