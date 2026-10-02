#!/usr/bin/env python3
"""ゲームのアップデートに合わせて、サイトのデータを一括で確認・更新する。

使い方(palworld/ フォルダで実行):
    python3 scripts/update_all.py            # 確認だけ。ファイルは一切書かない
    python3 scripts/update_all.py --apply    # 差分を反映して、データを作り直す

やること:
  1. 最新ビルドを確認(GitHub: Awy64/palworld-atlas-data)
  2. 生データと突き合わせて差分を出す
       - パルの種族値・作業適性・属性 / アイテムの価格・スタック数・ランク ← atlas の最新ビルド
       - テクノロジー・ミッション ← paldb.cc
     ※ アイテムの重量は atlas 側が全件0で取れていないため見ない(2026-10-02確認)
  3. (--apply のとき) 退避 → 反映 → build_*.py を正しい順番で実行 → 構文チェック
  4. 更新履歴の下書きを出す

**やらないこと(人間が決める)**:
  - フッターのバージョン表記(scripts/inject_data_version.py の GAME_VERSION / DATA_TAKEN_ON)。
    「取り直していない範囲を『対応』と書かない」ルールがあるため、確認できた範囲を見て手で決める。
  - 新しいパルの図鑑への追加(日本語名・アイコンなど手作業が要る)。レポートに一覧だけ出す。
  - 技・パッシブ・ドロップなど、突き合わせ先が無いデータ。

出典の線引きは CLAUDE.md「他サイトのデータを使ってよいかの基準」を参照。
"""
import argparse, concurrent.futures as cf, datetime, html, json, os, re, shutil, subprocess, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)
ATLAS_RAW = "https://raw.githubusercontent.com/Awy64/palworld-atlas-data/main/published/v1"
ATLAS_API = "https://api.github.com/repos/Awy64/palworld-atlas-data/contents/published/v1/builds/{b}/pals"
MANIFEST = "https://awy64.github.io/palworld-atlas-data/v1/latest.json"
PALDB = {"tech": "https://paldb.cc/ja/Technologies", "mission": "https://paldb.cc/ja/Mission"}

# 実行順。依存: 図鑑(コラボ込み)→配合→出現→…。build_dex_data は図鑑JSONを作り直してコラボのパルを消すので、
# 必ず build_collab_pals を直後に流す(2026-10-02に配合が約3,500組欠けた原因)。
BUILD_ORDER = ["build_collab_pals", "build_breeding_data", "build_spawn_data", "build_spawn_flags", "build_spawn_index_data",
               "build_worldtree_data", "build_breeding_split_data", "build_dex_data", "build_collab_pals", "build_pal_data",
               "build_combat_data", "build_palbox_data", "build_items_data", "build_technology_data", "build_building_items",
               "build_missions_data"]
PAL_FIELDS = [("hp", "hp"), ("shot_attack", "attack"), ("defense", "defense"), ("run_speed", "runSpeed"), ("food_amount", "food")]
ITEM_FIELDS = [("price", "price"), ("max_stack", "maxStack"), ("rank", "rank"), ("rarity", "rarity")]


def get(url, as_json=True, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=40) as r:
                data = r.read()
            return json.loads(data) if as_json else data.decode("utf-8")
        except Exception as e:
            if i == tries - 1:
                raise SystemExit(f"取得に失敗: {url}\n  {e}")


def load(path):
    return json.load(open(path, encoding="utf-8"))


# ---------- 1. atlas(パル・アイテム) ----------
def atlas_diff(build):
    names = [x["name"] for x in get(ATLAS_API.format(b=build)) if x["name"] != "index.json"]
    with cf.ThreadPoolExecutor(12) as ex:
        pals = list(ex.map(lambda n: get(f"{ATLAS_RAW}/builds/{build}/pals/{n}"), names))
    atl = {p["id"].lower(): p for p in pals}
    items = get(f"{ATLAS_RAW}/builds/{build}/items/index.json")
    items = items.get("records") or items
    A = {r["id"]: r for r in (items if isinstance(items, list) else items.values())}

    chars = load("game_data/characters.json")["pals"]
    if os.environ.get("UPDATE_SIMULATE"):                      # 検出の動作確認用: メモリ上だけで値を変える
        chars[[c["asset"] for c in chars].index("Alpaca")]["stats"]["hp"] = 1
    loc = {p["asset"].lower(): p for p in chars}
    pal_changes, new_pals = [], sorted(set(atl) - set(loc))
    for k in sorted(set(atl) & set(loc)):
        s = loc[k]["stats"]
        for lf, af in PAL_FIELDS:
            if s.get(lf) != atl[k].get(af):
                pal_changes.append((loc[k]["asset"], lf, s.get(lf), atl[k].get(af)))
        lw = {t: r for t, r in loc[k]["work_suitabilities"].items() if r}
        if lw != atl[k]["workSuitability"]:
            pal_changes.append((loc[k]["asset"], "work_suitabilities", lw, atl[k]["workSuitability"]))
    L = {r["asset"]: r for r in load("game_data/items.json")["items"]}
    item_changes, new_items = [], sorted(set(A) - set(L))
    for k in sorted(set(A) & set(L)):
        for lf, af in ITEM_FIELDS:
            lv, av = L[k].get(lf), A[k].get(af)
            if lv is not None and av is not None and abs(float(lv) - float(av)) > 1e-9:
                item_changes.append((k, lf, lv, av))
    return pal_changes, new_pals, item_changes, new_items


# ---------- 2. paldb(テクノロジー・ミッション) ----------
def parse_tech(h):
    rows = []
    for blk in h.split("col pt-2 pb-1 border-bottom")[1:]:
        m = re.search(r'width:32px;"><div>(\d+)</div>', blk)
        if not m:
            continue
        for it in re.finditer(r'<div class="d-inline-block hoverTech[^"]*"\s*style="background-image: url\(([^)]*)\);"\s*data-hover="\?s=Technology/([^"]+)">\s*<div class="hoverTechCost badge">(\d+)</div>\s*<div class="hoverTechHeader">([^<]*)</div>\s*<div class="hoverTechFooter">([^<]*)</div>', blk):
            rows.append(dict(level=int(m.group(1)), tech_id=it.group(2), cost=int(it.group(3)), category=html.unescape(it.group(4)), name_jp=html.unescape(it.group(5)), icon=it.group(1)))
    return rows


def tech_diff():
    new = parse_tech(get(PALDB["tech"], as_json=False))
    if len(new) < 400:
        raise SystemExit(f"テクノロジーの取得結果が少なすぎる({len(new)}件)。ページの構造が変わった可能性がある")
    old = load("game_data/technology_raw.json")
    mo, mn = {r["tech_id"]: r for r in old}, {r["tech_id"]: r for r in new}
    added = [mn[k] for k in mn if k not in mo]
    removed = [mo[k] for k in mo if k not in mn]
    changed = [(k, f, mo[k][f], mn[k][f]) for k in mn if k in mo for f in ("level", "cost", "category", "name_jp") if mo[k][f] != mn[k][f]]
    return new, added, removed, changed


def mission_diff():
    h = get(PALDB["mission"], as_json=False)
    old_ids = {r["id"] for r in load("game_data/missions_raw.json")}
    found = []
    for m in re.finditer(r'<div id="[^"]*"[^>]*data-id="([^"]+)">([^<]+)</div><div[^>]*>(メインミッション|サブミッション)</div>', h):
        did, title, cat = m.group(1), html.unescape(m.group(2)), m.group(3)
        if did in old_ids:
            continue
        j = m.end(); k = h.find('<div class="half-bottom-row">', j)
        desc = html.unescape(re.sub(r"<[^>]+>", "", re.sub(r"<div[^>]*>|</div>", "", h[j:k]))).strip()
        e = re.search(r"Exp</span>\s*\+([\d,]+)", h[k:k + 4000])
        found.append(dict(id=did, title=title, category=cat, desc=desc, reward=f"Exp +{e.group(1)}" if e else None))
    return found


# ---------- 反映 ----------
def patch_text(path, asset, field, old, new, span=3000):
    """整形を壊さないよう、ファイルの該当箇所だけを文字列で置き換える"""
    s = open(path, encoding="utf-8").read()
    m = re.search(rf'"asset":\s*"{re.escape(asset)}"', s)
    old_s, new_s = f'"{field}": {json.dumps(old, ensure_ascii=False)}', f'"{field}": {json.dumps(new, ensure_ascii=False)}'
    j = s.find(old_s, m.start()) if m else -1
    if j < 0 or j > m.start() + span:
        return False
    open(path, "w", encoding="utf-8").write(s[:j] + new_s + s[j + len(old_s):])
    return True


def backup():
    d = ROOT / "tmp" / "update_backup" / datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    (d / "game_data").mkdir(parents=True)
    for f in ROOT.glob("palworld_*.json"):
        shutil.copy(f, d / f.name)
    for f in (ROOT / "game_data").iterdir():
        if f.is_file() and f.suffix in (".json", ".js"):
            shutil.copy(f, d / "game_data" / f.name)
    return d


def apply(pal_changes, item_changes, tech_new, missions):
    skipped = []
    for asset, f, old, new in pal_changes:
        if f == "work_suitabilities":
            skipped.append(f"{asset}: 作業適性の変更は手で確認(書式が複雑なため自動反映しない)"); continue
        ok = patch_text("game_data/characters.json", asset, f, old, new) and patch_text("palworld_combat_stats.json", asset, f, old, new, 800)
        if not ok: skipped.append(f"{asset}.{f}: 自動反映できなかった({old}→{new})")
    for asset, f, old, new in item_changes:
        if not patch_text("game_data/items.json", asset, f, old, new): skipped.append(f"{asset}.{f}: 自動反映できなかった({old}→{new})")
    if tech_new:
        json.dump(tech_new, open("game_data/technology_raw.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    if missions:
        raw = load("game_data/missions_raw.json"); icon = [r for r in raw if r["category"] == "サブミッション"][0]["icon"]
        for m in missions:
            raw.append(dict(id=m["id"], title=m["title"], category=m["category"], desc=m["desc"], reward=m["reward"], next=None, icon=icon))
        json.dump(raw, open("game_data/missions_raw.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    return skipped


def rebuild():
    for s in BUILD_ORDER:
        r = subprocess.run([sys.executable, f"scripts/{s}.py"], capture_output=True, text=True)
        print(f"  {s:28s} {'OK' if r.returncode == 0 else 'FAILED'}")
        if r.returncode != 0:
            print(r.stdout[-600:], r.stderr[-900:]); raise SystemExit(f"{s} で失敗。--apply の前の状態は tmp/update_backup/ にある")
    bad = []
    for f in sorted((ROOT / "game_data").glob("*.js")):
        if subprocess.run(["node", "--check", str(f)], capture_output=True).returncode != 0: bad.append(f.name)
    print("  構文チェック:", "OK" if not bad else f"NG {bad}")


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--apply", action="store_true"); a = ap.parse_args()
    cur = load("palworld_spawn_data.json")["steamBuildId"]; man = get(MANIFEST); latest = man["steamBuildId"]
    print(f"[1] ビルド: サイト {cur} / 最新 {latest} ({man['generatedAt'][:10]})" + ("  ← 新しい" if cur != latest else "  (同じ)"))
    pal_changes, new_pals, item_changes, new_items = atlas_diff(latest)
    try:
        tech_new, t_add, t_rem, t_chg = tech_diff()
    except SystemExit as e:                                  # paldb が一時的に取れないだけで全体を止めない
        print(f"[警告] テクノロジーの確認をスキップ: {e}"); tech_new, t_add, t_rem, t_chg = None, [], [], []
    try:
        m_new = mission_diff()
    except SystemExit as e:
        print(f"[警告] ミッションの確認をスキップ: {e}"); m_new = []
    L = []
    L += [f"[2] パル: 変更 {len(pal_changes)} 件 / 新パル {len(new_pals)} 体", *[f"    {c}" for c in pal_changes[:30]], *([f"    ★新パル(図鑑への追加は手作業): {new_pals}"] if new_pals else [])]
    L += [f"    アイテム: 変更 {len(item_changes)} 件 / 新アイテム {len(new_items)} 件", *[f"    {c}" for c in item_changes[:30]]]
    L += [f"    テクノロジー: 追加 {len(t_add)} / 削除 {len(t_rem)} / 変更 {len(t_chg)}", *[f"    + Lv{r['level']} {r['name_jp']}" for r in t_add[:20]], *[f"    - Lv{r['level']} {r['name_jp']}" for r in t_rem[:20]], *[f"    ~ {c}" for c in t_chg[:20]]]
    L += [f"    ミッション: 新規 {len(m_new)} 件", *[f"    + [{m['category']}] {m['title']} ({m['reward']})  ※説明文のアイテム名が欠けることがある。目視で確認" for m in m_new]]
    print("\n".join(L))
    nothing = not (pal_changes or new_pals or item_changes or new_items or t_add or t_rem or t_chg or m_new or cur != latest)
    if nothing:
        print("\n→ 変更はありません。更新は不要です。"); return
    stamp = datetime.date.today().isoformat()
    draft = [f'  {{ date: "{stamp}", items: [', f'    "<b>ゲームのアップデートに対応しました</b>(ビルド {latest})",']
    if pal_changes: draft.append(f'    "パルのデータ {len(pal_changes)} 件を更新しました",')
    if item_changes: draft.append(f'    "アイテムのデータ {len(item_changes)} 件を更新しました",')
    if t_add or t_chg: draft.append(f'    "テクノロジーを更新しました(追加 {len(t_add)}・変更 {len(t_chg)})",')
    if m_new: draft.append(f'    "ミッションを{len(m_new)}本追加しました",')
    draft += ['    "<b>確認できていないもの</b>: (ここに書く)",', "  ]},"]
    out = ROOT / "docs" / "update_reports"; out.mkdir(parents=True, exist_ok=True)
    (out / f"{stamp}.md").write_text("# 更新レポート " + stamp + "\n\n```\n" + "\n".join(L) + "\n```\n\n## 更新履歴の下書き(pages/changelog.js の先頭に貼る)\n\n```js\n" + "\n".join(draft) + "\n```\n", encoding="utf-8")
    print(f"\nレポートと更新履歴の下書き: docs/update_reports/{stamp}.md")
    if not a.apply:
        print("→ 確認だけで終了しました。反映するなら --apply を付けて再実行してください"); return
    print(f"\n[3] 反映: 退避 → {backup().relative_to(ROOT)}")
    skipped = apply(pal_changes, item_changes, tech_new, m_new)
    print("[4] データの作り直し"); rebuild()
    if skipped: print("\n自動で反映できなかったもの(手で確認):", *skipped, sep="\n  ")
    print("\n[5] 残りは人間の作業:\n  - pages/changelog.js に下書きを貼り、「確認できていないもの」を書く\n  - scripts/inject_data_version.py のバージョン表記を、確認できた範囲に合わせて直して実行する\n  - 新パル/新アイテムがあれば図鑑への追加、ミッションの説明文の目視確認\n  - ブラウザで各ページを開いて確認する")


if __name__ == "__main__":
    main()
