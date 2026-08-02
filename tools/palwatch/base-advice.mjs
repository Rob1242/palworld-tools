// 実際に持っているパルを見て、拠点編成の助言を作る。
//
// 拠点プランナー(pages/base_planner_v2.js)と同じ考え方を使う:
//   役職ごとの実測作業速度テーブルを引き、適性レベルに応じた「実際の仕事量」で評価する。
// 理論値ではなく手持ちの個体で計算するのが、このツールならではの部分。

import fs from 'node:fs';
import path from 'node:path';

function loadConst(file, name) {
  const src = fs.readFileSync(file, 'utf8');
  const m = new RegExp('const ' + name + '\\s*=\\s*([\\s\\S]+?);\\s*(?:\\nconst|$)').exec(src);
  return JSON.parse(m[1]);
}

export function loadPlannerData(gameDataDir) {
  const f = path.join(gameDataDir, 'base_planner_data.js');
  return {
    PAL_DATA: loadConst(f, 'PAL_DATA'),
    WORK_SPEED_TABLE: loadConst(f, 'WORK_SPEED_TABLE'),
  };
}

// 適性レベル→実際の作業速度。プランナーと同じくテーブルを引く。
// テーブルに無いレベルは、Lv4→5の伸び率で外挿する(プランナー側の注記と同じ扱い)。
function workSpeed(table, role, lv) {
  const t = table[role];
  if (!t) return 0;
  if (t[String(lv)] != null) return t[String(lv)];
  const growth = t['5'] / t['4'];
  let v = t['5'];
  for (let i = 5; i < lv; i++) v *= growth;
  return v;
}

// 手持ちのパルで、役職ごとに「上位何体がどれくらい仕事できるか」を出す。
export function analyzeBase(pals, dexIdToName, data, slots = 20) {
  const { PAL_DATA, WORK_SPEED_TABLE } = data;
  const byName = new Map(PAL_DATA.map(p => [p.name, p]));
  const roles = Object.keys(WORK_SPEED_TABLE);

  // 所持個体を種族情報に紐づける
  const owned = [];
  for (const p of pals) {
    const name = dexIdToName(p.dexId);
    const info = name && byName.get(name);
    if (info) owned.push({ inst: p, name, info });
  }
  if (!owned.length) return null;

  // 役職ごとに、実際の作業速度が高い順に並べる
  const perRole = {};
  for (const role of roles) {
    const cands = owned
      .filter(o => o.info.work && o.info.work[role])
      .map(o => ({ ...o, speed: workSpeed(WORK_SPEED_TABLE, role, o.info.work[role]), lv: o.info.work[role] }))
      .sort((a, b) => b.speed - a.speed);
    perRole[role] = cands;
  }

  // 手薄な役職(こなせる個体がいない・少ない)を洗い出す
  const weak = roles
    .map(r => ({ role: r, count: perRole[r].length, best: perRole[r][0] || null }))
    .filter(x => x.count === 0 || x.count <= 2)
    .sort((a, b) => a.count - b.count);

  // 枠に対して余っている役職(候補が多すぎる=他拠点に回せる)
  const rich = roles
    .map(r => ({ role: r, count: perRole[r].length }))
    .filter(x => x.count >= Math.max(8, Math.floor(slots * 0.6)))
    .sort((a, b) => b.count - a.count);

  return { owned, perRole, weak, rich, roles };
}

// 助言の文章にする。声で読む都合上、短く区切る。
export function buildAdvice(analysis, slots = 20) {
  if (!analysis) return [];
  const out = [];
  const { perRole, weak, rich } = analysis;

  for (const w of weak.slice(0, 3)) {
    if (w.count === 0) out.push(`${w.role}をこなせるパルが1体もいないよ。捕まえるか配合で用意したいね。`);
    else out.push(`${w.role}ができるのは${w.count}体だけ。ここが詰まりやすいよ。`);
  }
  for (const r of rich.slice(0, 2)) {
    out.push(`${r.role}は${r.count}体もいるから、何体かは別の拠点に回せるよ。`);
  }

  // 各役職のいちばん良い個体を教える(誰を置くべきか迷わないように)
  const picks = Object.entries(perRole)
    .filter(([, list]) => list.length)
    .map(([role, list]) => `${role}なら${list[0].name}(Lv${list[0].lv})`)
    .slice(0, 4);
  if (picks.length) out.push('今の手持ちだと、' + picks.join('、') + 'が一番いいよ。');

  return out;
}
