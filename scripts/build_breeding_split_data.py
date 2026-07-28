"""
palworld_palbox.htmlの配合ロードマップ機能向けに、breeding_data.jsを2つに分割する。

- breeding_pals_data.js (BREEDING_PALS_DATA, 数十KB): dex_id/名前/アイコン等の
  基本情報。「所持パル管理」「共有ボックス」タブでも使うため常に読み込む。
- breeding_forward_pairs_data.js (BREEDING_FORWARD_PAIRS_DATA, 1.8MB): 配合の
  親ペア→子の表。「配合ロードマップ」タブを実際に開いた時だけ動的に
  <script>タグを注入して読み込む(2026-07-28、颯太の依頼でforwardPairsも
  完全に遅延読込化)。

reverseParents(子→親候補、breeding.html専用)はどちらにも含めない
(build_breeding_data_no_reverse.pyと同じ理由でpalbox.htmlには不要)。
"""
import json
import re
from pathlib import Path

from js_data_writer import write_js_consts

ROOT = Path(__file__).resolve().parent.parent
SRC_PATH = ROOT / "game_data" / "breeding_data.js"
PALS_OUT = ROOT / "game_data" / "breeding_pals_data.js"
FORWARD_OUT = ROOT / "game_data" / "breeding_forward_pairs_data.js"


def main():
    content = open(SRC_PATH, encoding="utf-8").read()
    m = re.search(r"const BREEDING_DATA\s*=\s*(.*);\s*$", content, re.S)
    data = json.loads(m.group(1))

    write_js_consts(PALS_OUT, [("BREEDING_PALS_DATA", data["pals"])])
    write_js_consts(FORWARD_OUT, [("BREEDING_FORWARD_PAIRS_DATA", data["forwardPairs"])])
    print(f"pals({len(data['pals'])}件) -> {PALS_OUT}")
    print(f"forwardPairs({len(data['forwardPairs'])}件) -> {FORWARD_OUT}")


if __name__ == "__main__":
    main()
