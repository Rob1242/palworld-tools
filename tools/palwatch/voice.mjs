// 声で話しかけて、声で返してもらうための部分。
//
// Palworldはゲーム内チャットを読む手段が無いので、Macのマイクで受けることで
// 双方向のやり取りを成立させている(PS5で遊びながらMacに話しかける想定)。
//
// 録音 → whisper.cppで文字起こし → 意図を判定 → sayで返answer
// すべてMac内で完結し、音声は外部へ送られない。

import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const execFileAsync = promisify(execFile);

const TMP = path.join(os.tmpdir(), 'palwatch-voice');
fs.mkdirSync(TMP, { recursive: true });

// --- 録音 ---
// 無音が一定時間続いたら自動で止める(話し終わりを待たなくてよくするため)。
export function recordUntilSilence(cfg) {
  const wav = path.join(TMP, `rec_${Date.now()}.wav`);
  return new Promise((resolve, reject) => {
    const p = spawn('rec', [
      '-q', '-r', '16000', '-c', '1', '-b', '16', wav,
      'silence', '1', '0.1', String(cfg.voiceStartThreshold || '2%'),
      '1', String(cfg.voiceSilenceSec || 1.2), String(cfg.voiceStopThreshold || '2%'),
      'trim', '0', String(cfg.voiceMaxSec || 12),
    ]);
    p.on('error', reject);
    p.on('close', () => fs.existsSync(wav) ? resolve(wav) : reject(new Error('録音できませんでした')));
  });
}

// --- 文字起こし ---
export async function transcribe(wav, cfg) {
  try {
    const { stdout } = await execFileAsync('whisper-cli', [
      '-m', cfg.whisperModel, '-l', 'ja', '-nt', '-np', '-f', wav,
    ], { maxBuffer: 1024 * 1024 });
    return stdout.replace(/\s+/g, ' ').trim();
  } finally {
    fs.unlink(wav, () => {});
  }
}

// --- 意図の判定 ---
// LLMには繋がず、ゲームのデータで答えられる質問に絞って確実に返す。
// 聞き取りは揺れるので、完全一致ではなく含まれる語で判定する。
const has = (t, ...ws) => ws.some(w => t.includes(w));

// 聞き取りではカタカナが平仮名に崩れることがある(「セクメト」→「セクメと」など)。
// パル名を探すときは平仮名に寄せてから比べる。
export const toHira = s => (s || '').replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));

export function interpret(text, ctx) {
  const t = text.replace(/\s/g, '');
  if (!t) return null;

  // 何体いる / 何種類
  if (has(t, '何体', 'なんたい', '何匹', 'なんびき')) {
    return `今は${ctx.total}体いるよ。種類は${ctx.species}種類。`;
  }
  if (has(t, '何種', 'なんしゅ', '図鑑')) {
    return `図鑑は${ctx.species}種類そろってるよ。あと${299 - ctx.species}種類。`;
  }
  // 一番強い / 良個体
  if (has(t, '一番', 'いちばん', '最強', '最高', 'つよい', '強い')) {
    return ctx.best
      ? `いちばん個体値が高いのは${ctx.best.name}で、合計${ctx.best.iv}だよ。`
      : 'まだ個体のデータが無いよ。';
  }
  // 拠点の助言
  if (has(t, '拠点', 'きょてん', '編成', 'おすすめ', 'どうすれば')) {
    return ctx.advice.length ? ctx.advice.slice(0, 2).join(' ') : '拠点の助言はまだ出せないよ。';
  }
  // 特定の種を持っているか
  const hit = ctx.findSpecies(t);
  if (hit) {
    return hit.count > 0
      ? `${hit.name}は${hit.count}体いるよ。${hit.bestIv ? `一番いいのは個体値合計${hit.bestIv}。` : ''}`
      : `${hit.name}はまだ持ってないね。`;
  }
  // 調子伺い
  if (has(t, 'ただいま', 'おはよう', 'こんにちは', 'こんばんは', 'やあ')) {
    return `おかえり。今は${ctx.total}体、${ctx.species}種類だよ。`;
  }
  return null;
}

// --- 1回ぶんのやり取り ---
export async function listenOnce(cfg, ctx, speak) {
  const wav = await recordUntilSilence(cfg);
  const text = await transcribe(wav, cfg);
  if (!text) return { heard: '', reply: null };
  const reply = interpret(text, ctx);
  if (reply) await speak(reply);
  else await speak('ごめん、聞き取れなかった。もう一回言って。');
  return { heard: text, reply };
}
