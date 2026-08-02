const state = { query: "", category: "すべて" };

function render(){
  const q = state.query.trim().toLowerCase();
  const filtered = TECHNOLOGY_DATA.filter(t => {
    if(state.category !== "すべて" && t.category !== state.category) return false;
    if(q && !t.name_jp.toLowerCase().includes(q)) return false;
    return true;
  });
  document.getElementById("countTag").textContent = `${filtered.length}件`;

  if(!filtered.length){
    document.getElementById("techList").innerHTML = `<div class="empty-msg">該当する技術がありません</div>`;
    return;
  }

  const byLevel = new Map();
  filtered.forEach(t => {
    if(!byLevel.has(t.level)) byLevel.set(t.level, []);
    byLevel.get(t.level).push(t);
  });
  const levels = Array.from(byLevel.keys()).sort((a,b) => a-b);

  document.getElementById("techList").innerHTML = levels.map(lv => `
    <div class="level-group">
      <div class="level-header">Lv${lv}</div>
      <div class="tech-grid">
        ${byLevel.get(lv).map(t => `
          <div class="tech-card">
            <img src="${t.icon}" data-onerror-src="game_data/icons/T_icon_unknown.webp" alt="">
            <div>
              <div class="tname">${t.name_jp}</div>
              <div class="tcat">${t.category}</div>
            </div>
            <div class="tcost">${t.cost}</div>
          </div>
        `).join("")}
      </div>
    </div>
  `).join("");
}

document.getElementById("searchBox").addEventListener("input", e => { state.query = e.target.value; render(); });
document.getElementById("catChips").addEventListener("click", e => {
  const chip = e.target.closest(".chip");
  if(!chip) return;
  document.querySelectorAll("#catChips .chip").forEach(c => c.classList.remove("active"));
  chip.classList.add("active");
  state.category = chip.dataset.cat;
  render();
});

render();
