(function(){
  function renderMissionList(cat){
    const list = MISSIONS_DATA.filter(m => m.category === cat);
    document.getElementById("missionListEl").innerHTML = list.map((m, i) => `
      <div class="mission-item" data-id="${m.id}">
        <div class="mission-head">
          <span class="mission-num">${i + 1}</span>
          <span class="mission-title">${m.title}</span>
        </div>
        ${m.desc ? `<div class="mission-desc">${m.desc}</div>` : ""}
        <div class="mission-foot">
          ${m.reward ? `<span><b>報酬:</b> ${m.reward}</span>` : ""}
          ${m.next ? `<span><b>次:</b> ${m.next}</span>` : ""}
        </div>
      </div>
    `).join("");
    document.querySelectorAll("#missionListEl .mission-item").forEach(el => {
      el.addEventListener("click", () => openMissionDetail(el.dataset.id));
    });
  }
  document.querySelectorAll("#missionModeTabs .mode-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("#missionModeTabs .mode-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      renderMissionList(tab.dataset.cat);
    });
  });
  renderMissionList("メインミッション");

  // 「次」欄はミッションIDではなくタイトル文字列そのものなので、タイトル完全一致で引く。
  function findMissionByTitle(title){
    return MISSIONS_DATA.find(m => m.title === title) || null;
  }

  function openMissionDetail(id){
    const m = MISSIONS_DATA.find(x => x.id === id);
    if(!m) return;
    const nextMission = m.next ? findMissionByTitle(m.next) : null;
    document.getElementById("missionDetailContent").innerHTML = `
      <div class="detail-box">
        <div class="detail-eyebrow">${m.category}</div>
        <h2>${m.title}</h2>
        <div class="detail-desc">${m.desc || "(説明文なし)"}</div>
        <div class="detail-foot">
          ${m.reward ? `<div class="detail-foot-row"><b>報酬</b><span>${m.reward}</span></div>` : ""}
          ${m.next ? `<div class="detail-foot-row"><b>次のミッション</b>${
            nextMission ? `<span class="next-link" data-next-id="${nextMission.id}">${m.next} →</span>` : `<span>${m.next}</span>`
          }</div>` : ""}
        </div>
      </div>
    `;
    const nextEl = document.querySelector("#missionDetailContent [data-next-id]");
    if(nextEl) nextEl.addEventListener("click", () => openMissionDetail(nextEl.dataset.nextId));
    document.querySelectorAll("#missionModeTabs .mode-tab").forEach(t => t.classList.toggle("active", t.dataset.cat === m.category));
    renderMissionList(m.category);
    document.getElementById("missionListView").style.display = "none";
    document.getElementById("missionDetailView").style.display = "block";
    window.scrollTo(0, 0);
    history.replaceState(null, "", `?view=missions&id=${encodeURIComponent(id)}`);
  }
  window.openMissionDetail = openMissionDetail;

  function closeMissionDetail(){
    document.getElementById("missionDetailView").style.display = "none";
    document.getElementById("missionListView").style.display = "block";
    history.replaceState(null, "", "?view=missions");
  }
  document.getElementById("missionBackBtn").addEventListener("click", closeMissionDetail);

  // サイト全体検索(shared/global_search.js)や他ページからの直リンク用:
  // ?view=missions&id=<mission_id>で該当ミッションの詳細を開く。
  const params = new URLSearchParams(location.search);
  if(params.get("view") === "missions"){
    const initialMissionId = params.get("id");
    if(initialMissionId && MISSIONS_DATA.some(m => m.id === initialMissionId)) openMissionDetail(initialMissionId);
  }
})();
