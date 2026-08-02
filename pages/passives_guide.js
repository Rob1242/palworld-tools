function render(cat){
  document.getElementById("passiveList").innerHTML = PASSIVES_GUIDE_DATA[cat].map(p => `
    <div class="passive-item">
      <div class="rank-badge">R${p.rank}</div>
      <div class="passive-name">${p.name}</div>
      <div class="passive-effect">${p.effect}</div>
    </div>
  `).join("");
}
document.querySelectorAll(".mode-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".mode-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    render(tab.dataset.cat);
  });
});
render("combat");
