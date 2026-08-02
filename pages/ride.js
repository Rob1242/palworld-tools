// 汎用パッシブによる移動速度ボーナス(game_data/combat_data.jsのCOMBAT_PASSIVES_DATAで
// 確認済みの実効果値。陸上と水上で別枠のパッシブなので、飛行にも陸上の値を流用する
// (MoveSpeed効果はゲーム内データ上、地上/飛行の区別なく同じ扱いのため)。
// 速度極振り = デメリットの有無を問わず単純に一番速度が上がる4枠(または全て)を採用。
// 安定型 = 満腹度減少などのデメリット付きパッシブ(次元跳躍)を避け、代わりに「永久機関」
// (最大スタミナ+75%・ライドパルのみ有効・デメリット無し)を入れて、速度は多少譲っても
// スタミナ切れでダッシュが止まりにくい編成にする。水上は速度パッシブが3種しか確認できて
// おらず速度極振りでも4枠目が余るため、安定型ではその余った枠に永久機関を入れる形になる。
const STAMINA_PCT = 75; // 永久機関の効果値
const SPEED_BUILDS = {
  none:  { land: [], swim: [] },
  max:   {
    land: [{name:"次元跳躍",pct:50},{name:"神速",pct:30},{name:"伝説",pct:20},{name:"走るのが得意",pct:20}],
    swim: [{name:"波乗り王",pct:50},{name:"泳ぐのが得意",pct:40},{name:"しなやかスイム",pct:30}],
  },
  stable: {
    land: [{name:"神速",pct:30},{name:"伝説",pct:20},{name:"走るのが得意",pct:20},{name:"永久機関",pct:0,stamina:STAMINA_PCT}],
    swim: [{name:"波乗り王",pct:50},{name:"泳ぐのが得意",pct:40},{name:"しなやかスイム",pct:30},{name:"永久機関",pct:0,stamina:STAMINA_PCT}],
  },
};

const SWIM_BY_DEXID = {};
SWIM_SPEED_DATA.forEach(s => { SWIM_BY_DEXID[s.dexId] = s; });

// 環境補正(特定パル固有のパートナースキルとして、地形/時間条件を満たすと速度が上がる効果)。
// palworld-lab.comの各パル個別ページのパートナースキル欄を実際に★を切り替えて確認した実測値
// (2026-07-16調査)。属性による自動ボーナスではなく、この4匹だけが持つ固有効果であることを
// 確認済み(同じ属性の他のパルには付かない)。values配列は[★0,★1,★2,★3,★4]の順。
const ENV_BONUS_PALS = {
  "199": { label: "草原(ココヤンバ)", values: [155,175,195,215,240] },
  "166": { label: "夜間(ナイトロット)", values: [50,62,74,86,100] },
  "155": { label: "砂地(トリステップ)", values: [50,62,74,86,100] },
  "228": { label: "雪上(チョコザラシ)", values: [80,100,120,140,160] },
};

const state = { mode: "ground", build: "none", query: "", sort: "sprint", star: 0, env: "off" };

function toKana(str){
  return (str||"").replace(/[ぁ-ゖ]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}

function envPctFor(p){
  if(state.env !== "on") return 0;
  const bonus = ENV_BONUS_PALS[p.id];
  return bonus ? bonus.values[state.star] : 0;
}

function speedPctFor(mode){
  const key = mode === "swim" ? "swim" : "land";
  return SPEED_BUILDS[state.build][key].reduce((s,p) => s + p.pct, 0);
}

function staminaPctFor(mode){
  const key = mode === "swim" ? "swim" : "land";
  return SPEED_BUILDS[state.build][key].reduce((s,p) => s + (p.stamina||0), 0);
}

function updateBuildDetail(){
  const key = state.mode === "swim" ? "swim" : "land";
  const list = SPEED_BUILDS[state.build][key];
  const el = document.getElementById("buildDetail");
  if(!list.length){ el.textContent = ""; }
  else {
    el.textContent = "採用パッシブ: " + list.map(p => `${p.name}(${p.pct ? `速度+${p.pct}%` : `スタミナ+${p.stamina}%`})`).join("・")
      + ` / 速度合計+${list.reduce((s,p)=>s+p.pct,0)}%`
      + (staminaPctFor(state.mode) ? `・スタミナ+${staminaPctFor(state.mode)}%` : "");
  }
  const envEl = document.getElementById("envDetail");
  if(state.env !== "on"){ envEl.textContent = ""; return; }
  const names = Object.values(ENV_BONUS_PALS).map(b => `${b.label}+${b.values[state.star]}%`).join("・");
  envEl.textContent = `該当パルのみ: ${names}`;
}

function poolFor(mode){
  // 陸上を走れるパルは、水上も泳げるかどうかに関わらず対象にする(両方できるパルもいるため)。
  if(mode === "ground") return PAL_DEX_DATA.filter(p => p.ride && p.ride.rideable && !p.ride.fly);
  if(mode === "fly") return PAL_DEX_DATA.filter(p => p.ride && p.ride.fly);
  // 水上: 陸上ride.swimフラグは信頼性に欠ける項目が複数見つかった(2026-07-16調査)ため使わず、
  // paldb.cc実測データ(SWIM_SPEED_DATA)に載っている13匹のみを対象にする。
  return PAL_DEX_DATA.filter(p => SWIM_BY_DEXID[p.id]);
}

function statsFor(p, mode){
  const speedMult = 1 + (speedPctFor(mode) + envPctFor(p)) / 100;
  const staminaMult = 1 + staminaPctFor(mode) / 100;
  const hasEnv = state.env === "on" && !!ENV_BONUS_PALS[p.id];
  if(mode === "swim"){
    const s = SWIM_BY_DEXID[p.id];
    return {
      runLabel: "泳ぎ", sprintLabel: "泳ぎダッシュ",
      run: Math.round(s.swim_speed * speedMult), sprint: Math.round(s.swim_dash_speed * speedMult),
      stamina: Math.round(s.stamina * staminaMult), hasEnv,
    };
  }
  const baseStamina = MOUNT_STAMINA_DATA[p.id];
  return {
    runLabel: "走行", sprintLabel: "ライド疾走",
    run: Math.round(p.stats.run_speed * speedMult), sprint: Math.round(p.stats.ride_sprint_speed * speedMult),
    stamina: baseStamina != null ? Math.round(baseStamina * staminaMult) : null, hasEnv,
  };
}

function render(){
  let list = poolFor(state.mode);
  if(state.query){
    const q = toKana(state.query.toLowerCase());
    list = list.filter(p => toKana(p.name).includes(q) || (p.en_name && p.en_name.toLowerCase().includes(state.query.toLowerCase())));
  }
  const withStats = list.map(p => ({ p, s: statsFor(p, state.mode) }));
  const key = state.sort === "run" ? "run" : "sprint";
  withStats.sort((a,b) => b.s[key] - a.s[key]);

  updateBuildDetail();
  document.getElementById("countTag").textContent = `${withStats.length}匹`;
  const box = document.getElementById("rankList");
  if(!withStats.length){
    box.innerHTML = `<div class="empty-msg">該当するパルが見つかりません。</div>`;
    return;
  }
  const maxRun = Math.max(...withStats.map(x => x.s.run));
  const maxSprint = Math.max(...withStats.map(x => x.s.sprint));
  box.innerHTML = withStats.map(({p, s}, i) => {
    const runPct = Math.round(s.run / maxRun * 100);
    const sprintPct = Math.round(s.sprint / maxSprint * 100);
    return `<div class="rank-row">
      <div class="rnum">#${i+1}</div>
      <div class="icon-wrap"><img src="${p.icon}" loading="lazy" alt=""></div>
      <div><a href="palworld_dex.html?id=${p.id}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;"><span class="pname" style="border-bottom:1px dashed var(--parchment-dim);">${p.name}</span></a><span class="pname-en">${p.en_name||''}</span>${s.hasEnv ? ' <span class="env-badge">環境補正中</span>' : ''}</div>
      <div class="stat-bar-wrap">
        <div class="stat-bar-label"><span>${s.runLabel}</span><span>${s.run}</span></div>
        <div class="stat-bar"><div class="stat-bar-fill run" style="width:${runPct}%"></div></div>
      </div>
      <div class="stat-bar-wrap">
        <div class="stat-bar-label"><span>${s.sprintLabel}</span><span>${s.sprint}</span></div>
        <div class="stat-bar"><div class="stat-bar-fill sprint" style="width:${sprintPct}%"></div></div>
      </div>
      <div class="stamina-val">${s.stamina != null ? 'スタミナ'+s.stamina : ''}</div>
    </div>`;
  }).join("");
}

document.querySelectorAll(".mode-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".mode-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    state.mode = tab.dataset.mode;
    render();
  });
});
document.querySelectorAll("#passiveBuildTabs .build-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll("#passiveBuildTabs .build-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    state.build = tab.dataset.build;
    render();
  });
});
document.querySelectorAll("#starTabs .build-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll("#starTabs .build-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    state.star = parseInt(tab.dataset.star, 10);
    render();
  });
});
document.querySelectorAll("#envTabs .build-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll("#envTabs .build-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    state.env = tab.dataset.env;
    render();
  });
});
document.querySelectorAll("#sortChips .chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#sortChips .chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    state.sort = chip.dataset.sort;
    render();
  });
});
document.getElementById("searchBox").addEventListener("input", e => { state.query = e.target.value; render(); });

render();
