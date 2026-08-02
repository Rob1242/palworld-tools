function renderWork(){
  document.getElementById("refList").innerHTML = `<p style="font-size:12px;color:var(--parchment-dim);margin-bottom:10px;">数値が小さいほど優先的に処理される作業です。</p>` + WORK_PRIORITY_DATA.map(w => `
    <div class="ref-item">
      <div class="ref-badge">${w.priority}</div>
      <div class="ref-name">${w.name_jp}</div>
      <div class="ref-sub">${w.detail_jp}</div>
    </div>
  `).join("");
}
function renderElement(){
  document.getElementById("refList").innerHTML = `<p style="font-size:12px;color:var(--parchment-dim);margin-bottom:10px;">パートナースキルでプレイヤーの攻撃属性を変換できるパル。Lv1〜5は攻撃力増加%。</p>` + ELEMENT_SWAP_DATA.map(e => `
    <div class="ref-item">
      <div class="ref-name">${e.name_jp}</div>
      <div class="ref-sub">${e.element}に変換</div>
      <div class="ref-vals">${e.lv_bonus.map((v,i) => `<span>Lv${i+1}: +${v}%</span>`).join("")}</div>
    </div>
  `).join("");
}
function renderParty(){
  document.getElementById("refList").innerHTML = `<p style="font-size:12px;color:var(--parchment-dim);margin-bottom:10px;">パートナースキルでパーティ全体に攻撃力バフを与えるパル(手持ちにいるだけで効果)。</p>` + PARTY_BUFFS_DATA.map(p => `
    <div class="ref-item">
      <div class="ref-name">${p.name_jp}</div>
      <div class="ref-sub">${p.element || "属性指定なし"}</div>
      <div class="ref-vals">${p.lv_bonus.map((v,i) => `<span>Lv${i+1}: +${v}%</span>`).join("")}</div>
    </div>
  `).join("");
}
function renderSan(){
  const levelsHtml = SAN_SYSTEM_DATA.levels.map(l => `
    <div class="ref-item">
      <div class="ref-badge">${l.san_threshold}</div>
      <div class="ref-name">${l.behavior}</div>
    </div>
  `).join("");
  const ailmentsHtml = SAN_SYSTEM_DATA.ailments.map(a => `
    <div class="ref-item">
      <div class="ref-name">${a.ailment}</div>
      <div class="ref-sub">${a.effects.join(" / ")}</div>
      <div class="ref-sub" style="margin-left:auto;">${a.medicine}で治療</div>
    </div>
  `).join("");
  document.getElementById("refList").innerHTML = `
    <p style="font-size:12px;color:var(--parchment-dim);margin-bottom:10px;">SAN値(正気度)がしきい値を下回ると、パルが以下の行動を取ります(数値以下で発動)。</p>
    ${levelsHtml}
    <p style="font-size:12px;color:var(--parchment-dim);margin:18px 0 10px;">状態異常と治療に必要な医薬品:</p>
    ${ailmentsHtml}
  `;
}
const RENDERERS = { work: renderWork, element: renderElement, party: renderParty, san: renderSan };
document.querySelectorAll(".mode-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".mode-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    RENDERERS[tab.dataset.cat]();
  });
});
renderWork();
