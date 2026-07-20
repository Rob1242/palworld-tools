import json
import os
import re
import urllib.request

PALDB_URL = "https://paldb.cc/ja/Pals"
CLEAN_PATH = "palworld_pals_clean.json"
ICONS_DIR = "game_data/icons/pals"
OUTPUT_PATH = "palworld_name_jp_en_map.json"

NAME_PATTERN = re.compile(
    r'<a class="itemname" data-hover="[^"]*" href="([^"]+)">([^<]+)</a>'
)
ICON_PATTERN = re.compile(
    r'src="https://cdn\.paldb\.cc/image/Pal/Texture/PalIcon/Normal/(T_[A-Za-z0-9_]+_icon_normal\.webp)"'
)


def fetch_paldb_html():
    req = urllib.request.Request(
        PALDB_URL,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8")


def parse_paldb_map(html_text):
    card_splits = re.split(r'(?=<div class="col" data-filters=")', html_text)
    cards = [c for c in card_splits if c.startswith('<div class="col" data-filters="')]
    result = {}
    for card in cards:
        name_match = NAME_PATTERN.search(card)
        if not name_match:
            continue
        en_name, jp_name = name_match.group(1), name_match.group(2)
        icon_match = ICON_PATTERN.search(card)
        result[jp_name] = {
            "en_name": en_name,
            "icon_file": icon_match.group(1) if icon_match else None,
        }
    return result


def main():
    html_text = fetch_paldb_html()
    paldb_map = parse_paldb_map(html_text)
    print(f"paldb.ccから{len(paldb_map)}件のパル名ペアを取得")

    clean = json.load(open(CLEAN_PATH, encoding="utf-8"))
    output = []
    no_paldb_entry = []
    no_local_icon = []
    for p in clean:
        jp = p["name"]
        entry = paldb_map.get(jp)
        icon_path = None
        en_name = None
        if entry is None:
            no_paldb_entry.append(jp)
        else:
            en_name = entry["en_name"]
            icon_file = entry["icon_file"]
            if icon_file and os.path.exists(os.path.join(ICONS_DIR, icon_file)):
                icon_path = f"game_data/icons/pals/{icon_file}"
            else:
                no_local_icon.append(jp)
        output.append({"name": jp, "en_name": en_name, "icon": icon_path})

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    matched = sum(1 for o in output if o["icon"])
    print(f"合計{len(clean)}体中、画像マッチ成功: {matched}体")
    if no_paldb_entry:
        print(f"paldb.ccに見つからなかった: {len(no_paldb_entry)}体 {no_paldb_entry}")
    if no_local_icon:
        print(f"paldb.ccには有るがローカルアイコンが無い: {len(no_local_icon)}体 {no_local_icon}")
    print(f"{OUTPUT_PATH} に保存しました")


if __name__ == "__main__":
    main()
