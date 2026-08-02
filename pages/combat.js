const TYPES = ["無","炎","水","雷","地","草","氷","竜","闇"];
function typeBadge(t){ return `<span class="type-badge type-${t}">${t}</span>`; }

const STAB_MULT = 1.2;
const MIN_CYCLE_SECONDS = 2.5;

let state = {
  pal: null,
  lv: 80,
  star: 4,
  talent: { hp: 100, atk: 100, def: 100 },
  soul: { hp: 60, atk: 60, def: 60 },
  passiveSlots: [null, null, null, null],
  dpsMode: "sustained",
};

function computeStat(speciesVal, base, coef, lv, talentPct, starPct, soulPct){
  return (base + speciesVal * coef * lv * (1 + talentPct/100)) * (1 + starPct/100) * (1 + soulPct/100);
}

function passiveEffectValue(passive, type){
  if(!passive) return 0;
  const e = passive.effects.find(x => x.type === type && x.target === "ToSelf");
  return e ? e.value : 0;
}

function getChosenPassives(){
  return state.passiveSlots.map(name => name ? COMBAT_PASSIVES_DATA.find(p => p.name === name) : null).filter(Boolean);
}

function currentStats(){
  const p = state.pal;
  const starPct = state.star * 5;
  const hp = computeStat(p.stats.hp, 500, 0.5, state.lv, state.talent.hp, starPct, state.soul.hp);
  const atk = computeStat(p.stats.shot_attack, 100, 0.075, state.lv, state.talent.atk, starPct, state.soul.atk);
  const def = computeStat(p.stats.defense, 100, 0.075, state.lv, state.talent.def, starPct, state.soul.def);
  return { hp, atk, def };
}

function renderSummary(){
  const p = state.pal;
  const s = currentStats();
  document.getElementById("sumIcon").innerHTML = p.icon ? `<img src="${p.icon}" alt="">` : "";
  document.getElementById("sumName").textContent = p.name;
  document.getElementById("sumNameEn").textContent = `${p.en_name || ""} ・ #${p.dex_id}`;
  document.getElementById("sumTypes").innerHTML = p.types.map(typeBadge).join("");
  document.getElementById("sumHp").textContent = Math.round(s.hp).toLocaleString();
  document.getElementById("sumAtk").textContent = Math.round(s.atk).toLocaleString();
  document.getElementById("sumDef").textContent = Math.round(s.def).toLocaleString();

  const maxBar = 20000;
  document.getElementById("barHpVal").textContent = Math.round(s.hp).toLocaleString();
  document.getElementById("barAtkVal").textContent = Math.round(s.atk).toLocaleString();
  document.getElementById("barDefVal").textContent = Math.round(s.def).toLocaleString();
  document.getElementById("barHp").style.width = Math.min(100, s.hp/maxBar*100) + "%";
  document.getElementById("barAtk").style.width = Math.min(100, s.atk/maxBar*100) + "%";
  document.getElementById("barDef").style.width = Math.min(100, s.def/maxBar*100) + "%";

  const pskill = p.partner_skill;
  document.getElementById("pskillBox").innerHTML = pskill ? `
    <div class="pskill-name">◆ ${pskill.name}</div>
    <div class="pskill-effect">${pskill.effect}</div>
  ` : "";
}

function renderStarRow(){
  document.getElementById("starVal").textContent = state.star;
  const starRow = document.getElementById("starRow");
  starRow.innerHTML = [1,2,3,4].map(i => `<button class="star-icon-btn ${i <= state.star ? 'filled' : ''}" data-star="${i}">${ico('star')}</button>`).join("");
  starRow.querySelectorAll(".star-icon-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const i = parseInt(btn.dataset.star);
      state.star = (state.star === i) ? i - 1 : i;
      renderStarRow();
      renderAll();
    });
  });
}

function renderBasicControls(){
  document.getElementById("lvSlider").value = state.lv;
  document.getElementById("lvVal").textContent = state.lv;

  renderStarRow();

  const talentGrid = document.getElementById("talentGrid");
  talentGrid.innerHTML = ["hp","atk","def"].map(k => `
    <div class="talent-col">
      <span class="lbl">才能(${k==='hp'?'HP':k==='atk'?'攻撃':'防御'})</span>
      <span class="val" id="talentVal_${k}">${state.talent[k]}</span>
      <input type="range" min="0" max="100" value="${state.talent[k]}" data-k="${k}" class="talentSlider">
    </div>
  `).join("");
  talentGrid.querySelectorAll(".talentSlider").forEach(sl => {
    sl.addEventListener("input", () => { state.talent[sl.dataset.k] = parseInt(sl.value); renderAll(); });
  });

  const soulGrid = document.getElementById("soulGrid");
  soulGrid.innerHTML = ["hp","atk","def"].map(k => `
    <div class="talent-col">
      <span class="lbl">ソウル(${k==='hp'?'HP':k==='atk'?'攻撃':'防御'})</span>
      <span class="val" id="soulVal_${k}">+${state.soul[k]}%</span>
      <input type="range" min="0" max="60" value="${state.soul[k]}" data-k="${k}" class="soulSlider">
    </div>
  `).join("");
  soulGrid.querySelectorAll(".soulSlider").forEach(sl => {
    sl.addEventListener("input", () => { state.soul[sl.dataset.k] = parseInt(sl.value); renderAll(); });
  });
}

function renderPassiveSlots(){
  const wrap = document.getElementById("passiveSlots");
  const sortedPassives = [...COMBAT_PASSIVES_DATA].sort((a,b) => a.name.localeCompare(b.name, 'ja'));
  wrap.innerHTML = state.passiveSlots.map((chosen, i) => `
    <div class="passive-slot">
      <select data-slot="${i}">
        <option value="">(未選択)</option>
        ${sortedPassives.map(p => `<option value="${p.name}" ${chosen === p.name ? 'selected' : ''}>${p.name}${p.is_worldtree ? ' [世界樹]' : ''}</option>`).join("")}
      </select>
      <div class="slot-effect" id="slotEffect_${i}"></div>
    </div>
  `).join("");
  wrap.querySelectorAll("select").forEach(sel => {
    sel.addEventListener("change", () => {
      state.passiveSlots[parseInt(sel.dataset.slot)] = sel.value || null;
      renderAll();
    });
  });
  updateSlotEffectLabels();
}

function updateSlotEffectLabels(){
  state.passiveSlots.forEach((name, i) => {
    const el = document.getElementById(`slotEffect_${i}`);
    if(!el) return;
    if(!name){ el.textContent = ""; return; }
    const p = COMBAT_PASSIVES_DATA.find(x => x.name === name);
    el.textContent = p ? p.effect_text_jp : "";
  });
}

function pickPowerPreset(){
  return COMBAT_PASSIVES_DATA
    .map(p => ({ p, val: passiveEffectValue(p, "ShotAttack") }))
    .filter(x => x.val > 0)
    .sort((a,b) => b.val - a.val)
    .slice(0, 4)
    .map(x => x.p.name);
}

function pickStablePreset(){
  const safe = COMBAT_PASSIVES_DATA
    .map(p => ({
      p,
      atk: passiveEffectValue(p, "ShotAttack"),
      ct: passiveEffectValue(p, "ActiveSkillCoolTime_Decrease"),
      def: passiveEffectValue(p, "Defense"),
      hp: passiveEffectValue(p, "MaxHP"),
    }))
    .filter(x => (x.atk > 0 || x.ct > 0) && x.def >= 0 && x.hp >= 0)
    .sort((a,b) => (b.atk + b.ct) - (a.atk + a.ct))
    .map(x => x.p.name);
  const picks = safe.slice(0, 4);
  if(picks.length < 4){
    const defensive = COMBAT_PASSIVES_DATA
      .map(p => ({
        p,
        val: passiveEffectValue(p, "Defense") + passiveEffectValue(p, "MaxHP") + passiveEffectValue(p, "AutoHPRegeneRate"),
      }))
      .filter(x => x.val > 0 && !picks.includes(x.p.name))
      .sort((a,b) => b.val - a.val);
    for(const d of defensive){
      if(picks.length >= 4) break;
      picks.push(d.p.name);
    }
  }
  return picks;
}

function pickElementPreset(){
  const elementKeys = state.pal.types_en.map(t => `ElementBoost_${t}`);
  return COMBAT_PASSIVES_DATA
    .map(p => {
      const atk = passiveEffectValue(p, "ShotAttack");
      const elem = elementKeys.reduce((sum, k) => sum + passiveEffectValue(p, k), 0);
      return { p, score: atk + elem, hasElem: elem > 0 };
    })
    .filter(x => x.score > 0)
    .sort((a,b) => (b.score + (b.hasElem ? 0.01 : 0)) - (a.score + (a.hasElem ? 0.01 : 0)))
    .slice(0, 4)
    .map(x => x.p.name);
}

function applyPreset(preset){
  const picks = preset === "stable" ? pickStablePreset()
    : preset === "element" ? pickElementPreset()
    : pickPowerPreset();
  state.passiveSlots = [picks[0]||null, picks[1]||null, picks[2]||null, picks[3]||null];
  renderPassiveSlots();
  renderAll();
}

function renderSkillList(){
  const p = state.pal;
  const s = currentStats();
  const chosen = getChosenPassives();
  const genericPct = chosen.reduce((sum,ps) => sum + passiveEffectValue(ps, "ShotAttack"), 0);
  const ctPct = chosen.reduce((sum,ps) => sum + passiveEffectValue(ps, "ActiveSkillCoolTime_Decrease"), 0);
  const ctMultiplier = Math.max(1 - ctPct/100, 0.1);

  const rows = p.skills.map(sk => {
    const stab = p.types_en.includes(sk.element) ? STAB_MULT : 1.0;
    const elementPct = chosen.reduce((sum,ps) => sum + passiveEffectValue(ps, `ElementBoost_${sk.element}`), 0);
    const effectiveAtk = s.atk * (1 + genericPct/100) * (1 + elementPct/100);
    const instant = sk.power * effectiveAtk * stab;
    const cycle = Math.max(sk.cooldown * ctMultiplier, MIN_CYCLE_SECONDS);
    const sustained = instant / cycle;
    return { ...sk, stab: stab > 1, elementBoosted: elementPct > 0, instant, sustained };
  });

  const sortKey = state.dpsMode === "instant" ? "instant" : "sustained";
  rows.sort((a,b) => b[sortKey] - a[sortKey]);

  document.getElementById("formulaNote").textContent = state.dpsMode === "instant"
    ? "瞬間火力 = 威力 × 攻撃力 × 属性一致(×1.2) × 属性強化パッシブ"
    : "継続火力 = 瞬間火力 ÷ max(技のCT × (1-クールタイム短縮%), 2.5秒)";

  document.getElementById("skillList").innerHTML = rows.map(r => `
    <div class="skill-row">
      <div>
        <div class="skill-name">${r.jp_name || r.en_name}${r.stab ? '<span class="stab-tag">一致</span>' : ''}${r.elementBoosted ? '<span class="stab-tag" style="background:rgba(110,200,234,.14);color:var(--brass);border-color:rgba(110,200,234,.35);">属性強化</span>' : ''}</div>
      </div>
      <div class="skill-meta">Lv${r.level ?? '?'}</div>
      <div class="skill-meta">威力${r.power} / CT${r.cooldown}s</div>
      <div class="skill-dps">${Math.round(r[sortKey]).toLocaleString()}</div>
    </div>
  `).join("");
}

function renderAll(){
  renderSummary();
  updateSlotEffectLabels();
  renderSkillList();
}

function selectPal(dexId){
  const p = COMBAT_PAL_DATA.find(x => x.dex_id === dexId);
  if(!p) return;
  state.pal = p;
  state.passiveSlots = [null, null, null, null];
  document.getElementById("calc").style.display = "block";
  renderBasicControls();
  renderPassiveSlots();
  renderAll();
  window.scrollTo(0,0);
}

document.getElementById("lvSlider").addEventListener("input", e => { state.lv = parseInt(e.target.value); document.getElementById("lvVal").textContent = state.lv; renderAll(); });
document.querySelectorAll("#presetRow .auto-btn").forEach(btn => {
  btn.addEventListener("click", () => applyPreset(btn.dataset.preset));
});
document.querySelectorAll(".dps-mode-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".dps-mode-tab").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.dpsMode = btn.dataset.mode;
    renderSkillList();
  });
});

function setupBuildPicker(){
  const wrap = document.getElementById("buildPicker");
  const inputEl = wrap.querySelector("input");
  const resultsEl = wrap.querySelector(".pal-picker-results");
  inputEl.addEventListener("input", () => {
    const q = inputEl.value.trim().toLowerCase();
    if(!q){ resultsEl.style.display = "none"; return; }
    const matches = COMBAT_PAL_DATA.filter(r =>
      r.name.toLowerCase().includes(q) || (r.en_name||"").toLowerCase().includes(q)
    ).slice(0, 20);
    if(!matches.length){
      resultsEl.innerHTML = `<div class="pal-picker-item">見つかりません</div>`;
    } else {
      resultsEl.innerHTML = matches.map(r => `
        <div class="pal-picker-item" data-id="${r.dex_id}">
          ${r.icon ? `<img src="${r.icon}" alt="">` : ""}<span>${r.name}</span>
        </div>
      `).join("");
      resultsEl.querySelectorAll(".pal-picker-item[data-id]").forEach(el => {
        el.addEventListener("click", () => {
          inputEl.value = "";
          resultsEl.style.display = "none";
          selectPal(el.dataset.id);
        });
      });
    }
    resultsEl.style.display = "block";
  });
  inputEl.addEventListener("blur", () => setTimeout(() => resultsEl.style.display = "none", 150));
}

setupBuildPicker();

const initialParams = new URLSearchParams(location.search);
const initialId = initialParams.get("id");
if(initialId && COMBAT_PAL_DATA.some(p => p.dex_id === initialId)){
  selectPal(initialId);
}

// ===== 6体最強パーティ =====
// 全パル共通の固定前提(Lv80・濃縮★4・才能値100%・ソウル強化60%)で各パルの最高DPS技を求め、
// 動的計画法(DP)で「得意技の属性カバレッジ」を保ちながら合計DPSが最大になる6体を厳密に選ぶ。
// 部分集合の被覆(属性カバレッジ)+ナップサック(6体選出)を同時に扱う都合上、
// dp[k][mask] = 「k体を選び、選んだ技の属性の和集合がmaskであるときの最大合計DPS」というテーブルを
// 291パル分1体ずつ更新する0/1ナップサックDP(状態数 約291×7×512 ≈ 100万、JSで一瞬で計算できる)。
const PARTY_SIZE = 6;
const PARTY_LV = 80, PARTY_STAR_PCT = 20, PARTY_TALENT_PCT = 100, PARTY_SOUL_PCT = 60;
const PARTY_COVERAGE_WEIGHT = 150000; // 属性1種カバーにつきこの値を加点(上位パルのDPSと同程度の重み)
const ELEMENT_EN_TO_JP = { Fire:"炎", Water:"水", Electricity:"雷", Earth:"地", Leaf:"草", Ice:"氷", Dragon:"竜", Dark:"闇", Normal:"無" };
const PARTY_ELEMENT_BEATS = { "炎":["草","氷"], "草":["地"], "地":["雷"], "雷":["水"], "水":["炎"], "氷":["竜"], "竜":["闇"], "闇":["無"], "無":[] };

function partyElementMultiplier(attackerType, defenderType){
  if(attackerType === "無") return 1;
  if(PARTY_ELEMENT_BEATS[attackerType].includes(defenderType)) return 1.5;
  if(defenderType === "無") return 1;
  if(attackerType === defenderType) return 0.66;
  if(PARTY_ELEMENT_BEATS[defenderType] && PARTY_ELEMENT_BEATS[defenderType].includes(attackerType)) return 0.66;
  return 1;
}
function isWeakTo(defenderTypesJp, attackerType){
  let mult = 1;
  defenderTypesJp.forEach(def => { mult *= partyElementMultiplier(attackerType, def); });
  return mult > 1.01;
}

function pickBestPresetForTypes(typesEn){
  const elementKeys = typesEn.map(t => `ElementBoost_${t}`);
  return COMBAT_PASSIVES_DATA
    .map(p => {
      const atk = passiveEffectValue(p, "ShotAttack");
      const elem = elementKeys.reduce((sum, k) => sum + passiveEffectValue(p, k), 0);
      return { p, score: atk + elem, hasElem: elem > 0 };
    })
    .filter(x => x.score > 0)
    .sort((a,b) => (b.score + (b.hasElem?0.01:0)) - (a.score + (a.hasElem?0.01:0)))
    .slice(0, 4)
    .map(x => x.p.name);
}

function computePalBestForParty(pal){
  if(!pal.skills || !pal.skills.length) return null;
  const atk = computeStat(pal.stats.shot_attack, 100, 0.075, PARTY_LV, PARTY_TALENT_PCT, PARTY_STAR_PCT, PARTY_SOUL_PCT);
  const passiveNames = pickBestPresetForTypes(pal.types_en);
  const chosen = passiveNames.map(n => COMBAT_PASSIVES_DATA.find(p => p.name === n)).filter(Boolean);
  const genericPct = chosen.reduce((s,ps) => s + passiveEffectValue(ps, "ShotAttack"), 0);
  const ctPct = chosen.reduce((s,ps) => s + passiveEffectValue(ps, "ActiveSkillCoolTime_Decrease"), 0);
  const ctMultiplier = Math.max(1 - ctPct/100, 0.1);

  let best = null;
  for(const sk of pal.skills){
    const stab = pal.types_en.includes(sk.element) ? STAB_MULT : 1.0;
    const elementPct = chosen.reduce((s,ps) => s + passiveEffectValue(ps, `ElementBoost_${sk.element}`), 0);
    const effectiveAtk = atk * (1 + genericPct/100) * (1 + elementPct/100);
    const instant = sk.power * effectiveAtk * stab;
    const cycle = Math.max(sk.cooldown * ctMultiplier, MIN_CYCLE_SECONDS);
    const sustained = instant / cycle;
    if(!best || sustained > best.sustained) best = { ...sk, sustained, instant };
  }
  if(!best) return null;
  return { pal, atk, passiveNames, best, attackElementJp: ELEMENT_EN_TO_JP[best.element] || "無" };
}

function popcount(x){
  let c = 0;
  while(x){ c += x & 1; x >>= 1; }
  return c;
}

// Terrariaコラボパル(dex_id 288〜298、クトゥルフのめだま〜かがやくコウモリ)は専用技の
// クールタイムが軒並み1秒(他の291体は最低でも2秒、高火力技は大抵10〜30秒)という他に例のない
// 異常値で、DPS計算式にそのまま通すと実際の強さとかけ離れた桁外れのスコアになる
// (レインボースライム等が「最強」に出てしまう不具合を確認済み・2026-07-16)。
// この専用技コールタイムが実際のゲームプレイ上の値なのか、ボス戦AIの攻撃間隔がそのまま
// 技データとして抽出されたものなのかは確認が取れていないため、確実な検証ができるまで
// 全パル横断のランキング系機能(6体パーティ・最強Tier表)からは除外する。
const RANKING_EXCLUDE_DEX_IDS = new Set(Array.from({length: 298-288+1}, (_,i) => String(288+i)));

function selectBestParty(){
  const candidates = COMBAT_PAL_DATA
    .filter(p => !RANKING_EXCLUDE_DEX_IDS.has(p.dex_id))
    .map(computePalBestForParty).filter(Boolean);
  const numMasks = 1 << TYPES.length; // 512
  const NEG = -Infinity;
  const bitOf = jp => 1 << TYPES.indexOf(jp);

  let dp = Array.from({length: PARTY_SIZE + 1}, () => new Float64Array(numMasks).fill(NEG));
  dp[0][0] = 0;
  const fromMaskAll = [];

  candidates.forEach(cand => {
    const bit = bitOf(cand.attackElementJp);
    const fromMask = new Int16Array((PARTY_SIZE + 1) * numMasks).fill(-1);
    for(let k = PARTY_SIZE - 1; k >= 0; k--){
      const row = dp[k];
      const nextRow = dp[k+1];
      for(let mask = 0; mask < numMasks; mask++){
        const cur = row[mask];
        if(cur === NEG) continue;
        const newMask = mask | bit;
        const newScore = cur + cand.best.sustained;
        if(newScore > nextRow[newMask]){
          nextRow[newMask] = newScore;
          fromMask[(k+1) * numMasks + newMask] = mask;
        }
      }
    }
    fromMaskAll.push(fromMask);
  });

  let bestMask = 0, bestTotal = NEG, bestDps = 0;
  const finalRow = dp[PARTY_SIZE];
  for(let mask = 0; mask < numMasks; mask++){
    if(finalRow[mask] === NEG) continue;
    const total = finalRow[mask] + popcount(mask) * PARTY_COVERAGE_WEIGHT;
    if(total > bestTotal){ bestTotal = total; bestMask = mask; bestDps = finalRow[mask]; }
  }

  const chosenIdx = [];
  let k = PARTY_SIZE, mask = bestMask;
  for(let i = candidates.length - 1; i >= 0 && k > 0; i--){
    const prevMask = fromMaskAll[i][k * numMasks + mask];
    if(prevMask !== -1){
      chosenIdx.push(i);
      mask = prevMask;
      k -= 1;
    }
  }
  chosenIdx.reverse();
  return { party: chosenIdx.map(i => candidates[i]), coverageMask: bestMask, totalDps: bestDps };
}

function renderPartyResult(result){
  const { party, coverageMask, totalDps } = result;
  const coveredCount = popcount(coverageMask);

  document.getElementById("partySummaryBox").innerHTML = `
    <div class="metric"><div class="num">${Math.round(totalDps).toLocaleString()}</div><div class="lbl">合計継続火力</div></div>
    <div class="metric"><div class="num">${coveredCount} / ${TYPES.length}</div><div class="lbl">カバーしている属性数</div></div>
  `;

  document.getElementById("coverageGrid").innerHTML = TYPES.map(t => {
    const covered = (1 << TYPES.indexOf(t)) & coverageMask;
    return `<span class="coverage-chip ${covered ? "covered" : "uncovered"}">${typeBadge(t)} ${covered ? "対応可" : "非対応"}</span>`;
  }).join("");

  document.getElementById("partyGrid").innerHTML = party.map(cand => `
    <div class="party-card">
      <div class="pc-head">
        ${cand.pal.icon ? `<img src="${cand.pal.icon}" alt="${cand.pal.name}">` : ""}
        <div>
          <div class="pc-name">${cand.pal.name}</div>
          <div class="pc-name-en">${cand.pal.en_name || ""}</div>
        </div>
      </div>
      <div class="badge-row">${cand.pal.types.map(typeBadge).join("")}</div>
      <div class="pc-skill"><span>${cand.best.jp_name || cand.best.en_name}${typeBadge(cand.attackElementJp)}</span><span>Lv${cand.best.level ?? "?"}</span></div>
      <div class="pc-dps">${Math.round(cand.best.sustained).toLocaleString()} <span style="font-size:10px;color:var(--parchment-dim);">継続火力</span></div>
    </div>
  `).join("");

  const weakCounts = TYPES.map(t => ({
    type: t,
    count: party.filter(cand => isWeakTo(cand.pal.types, t)).length,
  })).sort((a,b) => b.count - a.count);
  document.getElementById("weaknessRiskBox").innerHTML = weakCounts.map(w => `
    <div class="wr-row ${w.count <= 2 ? "safe" : ""}">
      <span style="width:40px;">${typeBadge(w.type)}</span>
      <div class="wr-bar"><div class="wr-fill" style="width:${(w.count / party.length) * 100}%"></div></div>
      <span class="wr-count">${w.count}/${party.length}体弱点</span>
    </div>
  `).join("");

  document.getElementById("partyResult").style.display = "block";
}

document.getElementById("computePartyBtn").addEventListener("click", () => {
  const btn = document.getElementById("computePartyBtn");
  btn.disabled = true;
  btn.textContent = "計算中…";
  setTimeout(() => {
    const result = selectBestParty();
    renderPartyResult(result);
    btn.disabled = false;
    btn.textContent = "6体最強パーティを再計算する";
  }, 30);
});

document.querySelectorAll(".mode-tabs .mode-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".mode-tabs .mode-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    const mode = tab.dataset.mode;
    document.getElementById("buildMode").style.display = mode === "build" ? "block" : "none";
    document.getElementById("partyMode").style.display = mode === "party" ? "block" : "none";
    document.getElementById("matchupMode").style.display = mode === "matchup" ? "block" : "none";
  });
});

(function initMatchupChecker(){
  const atkSel = document.getElementById("matchupAtk");
  const def1Sel = document.getElementById("matchupDef1");
  const def2Sel = document.getElementById("matchupDef2");
  TYPES.forEach(t => {
    atkSel.innerHTML += `<option value="${t}">${t}</option>`;
    def1Sel.innerHTML += `<option value="${t}">${t}</option>`;
    def2Sel.innerHTML += `<option value="${t}">${t}</option>`;
  });

  function render(){
    const atk = atkSel.value;
    const def1 = def1Sel.value;
    const def2 = def2Sel.value;
    const mult = def2 ? partyElementMultiplier(atk, def1) * partyElementMultiplier(atk, def2) : partyElementMultiplier(atk, def1);
    const resultEl = document.getElementById("matchupResult");
    const noteEl = document.getElementById("matchupNote");
    const color = mult > 1 ? "var(--danger)" : mult < 1 ? "var(--teal)" : "var(--parchment)";
    resultEl.style.color = color;
    resultEl.textContent = `×${mult.toFixed(2).replace(/\.?0+$/,'') || mult}`;
    noteEl.textContent = mult > 1 ? "弱点(通常より大きいダメージ)" : mult < 1 ? "耐性(通常より小さいダメージ)" : "等倍(有利・不利なし)";
  }
  [atkSel, def1Sel, def2Sel].forEach(sel => sel.addEventListener("change", render));
  render();
})();
