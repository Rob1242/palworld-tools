// 2026-07-21に「塔ボス・レイドボス12体は捕獲/配合による入手手段が無い」という
// 前提でBOSS_ONLY_DEX_IDSによる除外を追加していたが、2026-07-27にユーザーから
// 「ボルゼクス(ThunderDragonMan)を実際に配合の親として使った」という実プレイ報告を
// 受けて調査した結果、この前提自体が誤りだったと判明。配合データを一次データ抽出の
// tylercamp/palcalcに刷新し直接確認したところ、該当12体は全員、親としても子としても
// 実際の配合結果に登場することが確認できた(=通常の配合対象として扱ってよい)。
// よって前提が誤っていたBOSS_ONLY_DEX_IDSによる除外は撤廃し、本当に入手不可能な
// ゴースト個体(dex_idがnull、パル図鑑に正式登録すらされていないゼロヴァース等)の
// 除外のみ残す。
// ページ読み込み時にはパルの基本情報(55KB)だけを持ち、重い配合表は
// そのモードが実際に使われるまで読み込まない(2026-08)。
//   順引き(2体→子)  … breeding_forward_pairs_data.js  1.8MB
//   逆引き(子→親候補)… breeding_reverse_parents_data.js 1.4MB
// 以前は起動時に両方入りの breeding_data.js(3.3MB)を読んでいたため、
// どちらか一方しか使わない人にも全部ダウンロードさせていた。
// BREEDING_DATA という名前で参照している箇所が多いので、器だけ先に用意して
// 読み込み完了時に中身を差し込む形にする。
const BREEDING_DATA = { pals: BREEDING_PALS_DATA, forwardPairs: null, reverseParents: null };

function isGhost(asset){
  const info = BREEDING_DATA.pals[asset];
  return !info || !info.dex_id;
}

const PAL_LIST = Object.entries(BREEDING_DATA.pals || {})
  .filter(([asset]) => !isGhost(asset))
  .map(([asset, info]) => ({
    asset,
    displayName: info.jp_name || `${info.en_name}(JP名未確認)`,
    icon: info.icon,
  })).sort((a, b) => a.displayName.localeCompare(b.displayName, 'ja'));

// 追加のデータファイルを1回だけ読み込む。既に読み込み済みなら即座に返す。
const loadedDataPromises = {};
function loadDataScript(src){
  if(loadedDataPromises[src]) return loadedDataPromises[src];
  loadedDataPromises[src] = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("読み込みに失敗しました: " + src));
    document.head.appendChild(s);
  });
  return loadedDataPromises[src];
}

// ゴースト個体(dex_idが無く、パル図鑑に正式登録すらされていない個体)が絡むレシピは、
// そもそも配合で作れない/親として所持しようがないので除外する。
function ensureForwardPairs(){
  return loadDataScript("game_data/breeding_forward_pairs_data.js").then(() => {
    if(BREEDING_DATA.forwardPairs) return;
    const fp = BREEDING_FORWARD_PAIRS_DATA;
    Object.keys(fp).forEach(key => {
      const [a, b] = key.split("|");
      if(isGhost(fp[key]) || isGhost(a) || isGhost(b)) delete fp[key];
    });
    BREEDING_DATA.forwardPairs = fp;
  });
}

function ensureReverseParents(){
  return loadDataScript("game_data/breeding_reverse_parents_data.js").then(() => {
    if(BREEDING_DATA.reverseParents) return;
    const rp = BREEDING_REVERSE_PARENTS_DATA;
    Object.entries(rp).forEach(([target, entry]) => {
      if(isGhost(target)){ delete rp[target]; return; }
      ["unique", "formula"].forEach(key => {
        if(Array.isArray(entry[key])){
          entry[key] = entry[key].filter(([a, b]) => !isGhost(a) && !isGhost(b));
        }
      });
    });
    BREEDING_DATA.reverseParents = rp;
  });
}

function escapeHtml(str){
  return String(str == null ? "" : str).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

// 戻り値がinnerHTMLに埋められるため、対応表に無いアセット名はそのまま返さずエスケープする
// (現状ここに届く値は実在キーに限られるが、将来穴にならないようにしておく。2026-08)
function nameOf(asset){
  if(!Object.prototype.hasOwnProperty.call(BREEDING_DATA.pals || {}, asset)) return escapeHtml(String(asset));
  const info = BREEDING_DATA.pals[asset];
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
    const qKana = toKana(q);
    // 前方一致(名前が検索語で始まる)を最優先で上に出す。結果を30件に絞る際、
    // 単純な五十音順だと「ら行」の名前は絞り込み前に切り捨てられてしまうため
    // (例: 「る」で検索してもルミカイト等が63件中31位以降になり表示されない)。
    const matches = PAL_LIST
      .filter(p => toKana(p.displayName.toLowerCase()).includes(qKana) || p.asset.toLowerCase().includes(q))
      .sort((a, b) => {
        const aStarts = toKana(a.displayName.toLowerCase()).startsWith(qKana) ? 0 : 1;
        const bStarts = toKana(b.displayName.toLowerCase()).startsWith(qKana) ? 0 : 1;
        if(aStarts !== bStarts) return aStarts - bStarts;
        return a.displayName.localeCompare(b.displayName, 'ja');
      })
      .slice(0, 30);
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

const forwardState = { a: null, b: null };

async function renderForwardResult(){
  const box = document.getElementById("forwardResult");
  if(!forwardState.a || !forwardState.b){
    box.className = "result-box empty";
    box.textContent = "親を2体選んでください";
    return;
  }
  if(!BREEDING_DATA.forwardPairs){
    box.className = "result-box empty";
    box.textContent = "配合データを読み込んでいます…";
    try{ await ensureForwardPairs(); }
    catch(e){ box.textContent = "配合データの読み込みに失敗しました。通信環境を確認して再読み込みしてください。"; return; }
  }
  const key = [forwardState.a, forwardState.b].sort().join("|");
  const child = BREEDING_DATA.forwardPairs[key];
  box.className = "result-box";
  if(!child){
    box.innerHTML = `<p>「${nameOf(forwardState.a)}」×「${nameOf(forwardState.b)}」の組み合わせデータが見つかりません。(データ未収録の可能性があります)</p>`;
    return;
  }
  const childDexId = dexIdOf(child);
  const childInner = `${iconOf(child) ? `<img src="${iconOf(child)}" alt="">` : ""}<strong style="font-family:var(--font-display);font-size:20px;">${nameOf(child)}</strong>`;
  box.innerHTML = `
    <div class="picked-pal" style="display:inline-flex;">
      ${childDexId ? `<a href="palworld_dex.html?id=${childDexId}" class="pair-pal-link">${childInner}</a>` : childInner}
    </div>
    <p style="margin-top:10px;color:var(--parchment-dim);font-size:13px;">が生まれます</p>
    ${mutationBlock(forwardState.a, forwardState.b)}
  `;
}

/* この組で突然変異が起きたら何になるかを、通常の結果の下に添える。
   計算は shared/mutation-calc.js。ここでは表示だけ。
   稀にしか起きない話なので、主役の「が生まれます」を邪魔しないよう
   区切り線の下に小さく置く。 */
function mutationBlock(a, b){
  if(typeof MutationCalc === "undefined") return "";
  const pa = BREEDING_DATA.pals[a], pb = BREEDING_DATA.pals[b];
  if(!pa || !pb || typeof pa.combi_rank !== "number" || typeof pb.combi_rank !== "number") return "";

  if(!mutationBlock._index) mutationBlock._index = MutationCalc.buildRankIndex(BREEDING_DATA.pals);
  const { range, list } = MutationCalc.candidates(pa.combi_rank, pb.combi_rank, mutationBlock._index);
  if(!list.length) return "";

  const top = list.slice(0, 6).map(c => {
    const dex = dexIdOf(c.id);
    const inner = `${iconOf(c.id) ? `<img src="${iconOf(c.id)}" alt="">` : ""}<span>${nameOf(c.id)}</span><i>${(c.probability*100).toFixed(1)}%</i>`;
    return `<span class="mut-chip">${dex ? `<a href="palworld_dex.html?id=${dex}">${inner}</a>` : inner}</span>`;
  }).join("");
  const more = list.length > 6 ? `<span class="mut-more">ほか${list.length - 6}体</span>` : "";

  return `
    <div class="mut-inline">
      <div class="mut-head">
        まれに<b>突然変異</b>が起きた場合の行き先
        <a href="palworld_mutation.html" class="mut-link">くわしく →</a>
      </div>
      <div class="mut-chips">${top}${more}</div>
      <div class="mut-note">
        目標値 ${range.lo.toFixed(0)}〜${range.hi.toFixed(0)}(強い方のランク ${Math.min(pa.combi_rank, pb.combi_rank)} / 差 ${Math.abs(pa.combi_rank - pb.combi_rank)})。
        確率は候補内での割合で、変異そのものが起きる確率(約1〜3%)は別です。
      </div>
    </div>`;
}

setupPicker(document.querySelector('#pickerA input'), document.querySelector('#pickerA .pal-picker-results'), asset => { forwardState.a = asset; renderForwardResult(); });
setupPicker(document.querySelector('#pickerB input'), document.querySelector('#pickerB .pal-picker-results'), asset => { forwardState.b = asset; renderForwardResult(); });

function dexIdOf(asset){
  const info = BREEDING_DATA.pals[asset];
  return info && info.dex_id;
}

function palLink(asset){
  const inner = `${iconOf(asset) ? `<img src="${iconOf(asset)}" alt="">` : ""}${nameOf(asset)}`;
  const dexId = dexIdOf(asset);
  return dexId
    ? `<a href="palworld_dex.html?id=${dexId}" class="pair-pal-link">${inner}</a>`
    : `<span class="pair-pal-link" style="cursor:default;">${inner}</span>`;
}

function renderPairList(pairs, isUnique){
  return pairs.map(([a, b]) => `
    <div class="route-pair-item">
      ${isUnique ? '<span class="unique-tag">固定レシピ</span>' : ''}
      ${palLink(a)}
      <span style="color:var(--brass);">×</span>
      ${palLink(b)}
    </div>
  `).join("");
}

async function renderReverseResult(targetAsset){
  const box = document.getElementById("reverseResult");
  if(!BREEDING_DATA.reverseParents){
    box.className = "result-box empty";
    box.textContent = "配合データを読み込んでいます…";
    try{ await ensureReverseParents(); }
    catch(e){ box.textContent = "配合データの読み込みに失敗しました。通信環境を確認して再読み込みしてください。"; return; }
  }
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
  html += mutationParentsBlock(targetAsset);
  box.innerHTML = html;
  const btn = document.getElementById("showMoreBtn");
  if(btn){
    btn.addEventListener("click", () => {
      document.getElementById("formulaPairList").innerHTML = renderPairList(entry.formula, false);
      btn.remove();
    });
  }
}

/* 逆引きに「突然変異で狙う場合の親」を足す。
   「このパルが欲しい」という問いは1つなのに、通常配合と変異で答えが
   別ページに割れていたため、同じ画面に寄せた(2026-08-10)。
   通常ルートが見つからないパルでも、変異なら届くことがある。 */
function mutationParentsBlock(targetAsset){
  if(typeof MutationCalc === "undefined") return "";
  const t = BREEDING_DATA.pals[targetAsset];
  if(!t || typeof t.combi_rank !== "number") return "";
  if(!MutationCalc.canMutateInto(t)){
    return `<p class="mut-none">${nameOf(targetAsset)}は<b>突然変異では出せません</b>(伝説・塔ボス・レイド等は変異先になりません)。</p>`;
  }
  if(!mutationParentsBlock._index) mutationParentsBlock._index = MutationCalc.buildRankIndex(BREEDING_DATA.pals);
  const res = MutationCalc.parentsFor(targetAsset, BREEDING_DATA.pals, mutationParentsBlock._index, { limit: 12 });
  if(!res.length) return "";

  const rows = res.map(r => `
    <div class="pair-item mut-pair">
      ${iconOf(r.a) ? `<img src="${iconOf(r.a)}" alt="">` : ""}${nameOf(r.a)}
      <span style="color:var(--brass);">×</span>
      ${iconOf(r.b) ? `<img src="${iconOf(r.b)}" alt="">` : ""}${nameOf(r.b)}
      <span class="mut-pct">${(r.probability*100).toFixed(1)}%</span>
    </div>`).join("");

  return `
    <div class="mut-inline">
      <div class="mut-head">
        <b>突然変異</b>で狙う場合の親
        <a href="palworld_mutation.html" class="mut-link">仕組み →</a>
      </div>
      <div class="route-pair-list">${rows}</div>
      <div class="mut-note">
        %は<b>変異が起きたときに${nameOf(targetAsset)}になる割合</b>です。変異そのものが起きる確率(約1〜3%)は別にかかるので、掛け算になります。
        親のランクが近いほどレアな変異先を狙えます。
      </div>
    </div>`;
}

setupPicker(
  document.querySelector('#reverseMode .pal-picker input'),
  document.querySelector('#reverseMode .pal-picker-results'),
  asset => renderReverseResult(asset)
);

document.querySelectorAll(".mode-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".mode-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    const mode = tab.dataset.mode;
    document.getElementById("forwardMode").style.display = mode === "forward" ? "block" : "none";
    document.getElementById("reverseMode").style.display = mode === "reverse" ? "block" : "none";
    document.getElementById("roadmapMode").style.display = mode === "roadmap" ? "block" : "none";
  });
});

// 「配合ルートを探す(多世代)」用: 野生/ボスとして出現するパルは全て手元にある前提の
// 最少世代数ルート探索(所持ボックス機能は無く、palworld_palbox.htmlの配合ロードマップ機能
// から「所持パル管理」抜きの汎用版として移植したもの。アルゴリズム自体はそちらで
// 自己診断テスト済み)。
// 出現有無の真偽値だけを持つ軽量データ(spawn_flags_data.js)を使う(2026-07-28、
// 以前は本土・世界樹それぞれの1.2MB/168KBの詳細出現座標データを丸ごと読み込んでいた)
const CATCHABLE_ASSETS = new Set(Object.keys(SPAWN_FLAGS_BY_ASSET_DATA));

// 順引き表(1.8MB)を読み込んでから作る逆引き索引。起動時には作らず、
// 配合ルート探索が実際に使われた時点で1回だけ組み立てる。
let REVERSE_FORWARD_PAIRS_RM = null;
function buildReverseForwardPairs(){
  const rev = {};
  Object.entries(BREEDING_DATA.forwardPairs).forEach(([key, child]) => {
    const sep = key.indexOf("|");
    const a = key.slice(0, sep), b = key.slice(sep + 1);
    (rev[child] = rev[child] || []).push([a, b]);
  });
  REVERSE_FORWARD_PAIRS_RM = rev;
}

function computeShortestGen(asset, cache, visiting){
  if(cache.has(asset)) return cache.get(asset);
  if(visiting.has(asset)) return null;
  if(CATCHABLE_ASSETS.has(asset)){
    const result = { gen: 0, pair: null };
    cache.set(asset, result);
    return result;
  }
  visiting.add(asset);
  const candidates = REVERSE_FORWARD_PAIRS_RM[asset] || [];
  let best = null;
  for(const [a, b] of candidates){
    const ra = computeShortestGen(a, cache, visiting);
    if(!ra) continue;
    const rb = computeShortestGen(b, cache, visiting);
    if(!rb) continue;
    const gen = Math.max(ra.gen, rb.gen) + 1;
    if(!best || gen < best.gen) best = { gen, pair: [a, b] };
  }
  visiting.delete(asset);
  cache.set(asset, best);
  return best;
}

function reconstructRoadmapSteps(targetAsset, producedBy){
  const needed = new Set();
  const stack = [targetAsset];
  while(stack.length){
    const cur = stack.pop();
    if(needed.has(cur)) continue;
    if(cur !== targetAsset && CATCHABLE_ASSETS.has(cur)) continue;
    needed.add(cur);
    const rec = producedBy[cur];
    if(rec){ stack.push(rec.a); stack.push(rec.b); }
  }
  return Array.from(needed)
    .filter(a => producedBy[a])
    .map(a => ({ child: a, ...producedBy[a] }))
    .sort((x, y) => x.generation - y.generation);
}

function findRoadmapRoute(targetAsset){
  if(CATCHABLE_ASSETS.has(targetAsset)) return { found: true, wildOnly: true, steps: [] };
  const cache = new Map();
  const rec = computeShortestGen(targetAsset, cache, new Set());
  if(!rec) return { found: false };
  const producedBy = {};
  cache.forEach((r, asset) => { if(r && r.pair) producedBy[asset] = { a: r.pair[0], b: r.pair[1], generation: r.gen }; });
  return { found: true, wildOnly: false, steps: reconstructRoadmapSteps(targetAsset, producedBy) };
}

async function renderRoadmapResult(targetAsset){
  const box = document.getElementById("roadmapResult");
  if(!REVERSE_FORWARD_PAIRS_RM){
    box.className = "result-box empty";
    box.textContent = "配合データを読み込んでいます…";
    try{ await ensureForwardPairs(); buildReverseForwardPairs(); }
    catch(e){ box.textContent = "配合データの読み込みに失敗しました。通信環境を確認して再読み込みしてください。"; return; }
  }
  box.className = "result-box";
  const result = findRoadmapRoute(targetAsset);
  if(!result.found){
    box.innerHTML = `<p>「${nameOf(targetAsset)}」への配合ルートが見つかりませんでした(最大20世代以内では到達できません)。</p>`;
    return;
  }
  if(result.wildOnly){
    box.innerHTML = `<p>「${nameOf(targetAsset)}」は野生・ボスとして直接捕獲できます(配合は不要です)。</p>`;
    return;
  }
  let html = `<h3 style="font-family:var(--font-display);margin-top:0;">${nameOf(targetAsset)} への配合ルート(${result.steps.length}ステップ)</h3><ol class="route-pair-list" style="list-style:none;padding:0;">`;
  result.steps.forEach(s => {
    const isFinal = s.child === targetAsset;
    html += `<li class="route-pair-item" style="${isFinal ? 'border:1px solid var(--brass);' : ''}">
      <span class="unique-tag" style="background:var(--teal-dim);">第${s.generation}世代</span>
      ${palLink(s.a)}
      <span style="color:var(--brass);">×</span>
      ${palLink(s.b)}
      <span style="color:var(--brass);">→</span>
      ${palLink(s.child)}
    </li>`;
  });
  html += `</ol>`;
  box.innerHTML = html;
}

setupPicker(
  document.querySelector('#roadmapMode .pal-picker input'),
  document.querySelector('#roadmapMode .pal-picker-results'),
  asset => renderRoadmapResult(asset)
);

(function initFromQuery(){
  const params = new URLSearchParams(location.search);
  const target = params.get("target");
  if(!target) return;
  const asset = Object.keys(BREEDING_DATA.pals || {}).find(a => BREEDING_DATA.pals[a].dex_id === target);
  if(!asset) return;
  document.querySelectorAll(".mode-tab").forEach(t => t.classList.remove("active"));
  document.querySelector('.mode-tab[data-mode="reverse"]').classList.add("active");
  document.getElementById("forwardMode").style.display = "none";
  document.getElementById("reverseMode").style.display = "block";
  const targetInput = document.querySelector('#reverseMode .pal-picker input');
  if(targetInput) targetInput.value = nameOf(asset);
  renderReverseResult(asset);
})();
