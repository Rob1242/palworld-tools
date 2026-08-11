"""技の内部名 -> 日本語名 の小さな対応表を作る。

2026-08-12に追加。パルボックスは起動時に learnset_data.js(537KB)を丸ごと読み、
**技名の対応表を作るためだけに全走査**していた:

    Object.values(LEARNSET_DATA).forEach(arr => arr.forEach(e => {
      if(!(e.asset in ALL_SKILLS_MAP)) ALL_SKILLS_MAP[e.asset] = e.jp_name;
    }));

出来上がるのは 313件・16.4KB の対応表。537KB を読む必要は無い。
learnset_data.js 本体は「そのパルが覚える技」を出す詳細画面でだけ使うので、
開いたときに読む形に変えた。

■ learnset_data.js を作り直したら、ここも回すこと
"""
import json
from pathlib import Path

from js_data_writer import write_js_consts

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "game_data" / "learnset_data.js"
OUT = ROOT / "game_data" / "skill_names_data.js"


def main():
    src = SRC.read_text(encoding="utf-8")
    data = json.loads(src[src.index("=") + 1:].strip().rstrip(";"))

    names = {}
    for arr in data.values():
        for e in arr:
            names.setdefault(e["asset"], e.get("jp_name"))

    write_js_consts(OUT, [("SKILL_NAMES_DATA", names)])
    print(f"技 {len(names)}件")
    print(f"  {SRC.stat().st_size/1024:.0f}KB -> {OUT.stat().st_size/1024:.1f}KB")


if __name__ == "__main__":
    main()
