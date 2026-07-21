import json, re, time, urllib.request, urllib.parse, sys, os, html as htmllib

# アイテムのJP名/JP説明文をpaldb.ccのog:title/og:descriptionメタタグから取得する。
# 2026-07-21、ユーザー報告(アイテム名がほぼ全部英語のまま)を受けて、
# 既存のgamewith由来アイコンスタム突き合わせ(109/2466件しかヒットしない)を補うため新設。
# paldb.ccは/ja/{EN名をスラッグ化したもの}のページでも、<meta property="og:title">に
# 日本語名を出す(titleタグ自体はEN固定なので使えない)。

ITEMS_PATH = "game_data/items.json"
OUT_DIR = "game_data/item_jp_raw"

OGTITLE_RE = re.compile(r'<meta property="og:title" content="([^"]*)"')
OGDESC_RE = re.compile(r'<meta property="og:description" content="([^"]*)"', re.S)


def slugify(name):
    cleaned = name.strip().replace("'", "").replace("’", "")
    return urllib.parse.quote(cleaned.replace(' ', '_'), safe='_-')


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
    with open(ITEMS_PATH, encoding='utf-8') as f:
        items = json.load(f)['items']

    start, end = 0, len(items)
    if len(sys.argv) > 2:
        start, end = int(sys.argv[1]), int(sys.argv[2])
    targets = items[start:end]

    os.makedirs(OUT_DIR, exist_ok=True)

    results = {}
    failures = []
    for i, it in enumerate(targets):
        name, asset = it['name'], it['asset']
        slug = slugify(name)
        url = f"https://paldb.cc/ja/{slug}"
        html_text = fetch(url)
        if html_text is None:
            failures.append({'asset': asset, 'name': name, 'slug': slug})
            print(f"[{start+i}] FAIL {asset} ({name})")
            time.sleep(0.2)
            continue
        tm = OGTITLE_RE.search(html_text)
        dm = OGDESC_RE.search(html_text)
        jp_name = htmllib.unescape(tm.group(1)).strip() if tm else None
        jp_desc = htmllib.unescape(dm.group(1)).strip() if dm else None
        if jp_name:
            results[asset] = {'name_jp': jp_name, 'description_jp': jp_desc}
            print(f"[{start+i}] OK {asset} -> {jp_name}")
        else:
            failures.append({'asset': asset, 'name': name, 'slug': slug})
            print(f"[{start+i}] NODATA {asset} ({name})")
        time.sleep(0.2)

    out_path = f"{OUT_DIR}/jp_{start}_{end}.json"
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=1)
    fail_path = f"{OUT_DIR}/failures_{start}_{end}.json"
    with open(fail_path, 'w', encoding='utf-8') as f:
        json.dump(failures, f, ensure_ascii=False, indent=1)
    print(f"\nDone. matched={len(results)}/{len(targets)} failed={len(failures)} -> {out_path}")


if __name__ == '__main__':
    main()
