"""素材計算機が使う分だけに絞ったアイテムデータを作る。

2026-08-12に追加。素材計算機は items_dex_data.js(1,392KB)を読んでいたが、
**実際に使っているのは5フィールドだけ**だった。

    asset / name_jp / name_en / icon / category

内訳を測ると、容量の大半は使っていない説明文が占めていた:

    description_en  235KB   ← 使っていない
    icon            148KB
    description_jp  124KB   ← 使っていない
    asset            53KB
    name_en          52KB
    name_jp          27KB
    その他(subcategory / price / weight / max_stack / rank / rarity 等) 約70KB

5フィールドだけなら480KB。**912KB削れる。**

■ items_obtain_data.js はそのまま読む

こちらは381KBで、production(作業台と材料)と dropped_by(落とすパル)を
両方使っている。削れる余地が無いのでそのまま。

■ 元データを差し替えたら、このスクリプトも回すこと

items_dex_data.js を作り直したら、ここも実行しないと素材計算機だけ古い名前を出す。
"""
import json
from pathlib import Path

from js_data_writer import write_js_consts

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "game_data" / "items_dex_data.js"
OUT = ROOT / "game_data" / "material_items_data.js"

# 素材計算機(pages/material_calc.js)が実際に触るフィールドだけ。
# **増やすときは本当に使うか確かめること。** ここが太ると意味が無くなる。
FIELDS = ["asset", "name_jp", "name_en", "icon", "category"]


def main():
    src = SRC.read_text(encoding="utf-8")
    items = json.loads(src[src.index("=") + 1:].strip().rstrip(";"))

    slim = []
    for it in items:
        row = {}
        for k in FIELDS:
            v = it.get(k)
            if v not in (None, ""):        # 空の項目は持たない
                row[k] = v
        slim.append(row)

    write_js_consts(OUT, [("MATERIAL_ITEMS_DATA", slim)])

    before = SRC.stat().st_size
    after = OUT.stat().st_size
    print(f"{len(slim)}件 / {', '.join(FIELDS)}")
    print(f"  {before/1024:.0f}KB -> {after/1024:.0f}KB({(before-after)/1024:.0f}KB削減)")


if __name__ == "__main__":
    main()
