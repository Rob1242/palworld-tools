"""技図鑑のデータを「一覧用」と「詳細用(習得パル)」に分ける。

2026-08-12に追加。技図鑑は skills_page_data.js(1,552KB)を丸ごと読んでいたが、
**そのうち 1,380KB は learners(習得できるパルの一覧)** で、
詳細を開いたときにしか使わない(pages/skills.js の詳細描画だけが参照)。

一覧を出すだけなら 172KB で足りる。パル図鑑が2026-08-11に同じことをしている
(dex.js の ensureDetailData)ので、その作法に合わせる。

■ learners から icon を落とす

learners の各要素はこうなっている:

    {"asset":"FlowerPrince","dex_id":"286","name_jp":"ノクサージュ",
     "icon":"game_data/icons/pals/T_FlowerPrince_icon_normal.webp",
     "source":"levelup","level":70}

icon は asset から機械的に作れる(`game_data/icons/pals/T_{asset}_icon_normal.webp`)。
**ただし例外が1件でもあれば落とさない。** 生成時に全件を突き合わせて確認し、
食い違いがあればそのファイルだけ icon を残す。
"""
import json
import re
from pathlib import Path

from js_data_writer import write_js_consts

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "game_data" / "skills_page_data.js"
LIST_OUT = ROOT / "game_data" / "skills_page_data.js"          # 一覧用(上書き)
LEARN_OUT = ROOT / "game_data" / "skills_learners_data.js"     # 詳細用

ICON_FMT = "game_data/icons/pals/T_{asset}_icon_normal.webp"


def main():
    src = SRC.read_text(encoding="utf-8")
    skills = json.loads(src[src.index("=") + 1:].strip().rstrip(";"))

    if not any("learners" in s for s in skills):
        raise SystemExit("learners が既に分離済み。二重実行を防ぐため中止する")

    # icon が asset から復元できるかを全件で確認する
    total = mismatch = 0
    for s in skills:
        for l in s.get("learners") or []:
            total += 1
            if l.get("icon") and l["icon"] != ICON_FMT.format(asset=l.get("asset", "")):
                mismatch += 1
    drop_icon = mismatch == 0
    print(f"learners の要素 {total}件 / icon が規則どおりでないもの {mismatch}件"
          f" -> icon を{'落とす' if drop_icon else '残す'}")

    learners = {}
    for s in skills:
        ls = s.pop("learners", None)
        if not ls:
            continue
        rows = []
        for l in ls:
            row = {k: l[k] for k in ("asset", "dex_id", "name_jp", "source", "level") if k in l}
            if not drop_icon and l.get("icon"):
                row["icon"] = l["icon"]
            rows.append(row)
        learners[s["asset"]] = rows

    before = SRC.stat().st_size
    write_js_consts(LIST_OUT, [("SKILLS_PAGE_DATA", skills)])
    write_js_consts(LEARN_OUT, [("SKILLS_LEARNERS_DATA", learners)])

    print(f"  一覧用 {LIST_OUT.name}: {before/1024:.0f}KB -> {LIST_OUT.stat().st_size/1024:.0f}KB")
    print(f"  詳細用 {LEARN_OUT.name}: {LEARN_OUT.stat().st_size/1024:.0f}KB(開いたときだけ読む)")
    print(f"  技 {len(skills)}件 / 習得情報を持つ技 {len(learners)}件")


if __name__ == "__main__":
    main()
