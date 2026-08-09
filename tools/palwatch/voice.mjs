// 声で話しかけて、声で返してもらうための部分。
//
// Palworldはゲーム内チャットを読む手段が無いので、Macのマイクで受けることで
// 双方向のやり取りを成立させている(PS5で遊びながらMacに話しかける想定)。
//
// 録音 → whisper.cppで文字起こし → 意図を判定 → sayで返answer
// すべてMac内で完結し、音声は外部へ送られない。

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { transcribeFile } from './stt.mjs';

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
// 実体は stt.mjs にある。呼びかけ側と設定を共有するため。
export async function transcribe(wav, cfg) {
  return transcribeFile(wav, cfg);
}

// --- 意図の判定 ---
// LLMには繋がず、ゲームのデータで答えられる質問に絞って確実に返す。
// 聞き取りは揺れるので、完全一致ではなく含まれる語で判定する。
const has = (t, ...ws) => ws.some(w => t.includes(w));

// 語が1つ当たっただけで答えない。
//
// 「何体」が入っているだけで所持数を返していた。聞き取りが崩れて
// 「時間は何匹撮ってる?」になっても引っかかり、図鑑の質問に所持数を答えていた。
// 実測で50件中3件(6%)がこれで違う答えを返している。
//
// 反応しないより、違う答えを自信満々に返すほうが悪い。颯太さんは
// 間違いに気づけないまま受け取ることになる。だから確信が持てるときだけ答え、
// 足りなければ聞き返す側に渡す。
//
// 核になる語(それ自体で意図が決まる)が当たれば1つでよい。
// 弱い語(他の意図とも共通する)は、2つ以上そろって初めて認める。
const decided = (t, core, weak = []) =>
  core.some(w => t.includes(w)) ||
  weak.filter(w => t.includes(w)).length >= 2;

// 聞き取りではカタカナが平仮名に崩れることがある(「セクメト」→「セクメと」など)。
// パル名を探すときは平仮名に寄せてから比べる。
export const toHira = s => (s || '').replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));

// 返答の中身によって声色を変えるため、テキストと一緒に tone も返す。
// tone は outputs.mjs の voicevoxStyles のキーと対応する:
//   'reply'  … 通常の受け答え(既定の話し方)
//   'advice' … 拠点の助言(落ち着いた話し方。日誌の advice と共通)
//   'unsure' … データが無い/わからない系(しょんぼりした話し方。日誌の gone と共通)
const reply = (text) => ({ text, tone: 'reply' });
const unsure = (text) => ({ text, tone: 'unsure' });
const advice = (text) => ({ text, tone: 'advice' });

export function interpret(text, ctx) {
  const t = text.replace(/\s/g, '');
  if (!t) return null;

  // 特定の種を持っているか(「アヌビスは何体いる」のように汎用の「何体」も含みうるため、
  // 汎用判定より先に見る。先にパル名が見つかればそちらを優先する)
  const hit = ctx.findSpecies(t);
  if (hit) {
    return hit.count > 0
      ? reply(`${hit.name}は${hit.count}体いるよ。${hit.bestIv ? `一番いいのは個体値合計${hit.bestIv}。` : ''}`)
      : unsure(`${hit.name}はまだ持ってないね。`);
  }
  // 何体いる / 何種類
  // 図鑑を先に見る。
  // 「図鑑は何体、何匹採ってる?」のように、崩れた文には両方の語が混ざる。
  // 所持数を先に判定すると「何体」に引っかかって、図鑑の質問に所持数を答えてしまう。
  // より限定的な意図(図鑑)を先に置く。
  if (decided(t, ['図鑑', 'ずかん', '何種類', 'なんしゅるい'],
                 ['何種', 'なんしゅ', 'そろっ', '揃っ', 'コンプ'])) {
    return reply(`図鑑は${ctx.species}種類そろってるよ。あと${299 - ctx.species}種類。`);
  }

  // 「何体」だけでは決められない。「今」「持って」などと組んで初めて所持数の質問になる。
  if (decided(t, ['何体いる', 'なんたいいる', '何匹いる', '何体持', '合計何体'],
                 ['何体', 'なんたい', '何匹', 'なんびき', '今', 'いま', 'いる', '持っ'])) {
    return reply(`今は${ctx.total}体いるよ。種類は${ctx.species}種類。`);
  }
  // 一番強い / 良個体
  if (decided(t, ['一番強い', 'いちばんつよい', '最強', '一番いい'],
                 ['一番', 'いちばん', '最高', 'つよい', '強い', 'パル'])) {
    return ctx.best
      ? reply(`いちばん個体値が高いのは${ctx.best.name}で、合計${ctx.best.iv}だよ。`)
      : unsure('まだ個体のデータが無いよ。');
  }
  // 拠点の助言
  if (decided(t, ['拠点', 'きょてん', '編成'],
                 ['おすすめ', 'どうすれば', 'どうしたら', '改善', '様子'])) {
    return ctx.advice.length ? advice(ctx.advice.slice(0, 2).join(' ')) : unsure('拠点の助言はまだ出せないよ。');
  }
  // 調子伺い
  if (has(t, 'ただいま', 'おはよう', 'こんにちは', 'こんばんは', 'やあ')) {
    return reply(`おかえり。今は${ctx.total}体、${ctx.species}種類だよ。`);
  }
  return null;
}

// --- 1回ぶんのやり取り ---
export async function listenOnce(cfg, ctx, speak) {
  const wav = await recordUntilSilence(cfg);
  const text = await transcribe(wav, cfg);
  if (!text) return { heard: '', reply: null };
  const result = interpret(text, ctx);
  if (result) await speak(result.text, result.tone);
  else await speak('ごめん、聞き取れなかった。もう一回言って。', 'unsure');
  return { heard: text, reply: result ? result.text : null };
}
