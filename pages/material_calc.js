// 素材計算機。作りたいものと個数から、根っこの素材まで展開する。
//
// 新しいデータは取っていない。すでにある2つを組み合わせているだけ:
//   ITEMS_DEX_DATA    アイテムの名前・アイコン・カテゴリ
//   ITEM_OBTAIN_DATA  production(作業台と材料) / dropped_by(落とすパル)
//
// 作った動機(2026-08-11): 配合の実質的なボトルネックはケーキで、
// 「ケーキ20個作るのに畑と牧場をどれだけ回せばいいか」が既存のどのページでも
// 出せなかった。ケーキ専用にせず、production を持つものなら何でも展開できるようにしてある
// (回路や合金でも同じ問題が起きるため)。

const ITEM_BY_ASSET = new Map(ITEMS_DEX_DATA.map(i => [i.asset, i]));

function itemName(asset){
  const it = ITEM_BY_ASSET.get(asset);
  if(!it) return asset;
  return (it.name_jp && it.name_jp !== "-") ? it.name_jp : (it.name_en || asset);
}
function itemIcon(asset){
  const it = ITEM_BY_ASSET.get(asset);
  return it && it.icon ? it.icon : null;
}
function recipeOf(asset){
  const d = ITEM_OBTAIN_DATA[asset];
  return d && d.production ? d.production : null;
}
function dropsOf(asset){
  const d = ITEM_OBTAIN_DATA[asset];
  return d && d.dropped_by ? d.dropped_by : null;
}

// 作れるもの(production を持つもの)だけを候補にする。
// 素材そのものを選んでも展開する先が無く、画面が空になるため。
const CRAFTABLE = ITEMS_DEX_DATA
  .filter(i => recipeOf(i.asset))
  .filter(i => !/test|debug|dummy/i.test(i.asset))
  .filter(i => (i.name_jp && i.name_jp !== "-") || i.name_en)
  .sort((a,b) => itemName(a.asset).localeCompare(itemName(b.asset), "ja"));

// 配合をやる人が最初に来る動機がケーキなので、入口に置く。
// asset が存在するものだけ出す(データが変わって消えても壊れないように)。
const PRESETS = ["Cake", "Cake02", "Cake03", "Cake04", "Cake05"]
  .filter(a => ITEM_BY_ASSET.has(a) && recipeOf(a));

const state = { asset: PRESETS[0] || (CRAFTABLE[0] && CRAFTABLE[0].asset), qty: 1 };

/* 材料を再帰的に展開する。
   production を持たないものが「根っこ」。そこで止めて積み上げる。
   同じ素材が複数の枝に出てくる(小麦粉と生地の両方に小麦、など)ので、
   根っこは asset ごとに合算する。

   循環参照は path で止める。データ側に循環がある保証は無いが、
   あった場合に画面が固まるのを防ぐ。 */
function expand(asset, qty, path, roots, steps){
  const recipe = recipeOf(asset);
  if(!recipe || path.includes(asset)){
    roots.set(asset, (roots.get(asset) || 0) + qty);
    return { asset, qty, leaf: true, cyclic: path.includes(asset) };
  }
  steps.set(asset, (steps.get(asset) || 0) + qty);
  const children = recipe.materials.map(m =>
    expand(m.item_asset, Number(m.qty) * qty, path.concat(asset), roots, steps));
  return { asset, qty, leaf: false, workbench: recipe.workbench_jp, children };
}

function treeHtml(node, depth){
  const pad = depth * 18;
  const icon = itemIcon(node.asset);
  const name = itemName(node.asset);
  if(node.leaf){
    const drops = dropsOf(node.asset);
    const from = drops
      ? drops.slice(0, 3).map(d => d.pal_jp_name).join("・") + (drops.length > 3 ? ` 他${drops.length-3}体` : "")
      : "";
    return `<div class="tree-row leaf" style="padding-left:${pad}px">
      ${icon ? `<img src="${icon}" data-onerror="hide" alt="">` : ""}
      <span class="t-name">${name}</span>
      <span class="t-qty">×${node.qty.toLocaleString()}</span>
      ${from ? `<span class="t-from">${from}</span>` : `<span class="t-from dim">採取・購入など</span>`}
      ${node.cyclic ? `<span class="t-from warn">(循環参照のため展開を打ち切り)</span>` : ""}
    </div>`;
  }
  return `<div class="tree-row" style="padding-left:${pad}px">
      ${icon ? `<img src="${icon}" data-onerror="hide" alt="">` : ""}
      <span class="t-name">${name}</span>
      <span class="t-qty">×${node.qty.toLocaleString()}</span>
      <span class="t-from">${node.workbench || "作業台不明"}</span>
    </div>` + node.children.map(c => treeHtml(c, depth + 1)).join("");
}

function render(){
  const roots = new Map(), steps = new Map();
  const tree = expand(state.asset, state.qty, [], roots, steps);

  document.getElementById("targetName").textContent = itemName(state.asset);
  const ic = document.getElementById("targetIcon");
  const iconUrl = itemIcon(state.asset);
  ic.innerHTML = iconUrl ? `<img src="${iconUrl}" data-onerror="hide" alt="">` : "";

  // 買い物リスト: 根っこの素材だけを多い順に
  const list = [...roots.entries()].sort((a,b) => b[1] - a[1]);
  document.getElementById("shoppingBody").innerHTML = list.map(([asset, qty]) => {
    const drops = dropsOf(asset);
    const from = drops
      ? drops.slice(0, 4).map(d => d.pal_jp_name).join("・") + (drops.length > 4 ? ` 他${drops.length-4}体` : "")
      : "採取・購入など";
    const icon = itemIcon(asset);
    return `<tr>
      <td>${icon ? `<img class="mini" src="${icon}" data-onerror="hide" alt="">` : ""}${itemName(asset)}</td>
      <td class="num">${qty.toLocaleString()}</td>
      <td class="src">${from}</td>
    </tr>`;
  }).join("");
  document.getElementById("rootCount").textContent = `${list.length}種`;

  // 途中で作るもの(作業台を通す回数)
  const mid = [...steps.entries()].filter(([a]) => a !== state.asset)
    .sort((a,b) => b[1] - a[1]);
  const midBox = document.getElementById("midBox");
  midBox.innerHTML = mid.length
    ? mid.map(([asset, qty]) => {
        const r = recipeOf(asset);
        return `<div class="mid-row">
          <span class="t-name">${itemName(asset)}</span>
          <span class="t-qty">×${qty.toLocaleString()}</span>
          <span class="t-from">${r && r.workbench_jp ? r.workbench_jp : "作業台不明"}</span>
        </div>`;
      }).join("")
    : `<div class="dim">途中で作るものはありません(材料をそのまま使います)。</div>`;

  document.getElementById("treeBox").innerHTML = treeHtml(tree, 0);
}

function renderPicker(){
  const sel = document.getElementById("itemSelect");
  sel.innerHTML = CRAFTABLE.map(i =>
    `<option value="${i.asset}"${i.asset === state.asset ? " selected" : ""}>${itemName(i.asset)}</option>`).join("");

  const box = document.getElementById("presetBox");
  box.innerHTML = PRESETS.map(a =>
    `<button class="preset${a === state.asset ? " active" : ""}" data-asset="${a}">${itemName(a)}</button>`).join("");
  box.querySelectorAll(".preset").forEach(b => {
    b.addEventListener("click", () => {
      state.asset = b.dataset.asset;
      renderPicker();
      render();
    });
  });
}

document.getElementById("itemSelect").addEventListener("change", e => {
  state.asset = e.target.value;
  renderPicker();
  render();
});
document.getElementById("qtyInput").addEventListener("input", e => {
  const n = parseInt(e.target.value, 10);
  state.qty = Number.isFinite(n) && n > 0 ? Math.min(n, 9999) : 1;
  render();
});
document.getElementById("qtyInput").addEventListener("blur", e => {
  e.target.value = state.qty;
});

renderPicker();
render();
