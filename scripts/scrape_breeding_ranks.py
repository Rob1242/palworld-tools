import json, re, time, urllib.request, urllib.error, urllib.parse, sys, html as htmllib

NAMES_PATH = "/tmp/all_pal_names.json"
OUT_PATH = "game_data/breeding_raw/paldb_pal_pages.json"
FAIL_PATH = "game_data/breeding_raw/paldb_pal_failures.json"

STATS_CARD_RE = re.compile(
    r'<h5 class="card-title text-info"[^>]*>\s*Stats\s*</h5>(.*?)(?=<div class="card mt-3">|<footer|\Z)',
    re.S
)
BREEDFARM_CARD_RE = re.compile(
    r'<h5 class="card-title text-info"[^>]*data-i18n="mapobject_name_breedfarm">.*?</h5>(.*?)(?=<div class="col">|\Z)',
    re.S
)
ROW_RE = re.compile(
    r'<div class="d-flex justify-content-between p-2 align-items-center border-bottom">\s*'
    r'<div>(.*?)</div>\s*<div>(.*?)</div>\s*</div>',
    re.S
)
BREED_LINK_RE = re.compile(r'Breed\?child=([A-Za-z0-9_]+)')
UNIQUE_COMBO_RE = re.compile(
    r'>Unique Combo</span>:\s*<div>(.*?)</div></div>',
    re.S
)
PAL_LINK_RE = re.compile(r'href="([A-Za-z0-9_]+)"[^>]*>(?:(?!</a>).)*?</a>', re.S)
GENDER_RE = re.compile(r'PanGender_(Male|Female)')
TAG_RE = re.compile(r'<[^>]+>')


def strip_tags(s):
    return htmllib.unescape(TAG_RE.sub('', s)).strip()


def slugify(name):
    return urllib.parse.quote(name.strip().replace(' ', '_'), safe='_-')


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status != 200:
                return None
            return resp.read().decode('utf-8', errors='replace')
    except Exception:
        return None


def parse_stats(html_text):
    m = STATS_CARD_RE.search(html_text)
    if not m:
        return {}
    body = m.group(1)
    out = {}
    for label_raw, value_raw in ROW_RE.findall(body):
        label = strip_tags(label_raw)
        value = strip_tags(value_raw)
        if label:
            out[label] = value
    return out


def parse_unique_combo(html_text, asset_hint):
    m = BREEDFARM_CARD_RE.search(html_text)
    if not m:
        return None
    body = m.group(1)
    cm = UNIQUE_COMBO_RE.search(body)
    if not cm:
        return None
    segment = cm.group(1)
    # each parent/child is an <a href="AssetName" ...>...</a> possibly followed by a gender icon img
    parts = []
    for am in re.finditer(r'<a class="itemname"[^>]*href="([A-Za-z0-9_]+)"[^>]*>.*?</a>(\s*<img[^>]*PanGender_(Male|Female)[^>]*>)?', segment, re.S):
        asset = am.group(1)
        gender = am.group(3)
        parts.append({'asset': asset, 'gender': gender.lower() if gender else None})
    if len(parts) < 3:
        return None
    return {'parent_a': parts[0], 'parent_b': parts[1], 'child': parts[2]}


def main():
    with open(NAMES_PATH, encoding='utf-8') as f:
        names = json.load(f)

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
            failures.append({'name': name, 'slug': slug, 'reason': 'fetch_failed'})
            print(f"[{start+i}] FAIL {name}")
            time.sleep(0.25)
            continue
        stats = parse_stats(html_text)
        bm = BREED_LINK_RE.search(html_text)
        asset = bm.group(1) if bm else None
        combo = parse_unique_combo(html_text, asset)
        results[name] = {
            'slug': slug,
            'asset': asset,
            'combi_rank': stats.get('CombiRank'),
            'male_probability': stats.get('MaleProbability'),
            'unique_combo': combo,
        }
        print(f"[{start+i}] OK {name} asset={asset} combi_rank={stats.get('CombiRank')} combo={'Y' if combo else 'N'}")
        time.sleep(0.25)

    import os
    os.makedirs('game_data/breeding_raw', exist_ok=True)
    out_path = OUT_PATH.replace('.json', f'_{start}_{end}.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=1)
    fail_path = FAIL_PATH.replace('.json', f'_{start}_{end}.json')
    with open(fail_path, 'w', encoding='utf-8') as f:
        json.dump(failures, f, ensure_ascii=False, indent=1)
    print(f"\nDone. ok={len(results)} fail={len(failures)} -> {out_path}")


if __name__ == '__main__':
    main()
