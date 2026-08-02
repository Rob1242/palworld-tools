// 呼びかけ語の検出。「ルナ」と言ったら反応する。
//
// Picovoiceは2026年6月30日に個人利用プランが廃止されたため使えない。
// 代わりに、すでに入れてあるwhisperだけで実現している。追加の登録もキーも要らない。
//
// 仕組み:
//   1. soxが無音を監視して待つ(音量を見ているだけなのでCPUをほとんど使わない)
//   2. 声が始まったら録音し、黙ったところで自動的に切る
//   3. whisperで文字にして、呼びかけ語が含まれているか見る
//
// この作りの利点は、「ルナ、今何体いる」のように呼びかけと用件を続けて言えること。
// 呼びかけだけを検出する方式だと、二度手間になる。

import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const execFileAsync = promisify(execFile);

const TMP = path.join(os.tmpdir(), 'palwatch-wake');
fs.mkdirSync(TMP, { recursive: true });

// 聞き取りではカタカナが崩れるので(「ルナ」→「るな」)、平仮名に寄せて比べる。
const toHira = s => (s || '').replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));

// 呼びかけ語が含まれているか。
// 短い呼びかけは頭が欠けやすい(「ルナ、拠点は」→「な、拠点は」のように「ル」が落ちる)。
// そこで完全一致に加えて、先頭が1文字欠けた形も文頭に限って認める。
// 文頭に限定するのは、文の途中にたまたま同じ音があった時に誤反応しないため。
export function containsWake(text, words) {
  const t = toHira(text).replace(/[\s、。,.!?！？]/g, '');
  if (words.some(w => t.includes(toHira(w)))) return true;
  return words.some(w => {
    const h = toHira(w);
    return h.length >= 2 && t.startsWith(h.slice(1));
  });
}

// 呼びかけ語より後ろを用件として取り出す(「ルナ、今何体いる」→「今何体いる」)。
export function stripWake(text, words) {
  let t = text;
  for (const w of words) {
    const h = toHira(w);
    const i = toHira(t).indexOf(h);
    if (i >= 0) { t = t.slice(i + w.length); break; }
    // 先頭が欠けた形(「な、拠点は」)も取り除く
    if (h.length >= 2 && toHira(t).startsWith(h.slice(1))) { t = t.slice(h.length - 1); break; }
  }
  return t.replace(/^[\s、。,.]+/, '').trim();
}

// 声が始まるのを待って、黙るまで録音する。
// 無音の間はsoxが音量を見ているだけなので、待機中の負荷はごく小さい。
function recordUtterance(cfg) {
  const wav = path.join(TMP, `w_${Date.now()}.wav`);
  return new Promise((resolve, reject) => {
    const p = spawn('rec', [
      '-q', '-r', '16000', '-c', '1', '-b', '16', wav,
      // 前半: 声が始まるまで無音を捨て続ける / 後半: 黙ったら終了
      'silence', '1', '0.1', String(cfg.wakeStartThreshold || '3%'),
      '1', String(cfg.wakeSilenceSec || 1.0), String(cfg.wakeStopThreshold || '3%'),
      'trim', '0', String(cfg.wakeMaxSec || 10),
    ]);
    p.on('error', reject);
    p.on('close', () => fs.existsSync(wav) ? resolve(wav) : reject(new Error('録音できませんでした')));
  });
}

async function transcribe(wav, model) {
  try {
    const { stdout } = await execFileAsync('whisper-cli',
      ['-m', model, '-l', 'ja', '-nt', '-np', '-f', wav], { maxBuffer: 1024 * 1024 });
    return stdout.replace(/\s+/g, ' ').trim();
  } finally {
    fs.unlink(wav, () => {});
  }
}

// 呼びかけを待ち続ける。呼ばれたら onWake(用件のテキスト) を呼ぶ。
// 用件が空(呼びかけonly)なら null を渡すので、呼び出し側で聞き直せばよい。
export async function listenForWake(cfg, onWake, shouldStop = () => false) {
  const words = cfg.wakeWords && cfg.wakeWords.length ? cfg.wakeWords : ['ルナ'];
  const model = cfg.wakeWhisperModel || cfg.whisperModel;

  while (!shouldStop()) {
    let wav;
    try {
      wav = await recordUtterance(cfg);
    } catch (e) {
      if (shouldStop()) break;
      console.error('  録音に失敗:', e.message);
      continue;
    }
    let text = '';
    try {
      text = await transcribe(wav, model);
    } catch (e) {
      console.error('  聞き取りに失敗:', e.message);
      continue;
    }
    if (!text) continue;

    if (containsWake(text, words)) {
      const rest = stripWake(text, words);
      await onWake(rest || null, text);
    } else if (cfg.wakeDebug) {
      console.log(`  (呼びかけ以外: ${text})`);
    }
  }
}
