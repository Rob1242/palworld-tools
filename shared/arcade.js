/* ============================================================
   arcade.js — 画面を「動いている機械」にする層(2026-08-09)

   design-system.css が筐体の"形"を担当し、こちらが"生きている感じ"を担当する。
   参考にした spideytracker.net で効いていたのは、ドット絵そのものではなく:
     ・枠の外にキャラが立っている
     ・下で何かが流れ続けている(放っておいても動く)
     ・説明がキャラの声で来る
     ・起動したときログが流れる
   この4つ。20ページ全部が body > .wrap という同じ骨格なので、
   HTMLを1行ずつ書き換えずに、このスクリプト1本を読み込むだけで全部に乗る。

   **各ページのHTMLには <script src="shared/arcade.js" defer></script> だけ足す。**
   ============================================================ */
(function () {
  "use strict";

  /* 絵の中身を差し替えたときに古いものを掴ませないための版。
     tools/spritegen/idle.py を回して絵を作り直したら、ここも上げること。 */
  var V = "?v=20260809c";

  var wrap = document.querySelector("body > .wrap");
  if (!wrap) return;                       // リダイレクト用の小さいページは対象外

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var file = location.pathname.split("/").pop() || "palworld_home.html";

  /* --- ページごとの相棒と一言。
         ただの飾りにしないため、全部そのページで実際に役に立つことを言わせる --- */
  var PAGES = {
    "palworld_home.html":            ["home",     "どこから手をつけるか迷ったら、上の検索に作りたいパルの名前を入れてみて。"],
    "palworld_dex.html":             ["dex",      "属性で絞ってから並べ替えると、狙いのパルが一気に見つかるよ。"],
    "palworld_breeding.html":        ["breeding", "欲しい子から逆に引けるよ。親を探すより先に、ゴールを入れるのが速い。"],
    "palworld_palbox.html":          ["palbox",   "セーブデータを読み込むと、手持ちから届く配合ルートを勝手に組むよ。"],
    "palworld_combat.html":          ["combat",   "瞬間火力と継続火力は別物。長期戦なら継続のほうを見て。"],
    "palworld_base_planner_v2.html": ["base",     "枠数と重要度を入れるだけ。287体の組み合わせはこっちで総当たりするよ。"],
    "palworld_map.html":             ["map",      "レイヤーは重ねられるよ。ボスと商人を同時に出すと下見が一度で済む。"],
    "palworld_bossguide.html":       ["boss",     "塔ボスは弱点より、固有技の避け方を先に読んだほうが早く勝てる。"],
    "palworld_items.html":           ["items",    "2466種あるから、カテゴリで絞ってから探したほうがいいよ。"],
    "palworld_skills.html":          ["combat",   "威力だけじゃなくクールタイムも見て。回転の速い技のほうが強いこともある。"],
    "palworld_passives.html":        ["palbox",   "ランクの高いパッシブは、配合で受け継がせる価値があるよ。"],
    "palworld_passives_guide.html":  ["palbox",   "用途別の組み合わせを厳選してあるよ。迷ったらここの通りで大丈夫。"],
    "palworld_tierlist.html":        ["combat",   "戦闘・拠点・マウントで最強は全然違うよ。用途を決めてから見て。"],
    "palworld_ride.html":            ["ride",     "移動が面倒になってきたら、ここで一番速い足を選ぶといいよ。"],
    "palworld_iv_calc.html":         ["tools",    "今のHP・攻撃・防御を入れるだけで、隠れた素質値が逆算できるよ。"],
    "palworld_technology.html":      ["base",     "先に解放レベルを見ておくと、無駄なポイントを使わずに済むよ。"],
    "palworld_achievements.html":    ["tools",    "進行度で絞り込むと、残りの実績だけ並べられるよ。"],
    "palworld_party_guide.html":     ["breeding", "序盤・作業班・終盤で編成は変わるよ。今の段階のところだけ読めば十分。"],
    "palworld_reference.html":       ["tools",    "作業優先度の表は、拠点が動かなくなったときに見ると原因が分かるよ。"],
    "palworld_changelog.html":       ["tools",    "何が変わったかはここに全部載せてるよ。"]
  };
  var page = PAGES[file] || ["home", "上のタブから行きたいツールを選んでね。"];

  /* --- ティッカーに流す事実。数字は実データに合わせてある --- */
  var FACTS = [
    ["収録パル", "298", "体"], ["アイテム", "2,466", "種"], ["アクティブスキル", "350", "種"],
    ["パッシブ", "115", "種"], ["パル像", "407", "体"], ["ミッション", "117", "件"],
    ["フィールドボス", "83", "体"], ["塔ボス", "10", "体"], ["ツール", "20", "種"]
  ];

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  /* ===== 1. 上ベゼルの看板 ===== */
  /* h1 は <small>Palworld 攻略ツール</small>パル図鑑 という構造。
     small はサイト名なので落とし、ページ名だけを看板に出す。 */
  var titleEl = document.querySelector("h1.title, h1.brand-title");
  var title = "攻略ツール";
  if (titleEl) {
    var clone = titleEl.cloneNode(true);
    var small = clone.querySelector("small");
    if (small) small.remove();
    title = clone.textContent.replace(/\s+/g, " ").trim() || title;
  }
  var plaque = el("div", "arc-plaque");
  plaque.setAttribute("aria-hidden", "true");
  plaque.appendChild(el("span", "arc-plaque-in",
    '<b>PALWORLD</b><i class="arc-dot"></i><em>' + title + "</em>"));
  wrap.parentNode.insertBefore(plaque, wrap);

  /* ===== 2. 下のティッカー。放っておいても動き続ける ===== */
  var ticker = el("div", "arc-ticker");
  ticker.setAttribute("aria-hidden", "true");
  var track = el("div", "arc-track");
  var items = FACTS.map(function (f) {
    return "<span><b>" + f[0] + "</b> <i>" + f[1] + "</i> " + f[2] + "</span>";
  }).join("");
  track.innerHTML = items + items;          // 2周分入れて途切れなく繋ぐ
  ticker.appendChild(track);
  wrap.parentNode.insertBefore(ticker, wrap.nextSibling);

  /* ティッカーはページの一番下にある。図鑑は高さ1万pxあるので、
     見えていない時間のほうが圧倒的に長い。**見えていない間は止める。**
     見た目は変わらず(見えていないので)、合成レイヤーの更新が消える。
     タブを裏に回したときも同じ。 */
  var paused = null;
  function setPaused(p) {
    if (p === paused) return;
    paused = p;
    track.style.animationPlayState = p ? "paused" : "running";
    track.style.willChange = p ? "auto" : "transform";
  }
  /* **初期状態は「流す」。** 観測が何かの理由で動かない環境でも、
     最悪これまで通り流れ続けるだけで済む。逆(初期は止める)にすると、
     観測が動かないページで演出が永久に死ぬ。止まるより流れるほうがマシ。 */
  setPaused(false);

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      setPaused(!entries[0].isIntersecting || document.hidden);
    }).observe(ticker);
  }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) setPaused(true);
    else if ("IntersectionObserver" in window) {
      var r = ticker.getBoundingClientRect();
      setPaused(r.bottom < 0 || r.top > innerHeight);
    }
  });

  /* ===== 3. 枠の外に立つ相棒。息をしている ===== */
  var mascot = el("div", "arc-mascot");

  /* まず静止画で置く。**動く版はこれを置き換える形にする。**
     シートの読み込みに失敗しても、相棒が消えずに立ったままになる。 */
  var img = el("img");
  img.src = "shared/sprites/" + page[0] + ".png" + V;
  img.alt = "";
  img.width = 28; img.height = 28;
  mascot.appendChild(img);

  /* 待機モーション。spideytracker と同じで、CSSアニメではなく
     JSで background-position を送る。画面外では止められるようにするため。 */
  var IDLE_FRAMES = 4;
  var IDLE_MS = 190;
  var SCALE = 2;                      // 40px前後の絵を2倍で出す(等倍だと小さすぎる)
  var probe = new Image();
  probe.onload = function () {
    var fw = probe.naturalWidth / IDLE_FRAMES, fh = probe.naturalHeight;
    if (!fw || !fh) return;

    var sprite = el("div", "arc-mascot-sprite");
    sprite.style.width = (fw * SCALE) + "px";
    sprite.style.height = (fh * SCALE) + "px";
    sprite.style.backgroundImage = 'url("' + probe.src + '")';
    sprite.style.backgroundSize = (IDLE_FRAMES * 100) + "% 100%";
    mascot.replaceChild(sprite, img);

    var i = 0, timer = null;
    function tick() {
      i = (i + 1) % IDLE_FRAMES;
      /* パーセント指定なので、コマ幅が絵ごとに違っても同じ式で送れる */
      sprite.style.backgroundPositionX = (i * 100 / (IDLE_FRAMES - 1)) + "%";
    }
    function run(on) {
      if (on && !timer) timer = setInterval(tick, IDLE_MS);
      else if (!on && timer) { clearInterval(timer); timer = null; }
    }
    run(true);                        // 観測が効かない環境でも動く側に倒す

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (e) {
        run(e[0].isIntersecting && !document.hidden);
      }).observe(sprite);
    }
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) run(false);
    });
  };
  probe.src = "shared/sprites/" + page[0] + "-idle.png" + V;

  var bubble = el("div", "arc-bubble");
  bubble.innerHTML =
    '<div class="arc-bar"><span>ひとこと</span>' +
    '<button type="button" class="arc-close">× 閉じる</button></div>' +
    "<p>" + page[1] + "</p>";
  mascot.appendChild(bubble);
  ticker.parentNode.insertBefore(mascot, ticker.nextSibling);

  bubble.querySelector(".arc-close").addEventListener("click", function () {
    bubble.remove();
    try { sessionStorage.setItem("arc-bubble-off", "1"); } catch (e) {}
  });
  try { if (sessionStorage.getItem("arc-bubble-off")) bubble.remove(); } catch (e) {}

  /* ===== 4. 起動ログ。セッション中の最初の1ページだけ ===== */
  var booted = true;
  try { booted = !!sessionStorage.getItem("arc-booted"); } catch (e) {}
  if (!booted && !reduce) {
    try { sessionStorage.setItem("arc-booted", "1"); } catch (e) {}
    var lines = [
      "PALWORLD TOOLKIT BOOTING...",
      "LOADING PAL DATABASE ... 298 ENTRIES <b>[OK]</b>",
      "LOADING BREEDING TABLE ... <b>[OK]</b>",
      "LOADING WORLD MAP TILES ... <b>[OK]</b>",
      "CALIBRATING WORK SUITABILITY ... <b>[OK]</b>",
      "READY."
    ];
    var boot = el("div", "arc-boot");
    boot.setAttribute("aria-hidden", "true");
    lines.forEach(function (t, i) {
      var d = el("div", null, t);
      d.style.animationDelay = (i * 0.2) + "s";
      boot.appendChild(d);
    });
    boot.appendChild(el("div", "arc-skip", "クリックでスキップ"));
    document.body.appendChild(boot);
    var kill = function () { if (boot.parentNode) boot.remove(); };
    boot.addEventListener("click", kill);
    setTimeout(kill, 1800);
  }
})();
