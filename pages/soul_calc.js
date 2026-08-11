// パルソウル分配計算機。
// 手持ちのソウルで、狙ったステータス強化がどこまで届くかを出す。
//
// ■ 数値の出どころ(2026-08-11に確認)
//
// 力の石像での強化は 1段階 +3%、20段階で +60%。**ランク1〜10の内訳は複数ソースで一致:**
//
//     ランク1〜4   小さなパルのソウル ×1 / ×2 / ×3 / ×4   (合計10)
//     ランク5〜7   中くらいのパルのソウル ×1 / ×2 / ×3    (合計 6)
//     ランク8〜10  大きなパルのソウル ×1 / ×2 / ×3        (合計 6)
//     ランク11〜20 極まったパルのソウル                    (合計30)
//
// 1ステータスMAXの合計「小10 / 中6 / 大6 / 極30」は2ソースで一致し、
// さらに別の1ソースが 小10/中6/大6 を裏付けている(そのページは1.0前でランク10上限のため
// 極の記載が無い)。
//
// **ランク11〜20の1段階ごとの内訳だけは確定できなかった。** 合計30という数字しか出てこない。
// 10段階で合計30になる平坦な分け方は「毎段階3個」しか無いのでそれを採用しているが、
// これは**推定**であり画面にもそう書いてある。ランク20(MAX)の合計は確定値なので、
// 一番よく使う「MAXまで」の答えは正確に出る。
//
// ■ 両替について
//
// 小2→中、中2→大、大2→極 は game_data/items_obtain_data.js の製作レシピに入っている
// (粉砕機)。**下位への分解は扱わない。** 中→小のレシピは存在するが、1個から何個できるかが
// データに無く、推測になるため。

const SOUL_TIERS = [
  { key: "small",  asset: "PalUpgradeStone",  label: "小さなパルのソウル" },
  { key: "medium", asset: "PalUpgradeStone2", label: "中くらいのパルのソウル" },
  { key: "large",  asset: "PalUpgradeStone3", label: "大きなパルのソウル" },
  { key: "ultra",  asset: "PalUpgradeStone4", label: "極まったパルのソウル" },
];

// ランクごとの必要数。[段階, tierのkey, 個数]
// 11〜20 は推定(上のコメント参照)。ESTIMATED_FROM 以降が推定区間。
const ESTIMATED_FROM = 11;
const RANK_COST = [];
[1, 2, 3, 4].forEach((n, i) => RANK_COST.push({ rank: i + 1, tier: "small",  qty: n }));
[1, 2, 3].forEach((n, i)   => RANK_COST.push({ rank: i + 5, tier: "medium", qty: n }));
[1, 2, 3].forEach((n, i)   => RANK_COST.push({ rank: i + 8, tier: "large",  qty: n }));
for (let r = 11; r <= 20; r++) RANK_COST.push({ rank: r, tier: "ultra", qty: 3 });

const MAX_RANK = 20;
const PCT_PER_RANK = 3;

const state = {
  have: { small: 0, medium: 0, large: 0, ultra: 0 },
  slots: 3,        // 強化したいステータスの枠数(HP/攻撃/防御なら3)
  rank: MAX_RANK,
};

const $ = (id) => document.getElementById(id);
const jp = (n) => Math.round(n).toLocaleString();

// 目標ランクまでに要る数(1ステータスあたり)
function costForRank(rank){
  const need = { small: 0, medium: 0, large: 0, ultra: 0 };
  RANK_COST.filter(c => c.rank <= rank).forEach(c => { need[c.tier] += c.qty; });
  return need;
}

/* 手持ちで足りるかを、小さいほうから順に見る。
   余ったぶんは2個を1個にして上の段へ持ち上げる(小2→中、中2→大、大2→極)。
   **下へは降ろせない。** 分解のレシピはあるが取得数がデータに無いため扱わない。
   つまり小が足りないとき、大や極をいくら持っていても埋められない。 */
function solve(need, have){
  const rows = [];
  let carried = 0;                    // 下の段から持ち上がってきた数
  let convertedTotal = 0;
  for(let i = 0; i < SOUL_TIERS.length; i++){
    const t = SOUL_TIERS[i];
    const isTop = i === SOUL_TIERS.length - 1;     // 極。この上は無い
    const owned = have[t.key] || 0;
    const usable = owned + carried;
    const required = need[t.key] || 0;
    const short = Math.max(0, required - usable);
    const leftover = Math.max(0, usable - required);
    // 最上位の余りは持ち上げ先が無い。ここを場合分けしないと next が undefined になり、
    // 手順の描画で落ちて画面が古い内容のまま残る(2026-08-11に実際に踏んだ)。
    const promote = isTop ? 0 : Math.floor(leftover / 2);   // 2個で上の段の1個
    rows.push({
      tier: t, owned, carried, usable, required, short, leftover,
      promote, stranded: leftover - promote * 2, isTop,
    });
    convertedTotal += promote;
    carried = promote;
  }
  return { rows, ok: rows.every(r => r.short === 0), convertedTotal };
}

function render(){
  const perStat = costForRank(state.rank);
  const need = {};
  SOUL_TIERS.forEach(t => { need[t.key] = perStat[t.key] * state.slots; });

  const { rows, ok } = solve(need, state.have);

  $("targetLabel").textContent =
    `ステータス${state.slots}枠 × ランク${state.rank}(+${state.rank * PCT_PER_RANK}%)`;

  $("verdict").innerHTML = ok
    ? `<span class="ok">手持ちで届きます</span>`
    : `<span class="ng">足りません</span>`;

  $("tableBody").innerHTML = rows.map(r => `
    <tr class="${r.short ? "row-ng" : ""}">
      <td>${r.tier.label}</td>
      <td class="num">${jp(r.required)}</td>
      <td class="num">${jp(r.owned)}</td>
      <td class="num">${r.carried ? "+" + jp(r.carried) : "—"}</td>
      <td class="num ${r.short ? "ng" : "ok"}">${r.short ? "△" + jp(r.short) : "足りる"}</td>
    </tr>`).join("");

  // 両替の手順。持ち上げが起きた段だけ出す
  const steps = rows.filter(r => r.promote > 0).map((r, i) => {
    const next = SOUL_TIERS[SOUL_TIERS.indexOf(r.tier) + 1];
    return `<div class="step">
      <span class="step-n">${i + 1}</span>
      ${r.tier.label} ×${jp(r.promote * 2)} を粉砕機で
      <b>${next.label} ×${jp(r.promote)}</b> にする
    </div>`;
  });
  $("stepsBox").innerHTML = steps.length
    ? steps.join("")
    : `<div class="dim">両替は要りません。</div>`;

  // 最上位は「上へ回せない」のが当たり前なので、余りとして数え上げない
  const stranded = rows.filter(r => r.stranded > 0 && !r.isTop)
    .map(r => `${r.tier.label} ${jp(r.stranded)}個`);
  const topLeft = rows[rows.length - 1].leftover;
  const parts = [];
  if(stranded.length) parts.push(`2個に満たず上の段へ回せない余り: ${stranded.join(" / ")}`);
  if(topLeft > 0) parts.push(`${rows[rows.length-1].tier.label} は ${jp(topLeft)}個 余ります`);
  $("strandedNote").textContent = parts.join(" / ");

  // 内訳(1ステータスあたり)
  $("perStatBox").innerHTML = SOUL_TIERS
    .filter(t => perStat[t.key] > 0)
    .map(t => `<span class="chip">${t.label} <b>${jp(perStat[t.key])}</b></span>`).join("");

  $("estimateNote").style.display = state.rank >= ESTIMATED_FROM ? "block" : "none";
}

function renderInputs(){
  $("haveGrid").innerHTML = SOUL_TIERS.map(t => `
    <div class="form-field">
      <label for="have_${t.key}">${t.label}</label>
      <input type="number" id="have_${t.key}" value="${state.have[t.key]}" min="0" max="99999" data-k="${t.key}">
    </div>`).join("");
  $("haveGrid").querySelectorAll("input").forEach(inp => {
    inp.addEventListener("input", () => {
      const n = parseInt(inp.value, 10);
      state.have[inp.dataset.k] = Number.isFinite(n) && n > 0 ? Math.min(n, 99999) : 0;
      render();
    });
    inp.addEventListener("blur", () => { inp.value = state.have[inp.dataset.k]; });
  });
}

$("slotsInput").addEventListener("input", e => {
  const n = parseInt(e.target.value, 10);
  state.slots = Number.isFinite(n) && n > 0 ? Math.min(n, 999) : 1;
  render();
});
$("slotsInput").addEventListener("blur", e => { e.target.value = state.slots; });

$("rankInput").addEventListener("input", e => {
  state.rank = Math.min(MAX_RANK, Math.max(1, parseInt(e.target.value, 10) || 1));
  $("rankVal").textContent = `ランク${state.rank}(+${state.rank * PCT_PER_RANK}%)`;
  render();
});

renderInputs();
$("rankVal").textContent = `ランク${state.rank}(+${state.rank * PCT_PER_RANK}%)`;
render();
