(function(){
  const PAL_BY_ASSET = {};
  PAL_DEX_DATA.forEach(p => {
    const m = /T_(.+?)_icon_normal\.webp$/.exec(p.icon || "");
    if(m) PAL_BY_ASSET[m[1]] = p;
  });

  const EFFIGY_ICON = {};
  STATUE_DATA.effigyTypes.forEach(t => {
    const pal = PAL_BY_ASSET[t.type];
    EFFIGY_ICON[t.type] = pal ? pal.icon : "";
  });

  const CHECKLIST_KEY = "palworld_statue_checklist";
  function loadChecked(){
    try{ return JSON.parse(localStorage.getItem(CHECKLIST_KEY) || "{}"); }catch(e){ return {}; }
  }
  function saveChecked(obj){ localStorage.setItem(CHECKLIST_KEY, JSON.stringify(obj)); }
  let checked = loadChecked();

  const st = {
    region: "palpagos",
    activeTypes: new Set(STATUE_DATA.effigyTypes.map(t => t.type)),
    filter: "all",
  };

  const TILE_WORLD_SIZE = 256; // CRS.Simpleのズーム0世界サイズ(タイルサイズ基準)。ズーム4(maxNativeZoom)で256*2^4=4096px=実タイル解像度に一致
  // CRS.Simpleのproject()は生で pixel_y = -lat (0起点に自動で揃わない) なので、
  // 画像のy(0=上端,1=下端)をそのままlat=-y*sizeに対応させる(北=lat0、南=lat-size)。
  function xyToLatLng(x, y){
    return L.latLng(-y * TILE_WORLD_SIZE, x * TILE_WORLD_SIZE);
  }

  const stBounds = L.latLngBounds([-TILE_WORLD_SIZE, 0], [0, TILE_WORLD_SIZE]);
  const stMap = L.map("stMapViewport", {
    crs: L.CRS.Simple,
    minZoom: 0,
    maxZoom: 5,
    zoomControl: false,
    attributionControl: false,
  });
  stMap.fitBounds(stBounds);
  window.__statueMapOnShow = () => { stMap.invalidateSize(); stMap.fitBounds(stBounds); };

  let stTileLayer = null;
  function setStatueTiles(region){
    if(stTileLayer) stMap.removeLayer(stTileLayer);
    stTileLayer = L.tileLayer(`game_data/maps/tiles/${region}/{z}/{x}_{y}.webp`, {
      tileSize: 256,
      minZoom: 0,
      maxZoom: 5,
      minNativeZoom: 0,
      maxNativeZoom: 4,
      noWrap: true,
      bounds: stBounds,
    }).addTo(stMap);
  }

  const statueLayerGroup = L.layerGroup().addTo(stMap);

  stMap.on("mousemove", e => {
    const x = e.latlng.lng / TILE_WORLD_SIZE;
    const y = -e.latlng.lat / TILE_WORLD_SIZE;
    const el = document.getElementById("stCoordReadout");
    if(x < 0 || x > 1 || y < 0 || y > 1){ el.textContent = "X: — Y: —"; return; }
    el.textContent = `X: ${x.toFixed(3)} Y: ${y.toFixed(3)}`;
  });

  document.getElementById("stZoomInBtn").addEventListener("click", () => stMap.zoomIn());
  document.getElementById("stZoomOutBtn").addEventListener("click", () => stMap.zoomOut());

  function renderProgress(){
    const total = STATUE_DATA.points.length;
    const done = STATUE_DATA.points.filter(p => checked[p.id]).length;
    document.getElementById("stProgressFill").style.width = `${(done/total*100).toFixed(1)}%`;
    document.getElementById("stProgressCount").textContent = `${done} / ${total}`;

    document.querySelectorAll("#stRegionTabs .region-tab").forEach(tab => {
      const region = tab.dataset.region;
      const regionPts = STATUE_DATA.points.filter(p => p.region === region);
      const regionDone = regionPts.filter(p => checked[p.id]).length;
      tab.querySelector(".rt-count").textContent = ` ${regionDone}/${regionPts.length}`;
    });
  }

  function renderSpeciesPanel(){
    const panel = document.getElementById("stSpeciesPanel");
    const typesHere = STATUE_DATA.effigyTypes.filter(t => t.regionCounts[st.region] > 0);
    panel.innerHTML = typesHere.map(t => {
      const regionTotal = t.regionCounts[st.region];
      const donePts = STATUE_DATA.points.filter(p => p.type === t.type && p.region === st.region && checked[p.id]).length;
      const isComplete = donePts === regionTotal;
      return `
      <div class="species-chip ${st.activeTypes.has(t.type) ? "active" : ""} ${isComplete ? "complete" : ""}" data-type="${t.type}" title="強化効果: ${t.effect}">
        <img class="sc-icon" src="${EFFIGY_ICON[t.type]}" alt="">
        <span>${t.jp_name}</span>
        <span class="sc-count">${donePts}/${regionTotal}</span>
      </div>`;
    }).join("");
    panel.querySelectorAll(".species-chip").forEach(el => {
      el.addEventListener("click", () => {
        const type = el.dataset.type;
        if(st.activeTypes.has(type)) st.activeTypes.delete(type);
        else st.activeTypes.add(type);
        renderSpeciesPanel();
        renderStatues();
      });
    });
  }

  function switchStatueRegion(region){
    st.region = region;
    document.querySelectorAll("#stRegionTabs .region-tab").forEach(t => t.classList.toggle("active", t.dataset.region === region));
    setStatueTiles(region);
    stMap.fitBounds(stBounds);
    renderSpeciesPanel();
    renderStatues();
  }
  document.querySelectorAll("#stRegionTabs .region-tab").forEach(tab => {
    tab.addEventListener("click", () => switchStatueRegion(tab.dataset.region));
  });

  function statueDivIcon(point, isDone){
    return L.divIcon({
      className: "statue-marker-icon" + (isDone ? " done" : ""),
      html: `<img class="sm-icon" src="${EFFIGY_ICON[point.type]}" alt="">${isDone ? '<span class="sm-check">✓</span>' : ""}`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
  }

  function renderStatues(){
    statueLayerGroup.clearLayers();
    const points = STATUE_DATA.points.filter(p => {
      if(p.region !== st.region) return false;
      if(!st.activeTypes.has(p.type)) return false;
      if(st.filter === "remaining" && checked[p.id]) return false;
      return true;
    });
    points.forEach(p => {
      const isDone = !!checked[p.id];
      const t = STATUE_DATA.effigyTypes.find(x => x.type === p.type);
      const marker = L.marker(xyToLatLng(p.x, p.y), { icon: statueDivIcon(p, isDone) });
      marker.bindTooltip(
        `<b>${t ? t.jp_name : p.type}</b><div class="sd-hint">強化効果: ${t ? t.effect : "?"}</div><div class="sd-hint">${isDone ? "回収済み(クリックで解除)" : "クリックで回収済みにする"}</div>`,
        { direction: "top", offset: [0, -12], className: "statue-detail" }
      );
      marker.on("click", () => {
        checked[p.id] = !checked[p.id];
        saveChecked(checked);
        renderProgress();
        renderSpeciesPanel();
        renderStatues();
      });
      marker.addTo(statueLayerGroup);
    });
  }

  document.querySelectorAll("#stFilterToggle .toggle-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      st.filter = btn.dataset.filter;
      document.querySelectorAll("#stFilterToggle .toggle-btn").forEach(b => b.classList.toggle("active", b === btn));
      renderStatues();
    });
  });

  document.getElementById("stResetAllBtn").addEventListener("click", () => {
    if(!confirm("回収済みチェックを全部リセットします。よろしいですか?")) return;
    checked = {};
    saveChecked(checked);
    renderProgress();
    renderSpeciesPanel();
    renderStatues();
  });

  setStatueTiles(st.region);
  renderProgress();
  renderSpeciesPanel();
  renderStatues();
})();
