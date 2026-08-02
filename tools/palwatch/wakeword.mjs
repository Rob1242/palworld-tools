// 呼びかけ語の検出。「ルナ」と言ったら聞き取りを始める。
//
// Siriと同じ二段構えにしている:
//   常時は軽い検出だけを動かし(CPUをほとんど使わない)、
//   呼びかけを検知した時だけwhisperを起動して本格的に聞き取る。
// whisperを回しっぱなしにすると8GBのMacでは重すぎるため。
//
// 呼びかけ語は2通り選べる:
//   日本語 … Picovoice Consoleで作った .ppn と日本語モデルが要る(「ルナ」等)
//   英語   … 組み込みの語をそのまま使える。追加ファイル不要(JARVIS等)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export async function createDetector(cfg) {
  const { Porcupine, BuiltinKeyword } = await import('@picovoice/porcupine-node');
  const { PvRecorder } = await import('@picovoice/pvrecorder-node');

  if (!cfg.picovoiceAccessKey) {
    throw new Error('config.json に picovoiceAccessKey がありません。');
  }

  let porcupine;
  const jaModel = path.join(HERE, 'models', 'porcupine_params_ja.pv');
  const kw = cfg.wakeWordFile ? path.join(HERE, cfg.wakeWordFile) : null;

  if (kw && fs.existsSync(kw)) {
    // 日本語などの自作呼びかけ語
    if (!fs.existsSync(jaModel)) throw new Error('日本語モデル(models/porcupine_params_ja.pv)が見つかりません。');
    porcupine = new Porcupine(cfg.picovoiceAccessKey, [kw], [cfg.wakeSensitivity ?? 0.6], jaModel);
  } else {
    // 組み込みの英語の語(追加ファイルなしで動かせる)
    const name = (cfg.builtinWakeWord || 'JARVIS').toUpperCase();
    const builtin = BuiltinKeyword[name];
    if (builtin === undefined) throw new Error(`組み込みの呼びかけ語に ${name} はありません。`);
    porcupine = new Porcupine(cfg.picovoiceAccessKey, [builtin], [cfg.wakeSensitivity ?? 0.6]);
  }

  const recorder = new PvRecorder(porcupine.frameLength, cfg.audioDeviceIndex ?? -1);
  return { porcupine, recorder };
}

// 呼びかけを待ち続け、検知するたびに onWake を呼ぶ。
// onWake の実行中は検出を止める(自分の返事の声を拾って誤検知するのを防ぐため)。
export async function listenForWake({ porcupine, recorder }, onWake, shouldStop = () => false) {
  recorder.start();
  try {
    while (!shouldStop()) {
      const frame = await recorder.read();
      if (porcupine.process(frame) >= 0) {
        recorder.stop();
        try { await onWake(); } finally { recorder.start(); }
      }
    }
  } finally {
    recorder.stop();
  }
}

export function release({ porcupine, recorder }) {
  try { recorder.release(); } catch {}
  try { porcupine.release(); } catch {}
}
