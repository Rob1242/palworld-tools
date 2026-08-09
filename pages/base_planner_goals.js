/* ============================================================
   拠点プランナーの入口(2026-08-09)

   それまでは、使う人が自分で12役職の重要度(無/低/中/高)と実働上限を
   決めないと計算が始まらなかった。**作った本人でも使い方が分からない**
   状態だったので、「やりたいこと」を1つ選ぶだけで答えが出る形にした。

   計算エンジンには一切触っていない。ここがやるのは
   「目的 → 既存の入力欄を埋める → 既存の計算ボタンを押す」だけ。
   細かく調整したい人向けの画面は <details> の中にそのまま残してある。
   ============================================================ */
(function () {
  "use strict";

  var grid = document.getElementById("goalGrid");
  if (!grid) return;

  /* ■ 並べ方の考え方(2026-08-09、颯太の説明を反映)

     パルワールドの拠点は、まず **1つで完結するメイン拠点** を作る。
     採掘場も伐採場も畑も炉も、全部そこに置く。
     そのうえで「鉱石が足りない」となったら **2つ目に採掘専用の拠点** を増やす。

     最初はこれを分かっていなくて「鉱石を掘る」「木材を集める」を
     メイン拠点と横並びに置いていた。実際の作り方と順番が逆だった。

     上限(caps)は「その施設に何体入るか」。本体の ROLE_CAP_HINT と同じ根拠で、
     段階が進むほど施設が増える前提で緩めている。 */
  var GROUPS = [
    { title: "まずはこれ ・ 1つで完結するメイン拠点",
      note: "採掘も伐採も畑も炉も、この拠点1つに置く前提の編成です。",
      items: [
        { id: "main-early", icon: "🏕", name: "序盤のメイン拠点",
          desc: "序盤に捕まえられるパルだけ。手作業3・伐採2・採掘2体を目安に配分",
          tier: "early", slots: 10,
          w: { 手作業: 3, 運搬: 3, 採集: 2, 伐採: 2, 採掘: 2, 種まき: 2, 水やり: 2, 火おこし: 2, 牧場: 1 },
          caps: { 手作業: 3, 火おこし: 1, 伐採: 2, 採掘: 2 } },   /* 序盤は設備も少ない */

        { id: "main-mid", icon: "🏘", name: "中盤のメイン拠点",
          desc: "中盤までのパルで12役職を埋める。手作業4・伐採3・採掘3体が目安",
          tier: "mid", slots: 15,
          w: { 手作業: 3, 運搬: 3, 火おこし: 2, 水やり: 2, 種まき: 2, 採集: 2,
               伐採: 2, 採掘: 2, 製薬: 2, 冷却: 2, 発電: 2, 牧場: 1 },
          caps: { 手作業: 4, 火おこし: 2, 伐採: 3, 採掘: 3 } },

        { id: "main-late", icon: "🏰", name: "終盤のメイン拠点",
          desc: "配合・ボス限定も使う完成形。手作業5・伐採4・採掘4体が目安",
          tier: null, slots: 20,
          w: { 手作業: 3, 運搬: 3, 火おこし: 3, 水やり: 2, 種まき: 2, 採集: 2,
               伐採: 2, 採掘: 2, 製薬: 3, 冷却: 2, 発電: 2, 牧場: 1 },
          caps: { 手作業: 5, 火おこし: 3, 伐採: 4, 採掘: 4 } },
      ] },

    { title: "足りなくなったら ・ 2つ目以降の専用拠点",
      note: "メイン拠点だけでは足りない資源を、専用の拠点で稼ぎます。",
      items: [
        { id: "sub-ore", icon: "⛏", name: "採掘拠点",
          desc: "採掘場・採石場だけを並べる。石炭・硫黄・鉱石の量産",
          tier: null, slots: 12,
          w: { 採掘: 3, 運搬: 3, 手作業: 1 },
          caps: { 採掘: 6, 手作業: 2 } },   /* 掘るのが目的なので多め */

        { id: "sub-wood", icon: "🪓", name: "伐採拠点",
          desc: "伐採場だけを並べる。建築と加工の木材を切らさない",
          tier: null, slots: 12,
          w: { 伐採: 3, 運搬: 3, 手作業: 1 },
          caps: { 伐採: 6, 手作業: 2 } },   /* 伐るのが目的なので多め */

        { id: "sub-food", icon: "🍖", name: "食料・牧場拠点",
          desc: "畑と牧場に寄せる。ケーキ作りとSAN値対策の土台",
          tier: null, slots: 12,
          w: { 種まき: 3, 水やり: 3, 採集: 3, 牧場: 3, 運搬: 2, 手作業: 1 },
          caps: { 手作業: 2 } },   /* 畑は人数制限が無いので付けない */

        { id: "sub-craft", icon: "🔨", name: "生産拠点",
          desc: "組立ラインと炉をフル稼働。装備とスフィアを作り続ける",
          tier: null, slots: 15,
          w: { 手作業: 3, 火おこし: 3, 運搬: 2, 採掘: 1 },
          caps: { 手作業: 6, 火おこし: 3 } },   /* 作るのが目的なので多め */
      ] },
  ];

  var GOALS = GROUPS.reduce(function (a, g) { return a.concat(g.items); }, []);

  var ROLES = ["火おこし", "水やり", "種まき", "発電", "手作業", "採集",
               "伐採", "採掘", "製薬", "冷却", "運搬", "牧場"];

  var TIER_LABEL = { early: "序盤に捕まえられるパルだけ", mid: "中盤までに捕まえられるパルまで" };

  function apply(goal) {
    /* **候補にするパルを絞る。** ここが無いと「序盤の拠点」でも
       配合限定のノクサージュ(図鑑#286)などが選ばれてしまう。 */
    if (window.setPlannerTierLimit) window.setPlannerTierLimit(goal.tier || null);

    /* 枠数 */
    var range = document.getElementById("slotRange");
    var num = document.getElementById("slotNum");
    if (range) { range.value = goal.slots; range.dispatchEvent(new Event("input", { bubbles: true })); }
    if (num) { num.value = goal.slots; num.dispatchEvent(new Event("input", { bubbles: true })); }

    /* 重要度。既存の「無/低/中/高」ボタンをそのまま押す
       (内部状態の持ち方に依存しないので、本体を書き換えなくて済む) */
    ROLES.forEach(function (role) {
      var want = goal.w[role] || 0;
      var group = document.querySelector('.weight-btns[data-role="' + role + '"]');
      if (!group) return;
      var btn = group.querySelector('.wbtn[data-w="' + want + '"]');
      if (btn) btn.click();
    });

    /* 実働上限 */
    document.querySelectorAll(".cap-input").forEach(function (inp) {
      var v = goal.caps[inp.dataset.role];
      inp.value = v ? v : "";
      inp.dispatchEvent(new Event("input", { bubbles: true }));   /* 本体は input を見ている */
    });

    var note = document.getElementById("goalNote");
    if (note) {
      var lim = TIER_LABEL[goal.tier];
      note.textContent = goal.name + " で計算しました(枠 " + goal.slots + ")。"
        + (lim ? lim + "を候補にしています。" : "全パルを候補にしています。")
        + "合わないところは「細かく設定する」で直せます。";
    }

    var btn = document.getElementById("computeBtn");
    if (btn) btn.click();
  }

  GOALS.forEach(function (g) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "goal-card";
    b.innerHTML = '<span class="goal-icon">' + g.icon + "</span>" +
                  '<span class="goal-name">' + g.name + "</span>" +
                  '<span class="goal-desc">' + g.desc + "</span>";
    b.addEventListener("click", function () {
      grid.querySelectorAll(".goal-card").forEach(function (x) { x.classList.remove("on"); });
      b.classList.add("on");
      apply(g);
    });
    grid.appendChild(b);
  });

  /* **開いた時点で答えが出ている状態にする。**
     以前は設定を全部埋めてボタンを押すまで何も出なかった。
     ただし前回の設定が残っている場合(保存済み)は、それを尊重して勝手に上書きしない。 */
  var hadSaved = false;
  try { hadSaved = !!localStorage.getItem("palworldBasePlannerState"); } catch (e) {}
  if (!hadSaved) {
    var first = GOALS[0];
    var card = grid.querySelector(".goal-card");
    if (card) card.classList.add("on");
    setTimeout(function () { apply(first); }, 300);   // 本体の初期化を待つ
  }
})();

/* ============================================================
   牧場の案内(2026-08-09)

   牧場は「速さ」ではなく「何が採れるか」で選ぶ役職で、Lv別の実測データが
   無いため本体は意図的にスコア化していない。つまり**重要度を上げても
   計算に反映されない**。それを黙って落とすと「牧場を指定したのに出ない」に
   なるので、計算とは別枠で「置くならこれ」を出す。

   採れるものはパートナースキルの文面から機械的に抜いたもの(build_pal_data.py)。
   ============================================================ */
(function () {
  "use strict";
  if (typeof PAL_DATA === "undefined") return;

  var area = document.getElementById("resultArea");
  if (!area) return;

  function tierLabel(t) {
    return { early: "序盤", mid: "中盤", late: "終盤", special: "配合/ボス" }[t] || "";
  }

  function render() {
    var old = document.getElementById("ranchPanel");
    if (old) old.remove();
    if (!area.innerHTML.trim()) return;

    var list = PAL_DATA.filter(function (p) { return (p.work || {}).牧場; })
      .sort(function (a, b) { return b.work.牧場 - a.work.牧場; })
      .slice(0, 8);
    if (!list.length) return;

    var rows = list.map(function (p) {
      return '<li><b>' + p.name + '</b> <span class="ranch-lv">Lv' + p.work.牧場 + '</span>'
 + ' <span class="ranch-tier">' + tierLabel(p.tier) + '</span>'
        + (p.ranch ? ' — ' + p.ranch : ' — <span class="ranch-none">採れるものの記載なし</span>')
        + '</li>';
    }).join("");

    var box = document.createElement("div");
    box.id = "ranchPanel";
    box.className = "panel";
    box.innerHTML = '<h2>牧場に置くなら</h2>'
      + '<p class="subtitle" style="margin-top:0;">牧場は<b>速さではなく「何が採れるか」</b>で選ぶ役職です。'
      + 'Lvごとの速度データがゲーム側に無いため、上の計算には入れていません。'
      + '欲しいものに合わせてここから1体選んでください。</p>'
      + '<ul class="ranch-list">' + rows + '</ul>';
    area.appendChild(box);
  }

  /* **自分が resultArea に追記するので、素直に監視すると無限ループする**
     (追加 → 監視が反応 → また追加)。実際に画面が固まった(2026-08-09)。
     書き込む前に監視を止め、書き終えてから再開する。 */
  var busy = false;
  var mo = new MutationObserver(function () {
    if (busy) return;
    busy = true;
    mo.disconnect();
    try { render(); } finally {
      mo.observe(area, { childList: true });
      busy = false;
    }
  });
  mo.observe(area, { childList: true });
})();
