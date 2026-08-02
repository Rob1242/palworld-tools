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
      if (!quiet) await speak(a, cfg.voice, cfg.speechRate, cfg);
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
    for (const e of toSpeak) await speak(e.text, cfg.voice, cfg.speechRate, cfg);
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

// --- 声で話しかけてもらうモード ---
// Enterを押している間ではなく「Enterを押したら録音開始、話し終わりを無音で検出」方式。
// ゲームのコントローラーを持ったままでも扱いやすいのと、押しっぱなしより確実なため。
// 質問に答えるための材料をそろえる(--talk と --wake で共通)
async function buildTalkContext() {
  const { toHira } = await import('./voice.mjs');
  const cur = await fetchCurrent(cfg);
  if (!cur.pals.length) { console.log('まだパルのデータがありません。'); return null; }

  const speciesSet = new Set(cur.pals.map(p => p.dexId));
  const best = cur.pals.slice().sort((a, b) => ivTotal(b) - ivTotal(a))[0];
  const advice = buildAdvice(analyzeBase(cur.pals, dexName, plannerData, cfg.baseSlots), cfg.baseSlots);
  const ctx = {
    total: cur.pals.length,
    species: speciesSet.size,
    best: best ? { name: dexName(best.dexId) || best.dexId, iv: ivTotal(best) } : null,
    advice,
    // 聞き取った文にパル名が含まれていればその所持状況を返す。
    // 認識結果はカタカナが崩れることがあるので、両方を平仮名に寄せて比べる。
    findSpecies(t) {
      const th = toHira(t);
      // 長い名前から先に見る(短い名前が別の名前の一部に一致するのを防ぐ)
      const sorted = PAL_DEX_DATA.filter(p => p.name && p.name.length >= 3)
        .sort((a, b) => b.name.length - a.name.length);
      for (const p of sorted) {
        if (th.includes(toHira(p.name))) {
          const mine = cur.pals.filter(x => x.dexId === p.id);
          return { name: p.name, count: mine.length,
            bestIv: mine.length ? Math.max(...mine.map(ivTotal)) : 0 };
        }
      }
      return null;
    },
  };

  return ctx;
}

async function talkMode() {
  const { listenOnce } = await import('./voice.mjs');
  const ctx = await buildTalkContext();
  if (!ctx) return;
  const say = t => speak(t, cfg.voice, cfg.speechRate, cfg);

  // 押すキーは設定で変えられる。既定は「+」。
  // 全角で入力される場合もあるので、両方を受け付ける。
  const keys = (cfg.talkKeys && cfg.talkKeys.length ? cfg.talkKeys : ['+', '＋']);
  console.log(`話しかけモードです。「${keys[0]}」を押してから話してください(終了は Control+C)。\n`);
  await say(`準備できたよ。今は${ctx.total}体、${ctx.species}種類。`);

  // Enterを待たずに1文字で反応させるため、生の入力モードにする。
  // このモードではControl+Cが自動で効かないので、自分で拾って終了させる。
  if (!process.stdin.isTTY) {
    console.error('このモードは対話できる画面で動かしてください。');
    return;
  }
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  const cleanup = () => {
    try { process.stdin.setRawMode(false); } catch {}
    process.stdin.pause();
  };

  let busy = false;
  const prompt = () => process.stdout.write(`${keys[0]}で録音 > `);
  prompt();

  process.stdin.on('data', async (key) => {
    if (key === '\u0003') {   // Control+C
       cleanup(); console.log('\n終了しました。'); process.exit(0); }
    if (busy || !keys.includes(key)) return;
    busy = true;
    process.stdout.write('\n  聞いています…\n');
    try {
      const r = await listenOnce(cfg, ctx, say);
      if (r.heard) console.log(`  聞き取り: ${r.heard}`);
      if (r.reply) console.log(`  返答:     ${r.reply}`);
    } catch (e) {
      console.error('  エラー:', e.message);
    }
    busy = false;
    prompt();
  });
}

// --- 呼びかけで反応するモード ---
// Enterを押す代わりに、呼びかけ語を検知したら聞き取りを始める。
// うまく動かない時に切り分けられるよう、Enter方式と同じ中身を使い回している。
async function wakeMode() {
  const { listenForWake } = await import('./wakeword.mjs');
  const { listenOnce, interpret } = await import('./voice.mjs');
  const ctx = await buildTalkContext();
  if (!ctx) return;
  const say = t => speak(t, cfg.voice, cfg.speechRate, cfg);

  const words = cfg.wakeWords?.length ? cfg.wakeWords : ['ルナ'];
  console.log(`「${words[0]}」と呼びかけてください(終了は Control+C)。`);
  console.log('「ルナ、今何体いる」のように用件まで続けて言ってもいいです。\n');
  await say('呼びかけを待ってるね。');

  let stopping = false;
  process.on('SIGINT', () => { stopping = true; process.exit(0); });

  await listenForWake(cfg, async (rest, whole) => {
    console.log(`  呼ばれました: ${whole}`);
    try {
      if (rest) {
        // 呼びかけと一緒に用件も言われた場合は、聞き直さずそのまま答える
        const reply = interpret(rest, ctx);
        if (reply) { console.log(`  返答: ${reply}`); await say(reply); }
        else { await say('ごめん、聞き取れなかった。もう一回言って。'); }
      } else {
        // 呼びかけだけだった場合は、返事をしてから用件を聞く
        await say('なに?');
        const r = await listenOnce(cfg, ctx, say);
        if (r.heard) console.log(`  聞き取り: ${r.heard}`);
        if (r.reply) console.log(`  返答:     ${r.reply}`);
      }
    } catch (e) {
      console.error('  エラー:', e.message);
    }
  }, () => stopping);

  console.log('終了しました。');
}

// --- VOICEVOXの話者一覧を出す ---
// どの番号がどのキャラかを調べるためのもの。
async function listVoices() {
  if (!cfg.voicevoxUrl) { console.log('config.json に voicevoxUrl がありません。'); return; }
  try {
    const r = await fetch(`${cfg.voicevoxUrl}/speakers`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const speakers = await r.json();
    console.log('VOICEVOXの話者(番号を voicevoxSpeaker に設定する):\n');
    for (const sp of speakers) {
      for (const st of sp.styles) {
        console.log(`  ${String(st.id).padStart(3)}  ${sp.name}(${st.name})`);
      }
    }
  } catch (e) {
    console.log('VOICEVOXに接続できません:', e.message);
    console.log('  VOICEVOXアプリを起動してから、もう一度お試しください。');
  }
}

if (args.includes('--voices')) {
  await listVoices();
} else if (args.includes('--wake')) {
  await wakeMode();
} else if (args.includes('--talk')) {
  await talkMode();
} else if (watch) {
  console.log(`見守りを開始します(${cfg.intervalMinutes}分ごと)。止めるには Control+C。`);
  await tick();
  setInterval(tick, cfg.intervalMinutes * 60 * 1000);
} else {
  await tick();
}
