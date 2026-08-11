


function computeCombatBestEarly(pal, lv){
  if(!pal.skills || !pal.skills.length) return null;
  const atk = computeStat(pal.stats.shot_attack, 100, 0.075, lv, 0, 0, 0);
  let best = null;
  for(const sk of pal.skills){
    if(sk.level > lv) continue;
    const stab = pal.types_en.includes(sk.element) ? STAB_MULT : 1.0;
    const instant = sk.power * atk * stab;
    const cycle = Math.max(sk.cooldown, MIN_CYCLE_SECONDS);
    const sustained = instant / cycle;
    if(!best || sustained > best.sustained) best = { ...sk, sustained };
  }
  return best;
}


// showObtain: 入手時期バッジを出すか。序盤タブは野生Lv5以下だけに絞って組んでいるので
// 全部「序盤」になり、出しても情報量が無い。終盤タブと拠点タブでだけ出す。
function palChip(name, role, reason, showObtain){
  const dp = PAL_DEX_DATA.find(p => p.name === name);
  if(!dp) return "";
  return `
    <div class="squad-card">
      <img src="${dp.icon}" alt="">
      <div>
        <div class="squad-role">${role}</div>
        <div class="squad-name"><a href="palworld_dex.html?id=${dp.id}" style="color:inherit;text-decoration:none;border-bottom:1px dashed var(--parchment-dim);" target="_blank" rel="noopener">${dp.name}</a> ${dp.types.map(t=>`<span class="type-badge type-${t}">${t}</span>`).join(" ")}${showObtain ? obtainBadge(dp.tier) : ""}</div>
        <div class="squad-reason">${reason}</div>
      </div>
    </div>`;
}

// ---- 序盤(Lv1〜15、実際に野生入手できるパルのみ) ----
function buildEarlyData(){
  const minLevelByAsset = {};
  SPAWN_DATA.pals.forEach(s => {
    const levels = (s.wildZones||[]).map(z=>z.minLevel).filter(x=>x!=null);
    if(levels.length) minLevelByAsset[s.dexId] = Math.min(minLevelByAsset[s.dexId] ?? 99, ...levels);
  });
  const early = PAL_DEX_DATA.filter(p => minLevelByAsset[p.id] != null && minLevelByAsset[p.id] <= 5);
  const attackers = early.map(p => {
    const cp = COMBAT_PAL_DATA.find(c => c.dex_id === p.id);
    const best = cp ? computeCombatBestEarly(cp, 15) : null;
    return { p, sustained: best ? best.sustained : null, skill: best };
  }).filter(x => x.sustained != null).sort((a,b) => b.sustained - a.sustained);
  const mounts = early.filter(p => p.ride && p.ride.rideable).sort((a,b) => b.stats.ride_sprint_speed - a.stats.ride_sprint_speed);
  const workers = early.map(p => ({ p, workCount: Object.keys(p.work||{}).length })).filter(x => x.workCount > 0).sort((a,b) => b.workCount - a.workCount);
  return { early, attackers, mounts, workers };
}

function renderEarly(){
  const { early, attackers, mounts, workers } = buildEarlyData();
  const box = document.getElementById("earlyView");
  const top3 = attackers.slice(0,3);
  const topMount = mounts[0];
  const topWorkers = workers.slice(0,3);
  box.innerHTML = `
    <p class="section-lead">序盤に野生で捕獲できるパル(マップ出現データ上でLv5以下から出現する${early.length}種)だけに絞って、Lv15時点の想定DPSで評価したランキングです。序盤はまだ才能厳選・パッシブ厳選ができないため、種族値と技構成の差がそのまま火力差になります。</p>
    <div class="subhead">序盤アタッカー(Lv15想定・持続DPS上位)</div>
    <div class="squad-grid">
      ${top3.map((x,i) => palChip(x.p.name, `#${i+1} アタッカー`, `使用技: <b>${x.skill.jp_name || x.skill.en_name}</b>(威力${x.skill.power}・CT${x.skill.cooldown}秒)`)).join("")}
    </div>
    <div class="subhead">序盤の足(ライド速度上位)</div>
    <div class="squad-grid">
      ${topMount ? palChip(topMount.name, "序盤の乗騎", `疾走速度 <b>${topMount.stats.ride_sprint_speed}</b>(走行${topMount.stats.run_speed})。序盤で入手できるライド持ちの中では最速。`) : ""}
      ${palChip("モモンパ", "保険枠", "パートナースキルで<b>瀕死時にプレイヤーを自動蘇生</b>。Lv1から野生入手可能で、序盤の死に戻りロスを大きく減らせる数少ない保険役。")}
    </div>
    <div class="subhead">拠点の下働き(担当できる作業の種類が多いパル)</div>
    <div class="squad-grid">
      ${topWorkers.map(x => palChip(x.p.name, `作業${x.workCount}種対応`, `担当可能: ${Object.entries(x.p.work).map(([k,v])=>`${k}★${v}`).join("・")}`)).join("")}
    </div>
    <p class="link-row">より詳しい作業適性ランキングは<a href="palworld_tierlist.html">最強Tier表(拠点作業)</a>、乗騎速度の全種比較は<a href="palworld_ride.html">ライド速度ランキング</a>を参照してください。</p>
  `;
}

// ---- 拠点(作業班、全種対象で作業タイプごとの最強候補) ----
const WORK_TYPES = ["運搬","採集","手作業","伐採","採掘","水やり","種まき","火おこし","製薬","冷却","発電","牧場"];
const RANCH_DROP_RE = /家畜牧場にアサインすると、(.+?)(?:ことがある|。|$)/;

function renderBase(){
  const box = document.getElementById("baseView");
  const rows = WORK_TYPES.map(w => {
    const candidates = PAL_DEX_DATA.filter(p => (p.work||{})[w]).sort((a,b) => b.work[w] - a.work[w]);
    const top = candidates[0];
    if(!top) return "";
    const tied = candidates.filter(c => c.work[w] === top.work[w]);
    const extra = tied.length > 1 ? `他${tied.length-1}種同レベル` : "";
    const ranchNote = w === "牧場" ? (() => {
      const m = RANCH_DROP_RE.exec(top.partner_skill.effect);
      return m ? `/ 産出: ${m[1]}` : "";
    })() : "";
    // 12作業のうち9つで1位が「野生に出ないパル」だった(★8は全10体中9体がspecial。
    // 野生で獲れるパルの上限は★7で、序盤に至っては★4が上限)。しかも同率が1体しか
    // 無いので、この表だけ見ても代わりが分からなかった。1位は動かさず、
    // 野生では手に入らないときだけ「野生で獲れる最上位」を併記する。
    const wildTop = candidates.find(p => p.tier !== "special");
    const wildNote = (top.tier === "special" && wildTop)
      ? `<span class="wild-alt">野生で獲れる最上位: ${wildTop.name} ${"★".repeat(wildTop.work[w])}${obtainBadge(wildTop.tier)}</span>`
      : "";
    return `<tr>
      <td>${w}</td>
      <td><img src="${top.icon}" alt="">${top.name}${obtainBadge(top.tier)}</td>
      <td class="stars">${"★".repeat(top.work[w])}</td>
      <td>${extra}${ranchNote}${wildNote}</td>
    </tr>`;
  }).join("");
  box.innerHTML = `
    <p class="section-lead">全298種の中から、作業タイプごとに適性レベル(★の数)が最も高いパルを1体ずつ選んだ「作業班」の一覧です。同レベルのパルが複数いる場合は他候補の数を併記しています。牧場だけは配置時の産出アイテムも表示します(パートナースキルの説明文から判明したもののみ)。<b>★の最上位は多くが配合・ボス限定のパル</b>なので、野生で捕まえられるかどうかを名前の横のバッジで示し、野生に出ないパルが1位のときは「野生で獲れる最上位」も併記しています。</p>
    <div style="overflow-x:auto;">
    <table class="work-table">
      <thead><tr><th>作業</th><th>おすすめパル</th><th>適性</th><th>備考</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>
    <p class="link-row">全パルの作業適性を横断検索したい場合は<a href="palworld_tierlist.html">最強Tier表(拠点作業タブ)</a>、作業タイプの詳細な意味は<a href="palworld_reference.html">早見表(Work Priority)</a>を参照してください。</p>
  `;
}

// ---- 戦闘(終盤、Lv80想定の6体編成) ----
function topAttackerOfElement(el){
  const entries = PAL_DEX_DATA.map(dp => {
    const cp = COMBAT_PAL_DATA.find(c => c.dex_id === dp.id);
    const best = (cp && !RANKING_EXCLUDE_DEX_IDS.has(dp.id)) ? computeCombatBest(cp) : null;
    return { dp, best };
  }).filter(x => x.best && x.dp.types.includes(el));
  entries.sort((a,b) => b.best.sustained - a.best.sustained);
  return entries[0];
}

function renderCombat(){
  const box = document.getElementById("combatView");
  const top1 = topAttackerOfElement("無");
  const top2 = topAttackerOfElement("氷");
  box.innerHTML = `
    <p class="section-lead">Lv80・星4・才能100%・ソウル60%を想定した終盤の汎用6体編成です。属性の異なる2枚看板アタッカー+各アタッカー専属のバフ役+保険(蘇生)+盾役、という役割分担で組んでいます。ボスごとの弱点属性に合わせて差し替えたい場合は<a href="palworld_tierlist.html">最強Tier表(戦闘属性別)</a>や<a href="palworld_bossguide.html">ボス攻略</a>ページの個別編成を参照してください。</p>
    <div class="squad-grid">
      ${palChip(top1.dp.name, "メインアタッカー①", `全パル中トップの持続DPS(${Math.round(top1.best.sustained).toLocaleString()})。使用技: ${top1.best.jp_name}(威力${top1.best.power}・CT${top1.best.cooldown}秒)`, true)}
      ${palChip(top2.dp.name, "メインアタッカー②", `氷属性トップの持続DPS(${Math.round(top2.best.sustained).toLocaleString()})。①と属性が異なり、氷が弱点のボス(塔ボス7・レイドボス多数)を任せられる。`, true)}
      ${palChip("ミルフィー", "バフ役①", "パートナースキルで<b>無属性パルの攻撃力が上昇</b>。①のダメージを底上げする専属サポート。", true)}
      ${palChip("フブキツネ", "バフ役②", "パートナースキルで<b>氷属性パルの攻撃力が上昇</b>。②のダメージを底上げする専属サポート。", true)}
      ${palChip("モモンパ", "保険枠", "パートナースキルで<b>瀕死時にプレイヤーを自動蘇生</b>。ボス戦での事故死を防ぐ定番の保険役(ボス攻略ページの多くの編成でも採用)。", true)}
      ${palChip("アイギルガ", "盾役", "ライド中、イージスチャージ使用時の<b>シールド継続時間が延長</b>。プレイヤー自身の生存力を底上げする守り役。", true)}
    </div>
    <p class="section-lead" style="margin-top:8px;">属性バフを持つパルは現状9属性中8属性分しか確認できておらず(<a href="palworld_reference.html">早見表のパーティバフ一覧</a>参照)、竜属性の専属バフ役は今のところ見つかっていません。竜属性を主力にする場合はバフ役なしで組む必要があります。</p>
  `;
}

renderEarly();
renderBase();
renderCombat();

document.querySelectorAll(".mode-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".mode-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    const mode = tab.dataset.mode;
    document.getElementById("earlyView").style.display = mode === "early" ? "block" : "none";
    document.getElementById("baseView").style.display = mode === "base" ? "block" : "none";
    document.getElementById("combatView").style.display = mode === "combat" ? "block" : "none";
  });
});
