import json, re, time, urllib.request, urllib.error, html as htmllib

# scrape_item_stats.py の「Stats」カード解析では拾えていなかった2種のフィールドを追加取得する:
# 1. テクノロジー(技術ツリー解放レベル) - 装備の基本(コモン)tierのみに付く要求レベル。
#    ページ内の各レア度カード(hover_icon_bg)のうち最初の1つにのみ現れる
#    (上位レア度は技術ツリーではなく設計図合成で作るため、テクノロジー要求が無い)。
# 2. item_skill_bar(アイテム固有効果、例:「耐寒Lv1」「攻撃増加(小)Lv4」) -
#    説明文中に埋め込まれた効果タグ。全アイテムにあるわけではない。
# (SneakAttackRateも当初調査したが、全アイテムで値が"1"固定・差別化情報なしのため不採用)
# 2026-07-20発見。groups_index.json/merged.jsonと同じurlをそのまま再利用するため、
# 1グループにつき1回のfetchで済む(既にscrape_item_stats.pyで取得済みのHTMLと同じページ)。

MERGED_PATH = "game_data/item_stats_raw/merged.json"
OUT_PATH = "game_data/item_stats_raw/special_stats.json"

TECH_RE = re.compile(r'テクノロジー</span></span><span class="border p-1">([0-9]+)</span>')
EFFECT_RE = re.compile(r'class="item_skill_bar[^"]*"[^>]*>([^<]*)</div>')
TAG_RE = re.compile(r'<[^>]+>')
CARD_SPLIT = 'hover_icon_bg'


def strip_tags(s):
    return htmllib.unescape(TAG_RE.sub('', s)).strip()


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
    groups = json.load(open(MERGED_PATH, encoding='utf-8'))
    results = {}
    failures = []

    for i, g in enumerate(groups):
        html_text = fetch(g['url'])
        if html_text is None:
            failures.append(g['group_key'])
            print(f"[{i}] FAIL {g['group_key']}")
            time.sleep(0.2)
            continue

        # hover_icon_bgはレア度カードごとの区切りで、group['tiers']と同じ順序で
        # 出現する(BeamLauncher/Swordで位置対応を確認済み)。区切りブロックの中身だけを
        # 見ることで、テクノロジー要求・固有効果を正しいtierにひも付ける
        # (以前は全ブロック横断でitem_skill_barを重複除去していたため、例えば
        # 「攻撃増加Lv1」〜「Lv4」が全レア度に混在して付いてしまう不整合があった)。
        blocks = html_text.split(CARD_SPLIT)[1:]
        found_any = False
        for tier, block in zip(g['tiers'], blocks):
            tech_m = TECH_RE.search(block)
            effects = [strip_tags(m.group(1)) for m in EFFECT_RE.finditer(block)]
            entry = {}
            if tech_m:
                entry['tech_level'] = int(tech_m.group(1))
            if effects:
                entry['item_effects'] = effects
            if entry:
                results[tier['code']] = entry
                found_any = True
        print(f"[{i}] {'OK' if found_any else '(none)'} {g['group_key']}")
        time.sleep(0.2)

    json.dump(results, open(OUT_PATH, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f"\nDone. items with special stats: {len(results)}, failures: {len(failures)} -> {OUT_PATH}")


if __name__ == '__main__':
    main()
