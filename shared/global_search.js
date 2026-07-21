// ===== サイト全体共通のスマート検索バー =====
// header.top内の#gsearchInput/#gsearchResultsに対して動作する(マークアップは各HTML側に
// 直書き、挙動だけここに集約)。「ソルライトインゴット 落とすパル」のようなドロップ元検索
// (旧palworld_search.htmlの機能を統合)に加え、パル名・ミッション名・ページ名の検索にも
// 対応し、該当ページへ直接遷移できるようにする(2026-07-21、サイト全体検索への拡張依頼)。
//
// 各ページはデフォルトでは検索に必要なデータ(アイテム/パル/ドロップ/ミッション)を
// 読み込んでいないため、検索欄に最初に触れた時点で必要なスクリプトを動的に注入して
// 遅延ロードする(全ページに1.5MB超のJSONを常時読ませるのは重すぎるため)。
(function(){
  const REQUIRED_SCRIPTS = [
    "game_data/items_dex_data.js",
    "game_data/dex_data.js",
    "game_data/items_obtain_data.js",
    "game_data/breeding_data.js",
    "game_data/missions_data.js",
    "game_data/skills_page_data.js",
    "game_data/passives_page_data.js",
  ];

  const PAGES = [
    { name: "ホーム", url: "palworld_home.html" },
    { name: "拠点プランナー", url: "palworld_base_planner_v2.html" },
    { name: "パル図鑑", url: "palworld_dex.html" },
    { name: "アイテム図鑑", url: "palworld_items.html" },
    { name: "技図鑑", url: "palworld_skills.html" },
    { name: "パッシブ図鑑", url: "palworld_passives.html" },
    { name: "配合検索", url: "palworld_breeding.html" },
    { name: "パルボックス", url: "palworld_palbox.html" },
    { name: "戦闘最適化", url: "palworld_combat.html" },
    { name: "最強Tier表", url: "palworld_tierlist.html" },
    { name: "ライド速度", url: "palworld_ride.html" },
    { name: "出現マップ", url: "palworld_map.html" },
    { name: "ボス攻略", url: "palworld_bossguide.html" },
    { name: "実績一覧", url: "palworld_achievements.html" },
    { name: "おすすめパッシブ", url: "palworld_passives_guide.html" },
    { name: "早見表", url: "palworld_reference.html" },
    { name: "テクノロジー", url: "palworld_technology.html" },
    { name: "ミッション一覧", url: "palworld_missions.html" },
    { name: "素質値計算機", url: "palworld_iv_calc.html" },
    { name: "パーティ編成ガイド", url: "palworld_party_guide.html" },
    { name: "拠点位置ガイド", url: "palworld_base_spots.html" },
    { name: "更新履歴", url: "palworld_changelog.html" },
  ];

  const DROP_KEYWORDS = ["落とす","落ちる","おとす","おちる","ドロップ","入手方法","入手できる","入手先","産出"];
  const CRAFT_KEYWORDS = ["作る","作れる","つくる","材料","レシピ","クラフト","製作"];
  const PAL_FILTER_KEYWORDS = ["パル"];
  const HUMAN_FILTER_KEYWORDS = ["人間","にんげん","npc","人"];
  const TRAILING_PARTICLES = ["という","っていう","って","からは","までは","には","では","にも","の方","のほう","から","まで","を","が","は","も","に","で","と","の"];

  function toKana(str){
    return (str||"").replace(/[ぁ-ゖ]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60));
  }
  function normalize(s){
    return toKana((s||"").trim().toLowerCase());
  }
  function stripParticles(s){
    let changed = true;
    while(changed){
      changed = false;
      for(const p of TRAILING_PARTICLES){
        if(s.length > p.length && s.endsWith(p)){ s = s.slice(0, -p.length); changed = true; }
      }
    }
    return s;
  }

  let dataReady = false;
  let loadingPromise = null;
  let ITEM_ENTITIES = [], DROPPER_ENTITIES = [], DROPPER_INFO = {}, REVERSE_DROPS = {}, ITEM_BY_ASSET = new Map();
  let PAL_ENTITIES = [], MISSION_ENTITIES = [], PAGE_ENTITIES = [], SKILL_ENTITIES = [], PASSIVE_ENTITIES = [];

  function loadScript(src){
    if(document.querySelector(`script[src="${src}"]`)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("failed to load " + src));
      document.head.appendChild(s);
    });
  }

  function ensureDataLoaded(){
    if(dataReady) return Promise.resolve();
    if(loadingPromise) return loadingPromise;
    loadingPromise = Promise.all(REQUIRED_SCRIPTS.map(loadScript)).then(buildIndices).then(() => {
      dataReady = true;
    });
    return loadingPromise;
  }

  function isRealItem(it){
    return !/test|debug|dummy/i.test(it.asset) && !/dummy/i.test(it.icon);
  }

  function buildIndices(){
    ITEM_BY_ASSET = new Map(ITEMS_DEX_DATA.map(it => [it.asset, it]));
    ITEM_ENTITIES = ITEMS_DEX_DATA.filter(isRealItem).flatMap(it => {
      const names = new Set([it.name_jp, it.name_en, it.asset].filter(Boolean));
      return [...names].map(n => ({ text: normalize(n), asset: it.asset, item: it }));
    }).sort((a,b) => b.text.length - a.text.length);

    DROPPER_INFO = {};
    Object.entries(ITEM_OBTAIN_DATA).forEach(([itemAsset, v]) => {
      (v.dropped_by || []).forEach(d => {
        if(!DROPPER_INFO[d.pal_asset]){
          const bd = (typeof BREEDING_DATA !== "undefined" && BREEDING_DATA.pals) ? BREEDING_DATA.pals[d.pal_asset] : null;
          DROPPER_INFO[d.pal_asset] = { jp_name: d.pal_jp_name, isPal: !!bd, en_name: bd ? bd.en_name : null, canonical_jp_name: bd ? bd.jp_name : null };
        }
      });
    });
    DROPPER_ENTITIES = Object.entries(DROPPER_INFO).flatMap(([asset, info]) => {
      const names = new Set([info.jp_name, info.en_name, info.canonical_jp_name, asset].filter(Boolean));
      return [...names].map(n => ({ text: normalize(n), asset, isPal: info.isPal }));
    }).sort((a,b) => b.text.length - a.text.length);

    REVERSE_DROPS = {};
    Object.entries(ITEM_OBTAIN_DATA).forEach(([itemAsset, v]) => {
      (v.dropped_by || []).forEach(d => {
        (REVERSE_DROPS[d.pal_asset] = REVERSE_DROPS[d.pal_asset] || []).push({ item_asset: itemAsset, qty: d.qty, rate: d.rate });
      });
    });

    // パル図鑑への直接遷移用(例: 「ツッパニャン」で検索するとパル図鑑の詳細ページへ)。
    PAL_ENTITIES = PAL_DEX_DATA.flatMap(p => {
      const names = new Set([p.name, p.en_name].filter(Boolean));
      return [...names].map(n => ({ text: normalize(n), id: p.id, pal: p }));
    }).sort((a,b) => b.text.length - a.text.length);

    MISSION_ENTITIES = MISSIONS_DATA.map(m => ({ text: normalize(m.title), id: m.id, mission: m }))
      .sort((a,b) => b.text.length - a.text.length);

    PAGE_ENTITIES = PAGES.map(p => ({ text: normalize(p.name), page: p }))
      .sort((a,b) => b.text.length - a.text.length);

    // 技図鑑・パッシブ図鑑への直接遷移用(2026-07-21、詳細ページ新設に合わせて追加)。
    SKILL_ENTITIES = SKILLS_PAGE_DATA.flatMap(s => {
      const names = new Set([s.name_jp, s.name_en].filter(Boolean));
      return [...names].map(n => ({ text: normalize(n), skill: s }));
    }).sort((a,b) => b.text.length - a.text.length);

    PASSIVE_ENTITIES = PASSIVES_PAGE_DATA.map(p => ({ text: normalize(p.name_jp), passive: p }))
      .sort((a,b) => b.text.length - a.text.length);
  }

  function exactMatch(core, entities){
    return entities.find(e => e.text === core) || null;
  }
  function fuzzyMatch(core, entities){
    if(core.length < 2) return null;
    const containing = entities.filter(e => e.text.length >= 2 && e.text.includes(core));
    if(containing.length) return containing.reduce((a,b) => a.text.length <= b.text.length ? a : b);
    const contained = entities.filter(e => e.text.length >= 2 && core.includes(e.text));
    if(contained.length) return contained.reduce((a,b) => a.text.length >= b.text.length ? a : b);
    return null;
  }

  // 実体候補: アイテム/ドロップ元パル/パル図鑑/ミッション/ページ名、全部をまとめて
  // 1つの候補プールとして最長一致法にかける。優先度は種類でなく一致の強さ(完全一致優先)。
  // ただし「パル」と「ドロップ元パル」は同じパルが両方に登場することが多い
  // (ほぼ全パルが何かをドロップするため)。「落とす/ドロップ」キーワードが
  // 無い素のパル名検索(例:「ツッパニャン」)はパル図鑑への遷移を優先し、
  // キーワードがある時だけドロップ元(逆引き)を優先する
  // (2026-07-21、「ツッパニャン」で検索してもパル図鑑が開かず、ドロップ品
  // 逆引きが先に出てしまう不具合がテストで見つかったため)。
  function entityPools(hasDrop){
    const base = [
      { kind: "item", entities: ITEM_ENTITIES },
      { kind: "pal", entities: PAL_ENTITIES },
      { kind: "skill", entities: SKILL_ENTITIES },
      { kind: "passive", entities: PASSIVE_ENTITIES },
      { kind: "dropper", entities: DROPPER_ENTITIES },
      { kind: "mission", entities: MISSION_ENTITIES },
      { kind: "page", entities: PAGE_ENTITIES },
    ];
    if(hasDrop){
      const i = base.findIndex(p => p.kind === "pal");
      const j = base.findIndex(p => p.kind === "dropper");
      [base[i], base[j]] = [base[j], base[i]];
    }
    return base;
  }
  function exactMatchOnly(core, hasDrop){
    for(const pool of entityPools(hasDrop)){
      const m = exactMatch(core, pool.entities);
      if(m) return { kind: pool.kind, match: m };
    }
    return null;
  }
  function fuzzyMatchOnly(core, hasDrop){
    for(const pool of entityPools(hasDrop)){
      const m = fuzzyMatch(core, pool.entities);
      if(m) return { kind: pool.kind, match: m };
    }
    return null;
  }

  function parseQuery(raw){
    let norm = normalize(raw);
    const strip = (text, arr) => {
      let found = false;
      arr.forEach(k => {
        const kn = normalize(k);
        if(kn && text.includes(kn)){ found = true; text = text.split(kn).join(""); }
      });
      return { text, found };
    };
    let r = strip(norm, CRAFT_KEYWORDS);
    const hasCraft = r.found;
    r = strip(r.text, DROP_KEYWORDS);
    const hasDrop = r.found;

    const coreRaw = stripParticles(r.text.trim());
    let rf = strip(r.text, PAL_FILTER_KEYWORDS);
    const palStripped = rf.found;
    rf = strip(rf.text, HUMAN_FILTER_KEYWORDS);
    const humanStripped = rf.found;
    const coreStripped = stripParticles(rf.text.trim());
    const filterWasStripped = palStripped || humanStripped;

    let found = exactMatchOnly(coreRaw, hasDrop);
    let core = coreRaw, palOnly = false, humanOnly = false;
    if(!found && filterWasStripped){
      found = exactMatchOnly(coreStripped, hasDrop);
      if(found){ core = coreStripped; palOnly = palStripped; humanOnly = humanStripped; }
    }
    if(!found && filterWasStripped){
      found = fuzzyMatchOnly(coreStripped, hasDrop);
      if(found){ core = coreStripped; palOnly = palStripped; humanOnly = humanStripped; }
    }
    if(!found){
      found = fuzzyMatchOnly(coreRaw, hasDrop);
      if(found) core = coreRaw;
    }

    return { core, found, hasCraft, hasDrop, palOnly, humanOnly };
  }

  function displayName(it){
    return (it.name_jp && it.name_jp !== "-") ? it.name_jp : it.name_en;
  }
  function palIcon(asset){
    return `game_data/icons/pals/T_${asset}_icon_normal.webp`;
  }
  function esc(s){
    return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }

  function dropItemRow(d){
    return `<div class="gsearch-row gsearch-subrow">
      <img class="gsearch-icon" src="${palIcon(d.pal_asset)}" onerror="this.style.display='none'" alt="">
      <span class="gsearch-name">${esc(d.pal_jp_name)}</span>
      <span class="gsearch-meta">×${esc(d.qty)} ${esc(d.rate)}</span>
    </div>`;
  }
  function materialRow(m){
    const it = ITEM_BY_ASSET.get(m.item_asset);
    const name = it ? displayName(it) : m.item_asset;
    const icon = it ? it.icon : "game_data/icons/T_icon_unknown.webp";
    return `<div class="gsearch-row gsearch-subrow">
      <img class="gsearch-icon" src="${icon}" onerror="this.style.display='none'" alt="">
      <span class="gsearch-name">${esc(name)}</span>
      <span class="gsearch-meta">×${esc(m.qty)}</span>
    </div>`;
  }
  function reverseItemRow(r){
    const it = ITEM_BY_ASSET.get(r.item_asset);
    const name = it ? displayName(it) : r.item_asset;
    const icon = it ? it.icon : "game_data/icons/T_icon_unknown.webp";
    return `<div class="gsearch-row gsearch-subrow">
      <img class="gsearch-icon" src="${icon}" onerror="this.style.display='none'" alt="">
      <span class="gsearch-name">${esc(name)}</span>
      <span class="gsearch-meta">×${esc(r.qty)} ${esc(r.rate)}</span>
    </div>`;
  }

  function renderItemResult(item, p){
    const obtain = ITEM_OBTAIN_DATA[item.asset];
    let html = `<div class="gsearch-row gsearch-head">
      <img class="gsearch-icon" src="${item.icon}" onerror="this.style.display='none'" alt="">
      <span class="gsearch-name">${esc(displayName(item))}</span>
      <span class="gsearch-tag">アイテム</span>
    </div>`;
    if(!obtain){
      return html + `<div class="gsearch-empty">入手方法データはまだ登録されていません。</div>`;
    }
    const wantCraft = p.hasCraft && !p.hasDrop;
    const wantDrop = p.hasDrop && !p.hasCraft;
    const wantBoth = !p.hasCraft && !p.hasDrop;

    if((wantDrop || wantBoth) && obtain.dropped_by){
      let rows = obtain.dropped_by;
      if(p.palOnly) rows = rows.filter(d => DROPPER_INFO[d.pal_asset] && DROPPER_INFO[d.pal_asset].isPal);
      if(p.humanOnly) rows = rows.filter(d => !(DROPPER_INFO[d.pal_asset] && DROPPER_INFO[d.pal_asset].isPal));
      html += `<div class="gsearch-subhead">ドロップ元${p.palOnly ? "(パル限定)" : p.humanOnly ? "(人間NPC限定)" : ""}</div>`;
      html += rows.length ? rows.map(dropItemRow).join("") : `<div class="gsearch-empty">条件に合うドロップ元がありません。</div>`;
    }
    if((wantCraft || wantBoth) && obtain.production){
      html += `<div class="gsearch-subhead">製作材料</div>`;
      if(obtain.production.workbench_jp) html += `<div class="gsearch-empty">作業台: ${esc(obtain.production.workbench_jp)}</div>`;
      html += obtain.production.materials.map(materialRow).join("");
    }
    if(wantCraft && !obtain.production) html += `<div class="gsearch-empty">製作材料のデータはありません。</div>`;
    if(wantDrop && !obtain.dropped_by) html += `<div class="gsearch-empty">ドロップ元のデータはありません。</div>`;
    html += `<a class="gsearch-row gsearch-link" href="palworld_items.html?asset=${encodeURIComponent(item.asset)}" style="margin-top:6px;justify-content:center;color:var(--teal);">アイテム図鑑で詳細ページを見る(使い道も掲載)→</a>`;
    return html;
  }

  function renderDropperResult(asset, info){
    const rows = REVERSE_DROPS[asset] || [];
    let html = `<div class="gsearch-row gsearch-head">
      <img class="gsearch-icon" src="${palIcon(asset)}" onerror="this.style.display='none'" alt="">
      <span class="gsearch-name">${esc(info.jp_name)}</span>
      <span class="gsearch-tag">${info.isPal ? "パル" : "人間NPC"}</span>
    </div>`;
    html += `<div class="gsearch-subhead">ドロップするアイテム</div>`;
    html += rows.length ? rows.map(reverseItemRow).join("") : `<div class="gsearch-empty">ドロップ品のデータがありません。</div>`;
    return html;
  }

  function renderPalResult(entry){
    const p = entry.pal;
    return `<a class="gsearch-row gsearch-head gsearch-link" href="palworld_dex.html?id=${encodeURIComponent(p.id)}">
      <img class="gsearch-icon" src="${p.icon}" onerror="this.style.display='none'" alt="">
      <span class="gsearch-name">${esc(p.name)}<span class="gsearch-en">${esc(p.en_name || "")}</span></span>
      <span class="gsearch-tag">パル図鑑を開く</span>
    </a>`;
  }
  function renderMissionResult(entry){
    const m = entry.mission;
    return `<a class="gsearch-row gsearch-head gsearch-link" href="palworld_missions.html?id=${encodeURIComponent(m.id)}">
      <span class="gsearch-name">${esc(m.title)}<span class="gsearch-en">${esc(m.category)}</span></span>
      <span class="gsearch-tag">ミッション詳細</span>
    </a>`;
  }
  function renderPageResult(entry){
    const pg = entry.page;
    return `<a class="gsearch-row gsearch-head gsearch-link" href="${pg.url}">
      <span class="gsearch-name">${esc(pg.name)}</span>
      <span class="gsearch-tag">ページを開く</span>
    </a>`;
  }
  function renderSkillResult(entry){
    const s = entry.skill;
    return `<a class="gsearch-row gsearch-head gsearch-link" href="palworld_skills.html?asset=${encodeURIComponent(s.asset)}">
      <img class="gsearch-icon" src="${s.element_icon}" onerror="this.style.display='none'" alt="" style="filter:brightness(0) invert(1);">
      <span class="gsearch-name">${esc(s.name_jp)}<span class="gsearch-en">${esc(s.element_jp)} / 威力${s.power}</span></span>
      <span class="gsearch-tag">技の詳細を開く</span>
    </a>`;
  }
  function renderPassiveResult(entry){
    const p = entry.passive;
    return `<a class="gsearch-row gsearch-head gsearch-link" href="palworld_passives.html?asset=${encodeURIComponent(p.asset)}">
      <img class="gsearch-icon" src="${p.icon}" onerror="this.style.display='none'" alt="">
      <span class="gsearch-name">${esc(p.name_jp)}<span class="gsearch-en">${p.rank >= 0 ? "ランク" + p.rank : "マイナス効果"}</span></span>
      <span class="gsearch-tag">パッシブの詳細を開く</span>
    </a>`;
  }

  function fallbackSuggestions(core, box){
    if(!core){
      box.innerHTML = `<div class="gsearch-empty">アイテム名・パル名・ページ名などを入力してください。</div>`;
      return;
    }
    const rows = [];
    const seen = new Set();
    entityPools().forEach(pool => {
      pool.entities.filter(e => e.text.includes(core) || core.includes(e.text)).slice(0, 4).forEach(e => {
        const key = pool.kind + ":" + (e.asset || e.id || e.text);
        if(seen.has(key)) return; seen.add(key);
        if(pool.kind === "item") rows.push({ kind: "item", entry: e });
        if(pool.kind === "dropper") rows.push({ kind: "dropper", entry: e });
        if(pool.kind === "pal") rows.push(renderPalResult(e));
        if(pool.kind === "skill") rows.push(renderSkillResult(e));
        if(pool.kind === "passive") rows.push(renderPassiveResult(e));
        if(pool.kind === "mission") rows.push(renderMissionResult(e));
        if(pool.kind === "page") rows.push(renderPageResult(e));
      });
    });
    if(!rows.length){
      box.innerHTML = `<div class="gsearch-empty">「${esc(core)}」に一致する候補が見つかりませんでした。</div>`;
      return;
    }
    box.innerHTML = `<div class="gsearch-subhead">「${esc(core)}」に近い候補</div>` + rows.map(r => {
      if(typeof r === "string") return r;
      if(r.kind === "item") return `<div class="gsearch-row gsearch-link" data-item-asset="${esc(r.entry.asset)}">
        <img class="gsearch-icon" src="${r.entry.item.icon}" onerror="this.style.display='none'" alt="">
        <span class="gsearch-name">${esc(displayName(r.entry.item))}</span><span class="gsearch-tag">アイテム</span></div>`;
      if(r.kind === "dropper") return `<div class="gsearch-row gsearch-link" data-dropper-asset="${esc(r.entry.asset)}">
        <img class="gsearch-icon" src="${palIcon(r.entry.asset)}" onerror="this.style.display='none'" alt="">
        <span class="gsearch-name">${esc(DROPPER_INFO[r.entry.asset].jp_name)}</span><span class="gsearch-tag">${DROPPER_INFO[r.entry.asset].isPal ? "パル" : "人間NPC"}</span></div>`;
      return "";
    }).join("");
    box.querySelectorAll("[data-item-asset]").forEach(el => {
      el.addEventListener("click", () => {
        const item = ITEM_BY_ASSET.get(el.dataset.itemAsset);
        box.innerHTML = renderItemResult(item, { hasCraft:false, hasDrop:false, palOnly:false, humanOnly:false });
      });
    });
    box.querySelectorAll("[data-dropper-asset]").forEach(el => {
      el.addEventListener("click", () => {
        box.innerHTML = renderDropperResult(el.dataset.dropperAsset, DROPPER_INFO[el.dataset.dropperAsset]);
      });
    });
  }

  function runSearch(raw, box){
    if(!raw || !raw.trim()){
      box.classList.remove("open");
      box.innerHTML = "";
      return;
    }
    box.classList.add("open");
    const p = parseQuery(raw);
    if(!p.found){
      fallbackSuggestions(p.core, box);
      return;
    }
    if(p.found.kind === "item"){ box.innerHTML = renderItemResult(p.found.match.item, p); return; }
    if(p.found.kind === "dropper"){ box.innerHTML = renderDropperResult(p.found.match.asset, DROPPER_INFO[p.found.match.asset]); return; }
    if(p.found.kind === "pal"){ box.innerHTML = renderPalResult(p.found.match); return; }
    if(p.found.kind === "skill"){ box.innerHTML = renderSkillResult(p.found.match); return; }
    if(p.found.kind === "passive"){ box.innerHTML = renderPassiveResult(p.found.match); return; }
    if(p.found.kind === "mission"){ box.innerHTML = renderMissionResult(p.found.match); return; }
    if(p.found.kind === "page"){ box.innerHTML = renderPageResult(p.found.match); return; }
  }

  function init(){
    const input = document.getElementById("gsearchInput");
    const box = document.getElementById("gsearchResults");
    if(!input || !box) return;

    let pendingQuery = null;
    input.addEventListener("focus", () => {
      ensureDataLoaded().then(() => {
        if(pendingQuery !== null) runSearch(pendingQuery, box);
      });
    });
    input.addEventListener("input", e => {
      const val = e.target.value;
      if(!dataReady){
        pendingQuery = val;
        box.classList.add("open");
        box.innerHTML = `<div class="gsearch-empty">検索データを読み込み中…</div>`;
        ensureDataLoaded().then(() => runSearch(input.value, box));
        return;
      }
      runSearch(val, box);
    });
    document.addEventListener("click", e => {
      if(!box.contains(e.target) && e.target !== input) box.classList.remove("open");
    });
    input.addEventListener("keydown", e => {
      if(e.key === "Escape"){ box.classList.remove("open"); input.blur(); }
    });

    // 実験用: window.__gsearchDebugからparseQuery等に直接アクセスできるようにしておく
    // (2026-07-21、100件規模のテストで使う想定)。
    window.__gsearchDebug = { ensureDataLoaded, parseQuery, runSearch: (q) => runSearch(q, box) };
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
