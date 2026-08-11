const CATEGORY_ORDER = ["すべて","資源・素材","武器","防具","アクセサリー","食料","消耗品","グライダー・盾","弾薬","設計図","建築物","その他"];

// 開発者用デバッグ/テストアイテム(Debug_Handgun_*、TEST_*、*_Test等)は実際にゲーム内で
// 入手できないため、アイテム図鑑の表示対象から除外する(2026-07-16、日本語名対応中に発見)。
// また「_NPC」系・「_Otomo」系の一部(NPCやパルが使う専用武器の内部データで、
// name_jp/name_enどちらにも実際の名前が存在しない=asset名がそのままname_enになっている)
// も除外する。ただし「Otomo」を含むアイテムの大半(指輪・ホイッスル・指揮棒等)は
// 実在するプレイヤー用アクセサリーなので、「本当に名前が無いもの」だけを対象に絞る
// (2026-07-17、アーマー重複調査の過程で発見。当初「Otomo」を含む物を広く除外しようと
// したが、それだと実在の防具・アクセサリー約100件を誤って消してしまうところだった)。
// ※isUnnamedはname_jp==="-"判定のままだと常にfalseになる不具合があった
// (ビルド側がJP名なしをnullで出力しており、"-"は書き出されない)。2026-07-21修正。
const REAL_ITEMS = ITEMS_DEX_DATA.filter(it => {
  if(/test|debug|dummy/i.test(it.asset)) return false;
  if(/dummy/i.test(it.icon)) return false;
  const isUnnamed = !it.name_jp && it.name_en === it.asset;
  if(isUnnamed && (/_NPC(_|$)/.test(it.asset) || /_Otomo$/.test(it.asset))) return false;
  return true;
});

// 武器・防具・アクセサリー・グライダー/盾は、同名のまま最大5段階のレア度
// (コモン/アンコモン/レア/エピック/レジェンダリー)違いで個別の設計図・個別の
// アイテムIDとして実装されている(paldb.ccの実データで確認済み。例: ビームランチャーは
// 攻撃力14000→16800、耐久度3500→14000まで段階的に上がる別アイテム)。バグではなく
// 実在の仕様だが、名前・アイコンが同一で一見「重複」に見えるため
// (2026-07-17、ユーザーがアーマーの重複っぽさを指摘して発見)、
// 同名グループを1枚のカードに統合し、レア度ごとの詳細ステータス
// (game_data/items_stats_extra.js、paldb.ccから直接スクレイピング)を
// モーダル内の一覧表で見せる。
const RARITY_NAMES = ["コモン", "アンコモン", "レア", "エピック", "レジェンダリー"];
const RARITY_COLORS = ["var(--parchment-dim)", "var(--hp)", "var(--teal)", "var(--magenta)", "var(--brass)"];
const EQUIPMENT_CATEGORIES = new Set(["武器", "防具", "アクセサリー", "グライダー・盾"]);
const STAT_LABEL_ORDER = ["攻撃", "防御", "耐久度", "HP", "シールド"];

function statsOf(asset){
  return (typeof ITEM_STATS_EXTRA !== "undefined" && ITEM_STATS_EXTRA[asset]) || null;
}

const ITEM_BY_ASSET = new Map(ITEMS_DEX_DATA.map(it => [it.asset, it]));

// 表示用アイテムの一覧を作る: 非装備カテゴリは1アイテム=1カードのまま、
// 装備カテゴリは同名アイテムをレア度でまとめて1カードにする。
const DISPLAY_ITEMS = (() => {
  const out = [];
  const equipGroups = new Map();
  REAL_ITEMS.forEach(it => {
    if(!EQUIPMENT_CATEGORIES.has(it.category)){
      out.push({
        asset: it.asset, name_jp: it.name_jp, name_en: it.name_en, name_jp_literal: it.name_jp_literal, icon: it.icon,
        category: it.category, subcategory: it.subcategory,
        weight: it.weight, max_stack: it.max_stack, price: it.price, rarity: it.rarity,
        isGroup: false,
        tiers: [{ asset: it.asset, rarity: it.rarity, rarityName: null, price: it.price, stats: statsOf(it.asset) }],
      });
      return;
    }
    const key = it.category + "::" + (it.name_jp || it.name_en);
    if(!equipGroups.has(key)) equipGroups.set(key, []);
    equipGroups.get(key).push(it);
  });
  equipGroups.forEach(group => {
    const sorted = group.slice().sort((a,b) => a.rarity - b.rarity);
    const rep = sorted[sorted.length - 1];
    const prices = sorted.map(t => t.price);
    out.push({
      asset: rep.asset, name_jp: rep.name_jp, name_en: rep.name_en, name_jp_literal: rep.name_jp_literal, icon: rep.icon,
      category: rep.category, subcategory: rep.subcategory,
      weight: rep.weight, max_stack: rep.max_stack,
      price: Math.max(...prices), priceMin: Math.min(...prices), priceMax: Math.max(...prices),
      rarity: rep.rarity, isGroup: sorted.length > 1,
      tiers: sorted.map(t => ({ asset: t.asset, rarity: t.rarity, rarityName: RARITY_NAMES[t.rarity], price: t.price, stats: statsOf(t.asset) })),
    });
  });
  // 建築物(設置物)は売却額・重量・最大スタック数という概念が無いため、代わりに
  // テクノロジー解放Lv・コストを持たせる(2026-07-20、technology_data.jsの建築物枠から新設)。
  (typeof BUILDING_ITEMS_DATA !== "undefined" ? BUILDING_ITEMS_DATA : []).forEach(b => {
    out.push({
      asset: b.asset, name_jp: b.name_jp, name_en: null, icon: b.icon,
      category: "建築物", subcategory: b.subcategory,
      weight: null, max_stack: null, price: null, rarity: 0,
      tech_level: b.tech_level, tech_cost: b.tech_cost,
      isGroup: false,
      tiers: [{ asset: b.asset, rarity: 0, rarityName: null, price: null, stats: null }],
    });
  });
  return out;
})();

const state = { query: "", category: "すべて", sort: "price_desc" };
// name_jpが"-"のものは「日本語名が見つからなかった」プレースホルダであり、
// 実際の日本語名ではない(2026-07-17発見)。この場合は英語名にフォールバックする。
function displayName(item){
  return (item.name_jp && item.name_jp !== "-") ? item.name_jp : item.name_en;
}

// サブカテゴリは元データの時点で日本語/英語が混在している(2026-07-16発見)。
// 値の種類が24種類と少ないため、和訳マップで直接吸収する。
const SUBCATEGORY_JP = {
  "Assault Rifle": "アサルトライフル", "Melee Weapon": "近接武器", "Shotgun": "ショットガン",
  "Bow": "弓", "Handgun": "ハンドガン", "Crossbow": "クロスボウ", "Sniper Rifle": "スナイパーライフル",
  "Body Armor": "ボディアーマー", "Shield": "シールド", "Head Armor": "ヘッドアーマー",
  "Vegetable Dish": "野菜料理", "Meat Dish": "肉料理", "Fish Dish": "魚料理",
  "Sphere Modifier": "スフィアモジュール", "Pal Weapon": "パル用武器"
};
function subcategoryJp(sc){
  return SUBCATEGORY_JP[sc] || sc;
}

function renderChips(){
  const box = document.getElementById("catChips");
  box.innerHTML = CATEGORY_ORDER.map(c =>
    `<div class="chip ${state.category===c?'active':''}" data-cat="${c}">${c}</div>`
  ).join("");
  box.querySelectorAll(".chip").forEach(el => {
    el.addEventListener("click", () => {
      state.category = el.dataset.cat;
      renderChips();
      renderGrid();
    });
  });
}

// サブカテゴリが無い(null)アイテムでも、名前のパターンから種類ごとにまとめられるように
// する(2026-07-16、「スフィアはスフィアで、石片は石片でまとめて」というユーザー指摘で追加)。
function groupKeyOf(it){
  if(it.subcategory) return subcategoryJp(it.subcategory);
  const name = it.name_jp || "";
  if(/の石片$/.test(name)) return "レイドボスの石片";
  if(it.asset.startsWith("PalSphere") && /スフィア$/.test(name)) return "パルスフィア";
  return null;
}

function filteredSorted(){
  let list = DISPLAY_ITEMS.filter(it => {
    if(state.category !== "すべて" && it.category !== state.category) return false;
    if(state.query){
      const q = toKana(state.query.toLowerCase());
      const hitJp = it.name_jp && toKana(it.name_jp).includes(q);
      const hitEn = it.name_en && it.name_en.toLowerCase().includes(state.query.toLowerCase());
      if(!hitJp && !hitEn) return false;
    }
    return true;
  });
  if(state.sort === "price_desc") list = list.slice().sort((a,b) => (b.price ?? -1) - (a.price ?? -1));
  else if(state.sort === "price_asc") list = list.slice().sort((a,b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  else if(state.sort === "name") list = list.slice().sort((a,b) => {
    const c = displayName(a).localeCompare(displayName(b), "ja");
    return c !== 0 ? c : a.rarity - b.rarity;
  });

  // 種類(グループキー)ごとにまとめる安定並び替え。グループ内の順序は上のソートを維持し、
  // グループの並び順は「そのグループの先頭アイテムが元々どこにあったか」をそのまま使う
  // (価格降順ソートなら、一番高いアイテムを含むグループが自然に先頭に来る)。
  const order = [];
  const buckets = new Map();
  list.forEach(it => {
    const key = groupKeyOf(it) || "";
    if(!buckets.has(key)){ buckets.set(key, []); order.push(key); }
    buckets.get(key).push(it);
  });
  list = order.flatMap(key => buckets.get(key));
  return { list, groupCount: order.filter(k => k !== "").length + (buckets.has("") ? 1 : 0) };
}

function renderGrid(){
  const { list, groupCount } = filteredSorted();
  document.getElementById("countTag").textContent = `${list.length} / ${DISPLAY_ITEMS.length}件`;
  const grid = document.getElementById("grid");
  if(!list.length){
    grid.innerHTML = `<div class="empty-msg">該当するアイテムが見つかりません。</div>`;
    return;
  }
  let lastKey = undefined;
  grid.innerHTML = list.map(it => {
    const name = displayName(it);
    const isEn = !it.name_jp || it.name_jp === "-";
    const key = groupCount > 1 ? (groupKeyOf(it) || "その他") : null;
    const header = (key !== null && key !== lastKey) ? `<div class="group-header">${key}</div>` : "";
    lastKey = key;
    const tierStripHtml = it.category === "建築物" ? "" : it.isGroup
      ? `<div class="tier-strip">${it.tiers.map(t => `<span style="background:${RARITY_COLORS[t.rarity]}"></span>`).join("")}</div>`
      : `<div class="rarity-dots">${Array.from({length:5}, (_,i) => `<span class="${i < it.rarity ? 'on' : ''}"></span>`).join("")}</div>`;
    return `${header}<div class="card" data-asset="${it.asset}">
      <div class="icon-wrap"><img src="${it.icon}" data-onerror-src="game_data/icons/T_icon_unknown.webp" loading="lazy" alt=""></div>
      ${it.subcategory ? `<div class="sub-badge">${subcategoryJp(it.subcategory)}</div>` : ''}
      <div class="iname ${isEn ? 'en-fallback' : ''}">${name}</div>
      ${tierStripHtml}
    </div>`;
  }).join("");
  grid.querySelectorAll(".card[data-asset]").forEach(card => {
    card.addEventListener("click", () => openModal(card.dataset.asset));
  });
}

function buildStatTable(it){
  const cols = STAT_LABEL_ORDER.filter(label => it.tiers.some(t => t.stats && t.stats[label] != null));
  if(!cols.length) return "";
  const hasEffects = it.tiers.some(t => t.stats && t.stats.item_effects && t.stats.item_effects.length);
  const rows = it.tiers.map(t => {
    const cells = cols.map(label => {
      const v = t.stats && t.stats[label];
      return `<td>${v != null ? v.toLocaleString() : "—"}</td>`;
    }).join("");
    const effectCell = hasEffects ? `<td style="text-align:left;font-family:var(--font-body);">${(t.stats && t.stats.item_effects || []).join("・") || "—"}</td>` : "";
    return `<tr>
      <td class="rarity-cell" style="color:${RARITY_COLORS[t.rarity]}">${t.rarityName}</td>
      <td>₽${t.price.toLocaleString()}</td>
      ${cells}
      ${effectCell}
    </tr>`;
  }).join("");
  const techLevel = it.tiers[0].stats && it.tiers[0].stats.tech_level;
  return `<div class="stat-table-wrap"><table class="stat-table">
    <thead><tr><th>レア度</th><th>売却額</th>${cols.map(c => `<th>${c}</th>`).join("")}${hasEffects ? '<th>固有効果</th>' : ''}</tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
  ${techLevel != null ? `<p style="font-size:11px;color:var(--parchment-dim);margin-top:6px;">テクノロジー解放Lv: ${techLevel}(基本レア度のみ。上位レア度は設計図合成で作成)</p>` : ""}`;
}

function buildSingleStats(it){
  const stats = it.tiers[0].stats;
  if(!stats) return "";
  const chips = STAT_LABEL_ORDER.filter(l => stats[l] != null)
    .map(l => `<div class="stat-chip"><span class="sk">${l}</span><span class="sv">${stats[l].toLocaleString()}</span></div>`)
    .join("");
  const effectsHtml = stats.item_effects && stats.item_effects.length
    ? `<p style="font-size:12px;color:var(--parchment-dim);margin-top:8px;">固有効果: ${stats.item_effects.join("・")}</p>` : "";
  const techHtml = stats.tech_level != null
    ? `<p style="font-size:11px;color:var(--parchment-dim);margin-top:4px;">テクノロジー解放Lv: ${stats.tech_level}</p>` : "";
  return (chips ? `<div class="single-stats">${chips}</div>` : "") + effectsHtml + techHtml;
}

// この素材が他のどのアイテムの製作材料として使われているか(逆引き)。
// gamewith.jp等の個別アイテムページには載っているが、こちらはまだ「このアイテム自体を
// 作るのに何が要るか」の順方向しか出していなかったため追加(2026-07-22、複数サイトの
// アイテム詳細ページを比較した結果判明した最大のギャップ)。ITEM_OBTAIN_DATAの
// production.materialsを総当たりして逆引き索引を作るだけなので、新しいデータ取得は不要。
const REVERSE_USAGE = (() => {
  const rev = {};
  if(typeof ITEM_OBTAIN_DATA === "undefined") return rev;
  Object.entries(ITEM_OBTAIN_DATA).forEach(([itemAsset, data]) => {
    if(!data.production) return;
    data.production.materials.forEach(m => {
      (rev[m.item_asset] = rev[m.item_asset] || []).push({ item_asset: itemAsset, qty: m.qty });
    });
  });
  return rev;
})();

function buildUsedInHtml(it){
  const seen = new Set();
  const rows = [];
  it.tiers.forEach(t => {
    (REVERSE_USAGE[t.asset] || []).forEach(u => {
      if(seen.has(u.item_asset)) return;
      seen.add(u.item_asset);
      const usedByItem = ITEM_BY_ASSET.get(u.item_asset);
      const name = usedByItem ? displayName(usedByItem) : u.item_asset;
      const icon = usedByItem ? usedByItem.icon : "game_data/icons/T_icon_unknown.webp";
      rows.push(`<div class="drop-item">
        <img class="drop-icon" src="${icon}" data-onerror="hide" alt="">
        <span class="drop-name">${name}</span>
        <span class="drop-qty">×${u.qty}</span>
      </div>`);
    });
  });
  if(!rows.length) return "";
  return `<div class="modal-section">
    <h4>この素材の使い道(製作材料として)</h4>
    <div class="drop-list">${rows.join("")}</div>
  </div>`;
}

function buildObtainHtml(it){
  if(typeof ITEM_OBTAIN_DATA === "undefined") return "";
  const sections = [];
  it.tiers.forEach(t => {
    const data = ITEM_OBTAIN_DATA[t.asset];
    if(!data) return;
    const label = it.isGroup && t.rarityName ? `<span style="color:${RARITY_COLORS[t.rarity]}">[${t.rarityName}]</span> ` : "";

    if(data.production){
      const matRows = data.production.materials.map(m => {
        const matItem = ITEM_BY_ASSET.get(m.item_asset);
        const matName = matItem ? (matItem.name_jp && matItem.name_jp !== "-" ? matItem.name_jp : matItem.name_en) : m.item_asset;
        const matIcon = matItem ? matItem.icon : null;
        return `<div class="drop-item">
          ${matIcon ? `<img class="drop-icon" src="${matIcon}" data-onerror="hide" alt="">` : ""}
          <span class="drop-name">${matName}</span>
          <span class="drop-qty">×${m.qty}</span>
        </div>`;
      }).join("");
      sections.push(`<div class="modal-section">
        <h4>${label}製作</h4>
        ${data.production.workbench_jp ? `<div class="obtain-box" style="margin-bottom:8px;"><span class="obtain-label">作業台</span>${data.production.workbench_jp}</div>` : ""}
        <div class="drop-list">${matRows}</div>
      </div>`);
    }

    if(data.dropped_by){
      const rows = data.dropped_by.map(r => {
        const icon = `game_data/icons/pals/T_${r.pal_asset}_icon_normal.webp`;
        return `<div class="drop-item">
          <img class="drop-icon" src="${icon}" data-onerror="hide" alt="">
          <span class="drop-name">${r.pal_jp_name}</span>
          <span class="drop-qty">×${r.qty}</span>
          <span class="drop-rate">${r.rate}</span>
        </div>`;
      }).join("");
      sections.push(`<div class="modal-section">
        <h4>${label}ドロップ</h4>
        <div class="drop-list">${rows}</div>
      </div>`);
    }

    if(data.special_source){
      const rows = data.special_source.map(s => `<div class="drop-item">
        <span class="drop-name">${s.source}${s.type ? `(${s.type})` : ""}</span>
        ${s.rate ? `<span class="drop-rate">${s.rate}</span>` : ""}
      </div>`).join("");
      sections.push(`<div class="modal-section">
        <h4>${label}入手方法</h4>
        <div class="drop-list">${rows}</div>
      </div>`);
    }
  });
  return sections.join("");
}

// 説明文は詳細を開いたときにしか使わないのに、以前は items_dex_data.js に同梱されていた
// (description_en 235KB + description_jp 124KB + キー名の繰り返し)。一覧のカード描画にも
// サイト内検索にも不要なので、開いたときだけ読む(技図鑑・パル図鑑と同じ形、2026-08-12)。
const DESC_SRC = "game_data/items_desc_data.js?v=f6f22682";
let descPromise = null;
function ensureDescriptions(){
  if(descPromise) return descPromise;
  descPromise = new Promise((resolve, reject) => {
    if(typeof ITEMS_DESC_DATA !== "undefined") return resolve();
    const el = document.createElement("script");
    el.src = DESC_SRC;   // ?v= は scripts/version_game_data.py が中身のハッシュで刻む
    el.onload = resolve;
    el.onerror = () => reject(new Error("failed: " + DESC_SRC));
    document.head.appendChild(el);
  });
  if(window.Arcade && window.Arcade.whileLoading){
    descPromise = window.Arcade.whileLoading(descPromise, "説明文を読み込み中");
  }
  return descPromise;
}

async function openModal(asset){
  // 読み込みに失敗しても詳細は出す。説明文の欄だけ空になる
  let desc = {};
  try {
    await ensureDescriptions();
    desc = (typeof ITEMS_DESC_DATA !== "undefined" && ITEMS_DESC_DATA[asset]) || {};
  } catch(e){
    desc = {};
  }
  const it = DISPLAY_ITEMS.find(x => x.asset === asset || x.tiers.some(t => t.asset === asset));
  if(!it) return;
  const name = displayName(it);
  const isEn = !it.name_jp || it.name_jp === "-";
  document.getElementById("detailContent").innerHTML = `
    <div class="detail-box">
      <div class="modal-head">
        <div class="icon-wrap"><img src="${it.icon}" data-onerror-src="game_data/icons/T_icon_unknown.webp" alt=""></div>
        <div>
          <h3>${name}${it.name_jp_literal ? ' <span class="literal-tag">(参考訳)</span>' : ''}</h3>
          ${it.name_en ? `<div class="en-name">${it.name_en}</div>` : isEn ? `<div class="en-name">(日本語名未判明・英語内部名)</div>` : ""}
        </div>
      </div>
      <div class="modal-stats">
        <div class="k">カテゴリ</div><div class="v">${it.category}${it.subcategory ? ' / '+subcategoryJp(it.subcategory) : ''}</div>
        ${it.category === "建築物" ? `
          <div class="k">テクノロジー解放Lv</div><div class="v">${it.tech_level}</div>
          <div class="k">コスト</div><div class="v">${it.tech_cost}</div>
        ` : it.isGroup
          ? `<div class="k">売却額</div><div class="v">₽${it.priceMin.toLocaleString()} 〜 ₽${it.priceMax.toLocaleString()}</div>
             <div class="k">重量</div><div class="v">${it.weight}</div>
             <div class="k">最大スタック数</div><div class="v">${it.max_stack.toLocaleString()}</div>`
          : `<div class="k">売却額</div><div class="v">₽${it.price.toLocaleString()}</div>
             <div class="k">重量</div><div class="v">${it.weight}</div>
             <div class="k">最大スタック数</div><div class="v">${it.max_stack.toLocaleString()}</div>`}
      </div>
      ${it.category !== "建築物" ? (it.isGroup ? buildStatTable(it) : buildSingleStats(it)) : ""}
      <div class="modal-desc">${desc.description_jp || desc.description_en || "(説明文なし)"}</div>
      <div class="detail-sections">
        ${buildObtainHtml(it)}
        ${buildUsedInHtml(it)}
      </div>
    </div>
  `;
  document.getElementById("listView").style.display = "none";
  document.getElementById("detailView").style.display = "block";
  window.scrollTo(0, 0);
  history.replaceState(null, "", `?asset=${encodeURIComponent(asset)}`);
}

function closeModal(){
  document.getElementById("detailView").style.display = "none";
  document.getElementById("listView").style.display = "block";
  history.replaceState(null, "", location.pathname);
}
document.getElementById("backBtn").addEventListener("click", closeModal);

document.getElementById("searchBox").addEventListener("input", e => { state.query = e.target.value; renderGrid(); });

renderChips();
renderGrid();

// 個別アイテムへの直リンク用: ?asset=<資産名>で該当アイテムの詳細を自動で開く
// (2026-07-22、アイテム全件に「詳細ページ」を持たせる依頼への対応。物理的に2466個の
// HTMLファイルを作る代わりに、パル図鑑・技図鑑・パッシブ図鑑と同じ「1ページ+クエリ
// パラメータでの詳細直リンク」方式に統一した)。
const initialAsset = new URLSearchParams(location.search).get("asset");
if(initialAsset && ITEM_BY_ASSET.has(initialAsset)) openModal(initialAsset);
