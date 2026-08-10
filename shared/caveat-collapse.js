// 狭い画面で「.caveat」(データの出典・前提・既知の限界を書いた注意書き)を畳む。
//
// なぜ要るか: 注意書きは11.5pxで長いものは600文字以上あり、390px幅で実測すると
// 出現マップのものは高さ299pxあった。ヘッダー+タブと合わせるとツール本体が
// 画面の下端(844pxのうち640px付近)まで押し下げられ、開いた瞬間に何のページか
// 分からない状態になっていた(2026-08 実測)。
//
// 消すのではなく畳む。出典と既知の限界は正確さの担保なので、隠すのではなく
// 「読める状態で邪魔にならない」形にする。デスクトップは今まで通り常時表示。
//
// DOM構造には手を入れない。.caveat は <p> のページと <div> のページがあり、
// <p> の中に <div> は入れられないため、開閉ボタンは兄弟要素として後ろに置く。
(function () {
  var MQ = "(max-width: 640px)";
  var mq = window.matchMedia(MQ);

  function labelFor(open) {
    return open ? "閉じる" : "このページのデータについて";
  }

  function setup() {
    var list = document.querySelectorAll(".caveat");
    for (var i = 0; i < list.length; i++) {
      var cav = list[i];
      if (cav.dataset.collapseReady) continue;

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "caveat-toggle";
      btn.setAttribute("aria-expanded", "false");
      if (cav.id) btn.setAttribute("aria-controls", cav.id);
      btn.textContent = labelFor(false);

      (function (cav, btn) {
        btn.addEventListener("click", function () {
          var open = cav.dataset.collapsed === "0";
          cav.dataset.collapsed = open ? "1" : "0";
          btn.setAttribute("aria-expanded", String(!open));
          btn.textContent = labelFor(!open);
        });
      })(cav, btn);

      cav.parentNode.insertBefore(btn, cav.nextSibling);
      cav.dataset.collapseReady = "1";
      cav.dataset.collapsed = "1";
    }
    apply();
  }

  // 畳むのは「畳む価値があるほど長いもの」だけ。48文字程度の一行注記まで
  // ボタン付きにすると、かえって操作が増える。
  //
  // 判定に文字数を使うのは、描画後の高さだと表示中のものしか測れないため。
  // 出現マップのように複数ビューを1ページに持っていると、隠れているビューの
  // 注意書きは高さ0で「短い」と誤判定され、ビューを切り替えた先で畳まれない
  // ものが出る。文字数なら表示状態に左右されない。
  // 閾値120文字 = 390px幅・11.5pxで約4.6行。畳んだ時の3.6emより確実に長い。
  var MIN_CHARS = 120;

  function apply() {
    var narrow = mq.matches;
    var list = document.querySelectorAll(".caveat[data-collapse-ready]");
    for (var i = 0; i < list.length; i++) {
      var cav = list[i];
      var btn = cav.nextElementSibling;
      if (!btn || !btn.classList.contains("caveat-toggle")) continue;

      var long = cav.textContent.replace(/\s+/g, "").length > MIN_CHARS;

      if (narrow && long) {
        btn.hidden = false;
      } else {
        btn.hidden = true;
        cav.dataset.collapsed = "0";
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setup);
  } else {
    setup();
  }

  if (mq.addEventListener) mq.addEventListener("change", apply);
  else if (mq.addListener) mq.addListener(apply); // 古いSafari

  // 初期レイアウトが確定する前に apply() が走ると、実際より狭いと誤判定して
  // ボタンが出たままになることがある。リサイズでも一応かけ直す。
  var t = null;
  window.addEventListener("resize", function () {
    clearTimeout(t);
    t = setTimeout(apply, 150);
  });
})();
