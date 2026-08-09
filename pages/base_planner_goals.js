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

  /* 上限は「その施設に何体入るか」。プランナー本体の ROLE_CAP_HINT と同じ根拠。
     ここで既定値を入れておくことで、何も知らない人でも現実的な答えが出る。 */
  var GOALS = [
    { id: "start", icon: "🏕", name: "序盤の拠点",
      desc: "序盤に捕まえられるパルだけで組む。最初の拠点はこれで足りる",
      tier: "early", slots: 10,
      w: { 手作業: 3, 運搬: 2, 採集: 2, 伐採: 2, 採掘: 2, 種まき: 1, 火おこし: 1, 水やり: 1 },
      caps: { 手作業: 3, 火おこし: 1, 伐採: 2, 採掘: 2, 運搬: 3, 採集: 3, 種まき: 2, 水やり: 2 } },

    { id: "ore", icon: "⛏", name: "鉱石を掘る",
      desc: "採掘場・採石場を回す。石炭や硫黄の量産向け",
      tier: "mid", slots: 12,
      w: { 採掘: 3, 運搬: 3, 手作業: 1 },
      caps: { 採掘: 6, 手作業: 3, 運搬: 4 } },

    { id: "wood", icon: "🪓", name: "木材を集める",
      desc: "伐採場を回す。建築と加工の材料を切らさない",
      tier: "mid", slots: 12,
      w: { 伐採: 3, 運搬: 3, 手作業: 1 },
      caps: { 伐採: 6, 手作業: 3, 運搬: 4 } },

    { id: "food", icon: "🍖", name: "食料と牧場",
      desc: "畑と牧場を回す。ケーキ作りの下準備にも",
      tier: "mid", slots: 12,
      w: { 種まき: 3, 水やり: 3, 採集: 3, 牧場: 2, 手作業: 1, 運搬: 2 },
      caps: { 手作業: 3, 運搬: 3, 種まき: 4, 水やり: 4, 採集: 4 } },

    { id: "craft", icon: "🔨", name: "素材を量産する",
      desc: "組立ラインと炉をフル稼働。装備とスフィアを作る",
      tier: null, slots: 15,
      w: { 手作業: 3, 火おこし: 3, 運搬: 2, 採掘: 1 },
      caps: { 手作業: 9, 火おこし: 2, 採掘: 2, 運搬: 4 } },

    { id: "all", icon: "⚙", name: "全部そこそこ",
      desc: "配合やボス限定のパルも使う。終盤の完成形",
      tier: null, slots: 15,
      w: { 火おこし: 2, 水やり: 2, 種まき: 2, 発電: 2, 手作業: 3, 採集: 2,
           伐採: 2, 採掘: 2, 製薬: 2, 冷却: 2, 運搬: 2, 牧場: 1 },
      caps: { 手作業: 3, 火おこし: 1, 製薬: 1, 発電: 1, 冷却: 1, 伐採: 2, 採掘: 2, 運搬: 3 } },
  ];

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
