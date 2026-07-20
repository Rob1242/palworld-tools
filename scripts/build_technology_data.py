import json, os

from js_data_writer import write_js_consts

# paldb.cc「テクノロジー」ページ(/ja/Technologies)から手動抽出したLv1〜80、537件の
# 技術ツリーデータ。アイコンはpaldb.ccのCDN URLではなく、既にgame_data/icons/配下に
# ダウンロード済みだったアイコン(technologies/structures/items/pals、計460+534+多数件、
# 出所不明だが恐らく拠点プランナー等の準備用に以前取得されていたもの)をそのまま再利用する
# (2026-07-20発見。529種のアイコン要求に対し1件を除き全てローカルに既存だった)。
SRC_PATH = "game_data/technology_raw.json"
OUT_PATH = "game_data/technology_data.js"
ICON_DIRS = ["technologies", "structures", "items", "pals"]


def build_icon_index():
    index = {}
    for d in ICON_DIRS:
        path = f"game_data/icons/{d}"
        if not os.path.isdir(path):
            continue
        for fname in os.listdir(path):
            index.setdefault(fname, f"game_data/icons/{d}/{fname}")
    return index


def main():
    data = json.load(open(SRC_PATH, encoding="utf-8"))
    icon_index = build_icon_index()
    unresolved = set()
    for t in data:
        fname = t["icon"].rsplit("/", 1)[-1]
        local_icon = icon_index.get(fname)
        if not local_icon:
            unresolved.add(fname)
        t["icon"] = local_icon or "game_data/icons/T_icon_unknown.webp"
    data.sort(key=lambda t: (t["level"], t["category"], t["name_jp"]))
    write_js_consts(OUT_PATH, [("TECHNOLOGY_DATA", data)])
    print(f"{len(data)}件 (Lv1〜{max(t['level'] for t in data)}) -> {OUT_PATH}")
    print(f"未解決アイコン: {len(unresolved)} {sorted(unresolved)[:10]}")


if __name__ == "__main__":
    main()
