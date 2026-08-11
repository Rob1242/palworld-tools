// 複数ページで使う小さな汎用関数。
// (closeModal も3ページで同一だが、detailView/listView という特定のHTML構造に
//  依存していて、片方のページでid名を変えると黙って壊れるため各ページに残している)

// 属性(炎・水など)のバッジHTML。色はdesign-system.cssの --t-炎 等で定義。
function typeBadge(t){ return `<span class="type-badge type-${t}">${t}</span>`; }

// 入手時期のバッジHTML。パルを名指しで勧める画面(Tier表・ボス攻略・パーティ編成)で、
// 「そのパルが今すぐ手に入るのか」を必ず添えるために使う。除外はせず補足するだけ。
// tier は野生の最低出現レベルから決まる(early<=15 / mid<=35 / late / 野生に出なければ special)。
const OBTAIN_TIER_LABEL = { early: "序盤", mid: "中盤", late: "終盤", special: "配合・ボス" };

function obtainBadge(tier){
  if(!OBTAIN_TIER_LABEL[tier]) return "";
  return `<span class="tier-obtain ${tier}">${OBTAIN_TIER_LABEL[tier]}</span>`;
}

// 立っているビットの数を数える。属性カバレッジをビットマスクで扱う計算で使う。
function popcount(x){
  let c = 0;
  while(x){ c += x & 1; x >>= 1; }
  return c;
}
