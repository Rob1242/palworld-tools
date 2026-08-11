// 経験値・レベル上げ計算機。
//
// データは game_data/exp_table_data.js(EXP_TABLE / EXP_META)。
// 生成は scripts/build_exp_data.py で、Lv80までしか入っていない。
// 理由と実測はそちらの冒頭に書いてある。ここでは上限を直書きせず EXP_META から取る。

const CAP = EXP_META.levelCap;

// プレイヤーとパルで見る列が違うだけで、計算そのものは同じ。
const MODES = {
  player: { next: "NextEXP",    total: "TotalEXP",    label: "プレイヤー" },
  pal:    { next: "PalNextEXP", total: "PalTotalEXP", label: "パル" },
};

const state = { mode: "player" };

const $ = (id) => document.getElementById(id);
const num = (n) => Math.round(n).toLocaleString();
const row = (lv) => EXP_TABLE[String(lv)];

// 倒す相手として見せるレベル。全80行を出しても選べないので、
// 実際に狩り場として使われる帯を飛び飛びに置く。
const KILL_LEVELS = [10, 20, 30, 40, 50, 55, 60, 65, 70, 75, 80];

function clampLv(v, fallback) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(CAP, Math.max(1, n));
}

/* 現在Lv(+持ち越し経験値)から目標Lvまでに、あと何EXP要るか。
   累計の差から、いま貯まっている分を引くだけ。 */
function needed(cur, tgt, carried) {
  const col = MODES[state.mode];
  if (tgt <= cur) return 0;
  const gap = row(tgt)[col.total] - row(cur)[col.total];
  return Math.max(0, gap - carried);
}

function render() {
  const col = MODES[state.mode];
  const cur = clampLv($("curLv").value, 30);
  const tgt = clampLv($("tgtLv").value, CAP);
  const toNext = row(cur)[col.next] === 0 && cur < CAP
    ? row(cur + 1)[col.next] : row(cur)[col.next];

  // 「今のレベルで貯まっている経験値」は、次のレベルまでの必要量を超えられない
  const nextNeed = cur < CAP ? row(cur + 1)[col.total] - row(cur)[col.total] : 0;
  let carried = Math.max(0, parseInt($("curExp").value, 10) || 0);
  if (nextNeed > 0 && carried > nextNeed) carried = nextNeed;
  $("curExpNote").textContent = cur < CAP
    ? `Lv${cur}→${cur + 1} は ${num(nextNeed)} EXP`
    : `Lv${CAP} は上限です`;

  const need = needed(cur, tgt, carried);

  // ---- 必要経験値 ----
  if (tgt <= cur) {
    $("needNum").textContent = "0";
    $("needSub").innerHTML = `<span class="warn">目標レベルが今のレベル以下です。</span>`;
  } else {
    $("needNum").textContent = num(need);
    const parts = [
      `${col.label}の Lv${cur} → Lv${tgt}`,
      `内訳: 累計 <b>${num(row(tgt)[col.total])}</b> − <b>${num(row(cur)[col.total])}</b>` +
        (carried ? ` − 持ち越し <b>${num(carried)}</b>` : ""),
    ];
    if (state.mode === "pal" && EXP_META.palNextFlatFrom && tgt >= EXP_META.palNextFlatFrom) {
      // 勝手に補正せず、データがそうなっていることをそのまま伝える(build_exp_data.py 参照)
      parts.push(`※ パルの必要経験値は <b>Lv${EXP_META.palNextFlatFrom} 以降どのレベルも ` +
                 `${num(EXP_META.palNextFlatValue)}</b> で横ばいです。ゲーム内データがそうなっています。`);
    }
    $("needSub").innerHTML = parts.join("<br>");
  }

  // ---- 何体倒せば届くか ----
  const body = $("killBody");
  if (need <= 0) {
    body.innerHTML = `<tr><td colspan="3">—</td></tr>`;
    $("killNote").textContent = "";
  } else {
    // 1体あたりの獲得量は DropEXP。プレイヤーとパルで分けるデータが無いため共通で使う。
    body.innerHTML = KILL_LEVELS.filter(lv => lv <= CAP).map(lv => {
      const drop = row(lv).DropEXP;
      const n = Math.ceil(need / drop);
      return `<tr>
        <td>Lv${lv} のパル</td>
        <td class="num">${num(drop)}</td>
        <td class="num ${lv === CAP ? "hi" : ""}">${num(n)} 体</td>
      </tr>`;
    }).join("");
    $("killNote").innerHTML =
      "1体あたりの獲得量はテーブルの DropEXP をそのまま使っています。" +
      "パーティで分け合う分、料理・ケーキ・サーバー設定の倍率は含みません。<b>下限の見積もり</b>として見てください。";
  }

  // ---- レベルごとの内訳 ----
  const from = Math.min(cur, tgt), to = Math.max(cur, tgt);
  const rows = [];
  for (let lv = from; lv <= to; lv++) {
    const nx = lv < CAP ? row(lv + 1)[col.total] - row(lv)[col.total] : 0;
    rows.push(`<tr>
      <td>Lv${lv}</td>
      <td>${lv < CAP ? num(nx) : "—"}</td>
      <td>${num(row(lv)[col.total])}</td>
      <td>${num(row(lv).DropEXP)}</td>
    </tr>`);
  }
  $("breakdownBody").innerHTML = rows.join("");
}

document.querySelectorAll(".mode-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".mode-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    state.mode = tab.dataset.mode;
    render();
  });
});
["curLv", "tgtLv", "curExp"].forEach(id => {
  $(id).addEventListener("input", render);
});
["curLv", "tgtLv"].forEach(id => {
  // 範囲外のまま置き去りにしない。フォーカスが外れた時点で入力欄の値も直す。
  $(id).addEventListener("blur", () => {
    $(id).value = clampLv($(id).value, id === "curLv" ? 1 : CAP);
    render();
  });
});

render();
