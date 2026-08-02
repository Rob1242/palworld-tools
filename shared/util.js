// 複数ページで使う小さな汎用関数。
// (closeModal も3ページで同一だが、detailView/listView という特定のHTML構造に
//  依存していて、片方のページでid名を変えると黙って壊れるため各ページに残している)

// 属性(炎・水など)のバッジHTML。色はdesign-system.cssの --t-炎 等で定義。
function typeBadge(t){ return `<span class="type-badge type-${t}">${t}</span>`; }

// 立っているビットの数を数える。属性カバレッジをビットマスクで扱う計算で使う。
function popcount(x){
  let c = 0;
  while(x){ c += x & 1; x >>= 1; }
  return c;
}
