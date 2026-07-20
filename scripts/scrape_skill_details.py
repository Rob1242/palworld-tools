import json, re, urllib.request, html as htmllib

# paldb.ccの/ja/Active_Skillsは全アクティブスキル(395件)を1ページに一覧表示しているため、
# パルごとに386ページ叩くのではなく、この1ページだけスクレイピングすれば全技の
# 威力・冷却時間・属性・効果文が一度に取得できる(2026-07-20発見)。
# 技の実在アセット名(WazaID)は各スキルカードの data-hover 属性内
# (?s=Waza%2FEPalWazaID%3A%3AXxx 形式)から抽出する。hrefのスラッグは表示名ベースで
# 内部アセット名と異なる場合があるため使わない(パル/アイテムで既知の同種の罠)。

URL = "https://paldb.cc/ja/Active_Skills"
OUT_PATH = "game_data/skill_details_raw.json"

CARD_SPLIT = '<div class="card itemPopup activeSkill">'
WAZA_ID_RE = re.compile(r'EPalWazaID(?:::|%3A%3A)([A-Za-z0-9_]+)')
NAME_RE = re.compile(r'<a data-hover="[^"]*"[^>]*>([^<]*)</a>')
ELEMENT_RE = re.compile(r'padding-left:\s*35px">([^<]*)</span>')
COOLTIME_RE = re.compile(r'data-bs-title="CoolTime"[^>]*/>\s*:\s*<span[^>]*>([^<]*)</span>')
POWER_RE = re.compile(r'威力:\s*<span[^>]*>([^<]*)</span>')
AGGREGATE_RE = re.compile(r'class="Aggregate">\s*<span>[^<]*</span>\s*<span[^>]*>([^<]*)</span>\s*<div[^>]*>([^<]*)</div>')
CARD_BODY_RE = re.compile(r'<div class="card-body">\s*(.*?)\s*</div>\s*</div>', re.S)
TAG_RE = re.compile(r'<[^>]+>')


def strip_tags(s):
    return htmllib.unescape(TAG_RE.sub('', s)).strip()


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode('utf-8', errors='replace')


def parse_card(card_html):
    wm = WAZA_ID_RE.search(card_html)
    if not wm:
        return None
    asset = wm.group(1)
    nm = NAME_RE.search(card_html)
    jp_name = strip_tags(nm.group(1)) if nm else None
    em = ELEMENT_RE.search(card_html)
    element = em.group(1).replace('属性', '') if em else None
    cm = COOLTIME_RE.search(card_html)
    cooltime = cm.group(1) if cm else None
    pm = POWER_RE.search(card_html)
    power = pm.group(1) if pm else None
    am = AGGREGATE_RE.search(card_html)
    aggregate = {'status': am.group(1), 'value': am.group(2)} if am else None
    bm = CARD_BODY_RE.search(card_html)
    effect = strip_tags(bm.group(1)) if bm else None
    return {
        'asset': asset,
        'jp_name': jp_name,
        'element': element,
        'cooltime': cooltime,
        'power': power,
        'aggregate': aggregate,
        'effect_jp': effect,
    }


def main():
    print("Active_Skillsページ取得中…")
    html_text = fetch(URL)
    cards = html_text.split(CARD_SPLIT)[1:]
    print(f"カード数: {len(cards)}")

    out = {}
    dup = 0
    failed = 0
    for card in cards:
        parsed = parse_card(card)
        if not parsed:
            failed += 1
            continue
        if parsed['asset'] in out:
            dup += 1
        out[parsed['asset']] = parsed

    json.dump(out, open(OUT_PATH, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f"抽出成功: {len(out)}件 (重複{dup}件・解析失敗{failed}件) -> {OUT_PATH}")


if __name__ == '__main__':
    main()
