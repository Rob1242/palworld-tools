// ══════════════════════════════════════════════════════════════
// ビュー切り替え(地図/パル像コンプリート/ミッション/拠点おすすめ)
// ══════════════════════════════════════════════════════════════
// SEO対策: 各ビューは中身が別物(パル像チェックリスト/ミッション一覧/拠点おすすめ)
// なのに、JSでdisplay:noneを切り替えているだけなので生HTMLはどの?view=でも同一
// だった。canonical/title/descriptionが常に「出現マップ」固定だったため、Search
// Consoleに「重複しています。ユーザーにより、正規ページとして選択されていません」
// と検出された(2026-07-30、颯太からのSearch Consoleメール通知で発覚)。
// 統合前の旧ページ(palworld_statues.html等)のcanonicalは元々この?view=単位を
// 正規URLとして指しているため、ここでも?view=単位で自己参照canonicalを持たせて
// 一致させる。
const BASE_URL = "https://rob1242.github.io/palworld-tools/palworld_map.html";
const VIEW_META = {
  map: {
    title: "出現マップ | Palworld攻略ツール",
    desc: "パルワールドの出現マップ。パルの出現場所を昼夜・野生/ボス別に地図表示。塔ボス・商人・ファストトラベル・おすすめ拠点なども重ねて確認できます。",
  },
  statues: {
    title: "パル像コンプリート | Palworld攻略ツール",
    desc: "パルワールドのパル像(エフィジー)コンプリートチェックリスト。本土・世界樹エリア合わせて全12種407体の位置を地図で確認し、回収済みを記録できます。",
  },
  missions: {
    title: "ミッション一覧 | Palworld攻略ツール",
    desc: "パルワールドのミッション一覧。メイン・サブミッションの内容と場所を地図と合わせて確認できます。",
  },
  basespots: {
    title: "拠点おすすめ | Palworld攻略ツール",
    desc: "パルワールドのおすすめ拠点位置ガイド。座標付きで地図上に表示し、各拠点の推奨理由もあわせて確認できます。",
  },
};
function applyViewMeta(view){
  // viewはURLパラメータ(?view=)由来なので、VIEW_METAに実在するキーだけを受け付ける。
  // Object.prototype由来のキー("__proto__"や"constructor")を渡されると
  // VIEW_META[view]が中身の無いオブジェクトとして真になり、後続でエラーになるため
  // hasOwnProperty相当の判定で弾いてmapビューに倒す(2026-08)。
  if(!Object.prototype.hasOwnProperty.call(VIEW_META, view)) view = "map";
  const meta = VIEW_META[view];
  const url = view === "map" ? BASE_URL : `${BASE_URL}?view=${view}`;
  document.getElementById("pageTitle").textContent = meta.title;
  document.getElementById("metaDesc").setAttribute("content", meta.desc);
  document.getElementById("ogTitle").setAttribute("content", meta.title);
  document.getElementById("ogDesc").setAttribute("content", meta.desc);
  document.getElementById("ogUrl").setAttribute("content", url);
  document.getElementById("canonicalTag").setAttribute("href", url);
  const ld = JSON.parse(document.getElementById("ldJson").textContent);
  ld.name = meta.title.split(" | ")[0];
  ld.description = meta.desc;
  ld.url = url;
  document.getElementById("ldJson").textContent = JSON.stringify(ld);
}

function switchView(view, updateUrl){
  document.querySelectorAll(".view-tab").forEach(t => t.classList.toggle("active", t.dataset.view === view));
  document.getElementById("mapView").style.display = view === "map" ? "" : "none";
  document.getElementById("statuesView").style.display = view === "statues" ? "" : "none";
  document.getElementById("missionsView").style.display = view === "missions" ? "" : "none";
  document.getElementById("basespotsView").style.display = view === "basespots" ? "" : "none";
  applyViewMeta(view);
  // パル像マップ(stMap)は#statuesViewがdisplay:noneの間に初期化されるとLeafletが
  // コンテナサイズを0のまま覚えてしまうため、タブ表示のたびに再計算させる(2026-07-30)。
  if(view === "statues" && window.__statueMapOnShow) window.__statueMapOnShow();
  // 初回ロード時のURL(?view=missions&id=...等)はここで消してしまうと、
  // 後続スクリプト(ミッション詳細の自動オープン等)がidを読めなくなるため、
  // タブを実際にクリックした時だけURLを書き換える(2026-07-27)。
  if(updateUrl !== false){
    history.replaceState(null, "", view === "map" ? location.pathname : `?view=${view}`);
  }
}
document.querySelectorAll(".view-tab").forEach(tab => {
  tab.addEventListener("click", () => switchView(tab.dataset.view));
});

const PAL_BY_DEXID = {};
PAL_DEX_DATA.forEach(p => { PAL_BY_DEXID[p.id] = p; });

function buildPalList(spawnData){
  return spawnData.pals
    .map(s => ({ spawn: s, dex: PAL_BY_DEXID[s.dexId] }))
    .filter(x => x.dex)
    .map(x => ({
      dexId: x.spawn.dexId,
      name: x.dex.name,
      enName: x.dex.en_name,
      icon: x.dex.icon,
      spawn: x.spawn,
    }));
}

const PAL_LISTS = {
  palpagos: buildPalList(SPAWN_DATA),
  worldtree: buildPalList(WORLDTREE_SPAWN_DATA),
};

const LANDMARK_KIND_LABEL = { boss: "ボスの塔", fasttravel: "ファストトラベル" };
const CURATED_TYPE_LABEL = {
  "Alpha Pal": "フィールドボス", "Dungeon": "ダンジョン", "Ancient Ruin": "古代遺跡",
  "NPC": "NPC", "Bounty": "懸賞金対象", "City": "集落のパル", "Incident": "遭遇イベント",
  "Tower Boss": "塔ボス", "Merchant": "商人", "Fast Travel": "ファストトラベル/観測塔",
  "Recommend Base": "おすすめ拠点",
};
const CURATED_TYPE_COLOR = {
  "Alpha Pal": "#e2543f", "Dungeon": "#6ec8ea", "Ancient Ruin": "#c9a86a",
  "NPC": "#3d7bff", "Bounty": "#f0a233", "City": "#7bdb52", "Incident": "#8064b8",
  "Tower Boss": "#ff6ec7", "Merchant": "#ffd23d", "Fast Travel": "#3ddbc0",
  "Recommend Base": "#a3e635",
};
const curatedState = { active: new Set() };

// フィールドボスは旧来のCURATED_LANDMARKS_DATA(本島限定・簡易情報)ではなく、
// より詳しいFIELD_BOSS_DATA(二つ名・レベル・世界樹エリア9体を含む計92件)を使う。
// 塔ボス・商人・ファストトラベルは新規レイヤーとしてここに合流させる(2026-07-27)。
const EXTRA_CURATED_DATA = [
  ...CURATED_LANDMARKS_DATA.filter(p => p.type !== "Alpha Pal").map(p => ({ ...p, region: "palpagos" })),
  ...FIELD_BOSS_DATA.map(b => ({
    type: "Alpha Pal", name: b.title_jp ? `${b.title_jp} ${b.jp_name}` : b.jp_name,
    x: b.x, y: b.y, lv: b.level, region: b.region,
  })),
  ...TOWER_BOSS_DATA.map(t => ({
    type: "Tower Boss", name: `${t.name}(${t.boss})`, x: t.x, y: t.y, lv: t.level, region: t.region,
  })),
  ...MERCHANT_DATA.map(m => ({
    type: "Merchant", name: m.name, x: m.x, y: m.y, lv: m.level, region: m.region,
  })),
  ...FAST_TRAVEL_MAP_DATA.map(f => ({
    type: "Fast Travel", name: (f.name_jp || f.name_en) + (f.kind === "watchtower" ? "(観測塔)" : ""),
    x: f.x, y: f.y, region: f.region,
  })),
  ...BASE_SPOTS_RECOMMEND_DATA.map(b => ({
    type: "Recommend Base", name: b.name, reason: b.reason, sources: b.sources,
    x: b.x, y: b.y, region: b.region,
  })),
];

const state = {
  region: "palpagos",
  pal: null,
  kind: "wild",
  time: "both",
  viewMode: "cluster", // "cluster"=集計バブル(既定) / "density"=生座標を点群で描くCanvas表示
};

// ===== Leaflet地図(パル像ビューと同じCRS.Simple + タイルピラミッド方式) =====
const TILE_WORLD_SIZE = 256; // ズーム4(maxNativeZoom)で256*2^4=4096px=実タイル解像度に一致
function xyToLatLng(x, y){
  return L.latLng(-y * TILE_WORLD_SIZE, x * TILE_WORLD_SIZE);
}
function latLngToXy(latlng){
  return { x: latlng.lng / TILE_WORLD_SIZE, y: -latlng.lat / TILE_WORLD_SIZE };
}

const mapBounds = L.latLngBounds([-TILE_WORLD_SIZE, 0], [0, TILE_WORLD_SIZE]);
const mapMap = L.map("mapViewport", {
  crs: L.CRS.Simple,
  minZoom: 0,
  maxZoom: 5,
  zoomControl: false,
  attributionControl: false,
});
mapMap.fitBounds(mapBounds);

let mapTileLayer = null;
function setMapTiles(region){
  if(mapTileLayer) mapMap.removeLayer(mapTileLayer);
  mapTileLayer = L.tileLayer(`game_data/maps/tiles/${region}/{z}/{x}_{y}.webp`, {
    tileSize: 256,
    minZoom: 0,
    maxZoom: 5,
    minNativeZoom: 0,
    maxNativeZoom: 4,
    noWrap: true,
    bounds: mapBounds,
  }).addTo(mapMap);
}

const bubbleLayerGroup = L.layerGroup().addTo(mapMap);
const curatedLayerGroup = L.layerGroup().addTo(mapMap);
const landmarkLayerGroup = L.layerGroup().addTo(mapMap);
const customMarkerLayerGroup = L.layerGroup().addTo(mapMap);
let densityOverlay = null;

mapMap.on("mousemove", e => {
  const { x, y } = latLngToXy(e.latlng);
  const el = document.getElementById("coordReadout");
  if(x < 0 || x > 1 || y < 0 || y > 1){ el.textContent = "X: — Y: —"; return; }
  el.textContent = `X: ${x.toFixed(3)} Y: ${y.toFixed(3)}`;
});

mapMap.on("click", e => {
  if(!markerModeState.active) return;
  addCustomMarker(latLngToXy(e.latlng));
});

document.getElementById("zoomInBtn").addEventListener("click", () => mapMap.zoomIn());
document.getElementById("zoomOutBtn").addEventListener("click", () => mapMap.zoomOut());
function setupPicker(){
  const wrap = document.getElementById("mapPicker");
  const input = wrap.querySelector("input");
  const results = wrap.querySelector(".pal-picker-results");
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    if(!q){ results.style.display = "none"; return; }
    const qKana = toKana(q);
    const matches = PAL_LISTS[state.region]
      .filter(p => toKana(p.name.toLowerCase()).includes(qKana) || (p.enName || "").toLowerCase().includes(q))
      .slice(0, 30);
    results.innerHTML = matches.length
      ? matches.map(p => `
          <div class="pal-picker-item" data-dexid="${p.dexId}">
            ${p.icon ? `<img src="${p.icon}" alt="">` : ""}<span>${p.name}</span>
          </div>`).join("")
      : `<div class="pal-picker-item">見つかりません</div>`;
    results.querySelectorAll(".pal-picker-item[data-dexid]").forEach(el => {
      el.addEventListener("click", () => {
        input.value = "";
        results.style.display = "none";
        selectPal(el.dataset.dexid);
      });
    });
    results.style.display = "block";
  });
  input.addEventListener("blur", () => setTimeout(() => results.style.display = "none", 150));
}

function selectPal(dexId){
  const p = PAL_LISTS[state.region].find(x => x.dexId === dexId);
  if(!p) return;
  state.pal = p;
  const selPalIcon = document.getElementById("selPalIcon");
  selPalIcon.style.display = p.icon ? "" : "none";
  if(p.icon) selPalIcon.src = p.icon;
  document.getElementById("selPalName").textContent = p.name;
  document.getElementById("selectedPalBox").style.display = "flex";
  document.getElementById("mapSection").style.display = "block";
  document.getElementById("emptyHint").style.display = "none";
  document.getElementById("zoneDetail").style.display = "none";

  const hasAlpha = !!(p.spawn.alphaZones && p.spawn.alphaZones.length);
  const alphaBtn = document.querySelector('#kindToggle [data-kind="alpha"]');
  alphaBtn.disabled = !hasAlpha;
  state.kind = "wild";
  document.querySelectorAll("#kindToggle .toggle-btn").forEach(b => b.classList.toggle("active", b.dataset.kind === "wild"));

  renderZones();
}

function currentZones(){
  if(!state.pal) return [];
  const key = state.kind === "alpha" ? "alphaZones" : "wildZones";
  const zones = state.pal.spawn[key] || [];
  if(state.time === "both") return zones;
  return zones.filter(z => z.availability === "both" || z.availability === "mixed" || z.availability === state.time);
}

// availCode: 0=昼夜問わず, 1=昼のみ, 2=夜のみ, 3=昼夜混在(build_spawn_data.pyのAVAILABILITY_CODEと対応)
const AVAILABILITY_BY_CODE = ["both", "day", "night", "mixed"];
function currentPoints(){
  if(!state.pal) return [];
  const key = state.kind === "alpha" ? "alphaPoints" : "wildPoints";
  const flat = state.pal.spawn[key] || [];
  const points = [];
  for(let i = 0; i < flat.length; i += 3){
    const availability = AVAILABILITY_BY_CODE[flat[i+2]] || "mixed";
    if(state.time !== "both" && availability !== "both" && availability !== "mixed" && availability !== state.time) continue;
    points.push({ x: flat[i], y: flat[i+1] });
  }
  return points;
}

function zoneBubbleIcon(z, isAlpha){
  const glowSize = Math.round(40 + Math.min(70, Math.log2(z.count + 1) * 16));
  const coreSize = Math.round(14 + Math.min(18, Math.log2(z.count + 1) * 4));
  return L.divIcon({
    className: "zone-bubble-icon" + (isAlpha ? " alpha" : ""),
    html: `<div class="zb-core" style="width:${coreSize}px;height:${coreSize}px;font-size:${Math.max(10, coreSize*0.42)}px;"><span class="zb-count">${z.count}</span></div>`,
    iconSize: [glowSize, glowSize],
    iconAnchor: [glowSize/2, glowSize/2],
  });
}

function renderZones(){
  const zones = currentZones();
  document.getElementById("zoneCountTag").textContent = zones.length
    ? `${zones.length}エリア / 合計${zones.reduce((s,z)=>s+z.count,0)}体分の記録`
    : "該当エリアなし";
  fitViewToZones(zones);

  const isDensity = state.viewMode === "density";
  bubbleLayerGroup.clearLayers();
  if(densityOverlay){ mapMap.removeLayer(densityOverlay); densityOverlay = null; }
  if(isDensity){ renderDensity(currentPoints()); return; }

  // グロー(外側のふわっとした半透明の輪)のサイズは「今表示中のパルの中での最大件数」比ではなく、
  // 件数そのものの絶対値で決める。相対値だとエレパンダのように記録が1エリアしかないパルの場合、
  // その1件が(自分自身が最大なので)常に最大サイズになってしまい、逆にどこにあるか分かりにくかった
  // (2026-07-16、ユーザー指摘)。さらに、地図を覆い隠す固いソリッド円だと下の地形が見えず場所が
  // 分かりにくいという指摘も受けたため、半透明でフェードするグロー+中央の小さな件数バッジの
  // 2層構成に変更した(ユーザー提示の参考画像の見た目に合わせた)。
  const isAlpha = state.kind === "alpha";
  zones.forEach((z, i) => {
    const marker = L.marker(xyToLatLng(z.x, z.y), { icon: zoneBubbleIcon(z, isAlpha) });
    marker.on("click", () => {
      document.querySelectorAll(".zone-bubble-icon.selected").forEach(el => el.classList.remove("selected"));
      marker.getElement().classList.add("selected");
      showZoneDetail(zones[i]);
    });
    marker.addTo(bubbleLayerGroup);
  });
}

// 「集計バブル」は件数を数字で正確に読めるが、密集地では円同士が重なって場所の形が
// 分かりにくい。逆にこちらは生の座標を1点=1個体として全部そのまま点描することで、
// 出現エリアの「形」が一目で分かるようにする(2026-07-18、ユーザーが密な点群の参考画像を提示)。
// 個体数が多いパル(MimicDog等は野生だけで5000件近い)をDOM要素で描くと重いため、
// オフスクリーンCanvasに1回だけ描いてL.imageOverlayにする(Leafletが他タイルと同様に
// パン・ズームの変形を自動で処理してくれるため、フレームごとの再描画が不要になる)。
function renderDensity(points){
  if(!points.length) return;

  const RES = 2048;
  const canvas = document.createElement("canvas");
  canvas.width = RES;
  canvas.height = RES;
  const ctx = canvas.getContext("2d");
  const color = state.kind === "alpha" ? "143,214,255" : "110,200,234";
  ctx.fillStyle = `rgba(${color},.55)`;
  const radius = 4;
  points.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x * RES, p.y * RES, radius, 0, Math.PI * 2);
    ctx.fill();
  });

  densityOverlay = L.imageOverlay(canvas.toDataURL(), mapBounds, { interactive: false }).addTo(mapMap);
}

function showZoneDetail(z){
  const detail = document.getElementById("zoneDetail");
  const timeLabel = { day: "昼のみ", night: "夜のみ", both: "昼夜問わず", mixed: "昼夜混在" }[z.availability] || z.availability;
  detail.innerHTML = `
    <div class="zd-title">${state.pal.name} — ${state.kind === "alpha" ? "ボス" : "野生"}スポーン</div>
    <div class="zd-row">
      <span>記録数 <b>${z.count}</b></span>
      <span>レベル <b>${z.minLevel === z.maxLevel ? z.minLevel : `${z.minLevel}〜${z.maxLevel}`}</b></span>
      <span>出現時間帯 <b>${timeLabel}</b></span>
    </div>
  `;
  detail.style.display = "block";
}

// ===== パン・ズーム =====
function resetView(){
  // #mapSectionがdisplay:noneの間に地図が初期化されているとLeafletがコンテナサイズを
  // 0のまま覚えてしまうため、表示状態が変わるたびにサイズを再計算させる(2026-07-28)。
  mapMap.invalidateSize();
  mapMap.fitBounds(mapBounds);
}

// 出現エリアが密集していると円が重なって件数バッジが読み取れなくなるため
// (2026-07-18、ユーザー指摘)、そのパルの出現エリアの分布範囲だけを見て
// 自動でズーム・パンする。範囲が狭い(1エリアだけ等)場合はズームしすぎないよう
// 上限を設け、常に周辺の地形が見える程度の余白を残す。
function fitViewToZones(zones){
  if(!zones.length){ resetView(); return; }
  mapMap.invalidateSize();

  let xMin = Math.min(...zones.map(z => z.x));
  let xMax = Math.max(...zones.map(z => z.x));
  let yMin = Math.min(...zones.map(z => z.y));
  let yMax = Math.max(...zones.map(z => z.y));

  // 1点しかない/極端に狭い場合に無限大ズームにならないよう最小スプレッドを確保する
  const MIN_SPREAD = 0.12;
  if(xMax - xMin < MIN_SPREAD){ const c = (xMin+xMax)/2; xMin = c - MIN_SPREAD/2; xMax = c + MIN_SPREAD/2; }
  if(yMax - yMin < MIN_SPREAD){ const c = (yMin+yMax)/2; yMin = c - MIN_SPREAD/2; yMax = c + MIN_SPREAD/2; }

  const bounds = L.latLngBounds([xyToLatLng(xMin, yMin), xyToLatLng(xMax, yMax)]);
  mapMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 4 });
}

// ユーザーが任意の場所に自由にマーカーを置ける機能(2026-07-20追加)。
// region(本島/世界樹)ごとにlocalStorageへ保存し、リロードしても残る。
const markerModeState = { active: false };
const CUSTOM_MARKERS_KEY = "palworld_map_custom_markers";

function loadCustomMarkers(){
  try{
    return JSON.parse(localStorage.getItem(CUSTOM_MARKERS_KEY) || "{}");
  }catch(e){ return {}; }
}
function saveCustomMarkers(all){
  localStorage.setItem(CUSTOM_MARKERS_KEY, JSON.stringify(all));
}
function currentRegionMarkers(){
  const all = loadCustomMarkers();
  return all[state.region] || [];
}

function addCustomMarker({ x, y }){
  const all = loadCustomMarkers();
  const list = all[state.region] || (all[state.region] = []);
  list.push({ x, y });
  saveCustomMarkers(all);
  renderCustomMarkers();
}

function removeCustomMarker(idx){
  const all = loadCustomMarkers();
  const list = all[state.region] || [];
  list.splice(idx, 1);
  saveCustomMarkers(all);
  renderCustomMarkers();
}

function renderCustomMarkers(){
  customMarkerLayerGroup.clearLayers();
  currentRegionMarkers().forEach((m, i) => {
    const icon = L.divIcon({
      className: "custom-marker-icon",
      html: `<div class="cm-pin"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 14],
    });
    const marker = L.marker(xyToLatLng(m.x, m.y), { icon, title: "クリックで削除" });
    marker.on("click", () => removeCustomMarker(i));
    marker.addTo(customMarkerLayerGroup);
  });
}

document.getElementById("markerModeBtn").addEventListener("click", () => {
  markerModeState.active = !markerModeState.active;
  document.getElementById("markerModeBtn").classList.toggle("active", markerModeState.active);
  document.getElementById("mapViewport").parentElement.classList.toggle("marker-mode", markerModeState.active);
});
document.getElementById("markerClearBtn").addEventListener("click", () => {
  const all = loadCustomMarkers();
  all[state.region] = [];
  saveCustomMarkers(all);
  renderCustomMarkers();
});

document.getElementById("kindToggle").addEventListener("click", e => {
  const btn = e.target.closest(".toggle-btn");
  if(!btn || btn.disabled) return;
  state.kind = btn.dataset.kind;
  document.querySelectorAll("#kindToggle .toggle-btn").forEach(b => b.classList.toggle("active", b === btn));
  document.getElementById("zoneDetail").style.display = "none";
  renderZones();
});

document.getElementById("timeToggle").addEventListener("click", e => {
  const btn = e.target.closest(".toggle-btn");
  if(!btn) return;
  state.time = btn.dataset.time;
  document.querySelectorAll("#timeToggle .toggle-btn").forEach(b => b.classList.toggle("active", b === btn));
  document.getElementById("zoneDetail").style.display = "none";
  renderZones();
});

document.getElementById("viewModeToggle").addEventListener("click", e => {
  const btn = e.target.closest(".toggle-btn");
  if(!btn) return;
  state.viewMode = btn.dataset.viewmode;
  document.querySelectorAll("#viewModeToggle .toggle-btn").forEach(b => b.classList.toggle("active", b === btn));
  document.getElementById("zoneDetail").style.display = "none";
  renderZones();
});

// 本島・世界樹両対応のランドマークレイヤー(フィールドボス/ダンジョン/古代遺跡/NPC/
// 懸賞金対象/集落/遭遇イベント/塔ボス/商人/ファストトラベル)。パルを選択していなくても
// トグルをONにすればマップが表示される(既存の「パル未選択なら地図を隠す」仕様の例外)。
function renderCuratedTogglePanel(){
  const panel = document.getElementById("curatedTogglePanel");
  const types = Object.keys(CURATED_TYPE_LABEL);
  panel.innerHTML = types.map(t => `
    <div class="curated-chip" data-type="${t}">
      <span class="dot" style="background:${CURATED_TYPE_COLOR[t]}"></span>${CURATED_TYPE_LABEL[t]}
    </div>
  `).join("");
  panel.querySelectorAll(".curated-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const t = chip.dataset.type;
      if(curatedState.active.has(t)) curatedState.active.delete(t);
      else curatedState.active.add(t);
      chip.classList.toggle("active");
      if(curatedState.active.size > 0){
        const wasHidden = document.getElementById("mapSection").style.display !== "block";
        document.getElementById("mapSection").style.display = "block";
        document.getElementById("emptyHint").style.display = "none";
        if(wasHidden && !state.pal) resetView();
      } else if(curatedState.active.size === 0 && !state.pal){
        document.getElementById("mapSection").style.display = "none";
        document.getElementById("emptyHint").style.display = "block";
      }
      renderCuratedLandmarks();
    });
  });
}

function renderCuratedLandmarks(){
  curatedLayerGroup.clearLayers();
  if(curatedState.active.size === 0) return;
  const points = EXTRA_CURATED_DATA.filter(p => curatedState.active.has(p.type) && p.region === state.region);
  points.forEach(p => {
    const icon = L.divIcon({
      className: "curated-marker-icon",
      html: `<div class="cd-dot" style="background:${CURATED_TYPE_COLOR[p.type]}" title="${CURATED_TYPE_LABEL[p.type]}: ${p.name || ''}${p.lv ? ' (Lv'+p.lv+')' : ''}"></div>`,
      iconSize: [9, 9],
      iconAnchor: [4.5, 4.5],
    });
    const marker = L.marker(xyToLatLng(p.x, p.y), { icon });
    if(p.reason){
      marker.bindPopup(
        `<div class="rb-popup"><b>${p.name}</b><div class="rb-reason">${p.reason}</div><div class="rb-sources">出典: ${p.sources.join(" ・ ")}</div></div>`,
        { className: "rb-popup-wrap", closeButton: true }
      );
    }
    marker.addTo(curatedLayerGroup);
  });
}

function renderLandmarks(){
  landmarkLayerGroup.clearLayers();
  if(state.region !== "worldtree") return;
  WORLDTREE_SPAWN_DATA.landmarks.forEach(lm => {
    const icon = L.divIcon({
      className: `landmark-icon ${lm.kind}`,
      html: `<div class="lm-dot" title="${LANDMARK_KIND_LABEL[lm.kind]}"></div><div class="lm-label">${lm.name_jp || lm.name_en}</div>`,
      iconSize: [160, 32],
      iconAnchor: [80, 16],
    });
    L.marker(xyToLatLng(lm.x, lm.y), { icon }).addTo(landmarkLayerGroup);
  });
}

function switchRegion(region){
  state.region = region;
  document.querySelectorAll("#mapRegionTabs .region-tab").forEach(t => t.classList.toggle("active", t.dataset.region === region));
  setMapTiles(region);
  state.pal = null;
  document.getElementById("selectedPalBox").style.display = "none";
  const showForCurated = curatedState.active.size > 0;
  document.getElementById("mapSection").style.display = showForCurated ? "block" : "none";
  document.getElementById("emptyHint").style.display = showForCurated ? "none" : "block";
  document.getElementById("emptyHint").textContent = region === "worldtree"
    ? "上の検索で世界樹エリアに出現するパルを選ぶか、上のレイヤーを選ぶと地図が表示されます。"
    : "上の検索でパルを選ぶか、上のレイヤーを選ぶと地図が表示されます。";
  renderLandmarks();
  renderCustomMarkers();
  renderCuratedLandmarks();
  resetView();
}

document.querySelectorAll("#mapRegionTabs .region-tab").forEach(tab => {
  tab.addEventListener("click", () => switchRegion(tab.dataset.region));
});

setupPicker();
setMapTiles(state.region);
renderLandmarks();
renderCustomMarkers();
renderCuratedTogglePanel();
renderCuratedLandmarks();

const initialParams = new URLSearchParams(location.search);
const initialId = initialParams.get("id");
const initialView = initialParams.get("view") || "map";
if(initialView !== "map") switchView(initialView, false);
if(initialView === "map" && initialId && PAL_LISTS.palpagos.some(p => p.dexId === initialId)){
  selectPal(initialId);
}
// 拠点おすすめビューの「地図で見る」リンク(#recommend-base)から遷移してきた場合、
// おすすめ拠点レイヤーを自動でONにする(2026-07-28)
if(location.hash === "#recommend-base"){
  const chip = document.querySelector('.curated-chip[data-type="Recommend Base"]');
  if(chip) chip.click();
}
