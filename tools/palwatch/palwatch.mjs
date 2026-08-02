// Palworld専用サーバーの様子を見て、声をかけたりObsidianに書き留めたりする。
//
// 動く場所: 颯太さんのMac(声を出す先とObsidianがここにあるため)
// データ元 : サーバー側(VM)が5分ごとに更新しているバックアップ
//
// 使い方:
//   node palwatch.mjs            … 1回だけ確認する
//   node palwatch.mjs --watch    … 常駐して定期的に確認する
//   node palwatch.mjs --quiet    … 声を出さずに日誌だけ書く
//   node palwatch.mjs --advice   … 拠点編成の助言だけ出す
//
// 設定は同じフォルダの config.json に置く(合言葉を含むのでgit管理下に入れないこと)。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchCurrent, diffEvents, loadState, saveState, ivTotal } from './events.mjs';
import { speak, appendJournal } from './outputs.mjs';
import { loadPlannerData, analyzeBase, buildAdvice } from './base-advice.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(fs.readFileSync(path.join(HERE, 'config.json'), 'utf8'));
const args = process.argv.slice(2);
const quiet = args.includes('--quiet');
const watch = args.includes('--watch');
const adviceOnly = args.includes('--advice');

// 図鑑IDから日本語名を引く
const dexSrc = fs.readFileSync(path.join(cfg.gameDataDir, 'dex_data.js'), 'utf8');
const PAL_DEX_DATA = JSON.parse(dexSrc.slice(dexSrc.indexOf('=') + 1).trim().replace(/;\s*$/, ''));
const nameById = new Map(PAL_DEX_DATA.map(p => [p.id, p.name]));
const dexName = id => nameById.get(id) || null;

const plannerData = loadPlannerData(cfg.gameDataDir);
const STATE_FILE = path.join(HERE, 'state.json');

async function tick() {
  let cur;
  try {
    cur = await fetchCurrent(cfg);
  } catch (e) {
    console.error('取得に失敗:', e.message);
    return;
  }
  if (!cur.pals.length) {
    console.log('まだパルのデータがありません(サーバーで遊び始めると溜まります)');
    return;
  }

  // --- 拠点の助言だけ出すモード ---
  if (adviceOnly) {
    const advice = buildAdvice(analyzeBase(cur.pals, dexName, plannerData, cfg.baseSlots), cfg.baseSlots);
    for (const a of advice) {
      console.log('  ' + a);
      if (!quiet) await speak(a, cfg.voice, cfg.speechRate);
    }
    return;
  }

  const prev = loadState(STATE_FILE);
  const events = diffEvents(prev, cur, dexName);
  saveState(STATE_FILE, cur);

  if (!events.length) {
    console.log(`変化なし(${cur.pals.length}体)`);
    return;
  }

  // --- 声 ---
  // 全部読み上げると煩いので、重要度がしきい値以上のものだけ。
  // さらに一度に喋りすぎないよう上限も設ける。
  if (!quiet) {
    const toSpeak = events
      .filter(e => e.weight >= cfg.speakMinWeight)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, cfg.maxSpeechPerTick);
    for (const e of toSpeak) await speak(e.text, cfg.voice, cfg.speechRate);
  }

  // --- Obsidianの日誌 ---
  // 声に出さなかったものも含めて、記録には全部残す。
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const hhmm = now.toTimeString().slice(0, 5);
  const lines = events.map(e => `${hhmm} ${e.text}`);

  const species = new Set(cur.pals.map(p => p.dexId)).size;
  const best = cur.pals.slice().sort((a, b) => ivTotal(b) - ivTotal(a))[0];
  const advice = buildAdvice(analyzeBase(cur.pals, dexName, plannerData, cfg.baseSlots), cfg.baseSlots);
  const summary = [
    `- 所持: ${cur.pals.length}体 / ${species}種`,
    best ? `- 個体値がいちばん高いのは ${dexName(best.dexId) || best.dexId}(合計${ivTotal(best)})` : '',
    '',
    '### 拠点まわりの気づき',
    ...advice.map(a => `- ${a}`),
  ].filter(Boolean).join('\n');

  const file = appendJournal(cfg.vaultDir, dateStr, lines, summary);
  console.log(`${events.length}件を記録 → ${path.basename(file)}`);
}

if (watch) {
  console.log(`見守りを開始します(${cfg.intervalMinutes}分ごと)。止めるには Control+C。`);
  await tick();
  setInterval(tick, cfg.intervalMinutes * 60 * 1000);
} else {
  await tick();
}
