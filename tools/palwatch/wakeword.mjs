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

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { transcribeDetailed, measureRms, recordUtterance } from './stt.mjs';
import * as voiceid from './voiceid.mjs';
import * as bank from './voicebank.mjs';
import * as context from './context/index.mjs';

const TMP = path.join(os.tmpdir(), 'palwatch-wake');
fs.mkdirSync(TMP, { recursive: true });

// 聞き取りではカタカナが崩れるので(「ルナ」→「るな」)、平仮名に寄せて比べる。
const toHira = s => (s || '').replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
const isKana = c => /[ぁ-ゖー]/.test(c);

// 呼びかけ語は文頭付近にしか置かない。ここまでの文字数だけを見る。
// 「セーラームーンのルナが好き」のように、話の中に出てきた同じ語で反応しないため。
const HEAD_CHARS = 8;

// 以前はここで「先頭が1文字欠けた形」も認めていた(「ルナ、拠点は」→「な、拠点は」)。
// これが誤検出の主因だった。「な」で始まる日本語は多く、動画の音声で頻繁に引っかかる。
// 実測では、呼びかけでない文の約半分がこの規則だけで通っていた。
//
// そもそもこの規則は救えていなかった。whisperに語彙を教える(stt.mjs の --prompt)ように
// してから頭が欠ける崩れ方は起きなくなり、小声や遠い声で実際に起きるのは
// 「リューナ」のような別の崩れ方だった。効かない規則のために誤検出を抱えていたことになる。
//
// 崩れた読みを拾いたい場合は、規則を緩めるのではなく config.json の wakeWords に
// その表記を足す。どの語を許すかが目に見えるので、副作用が読める。

// 頭が1文字欠けた形。「ルナ」→「な」のように、最初の音が落ちた場合。
//
// 以前これを無条件で認めていて、誤検出の主因になった——「な」で始まる日本語は
// 多く、動画の音声で頻繁に引っかかる(実測 12/28)。
//
// ただし通しの試験で、10回中2回がこの崩れ方で落ちた。捨てるには惜しい。
// 本人だと分かっている前提でなら認めてよい。声紋が守るので、文字を緩められる。
// 「誰が言ったか」で守れるなら「何と言ったか」は緩められる、という交換。
export function containsWakeLoose(text, words) {
  const t = toHira(text).replace(/\s+/g, ' ');
  const head = t.slice(0, HEAD_CHARS);
  return words.some(w => {
    const h = toHira(w);
    if (h.length < 2) return false;
    const dropped = h.slice(1);
    const i = head.indexOf(dropped);
    if (i !== 0) return false;              // 文頭に限る
    const next = t[dropped.length];
    return next === undefined || !isKana(next);
  });
}

// 呼びかけ語が含まれているか。
// 文頭付近にあり、かつその直後で語が切れていること(仮名が続いていないこと)を求める。
// 直後を見るのは「ルナティック」「ルナルナ」のような別の語の一部で反応しないため。
export function containsWake(text, words) {
  const t = toHira(text).replace(/\s+/g, ' ');
  const head = t.slice(0, HEAD_CHARS);
  return words.some(w => {
    const h = toHira(w);
    const i = head.indexOf(h);
    if (i < 0) return false;
    const next = t[i + h.length];
    return next === undefined || !isKana(next);
  });
}

// 呼びかけ語より後ろを用件として取り出す(「ルナ、今何体いる」→「今何体いる」)。
export function stripWake(text, words) {
  const t = toHira(text).replace(/\s+/g, ' ');
  for (const w of words) {
    const h = toHira(w);
    const i = t.slice(0, HEAD_CHARS).indexOf(h);
    if (i < 0) continue;
    const next = t[i + h.length];
    if (next !== undefined && isKana(next)) continue;
    // 位置は平仮名に寄せた文字列で数えているが、長さは元の文字列と一対一で対応する
    // (置換しているのは文字種だけで、文字数は変わらない)ので、そのまま切り出せる。
    return text.slice(i + h.length).replace(/^[\s、。,.]+/, '').trim();
  }
  return text.replace(/^[\s、。,.]+/, '').trim();
}

// 呼びかけを待ち続ける。呼ばれたら onWake(用件のテキスト) を呼ぶ。
// 用件が空(呼びかけonly)なら null を渡すので、呼び出し側で聞き直せばよい。
export async function listenForWake(cfg, onWake, shouldStop = () => false) {
  const words = cfg.wakeWords && cfg.wakeWords.length ? cfg.wakeWords : ['ルナ'];
  const model = cfg.wakeWhisperModel || cfg.whisperModel;

  if (voiceid.isReady(cfg)) {
    console.log(`  (登録した声だけに反応します: しきい値 ${cfg.speakerThreshold ?? 0.70})`);
    // 声紋の常駐プロセスは起動に2.7秒かかる。最初の呼びかけを待たせないよう、
    // ここで先に立ち上げておく。2件目以降は0.02秒で済む。
    await voiceid.warmUp();
  }

  while (!shouldStop()) {
    let wav;
    try {
      wav = await recordUtterance(cfg, TMP);
    } catch (e) {
      if (shouldStop()) break;
      console.error('  録音に失敗:', e.message);
      continue;
    }

    // 聞き取りと声紋の照合は同じwavを使うので、両方が終わるまで消さない。
    try {
      // 小さすぎる音はここで捨てる。whisperを走らせる前に落とせるので、
      // 動画を流している間の負荷も下がる。しきい値は --calibrate で測って決める。
      if (cfg.wakeMinRms) {
        const rms = await measureRms(wav);
        if (rms != null && rms < cfg.wakeMinRms) {
          if (cfg.wakeDebug) console.log(`  (音が小さいので無視: RMS ${rms.toFixed(4)})`);
          continue;
        }
      }

      let text = '', rawText = '';
      try {
        // いま何をしているかで語彙を差し替える。
        // パルワールド中なら「アヌビス」「個体値」が当たりやすくなる。
        // 検知は裏で更新しているので、ここでは待たされない。
        const tuned = await context.tunedConfig(cfg);
        const det = await transcribeDetailed(wav, tuned, model);
        text = det.text; rawText = det.raw;
      } catch (e) {
        console.error('  聞き取りに失敗:', e.message);
        continue;
      }
      if (!text) continue;

      // 厳しい判定で通ればそれでよい。通らなくても、崩れた形なら望みがある。
      const strict = containsWake(text, words);
      const loose = !strict && containsWakeLoose(text, words);
      if (!strict && !loose) {
        if (cfg.wakeDebug) console.log(`  (呼びかけ以外: ${text})`);
        continue;
      }

      // 声紋を見る。緩い判定で拾ったものは、ここで本人と確認できたときだけ通す。
      // 文字が崩れていても、声が本人なら呼びかけとして扱ってよい。
      const { ok, similarity, embed } = await voiceid.checkOwner(wav, cfg);

      // 声紋が使えない状態(未登録など)で緩い判定を通すと、守るものが無くなる。
      if (loose && similarity == null) {
        if (cfg.wakeDebug) console.log(`  (崩れた呼びかけだが、声紋で確認できないので見送り: ${text})`);
        continue;
      }

      // 弾いた音も残す。しきい値を測り直すときの「弾きたい側」の実データになる。
      // 捨てると較正のたびに動画を流して録り直すことになる。
      if (!ok) {
        if (cfg.wakeDebug) {
          console.log(`  (別の人の声として無視: ${text} / 一致度 ${similarity?.toFixed(3)})`);
        }
        if (cfg.collectVoice) {
          bank.add(cfg, { wav, embed, transcript: text, transcriptRaw: rawText, similarity,
            rms: await measureRms(wav), source: 'live', accepted: false });
        }
        continue;
      }

      // 通した声のうち、はっきり本人だったものだけ貯める。
      // ぎりぎり通ったものを混ぜると、そこに他人が居た場合に声紋がそちらへ寄る。
      if (bank.shouldAdmit(cfg, similarity)) {
        bank.add(cfg, { wav, embed, transcript: text, transcriptRaw: rawText, similarity,
          rms: await measureRms(wav), source: 'live', accepted: true });
      }

      const rest = stripWake(text, words);
      await onWake(rest || null, text, similarity);
    } finally {
      fs.unlink(wav, () => {});
    }
  }
}
