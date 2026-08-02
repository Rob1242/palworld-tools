




// 家畜牧場にパルを配置した際の産出アイテムは、専用の構造化データが無いため
// パートナースキルの説明文(自然文)から正規表現で抽出する。抽出できないパルは
// 「(産出アイテム不明)」と明示し、無理に推測しない(2026-07-20)。
const RANCH_DROP_RE = /家畜牧場にアサインすると、(.+?)(?:ことがある|。|$)/;
const WORK_TYPES = ["運搬","採集","手作業","伐採","採掘","水やり","種まき","火おこし","製薬","冷却","発電","牧場"];
const ELEMENT_TYPES = ["無","炎","水","雷","地","草","氷","竜","闇"];

function buildEntries(){
  return PAL_DEX_DATA.map(dp => {
    const combatPal = COMBAT_PAL_DATA.find(c => c.dex_id === dp.id);
    const combatBest = (combatPal && !RANKING_EXCLUDE_DEX_IDS.has(dp.id)) ? computeCombatBest(combatPal) : null;
    // 陸上/飛行できるパル(=run_speed・ride_sprint_speedが実際の移動速度)だけを対象にする。
    // 水上専用パルは別データ(泳ぎ速度)が必要なため、このシンプルな指標には含めない
    // (詳細はライド速度ランキングページの陸上/飛行/水上タブを参照)。
    const landOrFly = dp.ride && (dp.ride.rideable || dp.ride.fly);
    const ranchLevel = (dp.work || {})["牧場"] || null;
    const ranchMatch = ranchLevel ? RANCH_DROP_RE.exec(dp.partner_skill.effect) : null;
    return {
      id: dp.id, name: dp.name, en_name: dp.en_name, icon: dp.icon, types: dp.types,
      combatScore: combatBest ? combatBest.sustained : null,
      combatDetail: combatBest ? `${combatBest.jp_name}(威力${combatBest.power}・CT${combatBest.cooldown}秒)` : null,
      mountScore: landOrFly ? dp.stats.ride_sprint_speed : null,
      mountDetail: landOrFly ? `走行${dp.stats.run_speed}・疾走${dp.stats.ride_sprint_speed}` : null,
      work: dp.work || {},
      ranchLevel,
      ranchDrop: ranchLevel ? (ranchMatch ? ranchMatch[1] : "(産出アイテム不明)") : null,
    };
  });
}

const ENTRIES = buildEntries();

function tierOf(rank, total){
  const pct = rank / total;
  if(pct <= 0.05) return "SS";
  if(pct <= 0.15) return "S";
  if(pct <= 0.35) return "A";
  if(pct <= 0.60) return "B";
  if(pct <= 0.85) return "C";
  return "D";
}

const state = { cat: "combat", query: "", element: "炎", work: "運搬" };

function scoreAndDetailFor(e){
  switch(state.cat){
    case "combat":
    case "combat_element":
      return { score: e.combatScore, detail: e.combatDetail, label: "持続DPS", isLevel: false };
    case "mount":
      return { score: e.mountScore, detail: e.mountDetail, label: "ライド疾走速度", isLevel: false };
    case "work":
      return { score: e.work[state.work] || null, detail: null, label: `作業適性(${state.work})`, isLevel: true };
    case "ranch":
      return { score: e.ranchLevel, detail: e.ranchDrop, label: "牧場適性", isLevel: true };
  }
}

function eligibleEntries(){
  if(state.cat === "combat_element") return ENTRIES.filter(e => e.types.includes(state.element));
  if(state.cat === "ranch") return ENTRIES.filter(e => e.ranchLevel != null);
  return ENTRIES;
}

function render(){
  const pool = eligibleEntries();
  let ranked = pool.map(e => ({ e, ...scoreAndDetailFor(e) })).filter(x => x.score != null);
  ranked.sort((a,b) => b.score - a.score);
  const total = ranked.length;

  let list = ranked.map((x, i) => ({ ...x.e, score: x.score, detail: x.detail, label: x.label, isLevel: x.isLevel, rank: i+1, tier: tierOf(i+1, total) }));
  if(state.query){
    const q = toKana(state.query.toLowerCase());
    list = list.filter(e => toKana(e.name).includes(q) || (e.en_name && e.en_name.toLowerCase().includes(state.query.toLowerCase())));
  }

  document.getElementById("countTag").textContent = `${list.length} / ${total}匹(対象外: ${PAL_DEX_DATA.length - total}匹)`;
  const box = document.getElementById("rankList");
  if(!list.length){
    box.innerHTML = `<div class="empty-msg">該当するパルが見つかりません。</div>`;
    return;
  }
  box.innerHTML = list.map(e => `
    <div class="rank-row">
      <div class="rnum">#${e.rank}</div>
      <div class="icon-wrap"><img src="${e.icon}" loading="lazy" alt=""></div>
      <div><a href="palworld_dex.html?id=${e.id}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;"><span class="pname" style="border-bottom:1px dashed var(--parchment-dim);">${e.name}</span></a><span class="pname-en">${e.en_name||''}</span></div>
      <div class="tier-badge ${e.tier}">${e.tier}</div>
      <div class="detail-text"><b>${e.label}: ${e.isLevel ? "★".repeat(e.score) : Math.round(e.score).toLocaleString()}</b>${e.detail ? ' / '+e.detail : ''}</div>
    </div>
  `).join("");
}

function renderSelectors(){
  const elBox = document.getElementById("elementSubTabs");
  const workSel = document.getElementById("workSubSelect");
  elBox.style.display = state.cat === "combat_element" ? "flex" : "none";
  workSel.style.display = state.cat === "work" ? "block" : "none";
  if(state.cat === "combat_element" && !elBox.dataset.built){
    elBox.innerHTML = ELEMENT_TYPES.map(t => `<div class="sub-chip${t===state.element?' active':''}" data-el="${t}">${t}</div>`).join("");
    elBox.dataset.built = "1";
    elBox.querySelectorAll(".sub-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        elBox.querySelectorAll(".sub-chip").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        state.element = chip.dataset.el;
        render();
      });
    });
  }
  if(state.cat === "work" && !workSel.dataset.built){
    workSel.innerHTML = WORK_TYPES.map(w => `<option value="${w}">${w}</option>`).join("");
    workSel.value = state.work;
    workSel.dataset.built = "1";
    workSel.addEventListener("change", () => { state.work = workSel.value; render(); });
  }
}

document.querySelectorAll(".cat-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".cat-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    state.cat = tab.dataset.cat;
    renderSelectors();
    render();
  });
});
document.getElementById("searchBox").addEventListener("input", e => { state.query = e.target.value; render(); });

renderSelectors();
render();
