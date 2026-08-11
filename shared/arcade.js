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

   **各ページのHTMLには <script src="shared/arcade.js?v=20260812m" defer></script> だけ足す。**
   ============================================================ */
(function () {
  "use strict";

  /* 絵の中身を差し替えたときに古いものを掴ませないための版。
     tools/spritegen/idle.py を回して絵を作り直したら、ここも上げること。 */
  var V = "?v=20260812m";

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
    ["フィールドボス", "83", "体"], ["塔ボス", "10", "体"], ["ツール", "26", "種"]
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

  /* ===== コマ送りの共通部分 =====
     spideytracker と同じで、CSSアニメではなくJSで background-position を送る。
     画面外で止められるようにするため。相棒とバッジの2箇所で使う。 */
  var IDLE_FRAMES = 4;

  function makeSprite(cls, url, scale, seq, dur, onReady) {
    var probe = new Image();
    probe.onload = function () {
      var fw = probe.naturalWidth / IDLE_FRAMES, fh = probe.naturalHeight;
      if (!fw || !fh) return;

      /* **コマ送りは transform で行う。** background-position を動かすと
         毎コマそこを描き直すことになる。中に長い帯を入れて左へずらす形なら
         合成だけで済み、描き直しが起きない(2026-08-09、重くなったという
         指摘を受けて変更)。 */
      var w = fw * scale, h = fh * scale;
      var sprite = el("div", cls);
      sprite.style.width = w + "px";
      sprite.style.height = h + "px";
      sprite.style.overflow = "hidden";

      var strip = el("div", cls + "-strip");
      strip.style.width = (w * IDLE_FRAMES) + "px";
      strip.style.height = h + "px";
      strip.style.backgroundImage = 'url("' + probe.src + '")';
      strip.style.backgroundSize = "100% 100%";
      sprite.appendChild(strip);
      onReady(sprite);

      var step = 0, timer = null;
      function tick() {
        step = (step + 1) % seq.length;
        strip.style.transform = "translateX(" + (-seq[step] * w) + "px)";
        timer = setTimeout(tick, dur[step]);
      }
      function run(on) {
        /* 止めている間はレイヤーを確保し続けない */
        strip.style.willChange = on ? "transform" : "auto";
        if (on && !timer) timer = setTimeout(tick, dur[step]);
        else if (!on && timer) { clearTimeout(timer); timer = null; }
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
    probe.src = url;
  }

  /* ===== 3. 枠の外に立つ相棒。息をしている ===== */
  var mascot = el("div", "arc-mascot");

  /* まず静止画で置く。**動く版はこれを置き換える形にする。**
     シートの読み込みに失敗しても、相棒が消えずに立ったままになる。 */
  var img = el("img");
  img.src = "shared/sprites/" + page[0] + ".png" + V;
  img.alt = "";
  img.width = 28; img.height = 28;
  mascot.appendChild(img);

  /* 0→1→2→3→2→1 と往復させる。0→3で折り返すと、伸び切った姿から
     いきなり中立に戻って弾んで見える。
     **中立(0)で1.5秒止めてから動き出す。** 動きっぱなしだと落ち着きがなく、
     「息をしている」ではなく「ずっと動いている」に見える(2026-08-09、颯太の指摘)。
     1周およそ2.6秒。 */
  makeSprite("arc-mascot-sprite", "shared/sprites/" + page[0] + "-idle.png" + V, 2,
             [0, 1, 2, 3, 2, 1], [1500, 200, 200, 320, 200, 200],
             function (sprite) { mascot.replaceChild(sprite, img); });

  var bubble = el("div", "arc-bubble");
  bubble.innerHTML =
    '<div class="arc-bar"><span>ひとこと</span>' +
    '<button type="button" class="arc-close">× 閉じる</button></div>' +
    "<p>" + page[1] + "</p>";
  mascot.appendChild(bubble);
  ticker.parentNode.insertBefore(mascot, ticker.nextSibling);

  /* 相棒は画面に貼り付いているので、吹き出しは出しっぱなしにしない。
     8秒で畳み、相棒を押すとまた出る。閉じるボタンはその場限りではなく
     セッション中ずっと黙らせる(うるさいと思った人向け)。 */
  var quietTimer = setTimeout(function () { mascot.classList.add("is-quiet"); }, 8000);
  mascot.addEventListener("click", function (e) {
    if (e.target.closest(".arc-bubble")) return;      // 吹き出し内の操作は素通し
    clearTimeout(quietTimer);
    mascot.classList.toggle("is-quiet");
  });

  bubble.querySelector(".arc-close").addEventListener("click", function () {
    bubble.remove();
    try { sessionStorage.setItem("arc-bubble-off", "1"); } catch (e) {}
  });
  try { if (sessionStorage.getItem("arc-bubble-off")) bubble.remove(); } catch (e) {}

  /* ===== 4. 左上のバッジ。「P」の代わりにモノクローナが首をかしげる =====
     文字を消すのは絵が載ったときだけ。読み込みに失敗したら「P」のまま残る。
     相棒より間隔を長くしてある(常に視界に入る位置なので、動きすぎると気が散る)。 */
  var badge = document.querySelector(".brand-badge");
  if (badge) {
    makeSprite("arc-badge-sprite", "shared/sprites/brand-idle.png" + V, 2,
               [0, 1, 2, 3, 2, 1], [2600, 260, 260, 420, 260, 260],
               function (sprite) { badge.textContent = ""; badge.appendChild(sprite); });
  }

  /* ===== 5. 起動演出。セッション中の最初の1ページだけ =====

     モノクローナ(内部名 MonochromeQueen、パートナースキル「染まらぬ孤高の姫」)が
     カーテシーで迎える。

     **尺を固定しない。** 以前は1.8秒で必ず明けていたが、図鑑は本番で
     読み込みに2.3秒かかるため、明けた直後にまだ読み込み中の画面が見えていた
     (2026-08-10 実測)。お辞儀しきったところでページの準備を待ち、
     整い次第フェードで明ける。待ち時間が演出に変わる。

     ただし上限は設ける。回線が遅いときに閉じ込めないため。

     **「1回だけ」の記録に sessionStorage を使わないこと(2026-08-11)。**
     sessionStorage はタブ単位で、`target="_blank" rel="noopener"` で開いた
     新しいタブには引き継がれない。Tier表・ボス攻略・パーティ編成からパルを
     押すと図鑑が新しいタブで開くので、**押すたびに毎回この演出が最初から流れ**、
     颯太さんの「Tier表からパル詳細を開くとめっちゃ遅い」になっていた。

     実測(本番、2026-08-11):
       sessionStorageが空       curtsy-idle.png を要求 = 演出が走る
       同じタブ内で移動         要求なし = 走らない
       図鑑の読み込み(温キャッシュ) DOMContentLoaded 228ms / load 264ms
       演出の下限               2,000ms + フェード500ms = 2,500ms

     つまり0.26秒で出せる画面を2.5秒待たせていた。演出の尺ではなく
     「1タブ1回」になっていたことが原因なので、記録先を localStorage に移して
     時間で期限を切る。タブをまたいでも1回、時間が空いたらまた挨拶する。 */
  var BOOT_KEY = "arc-booted-at";
  var BOOT_WINDOW_MS = 30 * 60 * 1000;   // これだけ間が空いたら、次の訪問として挨拶し直す

  var booted = true;
  try {
    var last = parseInt(localStorage.getItem(BOOT_KEY), 10);
    booted = !!last && (Date.now() - last) < BOOT_WINDOW_MS;
  } catch (e) {
    /* localStorage が使えない環境(プライベートモード等)では従来どおりタブ単位。
       演出が余分に流れることはあっても、出なくなるよりはよい。 */
    try { booted = !!sessionStorage.getItem("arc-booted"); } catch (e2) {}
  }
  /* 期限は「最後に見たページ」から数える。読んでいる間に切れて、次のクリックで
     いきなり挨拶が始まるのを防ぐため、演出を出さない場合も時刻を更新する。 */
  try { localStorage.setItem(BOOT_KEY, String(Date.now())); } catch (e) {}
  if (!booted && !reduce) {
    try { sessionStorage.setItem("arc-booted", "1"); } catch (e) {}

    /* makeSprite はコマをループさせる作りなので、最後のコマの表示時間を
       極端に長くして「立ったまま止まる」状態にする(1回だけのお辞儀にする)。 */
    /* 尺は2秒。根拠(2026-08-11):
         ・一番重いパル図鑑の読み込みが本番で2,327ms。2秒はほぼ実作業に覆われる
         ・0.8秒未満だと演出と認識されず「画面が乱れた」に見える
         ・3秒を超えると「まだか」が頭をよぎる
       セッション中1回だけ・クリックでスキップ可なので、2秒なら十分軽い。
       読み込みが終わらないときだけ立ったまま待ち、3.5秒で打ち切る。 */
    var BOW_FRAMES = [0, 1, 2, 3, 0];              // 立つ→沈む→最深→戻る→立つ
    var BOW_DUR    = [450, 350, 750, 450, 999999];
    var BOW_MS     = 450 + 350 + 750 + 450;        // お辞儀にかかる時間 2.0秒
    var MIN_SHOW   = 2000;                         // 最低これだけは見せる
    var MAX_WAIT   = 3500;                         // これ以上は待たない

    var boot = el("div", "arc-boot");
    boot.setAttribute("aria-hidden", "true");
    var stage = el("div", "arc-boot-stage");
    boot.appendChild(stage);
    boot.appendChild(el("div", "arc-boot-title", "PALWORLD TOOLKIT"));
    boot.appendChild(el("div", "arc-boot-sub", "お待ちください"));
    boot.appendChild(el("div", "arc-skip", "クリックでスキップ"));
    document.body.appendChild(boot);

    var gone = false;
    var kill = function () {
      if (gone) return;
      gone = true;
      boot.classList.add("is-leaving");        // 色が戻りながらフェード
      setTimeout(function () { if (boot.parentNode) boot.remove(); }, 500);
    };
    boot.addEventListener("click", kill);

    /* お辞儀を1回だけ再生し、終わったら「準備できたか」を待つ */
    var bowDone = false;
    makeSprite("arc-boot-sprite", "shared/sprites/curtsy-idle.png" + V, 4,
               BOW_FRAMES, BOW_DUR,
               function (sprite) { stage.appendChild(sprite); });
    setTimeout(function () { bowDone = true; tryLeave(); }, Math.max(BOW_MS, MIN_SHOW));

    var pageReady = document.readyState === "complete";
    window.addEventListener("load", function () { pageReady = true; tryLeave(); });
    function tryLeave() { if (bowDone && pageReady) kill(); }

    setTimeout(kill, MAX_WAIT);                // 保険
  }

  /* ===== 6. 読み込み中の表示。起動演出とは**別物** =====

     混ぜないこと(2026-08-11、颯太さんの指示):

       起動演出  全画面 / 1回きり / お辞儀  … 入場の挨拶。終わりの時刻が決まっている
       これ      画面の隅 / ループ / 別動作  … 作業中の合図。いつ終わるか分からない

     お辞儀は「終わる動き」なので、いつ終わるか分からない待ちに使うと
     お辞儀しきったあと固まって見える。待ちにはループする動きを当てる。

     絵は shared/sprites/waiting-idle.png(4コマ)。**まだ無くても壊れない。**
     makeSprite は読み込めたときだけ絵を差し込むので、無ければ帯だけが出る。 */
  var WAIT_FRAMES = [0, 1, 2, 3, 2, 1];
  var WAIT_DUR    = [180, 180, 180, 180, 180, 180];
  var LOAD_DELAY  = 250;   // これより速く終わる読み込みでは出さない(チラつくだけ)

  var loadCount = 0, loadEl = null, loadTimer = null;

  function buildLoader(label) {
    loadEl = el("div", "arc-load");
    loadEl.setAttribute("role", "status");
    var fig = el("div", "arc-load-fig");
    var body = el("div", "arc-load-body");
    body.appendChild(el("div", "arc-load-text", label || "読み込み中"));
    body.appendChild(el("div", "arc-load-bar"));
    loadEl.appendChild(fig);
    loadEl.appendChild(body);
    document.body.appendChild(loadEl);
    /* 足した直後に class を付けると transition が効かないので、間に一度
       レイアウトを確定させる。requestAnimationFrame は**使わない**:
       裏に回ったタブでは発火しないため、戻ってきたときに透明のまま残る
       (2026-08-11 実測、opacity が0のままだった)。 */
    void loadEl.offsetWidth;
    loadEl.classList.add("is-in");
    if (!reduce) {
      makeSprite("arc-load-sprite", "shared/sprites/waiting-idle.png" + V, 1,
                 WAIT_FRAMES, WAIT_DUR, function (s) { fig.appendChild(s); });
    }
  }

  /* 入れ子で呼ばれても1つだけ出す。全部終わってから消す。 */
  function loadingStart(label) {
    loadCount++;
    if (loadCount === 1 && !loadTimer && !loadEl) {
      loadTimer = setTimeout(function () { loadTimer = null; buildLoader(label); }, LOAD_DELAY);
    }
    var ended = false;
    return function done() {
      if (ended) return;                    // 二重に呼ばれても数がずれないように
      ended = true;
      loadCount = Math.max(0, loadCount - 1);
      if (loadCount > 0) return;
      if (loadTimer) { clearTimeout(loadTimer); loadTimer = null; }
      if (loadEl) {
        var g = loadEl;
        loadEl = null;
        g.classList.remove("is-in");
        setTimeout(function () { if (g.parentNode) g.remove(); }, 260);
      }
    };
  }

  /* 使う側はこれだけ書けばいい:
       await Arcade.whileLoading(読み込みのPromise, "詳細データを読み込み中");
     失敗しても必ず消える(finally)。Arcade が無いページでも動くよう、
     呼ぶ側は Arcade && Arcade.whileLoading で確認すること。 */
  window.Arcade = window.Arcade || {};
  window.Arcade.loading = loadingStart;
  window.Arcade.whileLoading = function (promise, label) {
    var done = loadingStart(label);
    return Promise.resolve(promise).then(
      function (v) { done(); return v; },
      function (e) { done(); throw e; }
    );
  };
})();
