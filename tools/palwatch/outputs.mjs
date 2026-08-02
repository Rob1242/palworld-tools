// 検知した出来事の出力先。声とObsidianの日誌を担当する。

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);

// --- 声 ---
// macOS標準のsayコマンドを使う。追加のインストールが要らず、日本語の声も入っている。
// 遊んでいる最中に喋り続けると邪魔になるので、重要度の低い出来事は読み上げない。
export async function speak(text, voice = 'Kyoko', rate = 190) {
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
