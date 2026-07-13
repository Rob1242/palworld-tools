# 配合検索・パルボックス・配合ロードマップ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `palworld_project_handoff.md`の「6. 次にやるべきこと」2〜4番、および2026-07-14夜間タスクの続き(配合検索・パルボックス・配合ロードマップ)を実装し、`palworld_dex.html`のナビに既に配置済みの `palworld_breeding.html` / `palworld_palbox.html` リンクを実体化する。

**Architecture:** 既存の`palworld_dex.html`と同じ設計(React不使用、素のHTML+CSS+JS単一ファイル、データはビルド時にPythonスクリプトで`const XXX_DATA = [...]`の形でHTMLに直接インライン埋め込み、file://で単体動作)を踏襲する。データソースは`game_data/breedingdata.json`(実測配合データ、捏造禁止)。配合検索とパルボックス/ロードマップは別ファイルとして分離しつつ、同じ`BREEDING_DATA`スキーマを共有する。

**Tech Stack:** Python 3(標準ライブラリのみ、ビルドスクリプト)、Vanilla JavaScript(ES6+, ビルド不要)、CSS(既存のパルワールド風デザイントークンを再利用)、localStorage(パルボックスの永続化)。

## Global Constraints

- 数値・データを記憶や推測で書かない。すべて`game_data/breedingdata.json`と既存の生成済みJSON(`palworld_dex_data.json`等)から機械的に導出する。マッチしないデータは「(JP名未確認)」等で明示し、それらしい名前を捏造しない(`CLAUDE.md`の絶対ルール1)
- 巨大なJSONファイルの中身をターミナル出力やチャットに丸ごと表示しない。件数・サンプルのみ出力する(`CLAUDE.md`の絶対ルール3)
- 外部JSライブラリ・CDN(フォント以外)・ビルドツール(webpack等)は使わない。既存ファイルと同じ素のHTML+CSS+JS
- 全ファイルは`file://`で直接開いて動作すること。データは`fetch()`せず、ビルド時にHTMLへインライン埋め込みする(`palworld_dex.html`の`PAL_DEX_DATA`と同じ方式)
- テストはこのリポジトリの既存の流儀に従う: Pythonビルドスクリプトは実行時の集計値出力(件数・マッチ率)で検証、JS側はブラウザconsoleで動く`console.assert`自己診断ブロック+ブラウザでの手動クリック確認(`task-3-brief.md`のパターンを踏襲)
- localStorageキーは`palworldOwnedPals`(所持パルの図鑑ID配列、文字列)で統一する
- デザインは`palworld_dex.html`の配色トークン(`--bg`, `--panel`, `--parchment`, `--brass`, `--teal`等)とフォント(`Reggae One`見出し / `JetBrains Mono`数値)をそのまま再利用し、AIっぽい汎用UIにしない

---

## 背景データ調査メモ(実装者向け、再調査不要)

`game_data/breedingdata.json`の構造は事前調査済み。以下を前提にしてよい:

- `pal_info`(300件): キーは内部アセット名(例: `"Alpaca"`, `"AmaterasuWolf_Dark"`)。値は`{name(英語表示名), combi_rank(配合ランク数値), rarity, ignore_combi(bool), icon}`
- `child_to_parents_formula`(257件): 子アセット名 → `[{parent_a, parent_b}, ...]`。ランク平均一致による正規の配合ペア一覧(**`ignore_combi:true`のパルが絡む組み合わせは既に除外済み**、検証済み)
- `child_to_parents_ignore`(254件): 一見ランク一致するが`ignore_combi`パルが絡むため無効な組み合わせ。**配合検索のロジックでは使わない**(参考データとして無視してよい)
- `unique_combos`(248件): 特定ペア→特定の子、という固定レシピ(属性変異体の生成など)。ランク平均より**常に優先**する
- `parent_to_children_formula`(43件): `ignore_combi:true`の43体(ボス級・特殊配合パル)専用。キーは特殊親のアセット名 → `[{partner, child}, ...]`。この43体が絡む配合はこのテーブルが正
- 検証済み: `parent_to_children_formula`のキー43件は完全に`pal_info`の`ignore_combi:true`の43件と一致。`child_to_parents_ignore`の中身は全て`ignore_combi:true`パルが絡む組み合わせ(サンプル検証で11/11件)

`palworld_dex_data.json`(287件、JP名の正)との紐付けは、`pal_info[asset].name`(英語表示名、例: `"Melpaca"`)を`palworld_dex_data.json`の`en_name`フィールドと突き合わせる。`build_dex_data.py`の`combat_by_name`と同じ「完全一致→`_`区切りのベース名フォールバック」方式が使える(`palworld_combat_stats.json`の`asset`フィールドが`breedingdata.json`の`pal_info`キーと同じ命名規則であることを確認済み)。

---

### Task 1: 配合データ統合ビルドスクリプト

**Files:**
- Create: `build_breeding_data.py`
- Create (生成物): `palworld_breeding_data.json`

**Interfaces:**
- Consumes: `game_data/breedingdata.json`, `palworld_dex_data.json`(既存)
- Produces: `palworld_breeding_data.json` のスキーマ:
  ```json
  {
    "pals": {
      "<asset>": {
        "jp_name": "モコロン or null",
        "en_name": "Melpaca",
        "icon": "game_data/icons/pals/....webp or null",
        "dex_id": "1 or null",
        "combi_rank": 2720,
        "rarity": 3,
        "ignore_combi": false,
        "match_status": "exact | variant_fallback | missing"
      }
    },
    "forwardPairs": { "AssetA|AssetB": "ChildAsset" },
    "reverseParents": {
      "ChildAsset": { "unique": [["AssetA","AssetB"]], "formula": [["AssetA","AssetB"], ...] }
    }
  }
  ```
  `forwardPairs`のキーは2親アセット名を`Array.sort().join("|")`した文字列。`reverseParents`の`unique`には`unique_combos`由来と`parent_to_children_formula`由来の両方を含む(UI側では「固定レシピ」として同じ優先表示にする)。
- また、以後のタスクが再実行して使う`inject_const(html_path, const_name, data)`関数をこのスクリプト内に定義する(他タスクはこのスクリプトを直接importせず、コピーして自分のビルドスクリプトに使う。Task 3で説明)。

- [ ] **Step 1: `build_breeding_data.py`を作成し、JP名マッチングロジックを書く**

```python
import json
import os
import re

BREEDING_PATH = "game_data/breedingdata.json"
DEX_PATH = "palworld_dex_data.json"
OUTPUT_PATH = "palworld_breeding_data.json"
# このスクリプトが存在すればBREEDING_DATA定数を注入するHTMLファイル一覧。
# まだ存在しないファイルは黙ってスキップする(Task 2/3でファイルが増えたらここに追記する)。
INJECT_TARGETS = ["palworld_breeding.html", "palworld_palbox.html"]


def build_jp_index(dex):
    idx = {}
    for p in dex:
        if p.get("en_name"):
            idx[p["en_name"].strip().lower()] = p
    return idx


def match_asset_to_jp(info, jp_idx):
    name = info.get("name", "")
    key = name.strip().lower()
    if key in jp_idx:
        return jp_idx[key], "exact"
    if "_" in name:
        base = name.rsplit("_", 1)[0].strip().lower()
        if base in jp_idx:
            return jp_idx[base], "variant_fallback"
    return None, "missing"


def build_pals(pal_info, jp_idx):
    pals = {}
    matched = 0
    unmatched = []
    for asset, info in pal_info.items():
        jp, status = match_asset_to_jp(info, jp_idx)
        if jp:
            matched += 1
            pals[asset] = {
                "jp_name": jp["name"],
                "en_name": info.get("name"),
                "icon": jp.get("icon"),
                "dex_id": jp.get("id"),
                "combi_rank": info.get("combi_rank"),
                "rarity": info.get("rarity"),
                "ignore_combi": bool(info.get("ignore_combi")),
                "match_status": status,
            }
        else:
            unmatched.append(asset)
            pals[asset] = {
                "jp_name": None,
                "en_name": info.get("name"),
                "icon": None,
                "dex_id": None,
                "combi_rank": info.get("combi_rank"),
                "rarity": info.get("rarity"),
                "ignore_combi": bool(info.get("ignore_combi")),
                "match_status": "missing",
            }
    return pals, matched, unmatched


def pair_key(a, b):
    return "|".join(sorted([a, b]))


def build_forward_and_reverse(bd):
    forward = {}
    reverse = {}

    # 1. ランク平均による正規の配合ペア(ベースライン)
    for child, pairs in bd["child_to_parents_formula"].items():
        reverse.setdefault(child, {"unique": [], "formula": []})
        reverse[child]["formula"] = [[p["parent_a"], p["parent_b"]] for p in pairs]
        for p in pairs:
            forward[pair_key(p["parent_a"], p["parent_b"])] = child

    # 2. ignore_combiパル専用の固定配合(正規テーブルを上書き)
    for special_parent, combos in bd["parent_to_children_formula"].items():
        for c in combos:
            k = pair_key(special_parent, c["partner"])
            forward[k] = c["child"]
            reverse.setdefault(c["child"], {"unique": [], "formula": []})
            reverse[c["child"]]["unique"].append([special_parent, c["partner"]])

    # 3. unique_combos(固定レシピ)が最優先で上書き
    for uc in bd["unique_combos"]:
        k = pair_key(uc["parent_a"], uc["parent_b"])
        forward[k] = uc["child"]
        reverse.setdefault(uc["child"], {"unique": [], "formula": []})
        reverse[uc["child"]]["unique"].append([uc["parent_a"], uc["parent_b"]])

    return forward, reverse


def inject_const(html_path, const_name, data):
    if not os.path.exists(html_path):
        print(f"  ({html_path} はまだ存在しないためスキップ)")
        return
    serialized = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    html = open(html_path, encoding="utf-8").read()
    pattern = re.compile(r"const " + re.escape(const_name) + r" = \{\};|const " + re.escape(const_name) + r" = \[\];")
    if not pattern.search(html):
        raise ValueError(f"{html_path} に `const {const_name} = {{}};` または `[];` のプレースホルダが見つかりません")
    html = pattern.sub(lambda m: f"const {const_name} = {serialized};", html, count=1)
    open(html_path, "w", encoding="utf-8").write(html)
    print(f"  {html_path} に {const_name} を注入しました")


def main():
    bd = json.load(open(BREEDING_PATH, encoding="utf-8"))
    dex = json.load(open(DEX_PATH, encoding="utf-8"))
    jp_idx = build_jp_index(dex)

    pals, matched, unmatched = build_pals(bd["pal_info"], jp_idx)
    forward, reverse = build_forward_and_reverse(bd)

    out = {"pals": pals, "forwardPairs": forward, "reverseParents": reverse}
    json.dump(out, open(OUTPUT_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    print(f"pal_info total: {len(bd['pal_info'])}")
    print(f"JP name matched: {matched} ({matched/len(bd['pal_info'])*100:.1f}%)")
    print(f"unmatched ({len(unmatched)}): {unmatched[:15]}{' ...' if len(unmatched) > 15 else ''}")
    print(f"forwardPairs entries: {len(forward)}")
    print(f"reverseParents entries (children with known route): {len(reverse)}")
    print(f"{OUTPUT_PATH} written")

    for target in INJECT_TARGETS:
        inject_const(target, "BREEDING_DATA", out)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 実行してマッチ率と統計を確認する**

Run: `cd ~/Downloads/palworld && python3 build_breeding_data.py`

Expected出力(概算、正確な数値は実行結果を信じること):
- `pal_info total: 300`
- `JP name matched:` が**270件以上(90%以上)**であること。90%を大きく下回る場合はマッチングロジックのバグの可能性が高いので、`unmatched`に出てくるアセット名を数件`palworld_dex_data.json`内で手動grepして原因を確認すること(例: 表記ゆれ、1.0新規パルでdex側に無い等)。低い場合でも数値を偽って報告しない
- `forwardPairs entries:` が3万件前後
- `palworld_breeding.html`, `palworld_palbox.html` はまだ存在しないため両方「スキップ」と表示される(これが正しい、エラーではない)

- [ ] **Step 3: 簡易な整合性チェックを行う**

以下をその場で実行し、結果を目視確認する(壊れていないことの確認、正式なテストファイルは作らない):

```bash
python3 -c "
import json
d = json.load(open('palworld_breeding_data.json'))
fp = d['forwardPairs']
# Alpaca+Alpaca -> Alpaca であるはず(調査済みの実データ)
print('Alpaca+Alpaca ->', fp.get('Alpaca|Alpaca'))
assert fp.get('Alpaca|Alpaca') == 'Alpaca'
# unique_combos が forwardPairs に反映されているか(1件サンプル確認)
import json as j
bd = j.load(open('game_data/breedingdata.json'))
uc = bd['unique_combos'][0]
key = '|'.join(sorted([uc['parent_a'], uc['parent_b']]))
print(uc, '-> forwardPairs says', fp.get(key))
assert fp.get(key) == uc['child']
print('OK')
"
```

Expected: 両方の`assert`がエラーなく通り、最後に`OK`が出る。

- [ ] **Step 4: Commit**

```bash
git add build_breeding_data.py palworld_breeding_data.json
git commit -m "配合データ統合ビルドスクリプト作成: JP名マッチング+forwardPairs/reverseParents生成"
```

---

### Task 2: 配合検索ページ(palworld_breeding.html)

**Files:**
- Create: `palworld_breeding.html`
- Modify: `build_breeding_data.py`は変更不要(Step 1で`palworld_breeding.html`が存在するようになった後に再実行するだけでよい)

**Interfaces:**
- Consumes: `Task 1`の`BREEDING_DATA`(`pals`/`forwardPairs`/`reverseParents`)
- Produces: 他タスクからは参照されない(独立ページ)

- [ ] **Step 1: HTMLの骨組みを作成する(既存デザインを踏襲)**

`palworld_dex.html`の**10〜125行目の`<style>`ブロックを丸ごとコピー**して`palworld_breeding.html`の`<style>`に貼り付ける(配色トークン・カード・タイプバッジ等のCSSを完全一致させる)。加えて以下のCSSを`</style>`直前に追記する(検索フォーム・結果表示用の追加クラス):

```css
.mode-tabs{display:flex;gap:8px;margin-bottom:16px;}
.mode-tab{padding:8px 18px;border:1px solid var(--line);border-radius:8px 8px 0 0;background:var(--panel);color:var(--parchment-dim);cursor:pointer;font-family:var(--font-display);}
.mode-tab.active{background:var(--panel2);color:var(--parchment);border-bottom:2px solid var(--brass);}
.picker-row{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;margin-bottom:20px;}
.pal-picker{position:relative;width:260px;}
.pal-picker input{width:100%;box-sizing:border-box;}
.pal-picker-results{position:absolute;top:100%;left:0;right:0;max-height:260px;overflow-y:auto;background:var(--panel2);border:1px solid var(--line);border-radius:0 0 8px 8px;z-index:10;}
.pal-picker-item{display:flex;align-items:center;gap:8px;padding:6px 10px;cursor:pointer;}
.pal-picker-item:hover{background:var(--panel);}
.pal-picker-item img{width:28px;height:28px;object-fit:contain;}
.picked-pal{display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--panel2);border-radius:8px;border:1px solid var(--line);min-height:44px;}
.picked-pal img{width:32px;height:32px;object-fit:contain;}
.plus-sign{font-family:var(--font-display);font-size:24px;color:var(--brass);align-self:center;margin-top:20px;}
.result-box{background:var(--panel2);border:1px solid var(--brass-dim);border-radius:10px;padding:20px;margin-top:12px;}
.result-box.empty{border-color:var(--line);color:var(--parchment-dim);}
.route-pair-list{display:flex;flex-direction:column;gap:6px;max-height:400px;overflow-y:auto;margin-top:10px;}
.route-pair-item{display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--panel);border-radius:6px;font-family:var(--font-mono);font-size:13px;}
.route-pair-item img{width:24px;height:24px;object-fit:contain;}
.unique-tag{display:inline-block;background:var(--brass-dim);color:var(--parchment);font-size:11px;padding:2px 8px;border-radius:10px;margin-right:8px;}
.show-more-btn{margin-top:10px;padding:6px 16px;background:var(--panel);border:1px solid var(--brass-dim);color:var(--parchment);border-radius:6px;cursor:pointer;font-family:var(--font-body);}
```

続いて`<body>`以下を作成する:

```html
<body>
<div class="wrap">
  <header class="top">
    <div class="brand">
      <div class="brand-badge">柄</div>
      <h1 class="title"><small>Palworld 攻略ツール</small>配合検索</h1>
    </div>
    <nav class="tabs">
      <a href="palworld_base_planner_v2.html">拠点プランナー</a>
      <a href="palworld_dex.html">パル図鑑</a>
      <a href="palworld_breeding.html" class="current">配合検索</a>
      <a href="palworld_palbox.html">パルボックス</a>
    </nav>
  </header>

  <div class="mode-tabs">
    <div class="mode-tab active" data-mode="forward">2体から生まれる子を調べる</div>
    <div class="mode-tab" data-mode="reverse">欲しい子から親候補を調べる</div>
  </div>

  <div id="forwardMode">
    <div class="picker-row">
      <div class="pal-picker" id="pickerA">
        <input type="text" placeholder="親1を検索…" data-slot="a">
        <div class="pal-picker-results" style="display:none;"></div>
      </div>
      <div class="plus-sign">×</div>
      <div class="pal-picker" id="pickerB">
        <input type="text" placeholder="親2を検索…" data-slot="b">
        <div class="pal-picker-results" style="display:none;"></div>
      </div>
    </div>
    <div id="forwardResult" class="result-box empty">親を2体選んでください</div>
  </div>

  <div id="reverseMode" style="display:none;">
    <div class="pal-picker" style="width:320px;">
      <input type="text" placeholder="目標のパルを検索…" data-slot="target">
      <div class="pal-picker-results" style="display:none;"></div>
    </div>
    <div id="reverseResult" class="result-box empty">パルを選んでください</div>
  </div>

  <p class="footer-note">配合データは内部データマイン実測値(<code>game_data/breedingdata.json</code>)に基づきます。1.0で追加されたパルの一部はパル図鑑側とのJP名紐付けが取れていない場合があります(その場合「(JP名未確認)」と表示)。</p>
</div>
<script>
const BREEDING_DATA = {};
</script>
</body>
</html>
```

- [ ] **Step 2: パル検索ピッカーの共通ロジックを実装する**

`<script>`内、`const BREEDING_DATA = {};`の直後に追記:

```javascript
const PAL_LIST = Object.entries(BREEDING_DATA.pals || {}).map(([asset, info]) => ({
  asset,
  displayName: info.jp_name || `${info.en_name}(JP名未確認)`,
  icon: info.icon,
})).sort((a, b) => a.displayName.localeCompare(b.displayName, 'ja'));

function nameOf(asset){
  const info = BREEDING_DATA.pals[asset];
  if(!info) return asset;
  return info.jp_name || `${info.en_name}(JP名未確認)`;
}
function iconOf(asset){
  const info = BREEDING_DATA.pals[asset];
  return info && info.icon;
}

function setupPicker(inputEl, resultsEl, onPick){
  inputEl.addEventListener("input", () => {
    const q = inputEl.value.trim().toLowerCase();
    if(!q){ resultsEl.style.display = "none"; return; }
    const matches = PAL_LIST.filter(p =>
      p.displayName.toLowerCase().includes(q) || p.asset.toLowerCase().includes(q)
    ).slice(0, 30);
    if(matches.length === 0){
      resultsEl.innerHTML = `<div class="pal-picker-item">見つかりません</div>`;
    } else {
      resultsEl.innerHTML = matches.map(p => `
        <div class="pal-picker-item" data-asset="${p.asset}">
          ${p.icon ? `<img src="${p.icon}" alt="">` : ""}<span>${p.displayName}</span>
        </div>
      `).join("");
      resultsEl.querySelectorAll(".pal-picker-item[data-asset]").forEach(el => {
        el.addEventListener("click", () => {
          const asset = el.dataset.asset;
          inputEl.value = nameOf(asset);
          resultsEl.style.display = "none";
          onPick(asset);
        });
      });
    }
    resultsEl.style.display = "block";
  });
  inputEl.addEventListener("blur", () => setTimeout(() => resultsEl.style.display = "none", 150));
}
```

- [ ] **Step 3: モードA(2体→子)を実装する**

```javascript
const forwardState = { a: null, b: null };

function renderForwardResult(){
  const box = document.getElementById("forwardResult");
  if(!forwardState.a || !forwardState.b){
    box.className = "result-box empty";
    box.textContent = "親を2体選んでください";
    return;
  }
  const key = [forwardState.a, forwardState.b].sort().join("|");
  const child = BREEDING_DATA.forwardPairs[key];
  box.className = "result-box";
  if(!child){
    box.innerHTML = `<p>「${nameOf(forwardState.a)}」×「${nameOf(forwardState.b)}」の組み合わせデータが見つかりません。(データ未収録の可能性があります)</p>`;
    return;
  }
  box.innerHTML = `
    <div class="picked-pal" style="display:inline-flex;">
      ${iconOf(child) ? `<img src="${iconOf(child)}" alt="">` : ""}
      <strong style="font-family:var(--font-display);font-size:20px;">${nameOf(child)}</strong>
    </div>
    <p style="margin-top:10px;color:var(--parchment-dim);font-size:13px;">が生まれます</p>
  `;
}

setupPicker(document.querySelector('#pickerA input'), document.querySelector('#pickerA .pal-picker-results'), asset => { forwardState.a = asset; renderForwardResult(); });
setupPicker(document.querySelector('#pickerB input'), document.querySelector('#pickerB .pal-picker-results'), asset => { forwardState.b = asset; renderForwardResult(); });
```

- [ ] **Step 4: モードB(子→親候補)を実装する**

`child_to_parents_formula`由来のペアが最大634件になるケースがあるため、デフォルトは先頭30件のみ表示し「すべて表示」ボタンで展開する。

```javascript
function renderPairList(pairs, isUnique){
  return pairs.map(([a, b]) => `
    <div class="route-pair-item">
      ${isUnique ? '<span class="unique-tag">固定レシピ</span>' : ''}
      ${iconOf(a) ? `<img src="${iconOf(a)}" alt="">` : ""}${nameOf(a)}
      <span style="color:var(--brass);">×</span>
      ${iconOf(b) ? `<img src="${iconOf(b)}" alt="">` : ""}${nameOf(b)}
    </div>
  `).join("");
}

function renderReverseResult(targetAsset){
  const box = document.getElementById("reverseResult");
  box.className = "result-box";
  const entry = BREEDING_DATA.reverseParents[targetAsset];
  if(!entry || (entry.unique.length === 0 && entry.formula.length === 0)){
    box.innerHTML = `<p>「${nameOf(targetAsset)}」の配合ルートが見つかりません(野生入手専用、または未収録の可能性があります)。</p>`;
    return;
  }
  let html = `<h3 style="font-family:var(--font-display);margin-top:0;">${nameOf(targetAsset)} の親候補</h3>`;
  if(entry.unique.length > 0){
    html += `<div class="route-pair-list">${renderPairList(entry.unique, true)}</div>`;
  }
  if(entry.formula.length > 0){
    const shown = entry.formula.slice(0, 30);
    const rest = entry.formula.slice(30);
    html += `<p style="margin-top:14px;color:var(--parchment-dim);font-size:13px;">ランク配合ペア(全${entry.formula.length}通り):</p>`;
    html += `<div class="route-pair-list" id="formulaPairList">${renderPairList(shown, false)}</div>`;
    if(rest.length > 0){
      html += `<button class="show-more-btn" id="showMoreBtn">残り${rest.length}件をすべて表示</button>`;
    }
  }
  box.innerHTML = html;
  const btn = document.getElementById("showMoreBtn");
  if(btn){
    btn.addEventListener("click", () => {
      document.getElementById("formulaPairList").innerHTML = renderPairList(entry.formula, false);
      btn.remove();
    });
  }
}

setupPicker(
  document.querySelector('#reverseMode .pal-picker input'),
  document.querySelector('#reverseMode .pal-picker-results'),
  asset => renderReverseResult(asset)
);
```

- [ ] **Step 5: モード切り替えタブを実装する**

```javascript
document.querySelectorAll(".mode-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".mode-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    const mode = tab.dataset.mode;
    document.getElementById("forwardMode").style.display = mode === "forward" ? "block" : "none";
    document.getElementById("reverseMode").style.display = mode === "reverse" ? "block" : "none";
  });
});
```

- [ ] **Step 6: `BREEDING_DATA`を注入する**

Run: `cd ~/Downloads/palworld && python3 build_breeding_data.py`

Expected: `palworld_breeding.html に BREEDING_DATA を注入しました` が出力される(`palworld_palbox.html`はまだ無いのでスキップされてよい)。

- [ ] **Step 7: ブラウザで確認する**

`palworld_breeding.html`をブラウザで開く。「2体から生まれる子を調べる」タブで親1に「モコロン」、親2に「モコロン」を選び、何らかの結果(モコロン、またはデータが無い旨のメッセージ)が表示されることを確認する。「欲しい子から親候補を調べる」タブに切り替え、「メルパカ」等既知のパルを検索して親候補リストが表示されることを確認する。開発者ツールのConsoleにエラーが出ていないことを確認する。

- [ ] **Step 8: Commit**

```bash
git add palworld_breeding.html build_breeding_data.py palworld_breeding_data.json
git commit -m "配合検索ページ追加: 2体→子モード、子→親候補モード"
```

---

### Task 3: パルボックスページ(palworld_palbox.html)

**Files:**
- Create: `palworld_palbox.html`
- Create: `build_palbox_data.py`

**Interfaces:**
- Consumes: `palworld_dex_data.json`(既存)、`palworld_breeding_data.json`(Task 1の生成物)
- Produces: `localStorage["palworldOwnedPals"]`(JSON配列、`palworld_dex_data.json`の`id`文字列の配列)。Task 4の配合ロードマップ機能がこのキーを読む。
- Produces: `window.getOwnedIds()` — 所持パルID配列を返すヘルパー関数(Task 4が使う)

- [ ] **Step 1: `build_palbox_data.py`を作成する**

このスクリプトは(a)`palworld_dex_data.json`をそのまま`PAL_BOX_DATA`として注入、(b)`palworld_breeding_data.json`を`BREEDING_DATA`として注入、の2つを行う。

```python
import json
import os
import re

DEX_PATH = "palworld_dex_data.json"
BREEDING_PATH = "palworld_breeding_data.json"
HTML_PATH = "palworld_palbox.html"


def inject_const(html, const_name, data):
    serialized = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    pattern = re.compile(r"const " + re.escape(const_name) + r" = \{\};|const " + re.escape(const_name) + r" = \[\];")
    if not pattern.search(html):
        raise ValueError(f"{HTML_PATH} に `const {const_name} = ...;` のプレースホルダが見つかりません")
    return pattern.sub(lambda m: f"const {const_name} = {serialized};", html, count=1)


def main():
    if not os.path.exists(HTML_PATH):
        print(f"{HTML_PATH} がまだ存在しません。先にTask 3 Step 2でファイルを作成してください。")
        return
    dex = json.load(open(DEX_PATH, encoding="utf-8"))
    breeding = json.load(open(BREEDING_PATH, encoding="utf-8"))

    html = open(HTML_PATH, encoding="utf-8").read()
    html = inject_const(html, "PAL_BOX_DATA", dex)
    html = inject_const(html, "BREEDING_DATA", breeding)
    open(HTML_PATH, "w", encoding="utf-8").write(html)
    print(f"PAL_BOX_DATA: {len(dex)}件、BREEDING_DATA: {len(breeding['pals'])}パルを{HTML_PATH}に注入しました")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: HTMLの骨組みを作成する**

`palworld_dex.html`の10〜125行目の`<style>`ブロックを丸ごとコピーし、Task 2で使った`.mode-tabs`系のCSSも同様に流用する(コピー元は`palworld_breeding.html`の追加CSSブロック)。加えて以下を追記:

```css
.card.owned{border-color:var(--teal);box-shadow:0 0 0 2px var(--teal) inset;}
.owned-badge{position:absolute;top:6px;left:6px;font-size:16px;}
.box-toolbar{display:flex;gap:10px;align-items:center;margin-bottom:14px;flex-wrap:wrap;}
.box-toolbar button{padding:6px 14px;background:var(--panel2);border:1px solid var(--brass-dim);color:var(--parchment);border-radius:6px;cursor:pointer;}
```

`<body>`:

```html
<body>
<div class="wrap">
  <header class="top">
    <div class="brand">
      <div class="brand-badge">柄</div>
      <h1 class="title"><small>Palworld 攻略ツール</small>パルボックス</h1>
    </div>
    <nav class="tabs">
      <a href="palworld_base_planner_v2.html">拠点プランナー</a>
      <a href="palworld_dex.html">パル図鑑</a>
      <a href="palworld_breeding.html">配合検索</a>
      <a href="palworld_palbox.html" class="current">パルボックス</a>
    </nav>
  </header>

  <div class="mode-tabs">
    <div class="mode-tab active" data-mode="box">所持パル管理</div>
    <div class="mode-tab" data-mode="roadmap">配合ロードマップ</div>
  </div>

  <div id="boxView">
    <div class="box-toolbar">
      <input type="text" id="boxSearchBox" placeholder="パル名で検索…">
      <button id="showOwnedOnlyBtn">所持のみ表示</button>
      <button id="showAllBtn">すべて表示</button>
      <span class="count-tag" id="boxCountTag"></span>
    </div>
    <div class="grid" id="boxGrid"></div>
  </div>

  <div id="roadmapView" style="display:none;">
    <div class="pal-picker" style="width:320px;">
      <input type="text" id="roadmapTargetInput" placeholder="目標のパルを検索…">
      <div class="pal-picker-results" style="display:none;"></div>
    </div>
    <div id="roadmapResult" class="result-box empty" style="margin-top:14px;">目標のパルを選んでください</div>
  </div>

  <p class="footer-note">所持データはこの端末のブラウザ内(localStorage)にのみ保存されます。他の端末・ブラウザとは共有されません。</p>
</div>
<script>
const PAL_BOX_DATA = [];
const BREEDING_DATA = {};
</script>
</body>
</html>
```

- [ ] **Step 3: 所持パル管理(グリッド+localStorage)を実装する**

```javascript
const OWNED_KEY = "palworldOwnedPals";

function getOwnedIds(){
  try {
    const raw = localStorage.getItem(OWNED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch(e){
    return [];
  }
}
window.getOwnedIds = getOwnedIds;

function setOwnedIds(ids){
  localStorage.setItem(OWNED_KEY, JSON.stringify(ids));
}

function toggleOwned(id){
  const ids = getOwnedIds();
  const idx = ids.indexOf(id);
  if(idx >= 0) ids.splice(idx, 1); else ids.push(id);
  setOwnedIds(ids);
}

const boxState = { query: "", ownedOnly: false };

function renderBoxGrid(){
  const owned = new Set(getOwnedIds());
  let list = PAL_BOX_DATA.filter(p => {
    if(boxState.query){
      const q = boxState.query.toLowerCase();
      if(!(p.name.includes(boxState.query) || (p.en_name && p.en_name.toLowerCase().includes(q)))) return false;
    }
    if(boxState.ownedOnly && !owned.has(p.id)) return false;
    return true;
  });
  document.getElementById("boxCountTag").textContent = `全${PAL_BOX_DATA.length}体中 所持${owned.size}体 / 表示${list.length}体`;
  const grid = document.getElementById("boxGrid");
  grid.innerHTML = list.map(p => `
    <div class="card ${owned.has(p.id) ? 'owned' : ''}" data-id="${p.id}" tabindex="0" role="button" aria-pressed="${owned.has(p.id)}">
      ${owned.has(p.id) ? '<span class="owned-badge">✅</span>' : ''}
      <div class="icon-wrap">${p.icon ? `<img src="${p.icon}" alt="${p.name}" loading="lazy">` : ""}</div>
      <div class="pname">${p.name}</div>
      <div class="pname-en">${p.en_name || ""}</div>
    </div>
  `).join("");
  grid.querySelectorAll(".card").forEach(card => {
    card.addEventListener("click", () => { toggleOwned(card.dataset.id); renderBoxGrid(); });
    card.addEventListener("keydown", e => { if(e.key==="Enter"||e.key===" "){ e.preventDefault(); toggleOwned(card.dataset.id); renderBoxGrid(); } });
  });
}

document.getElementById("boxSearchBox").addEventListener("input", e => { boxState.query = e.target.value; renderBoxGrid(); });
document.getElementById("showOwnedOnlyBtn").addEventListener("click", () => { boxState.ownedOnly = true; renderBoxGrid(); });
document.getElementById("showAllBtn").addEventListener("click", () => { boxState.ownedOnly = false; renderBoxGrid(); });

renderBoxGrid();
```

- [ ] **Step 4: モード切り替えタブ(所持管理⇔ロードマップ)を実装する**

```javascript
document.querySelectorAll(".mode-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".mode-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    const mode = tab.dataset.mode;
    document.getElementById("boxView").style.display = mode === "box" ? "block" : "none";
    document.getElementById("roadmapView").style.display = mode === "roadmap" ? "block" : "none";
  });
});
```

- [ ] **Step 5: データを注入する**

Run:
```bash
cd ~/Downloads/palworld
python3 build_palbox_data.py
```

Expected: `PAL_BOX_DATA: 287件、BREEDING_DATA: 300パルをpalworld_palbox.htmlに注入しました`

- [ ] **Step 6: ブラウザで確認する**

`palworld_palbox.html`を開く。グリッドに287体表示されること、カードをクリックすると✅バッジが付き背景色が変わること、再度クリックで解除されること、ブラウザをリロードしても所持状態が保持されること(localStorage永続化の確認)、検索ボックスで絞り込みできること、「所持のみ表示」ボタンが機能することを確認する。

- [ ] **Step 7: Commit**

```bash
git add palworld_palbox.html build_palbox_data.py
git commit -m "パルボックスページ追加: 所持パル管理(localStorage永続化)"
```

---

### Task 4: 配合ロードマップ機能(BFS)

**Files:**
- Modify: `palworld_palbox.html`(`roadmapView`部分にロジック追加)

**Interfaces:**
- Consumes: Task 3の`getOwnedIds()`、`BREEDING_DATA.pals`/`BREEDING_DATA.forwardPairs`
- Produces: なし(このページ内で完結)

アルゴリズム方針: 所持パル集合を初期状態とし、「1世代」ごとに、その時点で獲得済みの全パルの2体組み合わせ(自己交配含む)から新たに作れるパルを列挙して集合に追加する、という**世代レイヤーBFS**を行う(1回の配合ペアごとにグラフ探索するのではなく、1世代=並行して何組でも配合できる、という実際のプレイに即したコスト指標)。最大8世代まで探索し、進展が無くなった時点で打ち切る。

- [ ] **Step 1: BFSアルゴリズムを実装する**

`renderBoxGrid();`の直後に追記:

```javascript
function ownedAssetSet(){
  const ownedIds = new Set(getOwnedIds());
  const owned = new Set();
  Object.entries(BREEDING_DATA.pals).forEach(([asset, info]) => {
    if(info.dex_id && ownedIds.has(info.dex_id)) owned.add(asset);
  });
  return owned;
}

function findBreedingRoute(targetAsset, ownedSet, maxGenerations = 8){
  if(ownedSet.has(targetAsset)){
    return { found: true, alreadyOwned: true, steps: [] };
  }
  const forward = BREEDING_DATA.forwardPairs;
  const producedBy = {};
  let allKnown = new Set(ownedSet);

  for(let gen = 1; gen <= maxGenerations; gen++){
    const arr = Array.from(allKnown);
    const newlyFound = new Map();
    for(let i = 0; i < arr.length; i++){
      for(let j = i; j < arr.length; j++){
        const key = [arr[i], arr[j]].sort().join("|");
        const child = forward[key];
        if(child && !allKnown.has(child) && !newlyFound.has(child)){
          newlyFound.set(child, [arr[i], arr[j]]);
        }
      }
    }
    if(newlyFound.size === 0) break;
    newlyFound.forEach((pair, child) => {
      producedBy[child] = { a: pair[0], b: pair[1], generation: gen };
      allKnown.add(child);
    });
    if(allKnown.has(targetAsset)){
      return { found: true, alreadyOwned: false, steps: reconstructSteps(targetAsset, producedBy, ownedSet) };
    }
  }
  return { found: false };
}

function reconstructSteps(targetAsset, producedBy, ownedSet){
  const needed = new Set();
  const stack = [targetAsset];
  while(stack.length){
    const cur = stack.pop();
    if(needed.has(cur) || ownedSet.has(cur)) continue;
    needed.add(cur);
    const rec = producedBy[cur];
    if(rec){ stack.push(rec.a); stack.push(rec.b); }
  }
  return Array.from(needed)
    .filter(a => producedBy[a])
    .map(a => ({ child: a, ...producedBy[a] }))
    .sort((x, y) => x.generation - y.generation);
}
```

- [ ] **Step 2: 自己診断コードを追加する**

`reconstructSteps`関数の直後に追記:

```javascript
(function selfTestRoute(){
  // 単純ケース: A,Aから作れるパルがownedなら0ステップ
  const dummyForward = { "X|X": "X" };
  const savedForward = BREEDING_DATA.forwardPairs;
  BREEDING_DATA.forwardPairs = dummyForward;
  const r1 = findBreedingRoute("X", new Set(["X"]));
  console.assert(r1.found && r1.alreadyOwned === true, "[selfTest失敗] 所持済みパルは0ステップになるはず");
  BREEDING_DATA.forwardPairs = savedForward;

  // 到達不能ケース
  const r2 = findBreedingRoute("__NOT_EXIST__", new Set());
  console.assert(r2.found === false, "[selfTest失敗] 存在しない組み合わせはfound:falseになるはず");
  console.log("[selfTest] 配合ロードマップBFSの自己診断完了(上に赤いAssertion failedが無ければOK)");
})();
```

- [ ] **Step 3: ルート表示UIを実装する**

```javascript
function renderRoute(result, targetAsset, ownedSet){
  const box = document.getElementById("roadmapResult");
  box.className = "result-box";
  if(!result.found){
    box.innerHTML = `<p>「${nameOf(targetAsset)}」への配合ルートが見つかりませんでした(所持パルからは最大8世代以内で作れません。野生入手が必要な可能性があります)。</p>`;
    return;
  }
  if(result.alreadyOwned){
    box.innerHTML = `<p>「${nameOf(targetAsset)}」はすでに所持しています。</p>`;
    return;
  }
  let html = `<h3 style="font-family:var(--font-display);margin-top:0;">${nameOf(targetAsset)} への配合ルート(${result.steps.length}ステップ)</h3><ol class="route-pair-list" style="list-style:none;padding:0;">`;
  result.steps.forEach(s => {
    const isFinal = s.child === targetAsset;
    html += `<li class="route-pair-item" style="${isFinal ? 'border:1px solid var(--brass);' : ''}">
      <span class="unique-tag" style="background:var(--teal-dim);">第${s.generation}世代</span>
      ${ownedSet.has(s.a) ? '' : '🥚'}${iconOf(s.a) ? `<img src="${iconOf(s.a)}" alt="">` : ""}${nameOf(s.a)}
      <span style="color:var(--brass);">×</span>
      ${ownedSet.has(s.b) ? '' : '🥚'}${iconOf(s.b) ? `<img src="${iconOf(s.b)}" alt="">` : ""}${nameOf(s.b)}
      <span style="color:var(--brass);">→</span>
      ${iconOf(s.child) ? `<img src="${iconOf(s.child)}" alt="">` : ""}${nameOf(s.child)}${isFinal ? ' 🎯' : ''}
    </li>`;
  });
  html += `</ol><p style="margin-top:10px;color:var(--parchment-dim);font-size:12px;">🥚 = このルート内で先に配合して用意する必要があるパル(元々の所持パルではない)</p>`;
  box.innerHTML = html;
}

setupPicker(
  document.querySelector('#roadmapTargetInput'),
  document.querySelector('#roadmapView .pal-picker-results'),
  asset => {
    const owned = ownedAssetSet();
    const result = findBreedingRoute(asset, owned);
    renderRoute(result, asset, owned);
  }
);
```

`setupPicker`と`nameOf`/`iconOf`はTask 2で`palworld_breeding.html`用に書いた関数と同名・同実装。`palworld_palbox.html`にも同じ関数定義をコピーする(単一ファイル完結の方針を維持するため、共有JSファイルへの外出しはしない)。

- [ ] **Step 4: ブラウザで確認する**

`palworld_palbox.html`を開き、開発者ツールのConsoleで`[selfTest] 配合ロードマップBFSの自己診断完了`が出て赤いエラーが無いことを確認する。「所持パル管理」タブで適当に5〜6体チェックを入れる→「配合ロードマップ」タブに切り替え、それらのパル同士の配合で作れるはずのパル(またはランダムなパル)を検索してルート表示を試す。所持0体の状態でも(所持パルが無ければ何も配合できないため)「見つかりませんでした」的なメッセージが正しく出ることも確認する。

- [ ] **Step 5: Commit**

```bash
git add palworld_palbox.html
git commit -m "配合ロードマップ機能追加: 所持パルから目標パルまでの世代レイヤーBFS探索"
```

---

### Task 5: ナビゲーション統一(拠点プランナーへのnav追加)

**Files:**
- Modify: `palworld_base_planner_v2.html`

**Interfaces:**
- Consumes: なし
- Produces: なし

`palworld_base_planner_v2.html`にはヘッダーnavが無く、他3ページから飛んできても拠点プランナーへ戻る導線はあるが、拠点プランナー側から他ページへ行けない。一貫性のため追加する。

- [ ] **Step 1: 拠点プランナーのbody冒頭を確認し、ヘッダーを挿入する**

```bash
cd ~/Downloads/palworld
grep -n "<body>" palworld_base_planner_v2.html
```

`<body>`直後(既存の最初の要素の前)に以下を挿入する(既存のCSS変数名がdex.htmlと異なる可能性があるため、`--bg`等のCSS変数が無い場合はheaderに直接色を指定するインラインstyleにフォールバックする):

```html
<header class="top" style="display:flex;justify-content:space-between;align-items:center;padding:12px 24px;margin-bottom:16px;">
  <div style="font-family:'Reggae One',sans-serif;font-size:20px;">Palworld 攻略ツール - 拠点プランナー</div>
  <nav style="display:flex;gap:16px;">
    <a href="palworld_base_planner_v2.html" style="font-weight:bold;">拠点プランナー</a>
    <a href="palworld_dex.html">パル図鑑</a>
    <a href="palworld_breeding.html">配合検索</a>
    <a href="palworld_palbox.html">パルボックス</a>
  </nav>
</header>
```

- [ ] **Step 2: ブラウザで確認する**

`palworld_base_planner_v2.html`を開き、ヘッダーにnavが表示されること、既存のUI(役職重要度スライダー等)のレイアウトが崩れていないこと、各リンクをクリックして遷移できることを確認する。

- [ ] **Step 3: Commit**

```bash
git add palworld_base_planner_v2.html
git commit -m "拠点プランナーにナビゲーションヘッダーを追加(他3ページとの導線統一)"
```

---

## Task 6(任意・時間があれば): パル図鑑から配合検索へのディープリンク

**Files:**
- Modify: `palworld_dex.html`(`openDetail()`関数)
- Modify: `palworld_breeding.html`(URLパラメータ読み取り追加)

必須タスクではない。Task 1〜5が完了しレビューがクリーンになった後、時間があれば着手する。

- [ ] **Step 1:** `palworld_dex.html`の`openDetail(id)`内、詳細表示のHTML末尾に「配合を調べる」ボタンを追加し、`palworld_breeding.html?target=<dex_id>`へリンクさせる
- [ ] **Step 2:** `palworld_breeding.html`の末尾スクリプトで`new URLSearchParams(location.search)`から`target`(dex_id)を読み取り、`BREEDING_DATA.pals`から`dex_id`が一致するassetを探して、ページロード時に自動で「欲しい子から親候補を調べる」タブ・該当パルの結果を表示する
- [ ] **Step 3:** ブラウザで`palworld_dex.html`から任意のパル詳細→「配合を調べる」→`palworld_breeding.html`に自動遷移し結果が出ることを確認する
- [ ] **Step 4:** Commit

---

## 進捗管理・引き継ぎに関する指示(実装者向け)

- 各タスク完了ごとに`.superpowers/sdd/progress.md`を更新する(既存フォーマットに合わせる: `Task N: complete (commits ..., review clean)`)
- 各タスクはレビュー(既存の`.superpowers/sdd/review-*.diff`と同じ手順)を通してからコミットする
- 全タスク完了(Task 6含め着手した場合はそれも)後、Obsidian内`palworld_project_handoff.md`ノートを更新する: 「2026-07-14夜間 進行中タスク」セクションの②③④を完了マークに変え、6章「次にやるべきこと」に次の優先タスク(③アクティブスキルとパルの技習得ルートの紐付け)へ話を戻す一文を追記する。ローカルリポジトリ内に複製を作らないこと(`CLAUDE.md`規約)
- 何か判断に迷うスコープ問題が出た場合(例: マッチ率が想定より大幅に低い、データ構造が事前調査と food違う等)は、憶測で進めず、その旨をprogress.mdに明記した上で最も安全側(捏造しない、機能を諦めてでも正確性を優先する)の判断をする
