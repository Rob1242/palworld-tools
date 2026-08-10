/* 突然変異の行き先を計算する。
 *
 * ■ 式
 *
 *   目標値 = 強い方の親ランク×0.5 + 親同士のランク差×0.4 + 乱数(0 〜 強い方の親ランク×0.10)
 *   → 目標値に最も近い combi_rank の「変異先になれるパル」が選ばれる
 *
 *   ※「強い方」= combi_rank が**小さい**方。詳細は targetRange のコメント。
 *
 * ■ 出所と検算
 *
 * 式そのものは外部サイト(パルワールド攻略のオアシス)が1.0サーバー実装の
 * 静的解析として公開しているもの。係数がキリのいい数字なので鵜呑みにせず、
 * **こちらの combi_rank と ignore_combi で検算してから採用した。**
 *
 * コゴエール同士(rank 710)での突き合わせ:
 *
 *     モモエール   28.2% / 公称 26.8%   +1.4
 *     センコ       21.1% / 公称 21.1%   一致
 *     ボルカイザー 21.1% / 公称 21.1%   一致
 *     ブリザンダー 14.1% / 公称 14.1%   一致
 *     オーマサンダ 14.1% / 公称 14.1%   一致
 *
 * 5件中4件が小数点以下まで一致。残差 +1.4 は combi_rank 1刻み(10)ぶん
 * = 1/71 ちょうどで、乱数の端の扱い(0を含むか1からか)の差と見ている。
 *
 * ■ 変異先になれるパルの絞り込み
 *
 * ignore_combi=true(伝説・塔ボス・レイド・コラボ等)は変異先にならない。
 * このフラグは **game_data/breedingdata.json に元から入っていた**ものを
 * ビルド時に合流させている(scripts/build_breeding_split_data.py)。
 * 他所が公開している一覧の転記ではない。
 *
 * 外部サイトが「変異先は143種」としている数は、この絞り込みだけでは再現しない
 * (ignore_combi での除外後は261体)。143 は「どの親の組から到達できるか」の
 * 到達可能性まで計算した数と見られるが、**こちらでは確定できていない。**
 */
(function (global) {
  "use strict";

  var RANK_HALF = 0.5;    // 強い方の親ランクに掛ける
  var DIFF_MUL  = 0.4;    // 親同士のランク差に掛ける
  var RAND_MAX  = 0.10;   // 強い方の親ランクの何割まで乱数が乗るか

  /* 目標値の下限と上限。乱数はこの幅に一様に乗る。
   *
   * **「強い方」は combi_rank が小さい方**(2026-08-10 修正)。
   * combi_rank は小さいほど強い(ゼロヴァース10 ⇔ タマコッコ3080)。
   * 最初 Math.max で書いていたが、これは弱い方を採る誤り。
   * 検算に使った例が同種同士(710×710)で min==max だったため素通りしていた。
   *
   * 親のランクが違うと答えが完全に変わる:
   *   アズルーナ1220 × ブリザンダー380 の場合
   *     max(誤): 目標値 946〜1068 → 通常配合(800)より**平凡**なパルになる
   *     min(正): 目標値 526〜 564 → 通常配合(800)より**レア**なパルになる
   *   英語圏の複数ソースが "hatch into a much rarer pal than expected" と
   *   書いており、レア側に寄るのが正しい。
   */
  function targetRange(rankA, rankB) {
    var strong = Math.min(rankA, rankB);
    var diff = Math.abs(rankA - rankB);
    var lo = strong * RANK_HALF + diff * DIFF_MUL;
    return { lo: lo, hi: lo + strong * RAND_MAX };
  }

  /* 変異先になれるパルだけを残す。
   *
   * ignore_combi=true のパル(伝説・塔ボス・レイド・コラボ等)は変異先にならない。
   * このフラグは **自前の game_data/breedingdata.json に元から入っていた**。
   * 途中の breedingdata_v2.json で落ちていたため気づかず、
   * 「全種を候補にするしかない」と誤って判断していた(2026-08-10 修正)。
   * 他所が公開している一覧を転記したものではない。 */
  function canMutateInto(info) {
    return !!info && !info.ignore_combi;
  }

  /* combi_rank 昇順の一覧を作る。同じランクに複数のパルが居るので配列で持つ。
     あわせて「そのランクが最寄りになる区間」も先に出しておく。
     逆引きは4.5万ペアを回すので、ここを毎回計算し直すと3秒かかった(実測)。 */
  function buildRankIndex(palsById) {
    var byRank = {};
    var excluded = 0;
    for (var id in palsById) {
      if (!Object.prototype.hasOwnProperty.call(palsById, id)) continue;
      var r = palsById[id].combi_rank;
      if (typeof r !== "number") continue;
      if (!canMutateInto(palsById[id])) { excluded++; continue; }   // 変異先になれない
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
    return { ranks: ranks, byRank: byRank, bounds: bounds, slot: slot, excluded: excluded };
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
    // 親は誰でもよい。除外されるのは「変異先」であって親ではないため、
    // ここでは ignore_combi でフィルタしない。
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
    canMutateInto: canMutateInto,
    probabilityOf: probabilityOf,
    parentsFor: parentsFor,
  };
})(typeof window !== "undefined" ? window : globalThis);
