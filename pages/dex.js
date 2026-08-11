/* 詳細表示でしか使わないデータは、パルをクリックするまで読まない。
 *
 * 一覧を出すのに要るのは PAL_DEX_DATA と SPAWN_FLAGS_DATA だけ。
 * それ以外の5ファイルまで最初に読んでいたため、本番で
 * **DOM構築3,227ms / 読み込み完了3,910ms** かかっていた(2026-08-10 実測)。
 * 配合検索・パルボックスで既に使っている遅延読み込みと同じ手。 */
const DETAIL_SCRIPTS = [
  "game_data/item_icons_data.js?v=0b030eec",   // ITEM_ICONS(ドロップ品のアイコン)
  "game_data/learnset_data.js?v=0c7df10f",
  "game_data/paldb_extra_data.js?v=fdd8f5ac",
  "game_data/capture_rate_data.js?v=a17371d5",
  "game_data/movement_data.js?v=a23c57c6",
  "game_data/level80_stats_data.js?v=57c90819",
];
let detailDataPromise = null;

/* 読み込み中は画面の隅に合図を出す(shared/arcade.js)。
 * 起動演出のお辞儀とは別物で、こちらはループする待ちの動き。
 * 0.25秒以内に終わればそもそも出ない(2回目以降はキャッシュで即返る)。 */
function ensureDetailData(){
  if(detailDataPromise) return detailDataPromise;
  detailDataPromise = Promise.all(DETAIL_SCRIPTS.map(src => new Promise((resolve, reject) => {
    if(document.querySelector(`script[data-detail="${src}"]`)) return resolve();
    const el = document.createElement("script");
    el.src = src;   // ?v= は scripts/version_game_data.py が中身のハッシュで刻む
    el.dataset.detail = src;
    el.onload = resolve;
    el.onerror = () => reject(new Error("failed: " + src));
    document.head.appendChild(el);
  })));
  if(window.Arcade && window.Arcade.whileLoading){
    detailDataPromise = window.Arcade.whileLoading(detailDataPromise, "詳細データを読み込み中");
  }
  return detailDataPromise;
}

// 出現マップ埋め込み表示の有無だけを見るため、全パルの出現座標データ(1.2MB)ではなく
// dexIdごとの真偽値のみを持つ軽量データ(spawn_flags_data.js)を使う(2026-07-28)
const SPAWN_BY_DEXID = SPAWN_FLAGS_DATA;

const TYPES = ["無","炎","水","雷","地","草","氷","竜","闇"];
const ROLE_ICON = {"火おこし":"flame","水やり":"droplet","種まき":"sprout","発電":"bolt","手作業":"wrench","採集":"basket","伐採":"axe","採掘":"pickaxe","製薬":"flask","冷却":"snowflake","運搬":"box","牧場":"paw"};

let state = { view:"list", query:"", activeTypes:new Set(), sort:"id", selectedId:null };
function renderChips(){
  const wrap = document.getElementById("typeChips");
  wrap.innerHTML = TYPES.map(t => `<span class="chip" data-t="${t}">${t}</span>`).join("");
  wrap.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const t = chip.dataset.t;
      if(state.activeTypes.has(t)) state.activeTypes.delete(t); else state.activeTypes.add(t);
      chip.classList.toggle("active");
      renderGrid();
    });
  });
}

function filteredSorted(){
  let list = PAL_DEX_DATA.filter(p => {
    if(state.query){
      const q = state.query.toLowerCase();
      const hit = toKana(p.name).includes(toKana(state.query)) || (p.en_name && p.en_name.toLowerCase().includes(q));
      if(!hit) return false;
    }
    if(state.activeTypes.size > 0){
      const hasType = p.types.some(t => state.activeTypes.has(t));
      if(!hasType) return false;
    }
    return true;
  });
  if(state.sort === "name") list = list.slice().sort((a,b)=>a.name.localeCompare(b.name,'ja'));
  else if(state.sort === "rarity_desc") list = list.slice().sort((a,b)=>(b.stats&&b.stats.rarity||0)-(a.stats&&a.stats.rarity||0));
  else if(state.sort === "rarity_asc") list = list.slice().sort((a,b)=>(a.stats&&a.stats.rarity||0)-(b.stats&&b.stats.rarity||0));
  else list = list.slice().sort((a,b)=>Number(a.id)-Number(b.id));
  return list;
}

function renderGrid(){
  const list = filteredSorted();
  document.getElementById("countTag").textContent = `全${PAL_DEX_DATA.length}体中 ${list.length}体表示`;
  const grid = document.getElementById("cardGrid");
  if(list.length === 0){
    grid.innerHTML = `<div class="empty-msg">条件に合うパルが見つかりません</div>`;
    return;
  }
  grid.innerHTML = list.map(p => `
    <div class="card" data-id="${p.id}" tabindex="0" role="button" aria-label="${p.name}の詳細">
      <span class="num-badge">#${p.id}</span>
      <span class="night-badge">${p.active_time==="夜"?ico("moon"):p.active_time==="両方"?ico("sun")+ico("moon"):ico("sun")}</span>
      <div class="icon-wrap">${p.icon ? `<img src="${p.icon}" alt="${p.name}" loading="lazy">` : ""}</div>
      <div class="pname">${p.name}</div>
      <div class="pname-en">${p.en_name || ""}</div>
      <div class="types">${p.types.map(typeBadge).join("")}</div>
    </div>
  `).join("");
  grid.querySelectorAll(".card").forEach(card => {
    card.addEventListener("click", () => openDetail(card.dataset.id));
    card.addEventListener("keydown", e => { if(e.key==="Enter"||e.key===" "){ e.preventDefault(); openDetail(card.dataset.id); } });
  });
}

// 種族値・ライド速度の全パル中の順位を計算する(既存の種族値データのみから算出。
// 外部ソース不要・捏造リスク無し)
const STAT_RANK_KEYS = ["hp","melee_attack","shot_attack","defense","craft_speed","run_speed","ride_sprint_speed"];
const STAT_RANKS = {};
STAT_RANK_KEYS.forEach(key => {
  const withVal = PAL_DEX_DATA.filter(p => p.stats && typeof p.stats[key] === "number");
  const sorted = withVal.slice().sort((a,b) => b.stats[key] - a.stats[key]);
  const rankMap = {};
  sorted.forEach((p,i) => { rankMap[p.id] = i+1; });
  STAT_RANKS[key] = { rankMap, total: withVal.length };
});
function statRankText(id, key){
  const r = STAT_RANKS[key];
  if(!r || !(id in r.rankMap)) return "";
  return `${r.rankMap[id]}位/${r.total}`;
}

// 属性相性表(palworld-lab.comの相性チェッカーツールで検証、シェルガドラ実例の
// 弱点/耐性表示と照合して一致を確認済み)。beats[X]=[Y,...] は「Xで攻撃するとYに1.5倍」。
// 無属性は特例: 攻撃側として使っても常に等倍、かつ防御側としても同属性耐性を受けない。
const ELEMENT_BEATS = {
  "炎": ["草","氷"], "草": ["地"], "地": ["雷"], "雷": ["水"], "水": ["炎"],
  "氷": ["竜"], "竜": ["闇"], "闇": ["無"], "無": [],
};
function elementMultiplier(attackerType, defenderType){
  if(attackerType === "無") return 1; // 無属性は攻撃側として常に等倍
  if(ELEMENT_BEATS[attackerType].includes(defenderType)) return 1.5;
  if(defenderType === "無") return 1; // 無属性は防御側としても耐性を受けない特例
  if(attackerType === defenderType) return 0.66; // 同属性は耐性
  if(ELEMENT_BEATS[defenderType] && ELEMENT_BEATS[defenderType].includes(attackerType)) return 0.66; // 弱点の逆向き
  return 1;
}
function elementMatchup(defenderTypes){
  // 複属性は各属性の倍率を掛け合わせる(両方弱点なら1.5×1.5=2.25、等)
  const weak = [], resist = [];
  TYPES.forEach(atk => {
    let mult = 1;
    defenderTypes.forEach(def => { mult *= elementMultiplier(atk, def); });
    if(Math.abs(mult - 1) < 0.001) return;
    (mult > 1 ? weak : resist).push({ type: atk, mult });
  });
  weak.sort((a,b)=>b.mult-a.mult);
  resist.sort((a,b)=>a.mult-b.mult);
  return { weak, resist };
}

function statRow(label, val, max, id, key){
  const pct = Math.min(100, Math.round((val/max)*100));
  const rankText = (id && key) ? statRankText(id, key) : "";
  return `<div class="stat-row">
    <div class="stat-label">${label}</div>
    <div class="stat-bar"><div class="stat-bar-fill" style="width:${pct}%"></div></div>
    <div class="stat-val">${val}${rankText ? `<span class="stat-rank">${rankText}</span>` : ''}</div>
  </div>`;
}

function palAssetFromIcon(icon){
  const m = /T_(.+?)_icon_normal\.webp/.exec(icon || "");
  return m ? m[1] : null;
}

async function openDetail(id){
  const p = PAL_DEX_DATA.find(x => x.id === id);
  if(!p) return;
  try{
    await ensureDetailData();
  }catch(e){
    // 詳細用データが落ちてきていなくても、基本情報だけは出す。
    // 各参照は typeof チェック済みなので、欠けても壊れない。
    console.warn("[dex] 詳細データの読み込みに失敗:", e);
  }
  state.selectedId = id;
  const workEntries = Object.entries(p.work).sort((a,b)=>b[1]-a[1]);
  const rideBadges = [
    p.ride.rideable ? '<span class="badge ride">乗れる</span>' : '',
    p.ride.fly ? '<span class="badge ride">飛べる</span>' : '',
    p.ride.swim ? '<span class="badge ride">泳げる</span>' : '',
  ].join("");
  const timeBadge = p.active_time === "夜" ? `<span class="badge night">${ico("moon")} 夜行性</span>`
    : p.active_time === "両方" ? `<span class="badge day">${ico("sun")} 昼</span><span class="badge night">${ico("moon")} 夜</span>`
    : `<span class="badge day">${ico("sun")} 昼行性</span>`;
  const darkBadge = p.is_dark_type ? '<span class="badge dark">闇属性</span>' : '';

  let statsHtml = "";
  if(p.stats){
    const caveat = p.stats_status === "variant_fallback"
      ? `<div class="caveat">${ico("warning")} このパルは1.0で追加された属性違い個体のため、種族値の実測データがありません。近縁種(通常種)の種族値を参考値として表示しています。実際の値と異なる可能性があります。</div>`
      : "";
    statsHtml = `<div class="section">
      <h2>種族値</h2>
      ${caveat}
      <div class="stat-grid">
        ${statRow("HP", p.stats.hp, 200, id, "hp")}
        ${statRow("近接攻撃", p.stats.melee_attack, 200, id, "melee_attack")}
        ${statRow("遠隔攻撃", p.stats.shot_attack, 200, id, "shot_attack")}
        ${statRow("防御", p.stats.defense, 200, id, "defense")}
        ${statRow("作業速度", p.stats.craft_speed, 200, id, "craft_speed")}
      </div>
      <div class="badge-row" style="margin-top:10px;">
        <span class="badge">レア度 ${ico("star")}${p.stats.rarity ?? "?"}</span>
        <span class="badge">サイズ ${(p.stats.size||"").replace("EPalSizeType::","")}</span>
        <span class="badge">走行速度 ${p.stats.run_speed ?? "?"}${statRankText(id,"run_speed") ? `(${statRankText(id,"run_speed")})` : ''}</span>
        <span class="badge">ライド疾走速度 ${p.stats.ride_sprint_speed ?? "?"}${statRankText(id,"ride_sprint_speed") ? `(${statRankText(id,"ride_sprint_speed")})` : ''}</span>
        ${p.meal_amount != null ? `<span class="badge">食事量 ${p.meal_amount}/11</span>` : ''}
        ${p.stats.max_full_stomach != null ? `<span class="badge">満腹度上限 ${p.stats.max_full_stomach}</span>` : ''}
        ${(() => {
          const captureAsset = palAssetFromIcon(p.icon);
          const cr = (typeof CAPTURE_RATE_DATA !== "undefined" && captureAsset) ? CAPTURE_RATE_DATA[captureAsset] : null;
          return cr ? `<span class="badge">捕獲しやすさ ×${cr.capture_rate}(ボス×${cr.boss_capture_rate})</span>` : "";
        })()}
      </div>
      ${(() => {
        const l80Asset = palAssetFromIcon(p.icon);
        const l80 = (typeof LEVEL80_STATS_DATA !== "undefined" && l80Asset) ? LEVEL80_STATS_DATA[l80Asset] : null;
        if(!l80) return "";
        return `<p style="font-size:11px;color:var(--parchment-dim);margin-top:10px;">Lv80時想定ステータス幅(女神像・パッシブ等の補正なし、素質値0〜100%の幅): HP ${l80.hp.min}〜${l80.hp.max} / 攻撃 ${l80.attack.min}〜${l80.attack.max} / 防御 ${l80.defense.min}〜${l80.defense.max}</p>`;
      })()}
    </div>`;
  }

  const movementAsset = palAssetFromIcon(p.icon);
  const movement = (typeof MOVEMENT_DATA !== "undefined" && movementAsset) ? MOVEMENT_DATA[movementAsset] : null;
  const movementHtml = movement ? `<div class="section">
    <h2>移動速度</h2>
    <div class="badge-row">
      ${movement.walk_speed != null ? `<span class="badge">歩行 ${movement.walk_speed}</span>` : ""}
      ${movement.slow_walk_speed != null ? `<span class="badge">ゆっくり歩行 ${movement.slow_walk_speed}</span>` : ""}
      ${movement.transport_speed != null ? `<span class="badge">輸送速度 ${movement.transport_speed}</span>` : ""}
      ${movement.swim_speed != null ? `<span class="badge">遊泳速度 ${movement.swim_speed}</span>` : ""}
      ${movement.swim_dash_speed != null ? `<span class="badge">遊泳ダッシュ ${movement.swim_dash_speed}</span>` : ""}
      ${movement.stamina != null ? `<span class="badge">スタミナ ${movement.stamina}</span>` : ""}
    </div>
  </div>` : "";

  const extra = (typeof PALDB_EXTRA_DATA !== "undefined") ? PALDB_EXTRA_DATA[id] : null;
  const innatePassivesHtml = (extra && extra.innate_passives && extra.innate_passives.length) ? `<div class="section">
    <h2>最初から持っているパッシブ</h2>
    <div class="role-grid">
      ${extra.innate_passives.map(n => `<span class="role-pill">${n}</span>`).join("")}
    </div>
  </div>` : "";

  const palAsset = palAssetFromIcon(p.icon);
  const learnset = (typeof LEARNSET_DATA !== "undefined" && palAsset) ? LEARNSET_DATA[palAsset] : null;
  const skillsHtml = (learnset && learnset.length) ? `<div class="section">
    <h2>習得スキル</h2>
    <div class="drop-list">
      ${learnset.slice().sort((a,b)=>a.level-b.level).map(s => `<div class="drop-item" title="${s.effect_jp || ''}">
        <span class="drop-tier" style="min-width:34px;text-align:center;">Lv${s.level}</span>
        ${s.element ? typeBadge(s.element) : ""}
        <span class="drop-name">${s.jp_name || s.asset}</span>
        ${s.power != null ? `<span class="drop-qty">威力${s.power}</span>` : ""}
        ${s.cooltime != null ? `<span class="drop-rate">CT${s.cooltime}</span>` : ""}
      </div>`).join("")}
    </div>
  </div>` : "";

  const dropsHtml = (extra && extra.drops && extra.drops.length) ? `<div class="section">
    <h2>ドロップアイテム</h2>
    <div class="drop-list">
      ${extra.drops.map(d => `<div class="drop-item">
        ${(typeof ITEM_ICONS !== "undefined" ? ITEM_ICONS : {})[d.item] ? `<img class="drop-icon" src="${(typeof ITEM_ICONS !== "undefined" ? ITEM_ICONS : {})[d.item]}" alt="">` : ""}
        ${d.tier && d.tier !== "normal" ? `<span class="drop-tier ${d.tier}">${d.tier}</span>` : ""}
        <span class="drop-name">${d.item}</span>
        <span class="drop-qty">×${d.qty}</span>
        <span class="drop-rate">${d.rate}</span>
      </div>`).join("")}
    </div>
  </div>` : "";

  const obtain = extra && extra.obtain;
  const hasSpawn = SPAWN_BY_DEXID[p.id];
  const spawnMapHtml = hasSpawn ? `
    <div class="spawn-map-embed">
      <iframe src="palworld_map.html?id=${p.id}&embed=1" loading="lazy" title="${p.name}の出現マップ"></iframe>
      <a class="spawn-map-link" href="palworld_map.html?id=${p.id}" target="_blank" rel="noopener">出現マップを別タブで開く →</a>
    </div>` : "";
  const obtainHtml = (obtain && ((obtain.locations && obtain.locations.length) || obtain.egg_type || obtain.notes)) || spawnMapHtml ? `<div class="section">
    <h2>入手方法</h2>
    ${obtain ? `<div class="obtain-box">
      ${obtain.locations && obtain.locations.length ? `<div><span class="obtain-label">生息地</span>${obtain.locations.join(" / ")}</div>` : ""}
      ${obtain.egg_type ? `<div><span class="obtain-label">タマゴ</span>${obtain.egg_type}</div>` : ""}
      ${obtain.boss_only ? `<div><span class="obtain-label">出現</span>ボス個体のみ</div>` : ""}
      ${obtain.notes ? `<div class="obtain-notes">${obtain.notes}</div>` : ""}
    </div>` : ""}
    ${spawnMapHtml}
  </div>` : "";

  const matchup = elementMatchup(p.types);
  const matchupHtml = `<div class="section">
    <h2>属性相性(被ダメージ倍率)</h2>
    <div class="elem-matchup">
      ${matchup.weak.map(w => `<span class="elem-tag weak">${w.type} ×${w.mult.toFixed(2).replace(/\.?0+$/,'')}</span>`).join("")}
      ${matchup.resist.map(r => `<span class="elem-tag resist">${r.type} ×${r.mult.toFixed(2).replace(/\.?0+$/,'')}</span>`).join("")}
      ${(!matchup.weak.length && !matchup.resist.length) ? '<span style="color:var(--parchment-dim);font-size:12px;">弱点・耐性なし(全属性等倍)</span>' : ''}
    </div>
    <p style="font-size:10px;color:var(--parchment-dim);margin-top:8px;">赤=弱点(1.5倍以上のダメージを受ける) / 青=耐性(0.66倍以下)。属性相性のみの倍率(属性一致ボーナス等は含みません)。出典: palworld-lab.com属性相性表(検証済み)</p>
  </div>`;

  document.getElementById("detailContent").innerHTML = `
    <div class="detail-head">
      <div class="medallion">
        <div class="ring">${p.icon ? `<img src="${p.icon}" alt="${p.name}">` : ""}</div>
        <span class="rivet nw"></span><span class="rivet ne"></span><span class="rivet sw"></span><span class="rivet se"></span>
      </div>
      <div class="detail-info">
        <div class="dname">${p.name}</div>
        <div class="dname-en">${p.en_name || ""} ・ #${p.id}</div>
        <div class="badge-row">${p.types.map(typeBadge).join("")}${timeBadge}${darkBadge}</div>
        ${rideBadges ? `<div class="badge-row">${rideBadges}</div>` : ""}
      </div>
    </div>
    ${statsHtml}
    ${movementHtml}
    ${matchupHtml}
    <div class="section">
      <h2>作業適性</h2>
      <div class="role-grid">
        ${workEntries.length ? workEntries.map(([r,lv])=>`<span class="role-pill">${ico(ROLE_ICON[r])} ${r} <b>Lv${lv}</b></span>`).join("") : '<span style="color:var(--parchment-dim);font-size:12.5px;">作業適性なし</span>'}
      </div>
    </div>
    <div class="section">
      <h2>パートナースキル</h2>
      <div class="pskill-box">
        <div class="pskill-name">◆ ${p.partner_skill.name}</div>
        <div class="pskill-effect">${p.partner_skill.effect}</div>
      </div>
    </div>
    ${innatePassivesHtml}
    ${skillsHtml}
    ${dropsHtml}
    ${obtainHtml}
    <div style="text-align:center;margin-top:6px;">
      <a href="palworld_breeding.html?target=${p.id}" class="back-btn" style="display:inline-flex;text-decoration:none;margin-bottom:0;">${ico("dna")} 配合を調べる →</a>
    </div>
  `;
  document.getElementById("listView").style.display = "none";
  document.getElementById("detailView").style.display = "block";
  window.scrollTo(0,0);
}

function closeDetail(){
  document.getElementById("detailView").style.display = "none";
  document.getElementById("listView").style.display = "block";
}

document.getElementById("searchBox").addEventListener("input", e => { state.query = e.target.value; renderGrid(); });
document.getElementById("sortSel").addEventListener("change", e => { state.sort = e.target.value; renderGrid(); });
document.getElementById("backBtn").addEventListener("click", closeDetail);

renderChips();
renderGrid();

const initialParams = new URLSearchParams(location.search);
const initialId = initialParams.get("id");
if(initialId && PAL_DEX_DATA.some(p => p.id === initialId)){
  openDetail(initialId);
}
