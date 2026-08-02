document.getElementById("achList").innerHTML = ACHIEVEMENTS_DATA.map((a, i) => `
  <div class="ach-item">
    <div class="ach-badge">${i + 1}</div>
    <div class="ach-name">${a.name}</div>
    <div class="ach-cond">${a.condition}</div>
  </div>
`).join("");
