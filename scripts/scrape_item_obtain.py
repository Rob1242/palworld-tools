import json, re, time, urllib.request, urllib.error, urllib.parse, sys, html as htmllib

NAMES_PATH = "/tmp/all_item_names.json"
OUT_DIR = "game_data/item_obtain_raw"

# card-title(h5)の位置を見つけ、そこから直後の最初の</table>までを1ブロックとして
# 切り出す(外側のdiv入れ子がレア度違いの各ブロックで揃っていないケースがあり、
# card境界での判定は不安定だったため、必ず閉じられる</table>で区切る方式に変更)。
CARD_TITLE_RE = re.compile(r'<h5 class="card-title text-info"[^>]*>\s*([^<]*?)\s*</h5>')
TABLE_BLOCK_RE = re.compile(r'<table class="table mb-0">(.*?)</table>', re.S)
DROPPED_BY_ROW_RE = re.compile(
    r'<tr><td><a class="itemname"[^>]*href="([A-Za-z0-9_]+)"[^>]*>.*?<img[^>]*>([^<]*)</a>\s*<td><small class="itemQuantity">([^<]*)</small>\s*<td>([^<]*)</tr>',
    re.S
)
MATERIAL_SPAN_RE = re.compile(
    r'<span><a class="itemname"[^>]*href="([A-Za-z0-9_]+)"[^>]*>.*?</a>\s*<small class="itemQuantity">([^<]*)</small></span>',
    re.S
)
WORKBENCH_RE = re.compile(
    r'row-cols-lg-2 g-2">\s*<a class="itemname[^"]*"[^>]*href="([A-Za-z0-9_]+)"[^>]*>.*?</a>',
    re.S
)
TAG_RE = re.compile(r'<[^>]+>')


def strip_tags(s):
    return htmllib.unescape(TAG_RE.sub('', s)).strip()


def slugify(name):
    # paldb.ccはアポストロフィを%27等にエンコードせず、単純に取り除く規則
    # (例: "Dandilord's Petal" -> "Dandilords_Petal")。2026-07-19発見。
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


def parse_dropped_by(table_body):
    rows = []
    for m in DROPPED_BY_ROW_RE.finditer(table_body):
        asset, jp_name, qty, rate = m.groups()
        rows.append({
            'pal_asset': asset,
            'pal_jp_name': strip_tags(jp_name),
            'qty': strip_tags(qty),
            'rate': strip_tags(rate),
        })
    return rows


def parse_production(pre_table_window, table_body):
    wm = WORKBENCH_RE.search(pre_table_window)
    workbench = wm.group(1) if wm else None
    # 材料は表の最初の<td>(1行目)だけを対象にする(レア度違いで複数レシピがあっても代表1件で十分)。
    # このテーブルはHTML5の暗黙のタグクローズに頼っており</td>が出力されないため、
    # 次の<td>の開始タグまでを1セル分として切り出す(2026-07-19発見)。
    first_row = re.search(r'<tr><td>(.*?)<td>', table_body, re.S)
    materials = []
    if first_row:
        for mm in MATERIAL_SPAN_RE.finditer(first_row.group(1)):
            materials.append({'item_asset': mm.group(1), 'qty': strip_tags(mm.group(2))})
    return {'workbench_asset': workbench, 'materials': materials}


def parse_page(html_text):
    out = {}
    titles = list(CARD_TITLE_RE.finditer(html_text))
    for i, tm in enumerate(titles):
        title = tm.group(1).strip()
        if title not in ('Dropped By', 'Production'):
            continue
        search_end = titles[i + 1].start() if i + 1 < len(titles) else len(html_text)
        window = html_text[tm.end():search_end]
        table_m = TABLE_BLOCK_RE.search(window)
        if not table_m:
            continue
        table_body = table_m.group(1)
        if title == 'Dropped By':
            rows = parse_dropped_by(table_body)
            if rows:
                out['dropped_by'] = rows
        elif title == 'Production':
            pre_table_window = window[:table_m.start()]
            prod = parse_production(pre_table_window, table_body)
            if prod['materials']:
                out.setdefault('production', []).append(prod)
    return out


def main():
    with open(NAMES_PATH, encoding='utf-8') as f:
        names = json.load(f)
    start, end = 0, len(names)
    if len(sys.argv) > 2:
        start, end = int(sys.argv[1]), int(sys.argv[2])
    targets = names[start:end]

    import os
    os.makedirs(OUT_DIR, exist_ok=True)

    results = {}
    failures = []
    for i, name in enumerate(targets):
        slug = slugify(name)
        url = f"https://paldb.cc/ja/{slug}"
        html_text = fetch(url)
        if html_text is None:
            failures.append({'name': name, 'slug': slug})
            print(f"[{start+i}] FAIL {name}")
            time.sleep(0.2)
            continue
        data = parse_page(html_text)
        if data:
            results[name] = data
        tag = []
        if 'dropped_by' in data: tag.append(f"drop:{len(data['dropped_by'])}")
        if 'production' in data: tag.append(f"prod:{len(data['production'])}")
        print(f"[{start+i}] OK {name} {' '.join(tag) if tag else '(none)'}")
        time.sleep(0.2)

    out_path = f"{OUT_DIR}/obtain_{start}_{end}.json"
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=1)
    fail_path = f"{OUT_DIR}/failures_{start}_{end}.json"
    with open(fail_path, 'w', encoding='utf-8') as f:
        json.dump(failures, f, ensure_ascii=False, indent=1)
    print(f"\nDone. with_data={len(results)}/{len(targets)} fail={len(failures)} -> {out_path}")


if __name__ == '__main__':
    main()
