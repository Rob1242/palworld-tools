// Palworld専用サーバーの様子を見て、声をかけたりObsidianに書き留めたりする。
//
// 動く場所: 颯太さんのMac(声を出す先とObsidianがここにあるため)
// データ元 : 2つある。
//   ・セーブ経由 … サーバー側(VM)が更新しているバックアップ。数十秒遅れるが確実
//   ・メモリ直読み … サーバーのメモリを外から読む。捕まえた瞬間(約1秒)に届く
//   片方が壊れてももう片方が残るよう、2つは独立して動かしている。
//
// 使い方:
//   node palwatch.mjs            … 1回だけ確認する
//   node palwatch.mjs --watch    … 常駐して定期的に確認する
//   node palwatch.mjs --quiet    … 声を出さずに日誌だけ書く
//   node palwatch.mjs --advice   … 拠点編成の助言だけ出す
//   node palwatch.mjs --memtest  … 即時報告の経路が繋がっているか試す
//
// 設定は同じフォルダの config.json に置く(合言葉を含むのでgit管理下に入れないこと)。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchCurrent, diffEvents, loadState, saveState, ivTotal } from './events.mjs';
import { speak, appendJournal } from './outputs.mjs';
import { loadPlannerData, analyzeBase, buildAdvice } from './base-advice.mjs';
import { MemFeed, catchText, catchKey, snapshotOnce } from './memfeed.mjs';

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

// メモリから直に受け取って、もう報告したパル。
// この後にセーブ経由の報告が同じパルを持ってくるので、二度言わないために覚えておく。
const announcedByMemory = new Set();

// 動いているメモリ受信。声で聞かれたとき、その場の数で答えるために覗く。
let liveFeed = null;

// サーバーのメモリを直に見る経路をつなぐ。
//
// セーブ経由(数十秒)とは別に、捕まえた瞬間(約1秒)を受け取る。
// 片方が壊れてももう片方が残るよう、2つは独立させてある。
function startMemFeed({ selftest = false } = {}) {
  if (cfg.memFeed === false) return;

  const feed = new MemFeed(cfg, async (c) => {
    const { text, tone } = catchText(c);
    console.log(`  [即時] ${text}${c.selftest ? '   ← 試験用の合図' : ''}`);
    // 試験用の合図は本物ではないので、あとの報告を黙らせてはいけない。
    if (!c.selftest) announcedByMemory.add(catchKey(c));
    if (!quiet) await speak(text, cfg.voice, cfg.speechRate, cfg, tone);
  }, console.log, selftest);
  feed.start();
  liveFeed = feed;
  process.on('SIGINT', () => { feed.stop(); process.exit(0); });
  return feed;
}

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
      if (!quiet) await speak(a, cfg.voice, cfg.speechRate, cfg, 'advice');
    }
    return;
  }

  const prev = loadState(STATE_FILE);
  let events = diffEvents(prev, cur, dexName);
  saveState(STATE_FILE, cur);

  // メモリ経由で既に伝えたパルは、声に出すのをやめる。
  // 同じ捕獲を1秒後と数分後の2回言われると、二重に聞こえて煩い。
  //
  // 消すのではなく重みを0にする。日誌には残したいので——
  // 声に出したかどうかと、記録に残すかどうかは別の話。
  //
  // ただし「初めての種類」「今までで一番いい個体」はメモリ側では分からない
  // (過去を知らないため)。その手の積み上げの話だけは、あらためて言う。
  if (announcedByMemory.size) {
    for (const e of events) {
      if (e.type !== 'catch') continue;
      const key = `${e.pal.dexId}:${e.pal.ivs.hp}:${e.pal.ivs.shot}:${e.pal.ivs.defense}`;
      if (!announcedByMemory.has(key)) continue;
      announcedByMemory.delete(key);
      if (!e.isNewSpecies && e.weight < 4) e.weight = 0;
    }
  }

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
    for (const e of toSpeak) await speak(e.text, cfg.voice, cfg.speechRate, cfg, e.type);
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
export async function buildTalkContext() {
  const { toHira } = await import('./voice.mjs');

  // 材料はメモリを優先する。
  //
  // セーブ経由のデータは最大5分古い。「今何体いる?」と聞かれて5分前の数を
  // 自信満々に答えるのは、黙るより悪い。メモリなら今この瞬間の数が分かる。
  // メモリが取れないときだけセーブ経由に落ちる(片方が壊れても答えは返る)。
  let pals = cfg.memFeed === false ? null : await snapshotOnce(cfg);
  let source = 'メモリ';
  if (!pals || !pals.length) {
    const cur = await fetchCurrent(cfg);
    pals = cur.pals;
    source = 'セーブ経由';
  }
  if (!pals.length) { console.log('まだパルのデータがありません。'); return null; }
  console.log(`  材料: ${source}(${pals.length}体)`);

  // 受信が動いていれば、そちらの最新に差し替わる。
  // 会話の途中で捕まえても、次の質問には新しい数で答えられる。
  const latest = () => (liveFeed?.pals?.length ? liveFeed.pals : pals);

  const advice = buildAdvice(analyzeBase(pals, dexName, plannerData, cfg.baseSlots), cfg.baseSlots);
  const ctx = {
    get total() { return latest().length; },
    get species() { return new Set(latest().map(p => p.dexId)).size; },
    get best() {
      const b = latest().slice().sort((a, c) => ivTotal(c) - ivTotal(a))[0];
      return b ? { name: dexName(b.dexId) || b.dexId, iv: ivTotal(b) } : null;
    },
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
          const mine = latest().filter(x => x.dexId === p.id);
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
  const say = (t, tone = 'reply') => speak(t, cfg.voice, cfg.speechRate, cfg, tone);

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
  const say = (t, tone = 'reply') => speak(t, cfg.voice, cfg.speechRate, cfg, tone);

  // 呼びかけ待ちの間も、捕まえたら知らせる。
  // 颯太さんがパルワールドを遊んでいるのはたいていこのモードなので、
  // ここで繋がっていないと即時報告の意味がほとんど無い。
  startMemFeed();

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
        const result = interpret(rest, ctx);
        if (result) { console.log(`  返答: ${result.text}`); await say(result.text, result.tone); }
        else { await say('ごめん、聞き取れなかった。もう一回言って。', 'unsure'); }
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
} else if (args.includes('--enroll')) {
  const { enroll } = await import('./voiceid.mjs');
  await enroll(cfg, { quick: args.includes('--quick') });
} else if (args.includes('--calibrate')) {
  const { calibrate } = await import('./voiceid.mjs');
  await calibrate(cfg);
} else if (args.includes('--read')) {
  // 途中から再開できるようにする: --read 20 で21文目から
  const i = args.indexOf('--read');
  const fromArg = parseInt(args[i + 1], 10);
  const from = Math.max(0, Number.isFinite(fromArg) ? fromArg : 0);
  // 印を付けられるようにする: --read --label リビング
  const li = args.indexOf('--label');
  const label = li >= 0 ? (args[li + 1] || '') : '';
  const { readAloud } = await import('./readaloud.mjs');
  await readAloud(cfg, { from, label });
} else if (args.includes('--compare-models')) {
  const { compare } = await import('./compare-models.mjs');
  await compare(cfg);
} else if (args.includes('--ask')) {
  // 文字で振り分けを試す: --ask "今何体いる"
  // 声を使わずに判断層だけを確かめられる。
  const i = args.indexOf('--ask');
  const text = args.slice(i + 1).filter(a => !a.startsWith('--')).join(' ');
  if (!text) {
    console.log('使い方: node palwatch.mjs --ask "今何体いる"');
  } else {
    const [{ respond }, voice, context] = await Promise.all([
      import('./respond.mjs'), import('./voice.mjs'), import('./context/index.mjs'),
    ]);
    const ctx = await buildTalkContext();
    const rulesFn = ctx ? (t => voice.interpret(t, ctx)) : null;
    const situation = await context.currentCached(cfg);
    const t0 = Date.now();
    const r = await respond(text, cfg, { rulesFn, ctx, situation });
    console.log(`  ${((Date.now() - t0) / 1000).toFixed(1)}秒  ${r.who}${r.risk ? ' / ' + r.risk : ''}`);
    console.log(`  ルナ: ${r.say}`);
  }
} else if (args.includes('--context')) {
  const ctx = await import('./context/index.mjs');
  const psn = await import('./context/psn.mjs');
  console.log('いま何をしているか、検知できるかを確認します。\n');
  const ts = psn.tokenState(cfg);
  console.log('  PSNトークン:', ts.ok ? `あり(${ts.length}文字)` : `× ${ts.why}`);
  console.log('  パルワールドVM:', cfg.palworldVm?.name || '未設定');
  console.log('');
  const c = await ctx.current(cfg);
  if (!c) {
    console.log('  → 何も検知できませんでした(既定の語彙のまま動きます)');
  } else {
    console.log(`  → ${c.title ?? '不明'} を検知(${c.source})`);
    if (c.scene) {
      console.log(`     場面: ${c.scene}`);
      console.log(`     語彙を切り替えます: ${c.vocabulary?.slice(0, 46)}…`);
    } else {
      console.log('     場面の割り当てが無いので、語彙は既定のままです');
    }
    if (c.data) console.log(`     ${JSON.stringify(c.data)}`);
  }
} else if (args.includes('--e2e')) {
  // 通しで測る: --e2e [回数] [--label 名前]
  const i = args.indexOf('--e2e');
  const n = parseInt(args[i + 1], 10);
  const li = args.indexOf('--label');
  const { endToEnd } = await import('./endtoend.mjs');
  await endToEnd(cfg, {
    rounds: Number.isFinite(n) ? n : 10,
    label: li >= 0 ? (args[li + 1] || '') : '',
  });
} else if (args.includes('--mictest')) {
  const { micTest } = await import('./mictest.mjs');
  await micTest(cfg);
} else if (args.includes('--whoami')) {
  // 場所の名前を受け取る: --whoami リビング
  const i = args.indexOf('--whoami');
  const place = (args[i + 1] && !args[i + 1].startsWith('--')) ? args[i + 1] : '';
  const { whoAmI } = await import('./whoami.mjs');
  await whoAmI(cfg, { place });
} else if (args.includes('--saturation')) {
  const { report } = await import('./saturation.mjs');
  report(cfg);
} else if (args.includes('--insights')) {
  const [{ report }, bank] = await Promise.all([
    import('./insights.mjs'), import('./voicebank.mjs'),
  ]);
  report(cfg, bank.loadIndex(cfg));
} else if (args.includes('--weakspots')) {
  const { report } = await import('./weakspots.mjs');
  report(cfg.corrections);
} else if (args.includes('--fix')) {
  // 聞き間違いを覚えさせる: --fix "誤り" "正しい"
  // 語彙のヒントで直らなかった語だけをここに入れる。確実に置き換わる。
  const i = args.indexOf('--fix');
  const wrong = args[i + 1], right = args[i + 2];
  if (!wrong || !right) {
    console.log('使い方: node palwatch.mjs --fix "聞き間違えられた形" "本来の形"');
    console.log('例:     node palwatch.mjs --fix "リューナ" "ルナ"');
    console.log('\n今の対応表:');
    const c = cfg.corrections || {};
    if (!Object.keys(c).length) console.log('  (まだ空です)');
    for (const [w, r] of Object.entries(c)) console.log(`  ${w} → ${r}`);
  } else {
    const file = path.join(HERE, 'config.json');
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    raw.corrections = { ...(raw.corrections || {}), [wrong]: right };
    fs.writeFileSync(file, JSON.stringify(raw, null, 2) + '\n');
    console.log(`覚えました: 「${wrong}」→「${right}」`);
    console.log(`  対応表は現在${Object.keys(raw.corrections).length}件です。`);
  }
} else if (args.includes('--devtalk')) {
  const { voiceChat } = await import('./voicechat.mjs');
  await voiceChat(cfg, {
    speakReplies: args.includes('--speak'),
    mode: args.includes('--push') ? 'push' : 'always',
  });
} else if (args.includes('--collect')) {
  const { collectMode } = await import('./collect.mjs');
  await collectMode(cfg);
} else if (args.includes('--miccheck')) {
  const { micCheck } = await import('./collect.mjs');
  await micCheck(cfg);
} else if (args.includes('--build')) {
  const { buildFromBank } = await import('./collect.mjs');
  await buildFromBank(cfg);
} else if (args.includes('--drop')) {
  // 覚えのない録音を消す: --drop <idの一部> [...]
  const ids = args.slice(args.indexOf('--drop') + 1).filter(a => !a.startsWith('--'));
  if (!ids.length) {
    console.log('消したい録音のidを指定してください(--voicebank --all で一覧が出ます)。');
  } else {
    const bank = await import('./voicebank.mjs');
    const hit = bank.drop(cfg, ids);
    console.log(hit.length ? `${hit.length}件消しました。` : '一致する録音がありませんでした。');
    for (const e of hit) console.log(`  ${e.id}  ${e.transcript}`);
    if (hit.length) console.log('\n  声紋に反映するには --build か --relearn を実行してください。');
  }
} else if (args.includes('--correct')) {
  // 正しい書き起こしを記録する: --correct <id> "本当に言った文"
  // 私(Claude)が会話の文脈から判断して使う。颯太さんが打つ必要はない。
  const i = args.indexOf('--correct');
  const id = args[i + 1];
  const truth = args.slice(i + 2).filter(a => !a.startsWith('--')).join(' ');
  const bank = await import('./voicebank.mjs');
  if (!id || !truth) {
    const done = bank.labelled(cfg);
    console.log(`正解が付いた音声: ${done.length}件`);
    const secs = done.reduce((a, e) => a + ((e.quality?.seconds) || 0), 0);
    console.log(`  合計 ${Math.round(secs / 60)}分  (追加学習の目安は60〜120分)`);
    if (done.length) {
      console.log('\n  最近の5件:');
      for (const e of done.slice(-5)) {
        console.log(`    聞こえ: ${e.transcript}`);
        console.log(`    正解  : ${e.truth}`);
      }
    }
  } else {
    const hit = bank.correct(cfg, id, truth);
    console.log(hit ? `記録しました: ${hit.transcript} → ${truth}`
                    : `${id} が見つかりません`);
  }
} else if (args.includes('--voicebank')) {
  const { stats } = await import('./voiceid.mjs');
  stats(cfg, { all: args.includes('--all') });
} else if (args.includes('--relearn')) {
  const { rebuild } = await import('./voiceid.mjs');
  await rebuild(cfg);
} else if (args.includes('--wake')) {
  await wakeMode();
} else if (args.includes('--talk')) {
  await talkMode();
} else if (args.includes('--memtest')) {
  // 「サーバー → SSH → Mac → 声」が繋がっているかを、遊んでいないときでも確かめる。
  // サーバー側に偽の捕獲を1件だけ出させて、そのまま最後まで通す。
  console.log('メモリ経由の経路を試します(偽の捕獲を1件流します)。');
  const t0 = Date.now();
  startMemFeed({ selftest: true });
  setTimeout(() => {
    console.log(`${((Date.now() - t0) / 1000).toFixed(1)}秒で終了。合図が出ていなければ経路が切れています。`);
    process.exit(0);
  }, 30000);
} else if (watch) {
  console.log(`見守りを開始します(${cfg.intervalMinutes}分ごと)。止めるには Control+C。`);
  startMemFeed();
  await tick();
  setInterval(tick, cfg.intervalMinutes * 60 * 1000);
} else {
  await tick();
}
