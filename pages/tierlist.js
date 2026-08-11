




// 家畜牧場にパルを配置した際の産出アイテムは、専用の構造化データが無いため
// パートナースキルの説明文(自然文)から正規表現で抽出する。抽出できないパルは
// 「(産出アイテム不明)」と明示し、無理に推測しない(2026-07-20)。
const RANCH_DROP_RE = /家畜牧場にアサインすると、(.+?)(?:ことがある|。|$)/;
const WORK_TYPES = ["運搬","採集","手作業","伐採","採掘","水やり","種まき","火おこし","製薬","冷却","発電","牧場"];
const ELEMENT_TYPES = ["無","炎","水","雷","地","草","氷","竜","闇"];

// Tier表はS/A/Bのランキングであり拠点プランナーのような「おすすめ」ではないため、
// 配合限定のパルが上位に出ること自体は正しい。ただし見る側は「S位の採掘パル」を見て
// 捕まえに行こうとするので、配合・ボス限定か序盤で野生に出るのかが分からないと使えない。
// ランキングから除外はせず、入手時期バッジを添えて補足する(2026-08-09)。
// バッジ本体は shared/util.js の obtainBadge()。ボス攻略・パーティ編成でも同じものを使う。

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
      obtainTier: dp.tier,
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

// 「拠点作業」「配合牧場」はスコアが★1〜8の飛び飛びの段階で、順位のパーセンタイルで
// SS/S/A/B/C/Dを切ると同じ★のパルが並び順だけで別Tierに割れる。実測すると
// 12作業で50件そうなっていた(牧場の★4がSSとSに割れる等)。段階そのものが
// 適性なので、この2カテゴリはランクを付けず★のレベルで束ねて表示する(2026-08-11)。
// 戦闘・マウントは連続値なのでパーセンタイルのTierのまま。
const LEVEL_CATS = new Set(["work", "ranch"]);

// 束ねた中の並び順。★が同じならゲーム的な優劣は無いので、先に手に入るものから並べる。
// (並べないと図鑑番号順になり、なぜその順なのかが読み取れない)
const OBTAIN_ORDER = { early: 0, mid: 1, late: 2, special: 3 };

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

function palCell(e){
  return `<div><a href="palworld_dex.html?id=${e.id}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;"><span class="pname" style="border-bottom:1px dashed var(--parchment-dim);">${e.name}</span></a><span class="pname-en">${e.en_name||''}</span>${obtainBadge(e.obtainTier)}</div>`;
}

// ★のレベルごとに束ねる。見出しに★と体数を出すので、行の側では★を繰り返さない。
function renderLevelGroups(list, label){
  const levels = [...new Set(list.map(e => e.score))].sort((a,b) => b - a);
  return levels.map(lv => {
    const rows = list.filter(e => e.score === lv)
      .sort((a,b) => (OBTAIN_ORDER[a.obtainTier] ?? 9) - (OBTAIN_ORDER[b.obtainTier] ?? 9) || a.name.localeCompare(b.name, "ja"));
    return `
      <div class="level-head">
        <span class="level-stars">${"★".repeat(lv)}</span>
        <span class="level-label">${label} ${lv}</span>
        <span class="level-count">${rows.length}体</span>
      </div>
      ${rows.map(e => `
        <div class="rank-row level">
          <div class="icon-wrap"><img src="${e.icon}" loading="lazy" alt=""></div>
          ${palCell(e)}
          ${e.detail ? `<div class="detail-text">${e.detail}</div>` : ''}
        </div>`).join("")}`;
  }).join("");
}

function render(){
  const pool = eligibleEntries();
  let ranked = pool.map(e => ({ e, ...scoreAndDetailFor(e) })).filter(x => x.score != null);
  ranked.sort((a,b) => b.score - a.score);
  const total = ranked.length;
  const isLevel = LEVEL_CATS.has(state.cat);

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
  if(isLevel){
    box.innerHTML = renderLevelGroups(list, state.cat === "ranch" ? "牧場適性" : `${state.work}適性`);
    return;
  }
  box.innerHTML = list.map(e => `
    <div class="rank-row">
      <div class="rnum">#${e.rank}</div>
      <div class="icon-wrap"><img src="${e.icon}" loading="lazy" alt=""></div>
      ${palCell(e)}
      <div class="tier-badge ${e.tier}">${e.tier}</div>
      <div class="detail-text"><b>${e.label}: ${Math.round(e.score).toLocaleString()}</b>${e.detail ? ' / '+e.detail : ''}</div>
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
