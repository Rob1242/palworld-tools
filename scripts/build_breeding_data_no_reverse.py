"""
palworld_palbox.html はBREEDING_DATA.reverseParents(子→親候補、1.4MB)を
一切使っていない(grep で確認済み。使うのはpalworld_breeding.htmlの「子→親候補」
モードのみ)。にもかかわらず同じbreeding_data.js(3.3MB)を丸ごと読み込んでいた
(2026-07-28、颯太からの指摘で調査)。

reverseParentsを除いた版を別ファイルとして生成し、palbox.htmlはこちらを読む。
既存のBREEDING_DATA.pals/BREEDING_DATA.forwardPairs参照はそのまま動くよう、
変数名・キー構造は完全に同じにする(コード側の変更を最小化するため)。
"""
import json
import re
from pathlib import Path

from js_data_writer import write_js_consts

ROOT = Path(__file__).resolve().parent.parent
SRC_PATH = ROOT / "game_data" / "breeding_data.js"
OUT_PATH = ROOT / "game_data" / "breeding_data_no_reverse.js"


def main():
    content = open(SRC_PATH, encoding="utf-8").read()
    m = re.search(r"const BREEDING_DATA\s*=\s*(.*);\s*$", content, re.S)
    data = json.loads(m.group(1))
    trimmed = {"pals": data["pals"], "forwardPairs": data["forwardPairs"]}
    write_js_consts(OUT_PATH, [("BREEDING_DATA", trimmed)])
    print(f"reverseParents({len(data.get('reverseParents', {}))}件)を除外 -> {OUT_PATH}")


if __name__ == "__main__":
    main()
