const ELEMENTS = [...new Map(SKILLS_PAGE_DATA.map(s => [s.element, { element: s.element, jp: s.element_jp, color: s.element_color, icon: s.element_icon }])).values()];

const state = { query: "", element: "すべて" };
function renderChips(){
  const chips = ["すべて", ...ELEMENTS.map(e => e.element)];
  document.getElementById("elementChips").innerHTML = chips.map(el => {
    const info = ELEMENTS.find(e => e.element === el);
    return `<div class="chip ${state.element === el ? "active" : ""}" data-el="${el}">
      ${info ? `<img src="${info.icon}" alt="">` : ""}${info ? info.jp : el}
    </div>`;
  }).join("");
  document.querySelectorAll(".chip").forEach(el => {
    el.addEventListener("click", () => { state.element = el.dataset.el; renderGrid(); renderChipsActive(); });
  });
}
function renderChipsActive(){
  document.querySelectorAll(".chip").forEach(el => el.classList.toggle("active", el.dataset.el === state.element));
}

function filtered(){
  const q = toKana(state.query.toLowerCase());
  return SKILLS_PAGE_DATA.filter(s => {
    if(state.element !== "すべて" && s.element !== state.element) return false;
    if(!q) return true;
    return toKana((s.name_jp||"").toLowerCase()).includes(q) || toKana((s.name_en||"").toLowerCase()).includes(q);
  });
}

function renderGrid(){
  const list = filtered();
  document.getElementById("countTag").textContent = `${list.length} / ${SKILLS_PAGE_DATA.length}件`;
  const grid = document.getElementById("grid");
  if(!list.length){
    grid.innerHTML = `<div class="empty-msg">該当する技が見つかりません。</div>`;
    return;
  }
  grid.innerHTML = list.map(s => `
    <div class="card" data-asset="${s.asset}">
      <div class="icon-wrap" style="background:${s.element_color}33;border-color:${s.element_color};"><img src="${s.element_icon}" alt=""></div>
      <div class="sname">${s.name_jp}</div>
      <div class="element-badge" style="background:${s.element_color}33;color:${s.element_color};">${s.element_jp}</div>
      <div class="stat-row"><span>威力<b>${s.power}</b></span><span>CT<b>${s.cooldown}s</b></span></div>
    </div>
  `).join("");
  document.querySelectorAll(".card").forEach(el => {
    el.addEventListener("click", () => openModal(el.dataset.asset));
  });
}

function openModal(asset){
  const s = SKILLS_PAGE_DATA.find(x => x.asset === asset);
  if(!s) return;
  const learnersHtml = s.learners.length
    ? s.learners.map(l => `<a class="drop-item" href="palworld_dex.html?id=${encodeURIComponent(l.dex_id)}">
        <img class="drop-icon" src="${l.icon}" data-onerror="hide" alt="">
        <span class="drop-name">${l.name_jp}</span>
        <span class="drop-qty">${l.source === "levelup" && l.level ? `Lv.${l.level}` : "卵"}</span>
      </a>`).join("")
    : `<div style="font-size:12px;color:var(--parchment-dim);padding:8px;">習得できるパルの情報が見つかりませんでした(ボス専用技の可能性があります)。</div>`;

  document.getElementById("detailContent").innerHTML = `
    <div class="detail-box">
      <div class="modal-head">
        <div class="icon-wrap" style="background:${s.element_color}33;border-color:${s.element_color};"><img src="${s.element_icon}" alt=""></div>
        <div>
          <h3>${s.name_jp}</h3>
          <div class="en-name">${s.name_en}</div>
        </div>
      </div>
      <div class="modal-stats">
        <div class="k">属性</div><div class="v" style="color:${s.element_color}">${s.element_jp}</div>
        <div class="k">威力</div><div class="v">${s.power}</div>
        <div class="k">クールタイム</div><div class="v">${s.cooldown}秒</div>
        <div class="k">射程</div><div class="v">${s.min_range}〜${s.max_range}</div>
      </div>
      <div class="modal-desc">${s.effect_jp || s.description_en || "(効果説明なし)"}</div>
      <div class="modal-section">
        <h4>習得できるパル(${s.learners.length}体)</h4>
        <div class="drop-list">${learnersHtml}</div>
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
if(initialAsset && SKILLS_PAGE_DATA.some(s => s.asset === initialAsset)) openModal(initialAsset);
