import json

PASSIVES_PATH = "palworld_passives.json"
SKILLS_PATH = "game_data/skills.json"
OUTPUT_PATH = "palworld_passives_merged.json"

# JP display name -> EN internal asset id.
# Built by directly cross-referencing all 115 SortDisplayable entries in
# game_data/skills.json against all 115 entries in palworld_passives.json,
# matching on effect values + effect types + target types (verified by hand,
# not a heuristic guess). See palworld_project_handoff.md for the source note.
JP_TO_ASSET = {
    "悪魔の手": "WorldTree_CraftSpeed",
    "次元跳躍": "WorldTree_MoveSpeed",
    "諸刃の聖剣": "WorldTree_ATK",
    "神樹の苗床": "WorldTree_FullStomach",
    "聖域の肉壁": "WorldTree_DEF",
    "仙人": "WorldTree_Sanity",
    "破壊神": "WorldTree_ATK_DEF",
    "ダイヤモンドボディ": "Deffence_up3",
    "ヌシ": "Nushi",
    "ベビーシッター": "MutationPal_Babysitter",
    "永炎": "EternalFlame",
    "永久機関": "Stamina_Up_3",
    "希少": "Rare",
    "鬼神": "PAL_ALLAttack_up3",
    "吸血鬼": "Vampire",
    "救世主": "Salvation",
    "空渡り": "RideJumpCount_Increase2",
    "軽身": "RideJumpCount_Increase1",
    "重装甲": "MutationPal_ExplosionResist",
    "侵略者": "Invader",
    "神速": "MoveSpeed_up_3",
    "絶食の極み": "PAL_FullStomach_Down_3",
    "大盤振る舞い": "SelfDeathAddItemDrop_up_3",
    "超絶技巧": "CraftSpeed_up3",
    "伝説": "Legend",
    "特異体質": "MutationPal_Mutant",
    "波乗り王": "SwimSpeed_up_3",
    "不死身": "MutationPal_Immortal",
    "不動明王の心": "PAL_Sanity_Down_3",
    "牧場の主": "WorkSuitabilityAddRank_MonsterFarm_2",
    "魔女": "Witch",
    "サービス精神": "SelfDeathAddItemDrop_up_2",
    "ダイエットマスター": "PAL_FullStomach_Down_2",
    "バテ防止係": "PlayerSP_DecreaseRate_Passive",
    "ヒーリングコーチ": "AutoHPRegeneRate_Passive",
    "ヘビー級": "Deffence_up2_2",
    "モチベーター": "TrainerWorkSpeed_UP_1",
    "リロードマスター": "ReloadSpeedUp_Passive",
    "ワーカーホリック": "PAL_Sanity_Down_2",
    "泳ぐのが得意": "SwimSpeed_up_2",
    "炎帝": "ElementBoost_Fire_2_PAL",
    "海皇": "ElementBoost_Aqua_2_PAL",
    "屈強な肉体": "Deffence_up2",
    "堅城の軍師": "TrainerDEF_UP_1",
    "鉱山のチーフ": "TrainerMining_up1",
    "高貴": "SalePrice_Up_1",
    "職人気質": "CraftSpeed_up2",
    "神龍": "ElementBoost_Dragon_2_PAL",
    "精霊王": "ElementBoost_Leaf_2_PAL",
    "聖天": "ElementBoost_Normal_2_PAL",
    "走るのが得意": "MoveSpeed_up_2",
    "大物": "MiniNushi",
    "地帝": "ElementBoost_Earth_2_PAL",
    "突撃指揮者": "TrainerATK_UP_1",
    "脳筋": "Noukin",
    "博愛主義者": "Test_PalEgg_HatchingSpeed_Up",
    "伐採リーダー": "TrainerLogging_up1",
    "氷帝": "ElementBoost_Ice_2_PAL",
    "牧場っ子": "WorkSuitabilityAddRank_MonsterFarm_1",
    "無限のスタミナ": "Stamina_Up_1",
    "冥王": "ElementBoost_Dark_2_PAL",
    "雷帝": "ElementBoost_Thunder_2_PAL",
    "冷静沈着": "CoolTimeReduction_Up_1",
    "獰猛": "PAL_ALLAttack_up2",
    "アブノーマル": "ElementResist_Normal_1_PAL",
    "うぬぼれ屋": "PAL_conceited",
    "オラオラ系": "PAL_oraora",
    "コンデンサ": "ElementBoost_Thunder_1_PAL",
    "サディスト": "PAL_sadist",
    "しなやかスイム": "SwimSpeed_up_1",
    "すばしこい": "MoveSpeed_up_1",
    "せっかち": "CoolTimeReduction_Up_2",
    "ドラゴンキラー": "ElementResist_Dragon_1_PAL",
    "ポジティブ思考": "PAL_Sanity_Down_1",
    "まじめ": "CraftSpeed_up1",
    "マゾヒスト": "PAL_masochist",
    "火遊び好き": "ElementBoost_Fire_1_PAL",
    "健康優良児": "Stamina_Up_2",
    "硬い皮膚": "Deffence_up1",
    "高温体質": "ElementResist_Ice_1_PAL",
    "社畜": "PAL_CorporateSlave",
    "小食": "PAL_FullStomach_Down_1",
    "水遊び好き": "ElementBoost_Aqua_1_PAL",
    "絶縁体": "ElementResist_Thunder_1_PAL",
    "粗暴": "PAL_rude",
    "草木の香り": "ElementBoost_Leaf_1_PAL",
    "耐震構造": "ElementResist_Earth_1_PAL",
    "大地の力": "ElementBoost_Earth_1_PAL",
    "日焼け好き": "ElementResist_Fire_1_PAL",
    "不眠": "Nocturnal",
    "防水加工": "ElementResist_Aqua_1_PAL",
    "防草効果": "ElementResist_Leaf_1_PAL",
    "未知の生体細胞": "Alien",
    "無の境地": "ElementBoost_Normal_1_PAL",
    "夜の帳": "ElementBoost_Dark_1_PAL",
    "勇敢": "PAL_ALLAttack_up1",
    "陽キャラ": "ElementResist_Dark_1_PAL",
    "竜の血族": "ElementBoost_Dragon_1_PAL",
    "良い毛並み": "SalePrice_Up_2",
    "冷血": "ElementBoost_Ice_1_PAL",
    "うたれ弱い": "Deffence_down1",
    "ことなかれ主義者": "PAL_ALLAttack_down2",
    "サボり癖": "CraftSpeed_down2",
    "すぐ骨折する": "Deffence_down2",
    "のんびり屋さん": "CoolTimeReduction_Down_1",
    "ビビり": "PAL_ALLAttack_down1",
    "みすぼらしい": "SalePrice_Down_1",
    "引きこもり": "Stamina_Down_1",
    "手加減": "NonKilling",
    "食いしんぼ": "PAL_FullStomach_Up_1",
    "精神が不安定": "PAL_Sanity_Up_1",
    "破滅願望": "PAL_Sanity_Up_2",
    "不器用": "CraftSpeed_down1",
    "無限の胃袋": "PAL_FullStomach_Up_2",
    "夜更かし": "NightOwl",
}

# 未知の生体細胞 の日本語effect_textは「属性ダメージ軽減15%」と書かれているが、
# 実データ(Alien)の3つ目の効果は ElementBoost_Electricity=15(雷属性攻撃"増加") であり、
# 「軽減」ではなく「雷属性攻撃ダメージ増加+15%」が正しい。ソース側(palworld-lab.com)の
# テキスト誤りと判断し、実データを正とする。
KNOWN_JP_TEXT_ERRORS = {
    "未知の生体細胞": "JP effect_text says '属性ダメージ軽減15%' (unspecified element, "
    "reduction) but real data (Alien asset) shows ElementBoost_Electricity=15 "
    "(lightning attack damage INCREASE +15%, not a reduction). Treating EN "
    "structured data as authoritative.",
}


def build_effects(entry):
    effects = []
    for i in range(1, 5):
        et = entry[f"efftype{i}"]
        if et == "EPalPassiveSkillEffectType::no":
            continue
        effects.append(
            {
                "type": et.replace("EPalPassiveSkillEffectType::", ""),
                "value": entry[f"effect{i}"],
                "target": entry[f"target_type{i}"].replace(
                    "EPalPassiveSkillEffectTargetType::", ""
                ),
            }
        )
    return effects


def main():
    jp = json.load(open(PASSIVES_PATH, encoding="utf-8"))
    skills = json.load(open(SKILLS_PATH, encoding="utf-8"))
    en_by_asset = {
        p["asset"]: p
        for p in skills["passives"]
        if p["category"] == "EPalPassiveCategory::SortDisplayable"
    }

    merged = []
    missing = []
    for j in jp:
        asset = JP_TO_ASSET.get(j["name"])
        en = en_by_asset.get(asset) if asset else None
        if en is None:
            missing.append(j["name"])
            continue
        effects = build_effects(en)
        is_worldtree = any(e["type"] == "WorldTreeDecayImmunity" for e in effects)
        merged.append(
            {
                "name": j["name"],
                "asset": asset,
                "icon": en["icon"],
                "rank": en["rank"],
                "effects": effects,
                "effect_text_jp": j["effect_text"],
                "description_en": en["description"],
                "is_worldtree": is_worldtree,
                "url": j["url"],
                "jp_text_caveat": KNOWN_JP_TEXT_ERRORS.get(j["name"]),
            }
        )

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)

    print(f"JP passives: {len(jp)}, EN displayable: {len(en_by_asset)}")
    print(f"Merged: {len(merged)}, missing/unmatched: {len(missing)}")
    if missing:
        print("Missing:", missing)
    print(f"{OUTPUT_PATH} written")


if __name__ == "__main__":
    main()
