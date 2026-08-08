/* ============================================================
   sfx.js — 押したときの効果音(2026-08-09)

   音源ファイルは置かない。Web Audio の矩形波をその場で鳴らす。
   理由:
     ・ファイル0バイト。104KBのフォントを削った直後に音で増やしたくない
     ・8bit機の音は元々矩形波。サンプルを持ってくるより本物に近い
     ・CSPに media-src を足さずに済む

   **既定はオフ。** クリックで急に音が出るのは、
   夜にイヤホンで見ている人にとっては事故なので、
   ティッカー右端のスピーカーボタンで自分で入れてもらう。
   選択は localStorage に残るので、一度入れれば次回から鳴る。
   ============================================================ */
(function () {
  "use strict";

  var KEY = "arc-sfx";
  var on = false;
  try { on = localStorage.getItem(KEY) === "1"; } catch (e) {}

  var ctx = null;
  var last = 0;

  function audio() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  /* 1音。type=波形, f0→f1 に周波数を動かす, dur秒, vol音量 */
  function tone(f0, f1, dur, vol, type) {
    var c = audio(); if (!c) return;
    var osc = c.createOscillator();
    var gain = c.createGain();
    var t = c.currentTime;

    osc.type = type || "square";
    osc.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) osc.frequency.linearRampToValueAtTime(f1, t + dur);

    /* 立ち上がりを2msだけ入れる。0だとプチッと鳴る */
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(gain); gain.connect(c.destination);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  var SOUNDS = {
    nav:    function () { tone(520, 780, 0.06, 0.05); },                    // タブ・リンク
    press:  function () { tone(300, 300, 0.045, 0.05); },                   // ボタン
    open:   function () { tone(440, 660, 0.05, 0.05); setTimeout(function(){ tone(660, 880, 0.06, 0.045); }, 45); },  // カードを開く
    toggle: function () { tone(680, 680, 0.04, 0.045, "triangle"); },       // 絞り込み・チップ
    close:  function () { tone(520, 260, 0.07, 0.045); },                   // 閉じる・戻る
    boot:   function () { [523, 659, 784].forEach(function (f, i) { setTimeout(function () { tone(f, f, 0.07, 0.05); }, i * 80); }); }
  };

  function play(name) {
    if (!on) return;
    var now = performance.now();
    if (now - last < 40) return;      // 連打で音が団子にならないよう間引く
    last = now;
    var s = SOUNDS[name]; if (s) s();
  }
  window.arcSfx = play;               // 他のスクリプトからも鳴らせるように

  /* --- どこを押したら何を鳴らすか。個々の要素には触らず委譲で拾う --- */
  document.addEventListener("click", function (e) {
    if (!on) return;
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest(".arc-sfx-btn")) return;                 // トグル自身は別で鳴らす
    if (t.closest(".arc-close, .back-btn, [data-close]")) return play("close");
    if (t.closest("nav.tabs a")) return play("nav");
    if (t.closest("a.card, a.tool-card, .tool-card")) return play("open");
    if (t.closest(".chip, input[type=checkbox], input[type=radio], summary")) return play("toggle");
    if (t.closest("button, [role=button], .btn")) return play("press");
    if (t.closest("a[href]")) return play("nav");
  }, true);

  /* --- ティッカー右端のスピーカーボタン --- */
  function mount() {
    var ticker = document.querySelector(".arc-ticker");
    if (!ticker || ticker.querySelector(".arc-sfx-btn")) return;

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "arc-sfx-btn";
    var paint = function () {
      btn.textContent = on ? "♪ 音 ON" : "♪ 音 OFF";
      btn.setAttribute("aria-pressed", String(on));
      btn.setAttribute("aria-label", on ? "効果音を切る" : "効果音を鳴らす");
    };
    paint();

    btn.addEventListener("click", function () {
      on = !on;
      try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (e) {}
      paint();
      if (on) SOUNDS.boot();          // 入れた瞬間に鳴らして、音量を確かめてもらう
    });

    ticker.appendChild(btn);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
