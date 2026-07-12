import json
import os
import re

DEX_PATH = "palworld_dex_data.json"
BREEDING_PATH = "palworld_breeding_data.json"
HTML_PATH = "palworld_palbox.html"


def inject_const(html, const_name, data):
    serialized = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    pattern = re.compile(r"const " + re.escape(const_name) + r" = \{\};|const " + re.escape(const_name) + r" = \[\];")
    if not pattern.search(html):
        raise ValueError(f"{HTML_PATH} に `const {const_name} = ...;` のプレースホルダが見つかりません")
    return pattern.sub(lambda m: f"const {const_name} = {serialized};", html, count=1)


def main():
    if not os.path.exists(HTML_PATH):
        print(f"{HTML_PATH} がまだ存在しません。先にTask 3 Step 2でファイルを作成してください。")
        return
    dex = json.load(open(DEX_PATH, encoding="utf-8"))
    breeding = json.load(open(BREEDING_PATH, encoding="utf-8"))

    html = open(HTML_PATH, encoding="utf-8").read()
    html = inject_const(html, "PAL_BOX_DATA", dex)
    html = inject_const(html, "BREEDING_DATA", breeding)
    open(HTML_PATH, "w", encoding="utf-8").write(html)
    print(f"PAL_BOX_DATA: {len(dex)}件、BREEDING_DATA: {len(breeding['pals'])}パルを{HTML_PATH}に注入しました")


if __name__ == "__main__":
    main()
