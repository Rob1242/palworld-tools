(function(){
  document.getElementById("baseSpotGrid").innerHTML = BASE_SPOTS_RECOMMEND_DATA.map((s, i) => `
    <div class="spot-card">
      <div class="spot-head">
        <span class="spot-num">候補地 #${i+1}</span>
        <a class="spot-coord" href="palworld_map.html?view=map#recommend-base" title="出現マップの「おすすめ拠点」レイヤーで見る">地図で見る →</a>
      </div>
      <div class="spot-comment">${s.name}</div>
      <div class="spot-comment" style="font-weight:400;font-size:12.5px;color:var(--parchment-dim);">${s.reason}</div>
      <div class="spot-tags">${s.sources.map(src => `<span class="spot-tag resource">${src}</span>`).join("")}</div>
    </div>
  `).join("");
})();
