import json, re, time, urllib.request, urllib.parse, sys

# paldb.ccの各パルページの「Movement」カードから、歩行/走行/騎乗疾走/輸送/遊泳/
# 遊泳ダッシュ速度・スタミナを全298種統一的に取得する(現状は走行速度・ライド疾走速度
# のみ全種、遊泳速度は14種、スタミナは104種の特例対応にとどまっていた)。
NAMES_PATH = "/tmp/all_pal_names.json"
OUT_PATH = "game_data/movement_raw.json"

MOVEMENT_CARD_RE = re.compile(
    r'card-title text-info[^>]*>\s*Movement\s*</h5>(.*?)(?=<h5 class="card-title text-info"|\Z)',
    re.S
)
LEVEL80_CARD_RE = re.compile(
    r'card-title text-info[^>]*>\s*Level 80\s*</h5>(.*?)(?=<h5 class="card-title text-info"|\Z)',
    re.S
)
ROW_RE = re.compile(
    r'<div>([A-Za-z]+)</div>\s*<div>([^<]*)</div>',
)
LEVEL80_ROW_RE = re.compile(
    r'<div>(HP|攻撃|防御)</div>\s*<div>([0-9]+)\s*&ndash;\s*([0-9]+)</div>',
)
BREED_LINK_RE = re.compile(r'Breed\?child=([A-Za-z0-9_]+)')


def slugify(name):
    return urllib.parse.quote(name.strip().replace("'", "").replace("'", "").replace(" ", "_"), safe='_-')


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status != 200:
                return None
            return resp.read().decode('utf-8', errors='replace')
    except Exception:
        return None


def main():
    names = json.load(open(NAMES_PATH, encoding='utf-8'))
    start, end = 0, len(names)
    if len(sys.argv) > 2:
        start, end = int(sys.argv[1]), int(sys.argv[2])
    targets = names[start:end]

    results = {}
    failures = []
    for i, name in enumerate(targets):
        slug = slugify(name)
        url = f"https://paldb.cc/ja/{slug}"
        html_text = fetch(url)
        if html_text is None:
            failures.append(name)
            print(f"[{start+i}] FAIL {name}")
            time.sleep(0.2)
            continue
        bm = BREED_LINK_RE.search(html_text)
        asset = bm.group(1) if bm else None
        m = MOVEMENT_CARD_RE.search(html_text)
        if not m or not asset:
            failures.append(name)
            print(f"[{start+i}] (none) {name}")
            time.sleep(0.2)
            continue
        rows = dict(ROW_RE.findall(m.group(1)))
        entry = {"movement": rows}
        lm = LEVEL80_CARD_RE.search(html_text)
        if lm:
            l80 = {}
            for label, lo, hi in LEVEL80_ROW_RE.findall(lm.group(1)):
                l80[label] = {"min": int(lo), "max": int(hi)}
            entry["level80"] = l80
        results[asset] = entry
        print(f"[{start+i}] OK {name} -> {asset} {entry}")
        time.sleep(0.2)

    import os
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    out_path = OUT_PATH.replace('.json', f'_{start}_{end}.json')
    json.dump(results, open(out_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    fail_path = OUT_PATH.replace('.json', f'_failures_{start}_{end}.json')
    json.dump(failures, open(fail_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f"\nDone. ok={len(results)} fail={len(failures)} -> {out_path}")


if __name__ == '__main__':
    main()
