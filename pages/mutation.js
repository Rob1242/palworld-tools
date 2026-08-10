/* 突然変異ページ。計算は shared/mutation-calc.js、ここは画面まわりだけ。
 *
 * データは BREEDING_PALS_DATA(299体、combi_rank付き)をそのまま使う。
 * 配合検索と同じものなので追加の読み込みは無い。 */

// BREEDING_PALS_DATA は `const` 宣言なので **window のプロパティにはならない**。
// window.BREEDING_PALS_DATA と書くと undefined になる(2026-08-10に踏んだ)。
// MutationCalc の側は global に明示代入しているので window 経由でも取れる。
const M = window.MutationCalc;
const PALS = BREEDING_PALS_DATA;
const INDEX = M.buildRankIndex(PALS);

const PAL_LIST = Object.keys(PALS)
  .filter(id => typeof PALS[id].combi_rank === "number")
  .map(id => ({ asset: id, name: PALS[id].jp_name, icon: PALS[id].icon, rank: PALS[id].combi_rank }))
  .sort((a, b) => a.name.localeCompare(b.name, "ja"));

const nameOf = id => (PALS[id] && PALS[id].jp_name) || id;
const iconOf = id => (PALS[id] && PALS[id].icon) || "";
const rankOf = id => PALS[id] && PALS[id].combi_rank;

/* ---- パルピッカー(配合検索と同じ挙動に揃える) ---- */
function setupPicker(inputEl, resultsEl, onPick) {
  const norm = s => (typeof toKana === "function" ? toKana(s) : s);
  inputEl.addEventListener("input", () => {
    const q = inputEl.value.trim().toLowerCase();
    if (!q) { resultsEl.style.display = "none"; return; }
    const qk = norm(q);
    const hits = PAL_LIST
      .filter(p => norm(p.name.toLowerCase()).includes(qk) || p.asset.toLowerCase().includes(q))
      .sort((a, b) => {
        // 前方一致を先に。30件で切るので、後方一致だけの名前が押し出されないように
        const as = norm(a.name.toLowerCase()).startsWith(qk) ? 0 : 1;
        const bs = norm(b.name.toLowerCase()).startsWith(qk) ? 0 : 1;
        return as !== bs ? as - bs : a.name.localeCompare(b.name, "ja");
      })
      .slice(0, 30);
    resultsEl.innerHTML = hits.length
      ? hits.map(p => `<div class="pal-picker-item" data-asset="${p.asset}">
           ${p.icon ? `<img src="${p.icon}" alt="">` : ""}<span>${p.name}</span>
           <span class="pk-rank">${p.rank}</span></div>`).join("")
      : `<div class="pal-picker-item">見つかりません</div>`;
    resultsEl.querySelectorAll(".pal-picker-item[data-asset]").forEach(el => {
      el.addEventListener("click", () => {
        inputEl.value = nameOf(el.dataset.asset);
        resultsEl.style.display = "none";
        onPick(el.dataset.asset);
      });
    });
    resultsEl.style.display = "block";
  });
  document.addEventListener("click", e => {
    if (!resultsEl.contains(e.target) && e.target !== inputEl) resultsEl.style.display = "none";
  });
}

function palChip(id, extra) {
  return `<span class="mchip">${iconOf(id) ? `<img src="${iconOf(id)}" alt="">` : ""}
    <b>${nameOf(id)}</b><i>${rankOf(id)}</i>${extra || ""}</span>`;
}

/* ---- 順引き: 親2体 → 変異候補 ---- */
const fwd = { a: null, b: null };

function renderForward() {
  const box = document.getElementById("fwdResult");
  if (!fwd.a || !fwd.b) {
    box.className = "result-box empty";
    box.innerHTML = "親を2体えらんでください。同じパル同士も指定できます。";
    return;
  }
  const ra = rankOf(fwd.a), rb = rankOf(fwd.b);
  const { range, list } = M.candidates(ra, rb, INDEX);
  box.className = "result-box";

  // ランクは palChip が出すので、専用の列は置かない(二重表示になる)
  const rows = list.map(c => `
    <tr>
      <td>${palChip(c.id)}</td>
      <td class="num"><b>${(c.probability * 100).toFixed(1)}%</b></td>
      <td class="bar"><span style="width:${Math.max(2, c.probability * 100 * 2.4)}%"></span></td>
    </tr>`).join("");

  box.innerHTML = `
    <div class="calc-line">
      <!-- 「強い方」は combi_rank が小さい方。Math.max ではない -->
      <span>強い方のランク <b>${Math.min(ra, rb)}</b></span>
      <span>ランク差 <b>${Math.abs(ra - rb)}</b></span>
      <span>目標値 <b>${range.lo.toFixed(0)} 〜 ${range.hi.toFixed(0)}</b></span>
      <span>候補 <b>${list.length}体</b></span>
    </div>
    <table class="mtable">
      <thead><tr><th>変異先の候補(名前の右はランク)</th><th class="num">目安</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/* ---- 逆引き: 欲しいパル → 親の組み合わせ ---- */
let revTarget = null;

function renderReverse() {
  const box = document.getElementById("revResult");
  if (!revTarget) {
    box.className = "result-box empty";
    box.innerHTML = "出したいパルをえらんでください。";
    return;
  }
  const t0 = performance.now();
  const res = M.parentsFor(revTarget, PALS, INDEX, { limit: 40 });
  const ms = Math.round(performance.now() - t0);
  box.className = "result-box";

  if (!res.length) {
    box.innerHTML = `<p class="mnote">${nameOf(revTarget)} を変異先にできる親の組み合わせは見つかりませんでした。</p>`;
    return;
  }
  const rows = res.map(r => `
    <tr>
      <td>${palChip(r.a)}</td>
      <td class="x">×</td>
      <td>${palChip(r.b)}</td>
      <td class="num"><b>${(r.probability * 100).toFixed(1)}%</b></td>
    </tr>`).join("");

  box.innerHTML = `
    <div class="calc-line">
      <span>目標 ${palChip(revTarget)}</span>
      <span>見つかった組み合わせ <b>${res.length}件</b>(上位)</span>
      <span class="dim">${ms}ms</span>
    </div>
    <table class="mtable">
      <thead><tr><th>親1</th><th></th><th>親2</th><th class="num">目安</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/* ---- モード切替 ---- */
document.querySelectorAll(".mode-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".mode-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    const m = tab.dataset.mode;
    document.getElementById("fwdMode").style.display = m === "forward" ? "" : "none";
    document.getElementById("revMode").style.display = m === "reverse" ? "" : "none";
  });
});

setupPicker(document.querySelector("#pickerA input"),
            document.querySelector("#pickerA .pal-picker-results"),
            id => { fwd.a = id; renderForward(); });
setupPicker(document.querySelector("#pickerB input"),
            document.querySelector("#pickerB .pal-picker-results"),
            id => { fwd.b = id; renderForward(); });
setupPicker(document.querySelector("#pickerT input"),
            document.querySelector("#pickerT .pal-picker-results"),
            id => { revTarget = id; renderReverse(); });

renderForward();
renderReverse();
