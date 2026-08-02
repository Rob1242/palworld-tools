// 戦闘まわりの計算式と定数の「唯一の定義元」。
//
// 以前は同じ定数・同じ関数が戦闘最適化・パーティ編成ガイド・最強Tier表の3ページに
// コピーされていた。片方だけ数式を直すと残りが古い値のまま別の順位を出す、という
// 事故が起きうる構造だったため、ここに集約する(2026-08)。
// **数値を変えるときは必ずこのファイルだけを触ること。**
//
// 数値の根拠は Obsidian の `palworld_project_handoff.md`「3. 確定した計算式・数値」を参照。
// 記憶や推測で書き換えないこと。

// タイプ一致(Same Type Attack Bonus)の倍率
const STAB_MULT = 1.2;

// 技のクールタイム短縮を積んでも、これ以下のサイクルにはならないという下限(秒)
const MIN_CYCLE_SECONDS = 2.5;

// ランキング系から除外する図鑑ID(288〜298 = コラボ枠など、通常入手と前提が違うもの)
const RANKING_EXCLUDE_DEX_IDS = new Set(
  Array.from({ length: 298 - 288 + 1 }, (_, i) => String(288 + i))
);

// ランキング比較時の共通前提: Lv80・濃縮★4(+20%)・才能値100%・ソウル強化60%
const TL_LV = 80, TL_STAR_PCT = 20, TL_TALENT_PCT = 100, TL_SOUL_PCT = 60;

// レベルアップ後のステータス。base=種族共通の下駄、coef=ステータス種別ごとの係数。
function computeStat(speciesVal, base, coef, lv, talentPct, starPct, soulPct){
  return (base + speciesVal * coef * lv * (1 + talentPct/100)) * (1 + starPct/100) * (1 + soulPct/100);
}

// パッシブが自分自身に与える指定種別の効果量(該当が無ければ0)
function passiveEffectValue(passive, type){
  if(!passive) return 0;
  const e = passive.effects.find(x => x.type === type && x.target === "ToSelf");
  return e ? e.value : 0;
}

// そのパルの属性に対して最も攻撃力が伸びるパッシブ4つを選ぶ。
// 同点なら属性強化を持つ方を優先する(汎用攻撃力より属性一致の方が伸びしろがあるため)。
function pickBestPresetForTypes(typesEn){
  const elementKeys = typesEn.map(t => `ElementBoost_${t}`);
  return COMBAT_PASSIVES_DATA
    .map(p => {
      const atk = passiveEffectValue(p, "ShotAttack");
      const elem = elementKeys.reduce((sum, k) => sum + passiveEffectValue(p, k), 0);
      return { p, score: atk + elem, hasElem: elem > 0 };
    })
    .filter(x => x.score > 0)
    .sort((a,b) => (b.score + (b.hasElem?0.01:0)) - (a.score + (a.hasElem?0.01:0)))
    .slice(0, 4)
    .map(x => x.p.name);
}

// 上記の共通前提で、そのパルが出せる最大の持続DPSとその技を返す。
function computeCombatBest(pal){
  if(!pal.skills || !pal.skills.length) return null;
  const atk = computeStat(pal.stats.shot_attack, 100, 0.075, TL_LV, TL_TALENT_PCT, TL_STAR_PCT, TL_SOUL_PCT);
  const passiveNames = pickBestPresetForTypes(pal.types_en);
  const chosen = passiveNames.map(n => COMBAT_PASSIVES_DATA.find(p => p.name === n)).filter(Boolean);
  const genericPct = chosen.reduce((s,ps) => s + passiveEffectValue(ps, "ShotAttack"), 0);
  const ctPct = chosen.reduce((s,ps) => s + passiveEffectValue(ps, "ActiveSkillCoolTime_Decrease"), 0);
  const ctMultiplier = Math.max(1 - ctPct/100, 0.1);
  let best = null;
  for(const sk of pal.skills){
    const stab = pal.types_en.includes(sk.element) ? STAB_MULT : 1.0;
    const elementPct = chosen.reduce((s,ps) => s + passiveEffectValue(ps, `ElementBoost_${sk.element}`), 0);
    const effectiveAtk = atk * (1 + genericPct/100) * (1 + elementPct/100);
    const instant = sk.power * effectiveAtk * stab;
    const cycle = Math.max(sk.cooldown * ctMultiplier, MIN_CYCLE_SECONDS);
    const sustained = instant / cycle;
    if(!best || sustained > best.sustained) best = { ...sk, sustained };
  }
  return best;
}
