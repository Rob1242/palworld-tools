# 拠点配置プランナー v2 改良 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `palworld_base_planner_v2.html`(拠点配置プランナー)に、パル画像表示・作業速度スコアの正確性修正・世界樹パッシブ対応・ride情報表示を追加する。

**Architecture:** このプロジェクトはビルドツール無しの単一HTMLファイル(素のJS)+複数のJSON生成元データという構成。データ生成(Python)とロジック/UI(HTML内蔵JS)を分離し、Pythonスクリプトで生成した定数(`PAL_DATA`, `WORK_SPEED_TABLE`)をHTMLに書き込む方式にする。テストフレームワークは導入せず、(1)Pythonスクリプトはprintでの件数検証、(2)ブラウザのconsole.assertによる自己診断、(3)手動でのブラウザ確認、の3段構成で正しさを担保する。

**Tech Stack:** Python 3(標準ライブラリのみ、urllib/json/re)、素のHTML/CSS/JavaScript(フレームワーク無し)

## Global Constraints

- 数値・計算式は`palworld_project_handoff.md`(Obsidian)に確定済みのものを使う。無い場合はWeb検索で複数ソース確認する(CLAUDE.md 絶対ルール1)
- 巨大なJSONの中身をターミナルに丸ごと出力しない。件数・サンプルのみ(CLAUDE.md 絶対ルール3)
- 拠点最適化の計算はアルゴリズムで行い、LLM推論に「どれが最適か」を判断させない(CLAUDE.md 絶対ルール4)
- 画像アセットはbase64埋め込みではなく`game_data/icons/`への相対パス参照を使う(CLAUDE.md 2026-07-13更新分)
- 全てのファイルパスは `~/Downloads/palworld/` を作業ディレクトリとする相対パスで統一する

---

## Task 1: paldb.ccスクレイピングでJP⇔EN画像名対応表を作る

**Files:**
- Create: `build_name_map.py`
- Create(生成物): `palworld_name_jp_en_map.json`

**Interfaces:**
- Consumes: `palworld_pals_clean.json`(287件、`name`フィールド)、`game_data/icons/pals/`内のファイル一覧、`https://paldb.cc/ja/Pals`のHTML
- Produces: `palworld_name_jp_en_map.json` — `[{name: string, en_name: string|null, icon: string|null}, ...]`(287件、`name`をキーにTask 2で参照される)

- [ ] **Step 1: `build_name_map.py`を作成する**

```python
import json
import os
import re
import urllib.request

PALDB_URL = "https://paldb.cc/ja/Pals"
CLEAN_PATH = "palworld_pals_clean.json"
ICONS_DIR = "game_data/icons/pals"
OUTPUT_PATH = "palworld_name_jp_en_map.json"

NAME_PATTERN = re.compile(
    r'<a class="itemname" data-hover="[^"]*" href="([^"]+)">([^<]+)</a>'
)
ICON_PATTERN = re.compile(
    r'src="https://cdn\.paldb\.cc/image/Pal/Texture/PalIcon/Normal/(T_[A-Za-z0-9_]+_icon_normal\.webp)"'
)


def fetch_paldb_html():
    req = urllib.request.Request(
        PALDB_URL,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8")


def parse_paldb_map(html_text):
    card_splits = re.split(r'(?=<div class="col" data-filters=")', html_text)
    cards = [c for c in card_splits if c.startswith('<div class="col" data-filters="')]
    result = {}
    for card in cards:
        name_match = NAME_PATTERN.search(card)
        if not name_match:
            continue
        en_name, jp_name = name_match.group(1), name_match.group(2)
        icon_match = ICON_PATTERN.search(card)
        result[jp_name] = {
            "en_name": en_name,
            "icon_file": icon_match.group(1) if icon_match else None,
        }
    return result


def main():
    html_text = fetch_paldb_html()
    paldb_map = parse_paldb_map(html_text)
    print(f"paldb.ccから{len(paldb_map)}件のパル名ペアを取得")

    clean = json.load(open(CLEAN_PATH, encoding="utf-8"))
    output = []
    no_paldb_entry = []
    no_local_icon = []
    for p in clean:
        jp = p["name"]
        entry = paldb_map.get(jp)
        icon_path = None
        en_name = None
        if entry is None:
            no_paldb_entry.append(jp)
        else:
            en_name = entry["en_name"]
            icon_file = entry["icon_file"]
            if icon_file and os.path.exists(os.path.join(ICONS_DIR, icon_file)):
                icon_path = f"game_data/icons/pals/{icon_file}"
            else:
                no_local_icon.append(jp)
        output.append({"name": jp, "en_name": en_name, "icon": icon_path})

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    matched = sum(1 for o in output if o["icon"])
    print(f"合計{len(clean)}体中、画像マッチ成功: {matched}体")
    if no_paldb_entry:
        print(f"paldb.ccに見つからなかった: {len(no_paldb_entry)}体 {no_paldb_entry}")
    if no_local_icon:
        print(f"paldb.ccには有るがローカルアイコンが無い: {len(no_local_icon)}体 {no_local_icon}")
    print(f"{OUTPUT_PATH} に保存しました")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 実行して結果を確認する**

Run: `cd ~/Downloads/palworld && python3 build_name_map.py`

Expected出力(2026-07-13時点の検証結果と一致するはず):
```
paldb.ccから301件のパル名ペアを取得
合計287体中、画像マッチ成功: 287体
palworld_name_jp_en_map.json に保存しました
```
(「見つからなかった」系の行が出ても異常ではない。ただしマッチ成功が287体を大きく下回る場合はpaldb.cc側のHTML構造が変わった可能性があるため、`NAME_PATTERN`/`ICON_PATTERN`を実際のHTML(`curl -s https://paldb.cc/ja/Pals`で確認可)に合わせて調整すること)

- [ ] **Step 3: 生成されたJSONの中身をサンプル確認する**

Run: `python3 -c "import json; d=json.load(open('palworld_name_jp_en_map.json')); print(len(d)); print([x for x in d if x['name']=='モコロン'])"`

Expected: `287` と `[{'name': 'モコロン', 'en_name': 'Lamball', 'icon': 'game_data/icons/pals/T_SheepBall_icon_normal.webp'}]` が出力される

---

## Task 2: PAL_DATA生成スクリプト作成、HTMLへのicon画像+rideバッジ反映

**Files:**
- Create: `build_pal_data.py`
- Modify: `palworld_base_planner_v2.html`(`const PAL_DATA = ...`行の置換、`WORK_SPEED_TABLE`定数の新規追加、CSSの追加、`renderResult()`内のカード描画部分)

**Interfaces:**
- Consumes: Task 1が生成した `palworld_name_jp_en_map.json`、`palworld_pals_clean.json`、`palworld_work_speed_table.json`
- Produces: HTML内の `PAL_DATA`(各要素に`icon: string|null`, `ride: {rideable,fly,swim}`を追加)と `WORK_SPEED_TABLE`定数(Task 3で使用)

- [ ] **Step 1: `build_pal_data.py`を作成する**

```python
import json
import re

CLEAN_PATH = "palworld_pals_clean.json"
NAME_MAP_PATH = "palworld_name_jp_en_map.json"
WORK_SPEED_PATH = "palworld_work_speed_table.json"
HTML_PATH = "palworld_base_planner_v2.html"

ROLE_ORDER = [
    "火おこし", "水やり", "種まき", "発電", "手作業", "採集",
    "伐採", "採掘", "製薬", "冷却", "運搬", "牧場",
]


def build_pal_data():
    clean = json.load(open(CLEAN_PATH, encoding="utf-8"))
    name_map = {e["name"]: e for e in json.load(open(NAME_MAP_PATH, encoding="utf-8"))}

    pal_data = []
    for p in clean:
        work = {
            r: p["work_suitability"][r]
            for r in ROLE_ORDER
            if p["work_suitability"].get(r, 0) > 0
        }
        entry = {
            "name": p["name"],
            "types": p["types"],
            "active": p["active_time"],
            "work": work,
            "meal": p["meal_amount"],
            "pskill": p["partner_skill"]["name"],
            "icon": name_map.get(p["name"], {}).get("icon"),
            "ride": p["ride"],
        }
        pal_data.append(entry)
    return pal_data


def build_work_speed_table():
    data = json.load(open(WORK_SPEED_PATH, encoding="utf-8"))
    return data["work_speed_by_role"]


def replace_pal_data(html_text, pal_data):
    serialized = json.dumps(pal_data, ensure_ascii=False, separators=(",", ":"))
    pattern = re.compile(r"const PAL_DATA = \[.*?\]\n;\n", re.DOTALL)
    if not pattern.search(html_text):
        raise ValueError("const PAL_DATA = [...] ブロックが見つかりませんでした")
    return pattern.sub(f"const PAL_DATA = {serialized};\n", html_text, count=1)


def upsert_work_speed_table(html_text, work_speed_table):
    serialized = json.dumps(work_speed_table, ensure_ascii=False, separators=(",", ":"))
    existing_pattern = re.compile(r"const WORK_SPEED_TABLE = .*?;\n")
    if existing_pattern.search(html_text):
        return existing_pattern.sub(f"const WORK_SPEED_TABLE = {serialized};\n", html_text, count=1)
    marker = "const PASSIVE_POOL = "
    idx = html_text.index(marker)
    insertion = f"const WORK_SPEED_TABLE = {serialized};\n\n"
    return html_text[:idx] + insertion + html_text[idx:]


def main():
    pal_data = build_pal_data()
    work_speed_table = build_work_speed_table()

    html_text = open(HTML_PATH, encoding="utf-8").read()
    html_text = replace_pal_data(html_text, pal_data)
    html_text = upsert_work_speed_table(html_text, work_speed_table)

    with open(HTML_PATH, "w", encoding="utf-8") as f:
        f.write(html_text)

    icons_present = sum(1 for p in pal_data if p["icon"])
    print(f"PAL_DATA生成: {len(pal_data)}体、うちアイコン有り{icons_present}体")
    print(f"WORK_SPEED_TABLE生成: {len(work_speed_table)}役職分")
    print(f"{HTML_PATH} を更新しました")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 実行する**

Run: `cd ~/Downloads/palworld && python3 build_pal_data.py`

Expected出力:
```
PAL_DATA生成: 287体、うちアイコン有り287体
WORK_SPEED_TABLE生成: 10役職分
palworld_base_planner_v2.html を更新しました
```

- [ ] **Step 3: HTMLが壊れていないか構文チェックする**

Run: `python3 -c "
import re, json
html = open('palworld_base_planner_v2.html', encoding='utf-8').read()
m = re.search(r'const PAL_DATA = (\[.*?\]);', html, re.DOTALL)
data = json.loads(m.group(1))
print('PAL_DATA件数:', len(data))
print('iconキー有り件数:', sum(1 for d in data if d.get('icon')))
print('サンプル:', {k:v for k,v in data[0].items() if k!='work'})
m2 = re.search(r'const WORK_SPEED_TABLE = (\{.*?\});', html, re.DOTALL)
wst = json.loads(m2.group(1))
print('WORK_SPEED_TABLE役職数:', len(wst))
"`

Expected: `PAL_DATA件数: 287`、`iconキー有り件数: 287`、`WORK_SPEED_TABLE役職数: 10` が出力され、エラーが出ないこと

- [ ] **Step 4: CSSを追加する(パルアイコン・rideバッジ用)**

`palworld_base_planner_v2.html` の `.empty-slot{...}` ルールの直後に以下を追加する:

```css
  .slot-header{display:flex;align-items:flex-start;gap:8px;margin-bottom:2px;}
  .pal-icon{width:40px;height:40px;border-radius:50%;border:1px solid var(--line);background:var(--panel2);flex-shrink:0;object-fit:cover;}
  .pal-icon-empty{width:40px;height:40px;border-radius:50%;border:1px dashed var(--line);background:var(--panel2);flex-shrink:0;}
  .slot-header-text{flex:1;min-width:0;}
  .badge.ride{background:#20343a;color:#8fd0e0;border:1px solid #35606c;}
```

- [ ] **Step 5: `renderResult()`内のカード描画を、アイコン画像+rideバッジ表示に変更する**

現在の該当コード(`html += '<div class="slot-grid">';` 以降のforEach内)を以下に置き換える:

```javascript
  html += '<div class="slot-grid">';
  picks.forEach((p,i) => {
    const pal = p.pal;
    const roleBadges = Object.entries(pal.work)
      .filter(([r,lv]) => roleWeights[r] > 0)
      .sort((a,b)=>b[1]-a[1])
      .map(([r,lv]) => `<span class="badge role">${r} Lv${lv}</span>`).join('');
    const timeBadge = pal.active === "夜" ? '<span class="badge night">夜行性</span>'
      : pal.active === "両方" ? '<span class="badge day">昼</span><span class="badge night">夜</span>'
      : '<span class="badge day">昼行性</span>';
    let passiveBadges = '';
    if(p.loadout){
      passiveBadges = p.loadout.chosen.map(ps => `<span class="badge passive">${ps.name}${ps.pct?'+'+ps.pct+'%':''}</span>`).join('');
    }
    const rideBadges = [
      pal.ride && pal.ride.rideable ? '<span class="badge ride">乗れる</span>' : '',
      pal.ride && pal.ride.fly ? '<span class="badge ride">飛べる</span>' : '',
      pal.ride && pal.ride.swim ? '<span class="badge ride">泳げる</span>' : '',
    ].join('');
    const iconImg = pal.icon
      ? `<img class="pal-icon" src="${pal.icon}" alt="${pal.name}">`
      : '<div class="pal-icon-empty"></div>';
    html += `<div class="slot">
      <div class="num-badge">#${i+1}</div>
      <div class="slot-header">
        ${iconImg}
        <div class="slot-header-text">
          <div class="pname">${pal.name}</div>
          <div class="ptype">${pal.types.join('/')} ・ ${p.reason} ・ 実効${Math.round(p.effective)}</div>
        </div>
      </div>
      <div>${timeBadge}${roleBadges}</div>
      ${rideBadges ? '<div style="margin-top:4px;">'+rideBadges+'</div>' : ''}
      ${passiveBadges ? '<div style="margin-top:4px;">'+passiveBadges+'</div>' : ''}
      <div class="pskill">◆ ${pal.pskill}</div>
    </div>`;
  });
  for(let i=picks.length; i<slots; i++){
    html += `<div class="slot empty-slot">空き枠</div>`;
  }
  html += '</div>';
```

- [ ] **Step 6: ブラウザで開いて目視確認する**

`palworld_base_planner_v2.html` をブラウザで直接開く(`game_data`フォルダが同じ階層にあることを確認)。計算結果のパルカードにアイコン画像が表示され、乗れる/飛べる/泳げるパルにバッジが出ることを確認する。開発者ツールのConsoleタブに画像読み込みエラー(404)が出ていないか確認する。

- [ ] **Step 7: コミット(gitリポジトリでは無いためスキップ)**

このプロジェクトはgitリポジトリではないため、コミット手順は無し。代わりにファイル保存が完了していることを確認する: `ls -la ~/Downloads/palworld/build_name_map.py ~/Downloads/palworld/build_pal_data.py ~/Downloads/palworld/palworld_name_jp_en_map.json`

---

## Task 3: 作業速度スコアの正確性修正

**Files:**
- Modify: `palworld_base_planner_v2.html`(`baseScore()`関数の書き換え、`relativeWorkValue()`の新規追加、自己診断コードの追加、subtitle直後への注記追加)

**Interfaces:**
- Consumes: Task 2で追加済みの `WORK_SPEED_TABLE` 定数(`{役職名: {"1":70,...,"5":5400,"max":44849}, ...}`)
- Produces: `relativeWorkValue(role, lv): number` — 他タスクからは参照されないが、`baseScore()`が内部で使用する

- [ ] **Step 1: 役職ごとのLv4→5伸び率を事前計算し、`relativeWorkValue()`を追加する**

`const WORK_SPEED_TABLE = ...;` の行の直後に以下を追加する:

```javascript
const WORK_SPEED_GROWTH_RATE = {};
Object.keys(WORK_SPEED_TABLE).forEach(role => {
  const t = WORK_SPEED_TABLE[role];
  WORK_SPEED_GROWTH_RATE[role] = t["5"] / t["4"];
});

function relativeWorkValue(role, lv){
  const table = WORK_SPEED_TABLE[role];
  if(!table) return lv;
  const lv1 = table["1"];
  if(lv <= 5){
    return table[String(lv)] / lv1;
  }
  const growth = WORK_SPEED_GROWTH_RATE[role];
  let value = table["5"];
  for(let l = 6; l <= lv; l++){
    value *= growth;
  }
  return value / lv1;
}
```

- [ ] **Step 2: `baseScore()`を書き換える**

現在の実装:
```javascript
function baseScore(pal){
  let s = 0, roleCount = 0;
  for(const r in pal.work){
    const w = roleWeights[r] || 0;
    if(w > 0){ s += w * pal.work[r]; roleCount++; }
  }
  if(generalistPref && roleCount > 1) s *= (1 + 0.12*(roleCount-1));
  return s;
}
```

置き換え後:
```javascript
function baseScore(pal){
  let s = 0, roleCount = 0;
  for(const r in pal.work){
    const w = roleWeights[r] || 0;
    if(w > 0){ s += w * relativeWorkValue(r, pal.work[r]); roleCount++; }
  }
  if(generalistPref && roleCount > 1) s *= (1 + 0.12*(roleCount-1));
  return s;
}
```

- [ ] **Step 3: ブラウザのconsoleで動く自己診断コードを追加する**

`relativeWorkValue`関数の定義直後に追加する:

```javascript
(function selfTestWorkSpeed(){
  const approxEqual = (a,b,eps=0.01) => Math.abs(a-b) < eps;
  console.assert(relativeWorkValue("火おこし", 1) === 1, "[selfTest失敗] 火おこしLv1は基準値1のはず");
  console.assert(approxEqual(relativeWorkValue("火おこし", 5), 5400/70), "[selfTest失敗] 火おこしLv5の相対値");
  console.assert(approxEqual(relativeWorkValue("火おこし", 6), (5400*3)/70), "[selfTest失敗] 火おこしLv6は実測Lv5の3倍で外挿されるはず");
  console.assert(approxEqual(relativeWorkValue("水やり", 6), (1000*2)/70), "[selfTest失敗] 水やりLv6は実測Lv5の2倍で外挿されるはず");
  console.log("[selfTest] 作業速度相対値の自己診断完了(上にconsole.assertエラーが出ていなければOK)");
})();
```

- [ ] **Step 4: Lv6以上は外挿値であることをUIに注記する**

現在の該当行:
```html
  <p class="subtitle">基礎適正Lv + 理想パッシブ理論値で実効スコアを計算し、局所探索で組み合わせを反復改善します。</p>
```

直後に追加:
```html
  <p class="subtitle" style="font-size:11px;">※ 作業適正Lv6以上のパルは実測データが無いため、役職ごとの実測伸び率(Lv4→5)で外挿した推定値を使用しています。</p>
```

- [ ] **Step 5: ブラウザで開いて確認する**

`palworld_base_planner_v2.html` をブラウザで開き、開発者ツールのConsoleタブを確認する。`[selfTest] 作業速度相対値の自己診断完了` のログが出て、その前に赤いAssertion failedが出ていないことを確認する。「この条件で最適配置を計算する」を押して結果が表示されることも確認する。

---

## Task 4: 世界樹パッシブ トグル追加

**Files:**
- Modify: `palworld_base_planner_v2.html`(`PASSIVE_POOL`定数の拡張、トグルUI追加、`idealPassiveLoadout()`の書き換え、パッシブバッジ描画の修正)

**Interfaces:**
- Consumes: なし(このタスク内で完結)
- Produces: `useWorldTree`(グローバル真偽値、Task間の依存なし)

- [ ] **Step 1: `PASSIVE_POOL`に世界樹パッシブを追加する**

現在の該当行:
```javascript
const PASSIVE_POOL = {"speed": [{"name": "超絶技巧", "pct": 75.0}, {"name": "職人気質", "pct": 50.0}, {"name": "社畜", "pct": 30.0}, {"name": "希少", "pct": 20.0}, {"name": "まじめ", "pct": 20.0}, {"name": "うぬぼれ屋", "pct": 10.0}], "night": [{"name": "吸血鬼", "pct": 0}, {"name": "不眠", "pct": 0}]}
;
```

置き換え後:
```javascript
const PASSIVE_POOL = {"speed": [{"name": "超絶技巧", "pct": 75.0}, {"name": "職人気質", "pct": 50.0}, {"name": "社畜", "pct": 30.0}, {"name": "希少", "pct": 20.0}, {"name": "まじめ", "pct": 20.0}, {"name": "うぬぼれ屋", "pct": 10.0}], "night": [{"name": "吸血鬼", "pct": 0}, {"name": "不眠", "pct": 0}], "worldtree_speed": [{"name": "悪魔の手", "pct": 90.0, "drawback": "SAN値減少+15%"}]}
;
```

- [ ] **Step 2: トグルUIを追加する**

現在の該当箇所(「理想パッシブを適用」トグルの直後、`</div>`で拠点設定パネルが閉じる直前):
```html
    <div class="toggle-row">
      <div><div class="toggle-label">理想パッシブを適用</div><div class="toggle-desc">各パルに実在するパッシブ(超絶技巧・職人気質など)を4枠仮定して実効値を計算</div></div>
      <div class="switch on" id="togglePassive"><div class="knob"></div></div>
    </div>
  </div>
```

置き換え後:
```html
    <div class="toggle-row">
      <div><div class="toggle-label">理想パッシブを適用</div><div class="toggle-desc">各パルに実在するパッシブ(超絶技巧・職人気質など)を4枠仮定して実効値を計算</div></div>
      <div class="switch on" id="togglePassive"><div class="knob"></div></div>
    </div>
    <div class="toggle-row">
      <div><div class="toggle-label">世界樹パッシブも考慮</div><div class="toggle-desc">悪魔の手(作業速度+90%、デメリット:SAN値減少+15%)を選択肢に含める。手術台での移植が前提の上級者向け機能</div></div>
      <div class="switch" id="toggleWorldTree"><div class="knob"></div></div>
    </div>
  </div>
```

- [ ] **Step 3: グローバル変数とイベントリスナーを追加する**

現在の該当行:
```javascript
let dayNightBalance = true;
let generalistPref = true;
let usePassive = true;
```

置き換え後:
```javascript
let dayNightBalance = true;
let generalistPref = true;
let usePassive = true;
let useWorldTree = false;
```

`togglePassive`のイベントリスナーの直後に追加:
```javascript
document.getElementById('toggleWorldTree').addEventListener('click', function(){
  useWorldTree = !useWorldTree; this.classList.toggle('on', useWorldTree);
});
```

- [ ] **Step 4: `idealPassiveLoadout()`を書き換える**

現在の実装:
```javascript
function idealPassiveLoadout(pal, wantNight){
  let slots = 4;
  let chosen = [];
  let alreadyNight = (pal.active === "夜" || pal.active === "両方");
  let addedNightPassive = false;
  if(wantNight && !alreadyNight){
    chosen.push(PASSIVE_POOL.night[0]);
    slots -= 1;
    addedNightPassive = true;
  }
  const speedPicks = PASSIVE_POOL.speed.slice(0, slots);
  chosen = chosen.concat(speedPicks);
  const totalPct = chosen.reduce((s,c)=>s+(c.pct||0),0);
  return { chosen, totalPct, isNightActive: alreadyNight || addedNightPassive };
}
```

置き換え後:
```javascript
function idealPassiveLoadout(pal, wantNight){
  let slots = 4;
  let chosen = [];
  let alreadyNight = (pal.active === "夜" || pal.active === "両方");
  let addedNightPassive = false;
  if(wantNight && !alreadyNight){
    chosen.push(PASSIVE_POOL.night[0]);
    slots -= 1;
    addedNightPassive = true;
  }
  const speedCandidates = useWorldTree
    ? PASSIVE_POOL.speed.concat(PASSIVE_POOL.worldtree_speed).sort((a,b)=>b.pct-a.pct)
    : PASSIVE_POOL.speed;
  const speedPicks = speedCandidates.slice(0, slots);
  chosen = chosen.concat(speedPicks);
  const totalPct = chosen.reduce((s,c)=>s+(c.pct||0),0);
  return { chosen, totalPct, isNightActive: alreadyNight || addedNightPassive };
}
```

- [ ] **Step 5: パッシブバッジにデメリット表示を追加する(CSS + renderResult内)**

`.badge.ride{...}` ルールの直後にCSSを追加:
```css
  .badge.passive.warn{background:#3a2a20;color:#e7c3af;border:1px solid var(--danger);}
```

Task 2 Step 5で置き換え済みの`renderResult()`内、`passiveBadges`の生成行を置き換える:

現在:
```javascript
    let passiveBadges = '';
    if(p.loadout){
      passiveBadges = p.loadout.chosen.map(ps => `<span class="badge passive">${ps.name}${ps.pct?'+'+ps.pct+'%':''}</span>`).join('');
    }
```

置き換え後:
```javascript
    let passiveBadges = '';
    if(p.loadout){
      passiveBadges = p.loadout.chosen.map(ps => {
        const warn = ps.drawback ? ' warn' : '';
        const drawbackText = ps.drawback ? ` (${ps.drawback})` : '';
        return `<span class="badge passive${warn}">${ps.name}${ps.pct?'+'+ps.pct+'%':''}${drawbackText}</span>`;
      }).join('');
    }
```

- [ ] **Step 6: ブラウザで動作確認する**

`palworld_base_planner_v2.html` をブラウザで開く。「世界樹パッシブも考慮」トグルをOFFのまま計算し、次にONにして再計算する。ONの時、一部のパルのパッシブバッジに「悪魔の手+90% (SAN値減少+15%)」が警告色で表示され、合計実効スコアがOFFの時より上がることを確認する。

---

## 実装後の総合確認

全タスク完了後、以下を通しで確認する:

- [ ] `palworld_base_planner_v2.html` をブラウザで開き、初回計算(ページ読み込み時に自動実行される`compute()`)でエラーが出ずに結果が表示される
- [ ] 拠点枠数を1・15・50で試し、いずれも空き枠/配置数の表示が正しい
- [ ] 開発者ツールのConsoleにJSエラー・404(画像)・selfTestのassertion failedが無い
- [ ] `docs/superpowers/specs/2026-07-13-base-planner-v2-improvements-design.md` の「検証方法」セクションの各項目を満たしている
