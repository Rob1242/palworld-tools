import json, re, time, urllib.request, urllib.parse, html as htmllib

# インプラントアイテム(PalPassiveSkillChange_*、71件)はDropped By/Productionテーブルに
# 載らない特殊入手ルート(徘徊商人からの通貨交換)のため、専用にスクレイピングする。
# paldb.ccのURLスラッグはコロンを%3Aとしてパーセントエンコードする必要がある
# (アポストロフィは削除するのに対し、コロンはエンコードして保持する。2026-07-20発見)。

ITEMS_DEX_PATH = "game_data/items_dex_data.js"
OUT_PATH = "game_data/implant_obtain_raw.json"

CARD_TITLE_RE = re.compile(r'<h5 class="card-title text-info"[^>]*>\s*([^<]*?)\s*</h5>')
TABLE_RE = re.compile(r'<table class="table mb-0">(.*?)</table>', re.S)
ROW_RE = re.compile(
    r'<tr><td>.*?>([^<]+)</a>(?:\s*<small[^>]*>[^<]*</small>)?\s*<td><a href="([^"]+)">([^<]*)</a>\s*([0-9.]+%)?',
    re.S
)
RELEVANT_TITLES = {"Wandering Merchant", "Treasure Box"}
TAG_RE = re.compile(r'<[^>]+>')


def strip_tags(s):
    return htmllib.unescape(TAG_RE.sub('', s)).strip()


def slugify(name_en):
    cleaned = name_en.strip().replace("'", "").replace("’", "")
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
    content = open(ITEMS_DEX_PATH, encoding='utf-8').read()
    items = json.loads(content.split('=', 1)[1].strip().rstrip(';'))
    implants = [it for it in items if it['asset'].startswith('PalPassiveSkillChange') and it['asset'] != 'PalPassiveSkillChangeTest']

    results = {}
    failures = []
    for i, it in enumerate(implants):
        slug = slugify(it['name_en'])
        url = f"https://paldb.cc/ja/{slug}"
        html_text = fetch(url)
        if html_text is None:
            failures.append(it['asset'])
            print(f"[{i}] FAIL {it['name_en']}")
            time.sleep(0.2)
            continue
        titles = list(CARD_TITLE_RE.finditer(html_text))
        sources = []
        for ti, tm in enumerate(titles):
            title = tm.group(1).strip()
            if title not in RELEVANT_TITLES:
                continue
            window_end = titles[ti + 1].start() if ti + 1 < len(titles) else len(html_text)
            window = html_text[tm.end():window_end]
            table_m = TABLE_RE.search(window)
            if not table_m:
                continue
            for rm in ROW_RE.finditer(table_m.group(1)):
                source_name = strip_tags(rm.group(3)) or rm.group(2)
                rate = rm.group(4)
                sources.append({"type": title, "source": source_name, "rate": rate})
        if sources:
            results[it['asset']] = sources
            print(f"[{i}] OK {it['name_en']} -> {sources}")
        else:
            print(f"[{i}] (none) {it['name_en']}")
        time.sleep(0.2)

    json.dump(results, open(OUT_PATH, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f"\nDone. items: {len(results)}, failures: {len(failures)} -> {OUT_PATH}")


if __name__ == '__main__':
    main()
