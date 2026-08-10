/* 突然変異の行き先を計算する。
 *
 * ■ 式(2026-08-10 確認)
 *
 *   目標値 = 強い方の親ランク×0.5 + 親同士のランク差×0.4 + 乱数(0 〜 強い方の親ランク×0.10)
 *   → 目標値に最も近い combi_rank のパルが選ばれる
 *
 * 出典は palworld-lab ではなく「パルワールド攻略のオアシス」が
 * 1.0サーバー実装の静的解析として公開しているもの。
 * **鵜呑みにせず、こちらの combi_rank データで検算して採用した。**
 * コゴエール同士(rank 710)の例で、向こうの公称値と突き合わせた結果:
 *
 *     ブリザンダー 14.1% / 14.1%   完全一致
 *     センコ       21.1% / 21.1%   完全一致
 *     ボルカイザー 21.1% / 21.1%   完全一致
 *     モモエール   28.2% / 26.8%   +1.4
 *     オーマサンダ 15.5% / 14.1%   +1.4
 *
 * 5件中3件が小数点以下まで一致するので、式そのものは正しいと判断した。
 * 残差 +1.4 は combi_rank 1刻み(10)ぶん = 1/71 ちょうどで、
 * 乱数の端の扱い(開区間か閉区間か)の差と見ている。
 *
 * ■ 既知の限界: 「変異可能パル」の絞り込みをしていない
 *
 * 実際のゲームは全パルを変異先にしているわけではない。上の検算でも、
 * 目標値の範囲内にいるのに セレムーン(360)・ゼノドラン(400) は
 * 向こうの候補に出てこない。専用のリストがあるはずだが、
 * **どのパルが該当するかは公開されていない。**
 *
 * ここでは**全種を候補として計算する**。理由は2つ:
 *   1. 候補の取りこぼしが出ない(漏れなく調べられる)
 *   2. 他所が公開している143種のリストを転記するのは
 *      「よそのサイトのデータベース複製」にあたり、CLAUDE.md の基準で使わない側
 *
 * 代償として**確率は実際より薄まる**(出ないはずのパルが分母に入るため)。
 * 画面にもそう明記すること。順位の傾向は保たれるが、数値は目安。
 */
(function (global) {
  "use strict";

  var RANK_HALF = 0.5;    // 強い方の親ランクに掛ける
  var DIFF_MUL  = 0.4;    // 親同士のランク差に掛ける
  var RAND_MAX  = 0.10;   // 強い方の親ランクの何割まで乱数が乗るか

  /* 目標値の下限と上限。乱数はこの幅に一様に乗る。 */
  function targetRange(rankA, rankB) {
    var strong = Math.max(rankA, rankB);
    var diff = Math.abs(rankA - rankB);
    var lo = strong * RANK_HALF + diff * DIFF_MUL;
    return { lo: lo, hi: lo + strong * RAND_MAX };
  }

  /* combi_rank 昇順の一覧を作る。同じランクに複数のパルが居るので配列で持つ。
     あわせて「そのランクが最寄りになる区間」も先に出しておく。
     逆引きは4.5万ペアを回すので、ここを毎回計算し直すと3秒かかった(実測)。 */
  function buildRankIndex(palsById) {
    var byRank = {};
    for (var id in palsById) {
      if (!Object.prototype.hasOwnProperty.call(palsById, id)) continue;
      var r = palsById[id].combi_rank;
      if (typeof r !== "number") continue;
      (byRank[r] = byRank[r] || []).push(id);
    }
    var ranks = Object.keys(byRank).map(Number).sort(function (a, b) { return a - b; });

    var bounds = {};   // rank -> {left, right}  最寄りになる区間(境界は隣との中点)
    var slot = {};     // palId -> {rank, left, right, share}
    for (var i = 0; i < ranks.length; i++) {
      var left  = (i === 0) ? -Infinity : (ranks[i - 1] + ranks[i]) / 2;
      var right = (i === ranks.length - 1) ? Infinity : (ranks[i] + ranks[i + 1]) / 2;
      bounds[ranks[i]] = { left: left, right: right };
      var ids = byRank[ranks[i]];
      for (var j = 0; j < ids.length; j++) {
        slot[ids[j]] = { rank: ranks[i], left: left, right: right, share: 1 / ids.length };
      }
    }
    return { ranks: ranks, byRank: byRank, bounds: bounds, slot: slot };
  }

  /* 特定の1体が出る確率だけを O(1) で出す。逆引き用。 */
  function probabilityOf(palId, rankA, rankB, index) {
    var s = index.slot[palId];
    if (!s) return 0;
    var range = targetRange(rankA, rankB);
    var width = range.hi - range.lo;
    if (!(width > 0)) return 0;
    var lo = Math.max(s.left, range.lo);
    var hi = Math.min(s.right, range.hi);
    if (hi <= lo) return 0;
    return (hi - lo) / width * s.share;
  }

  /* 目標値の範囲を、各ランクが「最寄り」になる区間に切り分ける。
     境界は隣り合うランクの中点。区間の幅がそのまま確率になる。 */
  function candidates(rankA, rankB, index) {
    var range = targetRange(rankA, rankB);
    var width = range.hi - range.lo;
    if (!(width > 0)) return { range: range, list: [] };

    var ranks = index.ranks;
    var out = [];
    for (var i = 0; i < ranks.length; i++) {
      // このランクが最寄りになる区間 [left, right)
      var left  = (i === 0) ? -Infinity : (ranks[i - 1] + ranks[i]) / 2;
      var right = (i === ranks.length - 1) ? Infinity : (ranks[i] + ranks[i + 1]) / 2;
      var lo = Math.max(left, range.lo);
      var hi = Math.min(right, range.hi);
      if (hi <= lo) continue;

      var share = (hi - lo) / width;
      var ids = index.byRank[ranks[i]];
      // 同ランクが複数居る場合は均等割り(どれが選ばれるかの規則は不明なため)
      for (var j = 0; j < ids.length; j++) {
        out.push({ id: ids[j], rank: ranks[i], probability: share / ids.length });
      }
    }
    out.sort(function (a, b) { return b.probability - a.probability; });
    return { range: range, list: out };
  }

  /* 逆引き: 目的のパルが出る親の組み合わせを、確率の高い順に返す。
     299体なら約4.5万通りなので総当たりで足りる。 */
  function parentsFor(targetId, palsById, index, opts) {
    opts = opts || {};
    var limit = opts.limit || 60;
    var minProb = opts.minProb || 0.001;
    var ids = [];
    for (var id in palsById) {
      if (!Object.prototype.hasOwnProperty.call(palsById, id)) continue;
      if (typeof palsById[id].combi_rank === "number") ids.push(id);
    }

    var results = [];
    for (var i = 0; i < ids.length; i++) {
      var ra = palsById[ids[i]].combi_rank;
      for (var j = i; j < ids.length; j++) {
        var p = probabilityOf(targetId, ra, palsById[ids[j]].combi_rank, index);
        if (p >= minProb) results.push({ a: ids[i], b: ids[j], probability: p });
      }
    }
    results.sort(function (x, y) { return y.probability - x.probability; });
    return results.slice(0, limit);
  }

  global.MutationCalc = {
    targetRange: targetRange,
    buildRankIndex: buildRankIndex,
    candidates: candidates,
    probabilityOf: probabilityOf,
    parentsFor: parentsFor,
  };
})(typeof window !== "undefined" ? window : globalThis);
