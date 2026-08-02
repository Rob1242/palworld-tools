const state = { query: "", rank: "すべて" };
const RANK_CHIPS = ["すべて", "5", "4", "3", "2", "1", "マイナス"];

function renderChips(){
  document.getElementById("rankChips").innerHTML = RANK_CHIPS.map(r =>
    `<div class="chip ${state.rank === r ? "active" : ""}" data-r="${r}">${r === "すべて" ? "すべて" : r === "マイナス" ? "マイナス効果" : `ランク${r}`}</div>`
  ).join("");
  document.querySelectorAll(".chip").forEach(el => {
    el.addEventListener("click", () => { state.rank = el.dataset.r; renderGrid(); renderChips(); });
  });
}

function filtered(){
  const q = state.query.toLowerCase();
  return PASSIVES_PAGE_DATA.filter(p => {
    if(state.rank !== "すべて"){
      if(state.rank === "マイナス"){ if(p.rank >= 0) return false; }
      else if(p.rank !== parseInt(state.rank, 10)) return false;
    }
    if(!q) return true;
    return p.name_jp.toLowerCase().includes(q) || p.effect_jp.toLowerCase().includes(q);
  });
}

function renderGrid(){
  const list = filtered();
  document.getElementById("countTag").textContent = `${list.length} / ${PASSIVES_PAGE_DATA.length}件`;
  const grid = document.getElementById("grid");
  if(!list.length){
    grid.innerHTML = `<div class="empty-msg">該当するパッシブが見つかりません。</div>`;
    return;
  }
  grid.innerHTML = list.map(p => `
    <div class="card" data-asset="${p.asset}">
      <div class="card-head">
        <div class="icon-wrap"><img src="${p.icon}" data-onerror="hide" alt=""></div>
        <div class="pname">${p.name_jp}</div>
        <span class="rank-badge ${p.rank >= 0 ? "rank-pos" : "rank-neg"}">${p.rank >= 0 ? "★" + p.rank : "▼" + Math.abs(p.rank)}</span>
      </div>
      <div class="peffect">${p.effect_jp}</div>
    </div>
  `).join("");
  document.querySelectorAll(".card").forEach(el => {
    el.addEventListener("click", () => openModal(el.dataset.asset));
  });
}

function openModal(asset){
  const p = PASSIVES_PAGE_DATA.find(x => x.asset === asset);
  if(!p) return;
  document.getElementById("detailContent").innerHTML = `
    <div class="detail-box">
      <div class="modal-head">
        <div class="icon-wrap"><img src="${p.icon}" data-onerror="hide" alt=""></div>
        <div>
          <h3>${p.name_jp}</h3>
          <span class="rank-badge ${p.rank >= 0 ? "rank-pos" : "rank-neg"}">${p.rank >= 0 ? "ランク " + p.rank : "マイナス効果 " + Math.abs(p.rank)}</span>
        </div>
      </div>
      <div class="modal-desc">${p.effect_jp}</div>
      <div class="modal-section">
        <h4>入手方法</h4>
        <div class="obtain-box">${p.obtain_jp || "野生のパルが元々持っている場合や、配合・厳選によって特定の個体に付与される形で入手します(このパッシブ専用の確定入手ルートは確認できていません)。"}</div>
      </div>
    </div>
  `;
  document.getElementById("listView").style.display = "none";
  document.getElementById("detailView").style.display = "block";
  window.scrollTo(0, 0);
  history.replaceState(null, "", `?asset=${encodeURIComponent(asset)}`);
}

function closeModal(){
  document.getElementById("detailView").style.display = "none";
  document.getElementById("listView").style.display = "block";
  history.replaceState(null, "", location.pathname);
}
document.getElementById("backBtn").addEventListener("click", closeModal);
document.getElementById("searchBox").addEventListener("input", e => { state.query = e.target.value; renderGrid(); });

renderChips();
renderGrid();

const initialAsset = new URLSearchParams(location.search).get("asset");
if(initialAsset && PASSIVES_PAGE_DATA.some(p => p.asset === initialAsset)) openModal(initialAsset);
