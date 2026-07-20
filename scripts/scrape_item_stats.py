import json, re, time, urllib.request, urllib.error, urllib.parse, sys, html as htmllib

GROUPS_PATH = "game_data/item_stats_raw/groups_index.json"
OUT_PATH = "game_data/item_stats_raw/scraped.json"
FAIL_LOG = "game_data/item_stats_raw/failures.json"

STATS_CARD_RE = re.compile(
    r'<h5 class="card-title text-info">\s*Stats\s*</h5>(.*?)(?=<div class="card mt-3">|<footer|\Z)',
    re.S
)
ROW_RE = re.compile(
    r'<div class="d-flex justify-content-between p-2 align-items-center border-bottom">\s*'
    r'<div>(.*?)</div>\s*<div>(.*?)</div>\s*</div>',
    re.S
)
TAG_RE = re.compile(r'<[^>]+>')

def strip_tags(s):
    s = TAG_RE.sub('', s).strip()
    return htmllib.unescape(s)

def slugify(name_en):
    raw = name_en.strip().replace(' ', '_')
    return urllib.parse.quote(raw, safe='_-')

def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status != 200:
                return None
            return resp.read().decode('utf-8', errors='replace')
    except urllib.error.HTTPError:
        return None
    except Exception:
        return None

def parse_stats_cards(html_text):
    cards = []
    for m in STATS_CARD_RE.finditer(html_text):
        body = m.group(1)
        row_labels = {}
        code = None
        for label_raw, value_raw in ROW_RE.findall(body):
            label = strip_tags(label_raw)
            value = strip_tags(value_raw)
            if 'Gold_Coin' in label_raw or label == '金貨':
                label = 'price'
            if label == 'Code':
                code = value
                continue
            if not label:
                continue
            row_labels[label] = value
        if code:
            cards.append({'code': code, 'stats': row_labels})
    return cards

def main():
    with open(GROUPS_PATH, encoding='utf-8') as f:
        groups = json.load(f)

    only = None
    if len(sys.argv) > 1:
        start, end = int(sys.argv[1]), int(sys.argv[2])
        only = (start, end)

    results = []
    failures = []

    targets = groups if only is None else groups[only[0]:only[1]]

    for i, g in enumerate(targets):
        slug = slugify(g['name_en'])
        url = f"https://paldb.cc/ja/{slug}"
        html_text = fetch(url)
        expected_assets = {t['asset'] for t in g['tiers']}
        if html_text is None:
            failures.append({'group_key': g['group_key'], 'name_en': g['name_en'], 'slug': slug, 'reason': 'fetch_failed'})
            print(f"[{i}] FAIL fetch: {g['group_key']} ({slug})")
            time.sleep(0.3)
            continue
        cards = parse_stats_cards(html_text)
        matched = [c for c in cards if c['code'] in expected_assets]
        if not matched:
            failures.append({'group_key': g['group_key'], 'name_en': g['name_en'], 'slug': slug, 'reason': 'no_matching_code', 'found_codes': [c['code'] for c in cards]})
            print(f"[{i}] FAIL match: {g['group_key']} ({slug}) found_codes={[c['code'] for c in cards]}")
            time.sleep(0.3)
            continue
        missing = expected_assets - {c['code'] for c in matched}
        results.append({
            'group_key': g['group_key'],
            'name_en': g['name_en'],
            'slug': slug,
            'url': url,
            'tiers': matched,
            'missing_assets': sorted(missing),
        })
        print(f"[{i}] OK: {g['group_key']} ({slug}) tiers={len(matched)} missing={len(missing)}")
        time.sleep(0.3)

    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=1)
    with open(FAIL_LOG, 'w', encoding='utf-8') as f:
        json.dump(failures, f, ensure_ascii=False, indent=1)
    print(f"\nDone. ok={len(results)} fail={len(failures)}")

if __name__ == '__main__':
    main()
