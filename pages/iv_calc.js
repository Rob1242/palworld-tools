const POTENTIAL_BONUS = 0.3;

function toKana(str){
  return (str||"").replace(/[ぁ-ゖ]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}

function setupPicker(){
  const input = document.querySelector("#ivPicker input");
  const results = document.querySelector("#ivPicker .pal-picker-results");
  input.addEventListener("input", () => {
    const q = toKana(input.value.trim().toLowerCase());
    if(!q){ results.style.display = "none"; return; }
    const matches = PAL_DEX_DATA.filter(p =>
      toKana((p.name||"").toLowerCase()).includes(q) || (p.en_name||"").toLowerCase().includes(input.value.toLowerCase())
    ).slice(0, 20);
    results.innerHTML = matches.length
      ? matches.map(p => `<div class="pal-picker-item" data-id="${p.id}">${p.icon ? `<img src="${p.icon}" alt="">` : ""}<span>${p.name}</span></div>`).join("")
      : `<div class="pal-picker-item">見つかりません</div>`;
    results.querySelectorAll(".pal-picker-item[data-id]").forEach(el => {
      el.addEventListener("click", () => {
        const p = PAL_DEX_DATA.find(x => x.id === el.dataset.id);
        input.value = p.name;
        results.style.display = "none";
        document.getElementById("hpBase").value = p.stats.hp;
        document.getElementById("atkBase").value = p.stats.shot_attack;
        document.getElementById("defBase").value = p.stats.defense;
        compute();
      });
    });
    results.style.display = "block";
  });
  input.addEventListener("blur", () => setTimeout(() => results.style.display = "none", 150));
}

function calcIv(curVal, base, offset, coef, condenserMult, powerMult, passiveMult, lv){
  if(!curVal) return null;
  const x = curVal / condenserMult / powerMult / passiveMult;
  const iv = 100 * ((x - offset) / coef / base / lv - 1) / POTENTIAL_BONUS;
  return Math.round(iv * 10) / 10;
}

function compute(){
  const lv = parseInt(document.getElementById("lvInput").value) || 1;
  const condenserMult = 1 + parseInt(document.getElementById("condenserInput").value) * 0.05;

  const hpBase = parseFloat(document.getElementById("hpBase").value) || 0;
  const hpPower = 1 + (parseInt(document.getElementById("hpPower").value) || 0) * 0.03;
  const hpCur = parseFloat(document.getElementById("hpCur").value);
  const hpIv = calcIv(hpCur, hpBase, 500 + 5*lv, 0.5, condenserMult, hpPower, 1, lv);
  document.getElementById("hpIv").textContent = hpIv != null ? hpIv : "—";

  const atkBase = parseFloat(document.getElementById("atkBase").value) || 0;
  const atkPower = 1 + (parseInt(document.getElementById("atkPower").value) || 0) * 0.03;
  const atkPassive = 1 + (parseFloat(document.getElementById("atkPassive").value) || 0) / 100;
  const atkCur = parseFloat(document.getElementById("atkCur").value);
  const atkIv = calcIv(atkCur, atkBase, 100, 0.075, condenserMult, atkPower, atkPassive, lv);
  document.getElementById("atkIv").textContent = atkIv != null ? atkIv : "—";

  const defBase = parseFloat(document.getElementById("defBase").value) || 0;
  const defPower = 1 + (parseInt(document.getElementById("defPower").value) || 0) * 0.03;
  const defPassive = 1 + (parseFloat(document.getElementById("defPassive").value) || 0) / 100;
  const defCur = parseFloat(document.getElementById("defCur").value);
  const defIv = calcIv(defCur, defBase, 50, 0.075, condenserMult, defPower, defPassive, lv);
  document.getElementById("defIv").textContent = defIv != null ? defIv : "—";
}

document.querySelectorAll("input, select").forEach(el => el.addEventListener("input", compute));
setupPicker();
