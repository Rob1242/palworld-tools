// 検知した出来事の出力先。声とObsidianの日誌を担当する。

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);

// --- 声 ---
// 既定はmacOS標準のsay(追加のインストール不要)。
// VOICEVOXが起動していればそちらを使う。設定で明示的に切り替えることもできる。
// 遊んでいる最中に喋り続けると邪魔になるので、重要度の低い出来事は読み上げない。

let voicevoxAlive = null;   // 起動確認の結果を覚えておく(毎回試すと遅いため)

async function voicevoxAvailable(cfg) {
  if (voicevoxAlive !== null) return voicevoxAlive;
  try {
    const r = await fetch(`${cfg.voicevoxUrl}/version`, { signal: AbortSignal.timeout(1500) });
    voicevoxAlive = r.ok;
  } catch {
    voicevoxAlive = false;
  }
  return voicevoxAlive;
}

// 内容に応じた話し方を選ぶ。
// VOICEVOXは同じキャラでもスタイルごとに別の番号が振られているので、
// 「うれしい報告はこの番号」「淡々とした報告はこの番号」と割り当てられる。
// 設定に無い場合は既定の話者に落とすので、番号を1つしか登録していなくても動く。
export function pickStyle(cfg, tone) {
  const styles = cfg.voicevoxStyles || {};
  const id = styles[tone];
  return {
    speaker: id ?? cfg.voicevoxSpeaker ?? 3,
    speed: (cfg.voicevoxToneSpeed || {})[tone] ?? cfg.voicevoxSpeed ?? 1.0,
    pitch: (cfg.voicevoxTonePitch || {})[tone] ?? cfg.voicevoxPitch ?? 0.0,
  };
}

async function speakVoicevox(text, cfg, tone) {
  const base = cfg.voicevoxUrl;
  const st = pickStyle(cfg, tone);
  const sp = st.speaker;
  // VOICEVOXは「読み方の解析」と「音声合成」の2段階に分かれている
  const q = await fetch(`${base}/audio_query?text=${encodeURIComponent(text)}&speaker=${sp}`, { method: 'POST' });
  if (!q.ok) throw new Error(`audio_query 失敗 (${q.status})`);
  const query = await q.json();
  query.speedScale = st.speed;
  query.pitchScale = st.pitch;

  const s = await fetch(`${base}/synthesis?speaker=${sp}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(query),
  });
  if (!s.ok) throw new Error(`synthesis 失敗 (${s.status})`);

  const wav = path.join(os.tmpdir(), `palwatch_vv_${Date.now()}.wav`);
  fs.writeFileSync(wav, Buffer.from(await s.arrayBuffer()));
  try {
    await execFileAsync('afplay', [wav]);
  } finally {
    fs.unlink(wav, () => {});
  }
}

// tone には出来事の種類('catch' 'levelup' など)や 'reply' を渡す。
// 未指定なら既定の話し方になる。
export async function speak(text, voice = 'Kyoko', rate = 190, cfg = null, tone = null) {
  // VOICEVOXを使う設定で、実際に起動していればそちらで喋る
  if (cfg && cfg.useVoicevox !== false && cfg.voicevoxUrl && await voicevoxAvailable(cfg)) {
    try {
      await speakVoicevox(text, cfg, tone);
      return;
    } catch (e) {
      console.error('  VOICEVOXでの読み上げに失敗、標準の声に切り替えます:', e.message);
      voicevoxAlive = false;   // 以降はsayを使う
    }
  }
  try {
    await execFileAsync('say', ['-v', voice, '-r', String(rate), text]);
  } catch (e) {
    console.error('  読み上げに失敗:', e.message);
  }
}

// --- Obsidianの日誌 ---
// vaultは単なるMarkdownの集まりなので、ファイルを直接書けばObsidianに反映される
// (プラグインのAPIやキーが要らないぶん、壊れにくい)。
export function appendJournal(vaultDir, dateStr, lines, summary) {
  const file = path.join(vaultDir, `palworld_log_${dateStr}.md`);
  if (!fs.existsSync(file)) {
    const head = [
      '---',
      `name: palworld_log_${dateStr}`,
      `description: Palworld専用サーバーの自動記録(${dateStr})。捕獲・レベルアップなどの出来事をセーブデータの差分から書き出したもの。`,
      'metadata:',
      '  type: project',
      '---',
      '',
      `# Palworld 冒険日誌 ${dateStr}`,
      '',
      'サーバーのセーブデータを定期的に読んで自動生成しています。手で書き足しても消えません。',
      '',
      '## 出来事',
      '',
    ].join('\n');
    fs.writeFileSync(file, head);
  }
  let body = fs.readFileSync(file, 'utf8');

  // 「出来事」の節の末尾に追記する(手で書いた内容を壊さないよう、節を狙って入れる)
  const marker = '## 出来事\n\n';
  const idx = body.indexOf(marker);
  const insertAt = idx >= 0 ? idx + marker.length : body.length;
  const addition = lines.map(l => `- ${l}`).join('\n') + '\n';
  body = body.slice(0, insertAt) + addition + body.slice(insertAt);

  // 日の終わりの要約は常に最新のものへ差し替える
  if (summary) {
    const sumHead = '\n## 今の状況\n\n';
    const si = body.indexOf('## 今の状況');
    if (si >= 0) body = body.slice(0, si).replace(/\n+$/, '\n') + sumHead.trimStart() + summary + '\n';
    else body = body.replace(/\n*$/, '\n') + sumHead + summary + '\n';
  }
  fs.writeFileSync(file, body);
  return file;
}
