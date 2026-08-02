// サーバー側が更新しているバックアップを読み、前回との差分から「出来事」を組み立てる。
//
// このファイルは検知だけを担当し、声を出す・日誌を書くといった出力は別ファイルが行う。
// (出力先を増やしても、検知のロジックは1箇所のままにしておきたいため)

import fs from 'node:fs';
import path from 'node:path';

// --- Firestoreから現在のパル一覧を取る ---
// サーバー側(VMのpalsync)が5分ごとに書き込んでいるものをそのまま読む。
export async function fetchCurrent(cfg) {
  const url = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}`
    + `/databases/(default)/documents/personalBackups/${cfg.roomCode}?key=${cfg.apiKey}`;
  const r = await fetch(url);
  if (r.status === 404) return { pals: [], updatedAt: null };
  if (!r.ok) throw new Error(`バックアップの取得に失敗しました (HTTP ${r.status})`);
  const doc = await r.json();
  const arr = doc.fields?.instances?.arrayValue?.values || [];
  const pals = arr.map(v => {
    const f = v.mapValue.fields;
    const s = k => f[k]?.stringValue ?? null;
    const n = k => f[k]?.integerValue != null ? Number(f[k].integerValue) : null;
    const ivs = f.ivs?.mapValue?.fields || {};
    const ivn = k => ivs[k]?.integerValue != null ? Number(ivs[k].integerValue) : 0;
    return {
      uid: s('uid'), dexId: s('dexId'), nickname: s('nickname') || '',
      level: n('level'), rank: n('rank'),
      isAlpha: !!f.isAlpha?.booleanValue,
      sex: s('sex') || 'unknown',
      ivs: { hp: ivn('hp'), melee: ivn('melee'), shot: ivn('shot'), defense: ivn('defense') },
      passives: (f.passives?.arrayValue?.values || []).map(x => x.stringValue),
      activeSkills: (f.activeSkills?.arrayValue?.values || []).map(x => x.stringValue),
    };
  });
  return { pals, updatedAt: doc.fields?.updatedAt?.timestampValue || null };
}

// 個体値の合計。「良個体かどうか」の一番わかりやすい指標として使う。
export const ivTotal = p => p.ivs.hp + p.ivs.melee + p.ivs.shot + p.ivs.defense;

// --- 前回の状態と比べて出来事を作る ---
export function diffEvents(prev, cur, dexName) {
  const events = [];
  const prevByUid = new Map((prev.pals || []).map(p => [p.uid, p]));
  const prevSpecies = new Set((prev.pals || []).map(p => p.dexId));
  const curSpecies = new Set(cur.pals.map(p => p.dexId));

  // 初回は差分ではなく現状の要約だけ出す(全部を「新規」として喋ると煩いため)
  if (!prev.pals) {
    events.push({ type: 'first', text: `記録を始めるね。今いるパルは${cur.pals.length}体、${curSpecies.size}種類だよ。`, weight: 5 });
    return events;
  }

  const allIvTotals = (prev.pals || []).map(ivTotal);
  const bestBefore = allIvTotals.length ? Math.max(...allIvTotals) : 0;

  for (const p of cur.pals) {
    const before = prevByUid.get(p.uid);
    const name = dexName(p.dexId) || p.dexId;

    if (!before) {
      // 新しく手に入った個体
      const iv = ivTotal(p);
      const isNewSpecies = !prevSpecies.has(p.dexId);
      let text = `${name}が仲間になったよ。`;
      let weight = 1;
      if (isNewSpecies) { text = `${name}は初めてだね。図鑑が${curSpecies.size}種類になったよ。`; weight = 4; }
      if (iv > bestBefore && iv >= 200) { text += `しかも個体値の合計が${iv}。今までで一番いい個体だよ。`; weight = 5; }
      else if (iv >= 300) { text += `個体値の合計${iv}、かなり良いね。`; weight = 3; }
      if (p.isAlpha) { text += 'アルファ個体だ。'; weight = Math.max(weight, 3); }
      events.push({ type: 'catch', pal: p, name, iv, isNewSpecies, text, weight });
    } else if (p.level != null && before.level != null && p.level > before.level) {
      // レベルが上がった個体(細かく喋ると煩いので、節目だけ拾う)
      if (p.level % 10 === 0 || p.level >= 50) {
        events.push({ type: 'levelup', pal: p, name, from: before.level, to: p.level,
          text: `${name}がレベル${p.level}になったよ。`, weight: 2 });
      }
    }
  }

  // いなくなった個体(逃がした・売った・配合の素材にした)
  const goneCount = (prev.pals || []).filter(p => !cur.pals.some(c => c.uid === p.uid)).length;
  if (goneCount >= 5) {
    events.push({ type: 'gone', text: `${goneCount}体が手元からいなくなったね。整理したのかな。`, weight: 1 });
  }

  return events;
}

// --- 前回の状態の読み書き ---
export function loadState(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { pals: null }; }
}
export function saveState(file, cur) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cur));
}
