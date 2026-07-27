import json

SKILLS_PATH = "game_data/skills.json"
LEARNSET_PATH = "game_data/pals_learnset.json"
OUTPUT_PATH = "game_data/skills_jp.json"

# Asset (WazaID with "EPalWazaID::" stripped) -> JP name.
#
# Sourced from https://gamepedia.jp/palworld/active_skill (fetched per-element,
# element param e.g. ?element=fire), cross-referenced by hand against
# game_data/skills.json's power/cooldown/element fields for every asset actually
# referenced in game_data/pals_learnset.json (345 distinct WazaID out of the
# 375 total in skills.json).
#
# Matching method: for each (element, power, cooldown) signature, if exactly one
# local asset and one wiki entry share it, the match is direct and unambiguous
# (raw numeric confirmation). Many species share identical power/cooldown at the
# same tier though (their "Unique_*" signature moves), so a second pass resolves
# those multi-candidate groups by cross-checking each local skill's English
# `name`/asset-name fragment against the wiki's Japanese name (either a literal
# transliteration - "Flare Storm" -> "フレアストーム" - or the JP text made of the
# same visible words as the asset, e.g. "RadiantBarrage" -> "レイディアントバレッジ"),
# with any single leftover pair in a group resolved by elimination once every
# other member of that group is independently confident. Entries with no
# discoverable wiki match at their exact signature (mostly boss-exclusive
# attacks not in the player-facing skill list - Yakushima bosses, MoonQueen gym
# attacks, WorldTreeDragon) are left unmatched rather than guessed.
JP_NAME = {
    # --- direct numeric (power+cooldown+element) unique matches ---
    "AirBlade": "エアーブレード",
    "AquaJet": "ウォータージェット",
    "BeamSlicer": "ビームスライサー",
    "BlastCanon": "ブラストキャノン",
    "BubbleShot": "バブルショット",
    "BubbleShower": "ポイズンシャワー",
    "Commet": "コメット",
    "CrossWind": "クロスウィンド",
    "DarkArrow": "ダークアロー",
    "DarkPulse": "スプレッドダーク",
    "DragonBreath": "ドラゴンブレス",
    "DragonCanon": "ドラゴンキャノン",
    "FlameWall": "フレイムウォール",
    "FlareArrow": "フレアアロー",
    "GhostFlame": "スピリットフレイム",
    "HydroSlicer": "ハイドロスライサー",
    "IceBlade": "アイスカッター",
    "IcicleThrow": "ブリザードスパイク",
    "Inferno": "インフェルノ",
    "PoisonShot": "ポイズンシュート",
    "SandTornado": "サンドトルネード",
    "SeaGush": "水柱噴出",
    "SelfDestruct": "自爆",
    "SelfExplosion": "メガトン自爆",
    "SolarBeam": "ソーラーブラスト",
    "StoneShotgun": "ストーンブラスト",
    "Unique_AmaterasuWolf_Bite": "ワイルドファング(炎)",
    "Unique_CaptainPenguin_BodySlide": "キャプテンスライディング",
    "Unique_ChickenPal_ChickenPeck": "チキンタックル",
    "Unique_DarkScorpion_Pierce": "ジャンピングスティンガー",
    "Unique_Deer_PushupHorn": "ホーンアッパー",
    "Unique_DomeArmorDragon_ExplosiveMissile": "炸裂ミサイル",
    "Unique_FairyDragon_FairyTornado": "ミスティックハリケーン",
    "Unique_FlowerPrince_PoisonGasDance": "ポイズンダンス",
    "Unique_GhostDragon_TailSlash": "テールスラッシュ",
    "Unique_GrassMinotaur_BullRush": "ブルラッシュ・レイジ",
    "Unique_Horus_FlareBird": "鳳凰翔波",
    "Unique_Horus_PerfectStorm": "炎凰烈波",
    "Unique_Horus_Water_AquaStorm": "鳳凰海波",
    "Unique_IceCrocodile_SpitAttack": "乱れ吐き",
    "Unique_KingAlpaca_BodyPress": "キングプレス",
    "Unique_KingWhale_AquaTornado": "アクアトルネード",
    "Unique_LanternButler_LanternFlame": "ランタンフレイム",
    "Unique_LegendDeer_RadiantPurge_Otomo": "浄化の光",
    "Unique_MoonQueen_MoonBeam": "ムーンビーム",
    "Unique_MoonQueen_MoonBlade": "青月刃",
    "Unique_Mothman_SporeScatter": "スポアバースト",
    "Unique_NightBlueHorse_DeathStep": "リーサルステップ",
    "Unique_RedFlowerBird_JumpKick": "フラワースタンプ",
    "Unique_SamuraiDog_DashSlash": "がんばりスラッシュ",
    "Unique_SumoDog_SumoStomp": "どすこいスタンプ",
    "Unique_ThunderDog_Ice_Bite": "ワイルドファング(氷)",
    "Unique_WingGolem_RoundCutter": "グラウンドカッター",
    "Unique_YakushimaBoss001_Small_DemonEyeCharge": "めだま突進",
    "Unique_YakushimaMonster001_SlimePress_Dark": "スライムプレス(闇)",
    "Unique_YakushimaMonster001_SlimePress_Fire": "スライムプレス(炎)",
    "Unique_YakushimaMonster001_SlimePress_Leaf": "スライムプレス(草)",
    "Unique_YakushimaMonster001_SlimePress_Normal": "スライムプレス(無)",
    "Unique_YakushimaMonster001_SlimePress_Rainbow": "スライムプレス(虹)",
    "Unique_YakushimaMonster001_SlimePress_Water": "スライムプレス(水)",
    "Unique_YakushimaMonster002_SwordCharge": "ソードチャージ",
    "Unique_YakushimaMonster003_BatCharge": "こうもりの襲撃",
    "Unique_Yakushima_SummonServant": "しもべの召喚",
    "WaterGun": "アクアショット",
    "Weapon_Use": "武器の使用",
    "WindBurst": "ウィンドブラスト",
    "WindCutter": "ウィンドカッター",

    # --- resolved from multi-candidate (same power/cooldown/element) groups by
    #     cross-referencing English name / asset-name against the JP wiki name ---
    "Unique_Baphomet_SwallowKite": "ヘルファイアクロー",
    "FlareTornado": "フレアストーム",
    "Unique_RedArmorBird_TriplePeck": "ラッシュビーク",
    "Unique_BirdDragon_FireBreath": "フライングブレス",
    "Unique_AmaterasuWolf_FireCharge": "風林火山",
    "Unique_VolcanoDragon_VolcanicLaser": "マグマレーザー",
    "Unique_ClownRabbit_TrickShow": "トリックショー",
    "Unique_WingGolem_Fire_FlameCutter": "フレイムカッター",
    "PowerShot": "パワーショット",
    "Unique_HawkBird_Storm": "トルネードアタック",
    "Unique_Eagle_GlidingNail": "グライドクロー",
    "SeedMine": "シードマイン",
    "Unique_SoldierBee_NeedleLance": "ニードルスピア",
    "Unique_RobinHood_BowSnipe": "スナイプショット",
    "Unique_GrassPanda_MusclePunch": "マッスルパンチ",
    "Unique_SakuraSaurus_SideTackle": "ボディスマッシュ",
    "SeedMachinegun": "シードマシンガン",
    "Unique_FlowerDinosaur_Whip": "ボタニカルスマッシュ",
    "Unique_VolcanoDragon_Ice_IcicleSpit": "アイススピット",
    "Unique_IceNarwhal_JumpingHorn": "ハイブリーチ",
    "Unique_ThunderBird_Ice_SnowStrom": "アイスダイブ",
    "DiamondFall": "ダイアモンドフォール",
    "Unique_RockBeast_Ice_IceHorn": "アイスバースト",
    "Unique_Kirin_Ice_IceTackle": "疾風氷撃",
    "Unique_MoonQueen_IceMoonBlade": "青月閃",
    "HolyBlast": "ホーリーバースト",
    "Unique_NightBlueHorse_Neutral_Tossin": "銀馬の疾走",
    "Unique_CubeTurtle_Neutral_HolyPress": "ホーリープレス",
    "Unique_SaintCentaur_OneSpearRushes": "一槍一閃",
    "Unique_WhiteDeer_HolyPillar": "ホーリーノヴァ",
    "Unique_LegendDeer_RadiantWingRush": "ディバインウィング",
    "RadiantBarrage": "レイディアントバレッジ",
    "RockBeat": "ストーンビート",
    "Unique_RockBeast_RockHorn": "ホーンバースト",
    "Unique_GrassGolem_RocketPunch": "ロケットアーム",
    "Unique_CubeTurtle_CubePress": "ストーンプレス",
    "GravityShot": "ダークショット",
    "Unique_BlackPuppy_BiteV2": "ダブルファング(闇)",
    "Unique_AmaterasuWolf_Dark_BiteV2": "ダブルファング(闇)",
    "SandTwister": "サンドツイスター",
    "Unique_GoldenHorse_StoneDash": "クラッシュダッシュ",
    "Unique_Anubis_GroundPunch": "グラウンドスマッシャー",
    "Unique_VolcanicMonster_Ice_IceAttack": "フロストバースト",
    "Unique_Yeti_SnowBall": "スノーボーリング",
    "Unique_KingAlpaca_Ice_IcePress": "キンキンプレス",
    "Unique_SamuraiDog_Bite": "ワイルドファング(地)",
    "Unique_GoldenHorse_Bite": "ワイルドファング(地)",
    "Unique_KingBahamut_AirCrash": "マグナクラッシュ",
    "CommetRain": "メテオレイン",
    "Unique_GhostDragon_PhosphorousBeam": "ブレイズビーム",
    "Unique_DarkMechaDragon_FunnelLaser": "オメガレーザー",
    "Unique_JetDragon_JumpBeam": "ビームコメット",
    "DarkWave": "シャドウバースト",
    "Unique_Werewolf_Scratch": "ジャンピングクロー",
    "Unique_FireKirin_Dark_DarkTossin": "ダークチャージ",
    "Unique_GhostBeast_Tossin": "スピリットダッシュ",
    "ShadowBall": "ナイトメアボール",
    "Unique_PurpleSpider_SpiderRaid": "スパイダーレイド",
    "Unique_AmaterasuWolf_Dark_DarkCharge": "火陰山雷",
    "DarkLaser": "ダークレーザー",
    "Unique_NightLady_FlameNightmare": "フレイムワルツ",
    "Unique_NightBlueHorse_Tossin": "幽馬の疾走",
    "IcicleLine": "アイシクルライン",
    "Unique_WhiteTiger_IceScratch": "ブリザードクロー",
    "Unique_ThunderDog_Ice_KoriShorai": "召雪",
    "Unique_SnowTigerBeastman_TrampleSlash": "氷烈爪",
    "Unique_Sekhmet_SomersaultScratch": "サマーソルトスクラッチ",
    "Unique_Gorilla_Ground_EarthPunch": "ゴリランブルコンボ",
    "Unique_Grassmammoth_Earthquake": "アースインパクト",
    "Unique_WhiteTiger_Ground_IronScratch": "ストーンクロー",
    "Tremor": "ロックバースト",
    "Unique_Anubis_LowRoundKick": "スピンレッグスラッシュ",
    "AirCanon": "エアーキャノン",
    "Unique_SheepBall_Roll": "コロコロモコロン",
    "Unique_PinkCat_CatPunch": "ツッパンチ",
    "Unique_GuardianDog_BiteV2": "ダブルファング",
    "Unique_Garm_BiteV2": "ダブルファング",
    "Unique_GrassMinotaur_Ice_BullRush": "スノーラッシュ・レイジ",
    "Unique_SnowTigerBeastman_SnowImpact": "氷床撃砕",
    "AcidRain": "アシッドレイン",
    "Unique_OctopursGirl_InkJet": "ジェットスモーク",
    "FlameFunnel": "フレイムファンネル",
    "Unique_VolcanicMonster_MagmaAttack": "ボルカニックバースト",
    "Unique_FireKirin_Tackle": "フレイムチャージ",
    "Eruption": "ボルカニックレイン",
    "Unique_GhostAnglerfish_Fire_SweepBait_Fire": "灼熱提灯払い",
    "DarkLegion": "ダークウィスプ",
    "Unique_SnakeGirl_SnakeShot": "ポイズンスキャッター",
    "Unique_NightLady_WarpBeam_Straight": "ナイトメアレイ",
    "Unique_BlackGriffon_TackleLaser2": "ディザスターディバインⅡ",
    "Unique_NightLady_WarpBeam": "ナイトメアレイブルーム",
    "Psychokinesis": "サイコグラビティ",
    "Unique_IceHorse_Dark_DarkBladeAttack": "ダークウィング",
    "Unique_WhiteDeer_Dark_DarkPillar": "ダークノヴァ",
    "Unique_GrassGolem_Dark_DarkArmCannon": "ダークルート",
    "Unique_FlowerPrince_PoisonGasTackle": "ポイズンプロムナード",
    "Unique_BlackCentaur_TwoSpearRushes": "双槍一閃",
    "Unique_HerculesBeetle_BeetleTackle": "ギガホーン",
    "Unique_FeatherOstrich_Tossin": "アースダッシュ",
    "DarkBall": "ダークボール",
    "Unique_BlackPuppy_Bite": "ワイルドファング(闇)",
    "Unique_AmaterasuWolf_Dark_Bite": "ワイルドファング(闇)",
    "SpecialCutter": "マルチカッター",
    "Unique_QueenBee_SpinLance": "スピニングスタッフ",
    "DarkCanon": "ダークキャノン",
    "Unique_DarkCrow_TelePoke": "ファントムアサルト",
    "Unique_VolcanoDragon_Ice_IceLaser": "アイスレーザー",
    "Unique_IceHorse_IceBladeAttack": "クリスタルウィング",
    "DoubleIcicleThrow": "ダブルブリザードスパイク",
    "IceAge": "フロストアウト",
    "Unique_DarkMechaDragon_ConvergentBeam": "アストラルレイ",
    "Unique_MummyPal_MummyAttack": "マミーラッシュ",
    "Unique_GrimGirl_BrutalMachete": "恨みの連打",
    "Unique_MonochromeQueen_BalletJump": "黒羽根の舞",
    "WindEdge": "ウィンドエッジ",
    "GrassTornado": "グラストルネード",
    "Unique_DrillGame_ShellAttack": "シェルスピン",
    "ThrowRock": "ストーンキャノン",
    "Unique_Deer_Ground_DirtyHorn": "マッドホーン",
    "DragonWave": "ドラゴンバースト",
    "Unique_WeaselDragon_FlyingTackle": "ロケットタックル",
    "Unique_Mothman_GiantSpore": "ジャイアントスポア",
    "Unique_GrassGolem_ArmCannon": "ルートキャノン",
    "Unique_LotusDragon_LotusBloom": "蓮華開咲",
    "Apocalypse": "アポカリプス",
    "Unique_MysteryMask_LifeSteal": "ソウルスティール",
    "Unique_BlackGriffon_TackleLaser": "ディザスターディバイン",
    "Unique_Baphomet_Dark_DarkKite": "ナイトメアクロー",
    "Unique_DarkMechaDragon_WarpComet": "コズミックメテオ",
    "DragonMeteor": "ドラゴンメテオ",
    "Unique_WhiteShieldDragon_ShieldTackle": "イージスチャージ",
    "Unique_BlueSkyDragon_SweepBreath": "蒼龍炎",
    "HyperBeam": "パルブラスト",
    "Unique_SifuDog_Counter": "渾身の構え",
    "RootLance": "サークルヴァイン",
    "Unique_TropicalOstrich_DashKick": "ダッシュキック",
    "SelfDestruct_Bee": "ビー・クワイエット",
    "Unique_Alpaca_Tackle": "ふんわりタックル",
    "Unique_GuardianDog_Bite": "ワイルドファング",
    "Unique_Garm_Bite": "ワイルドファング",
    "IciclePierce": "アイシクルバレット",
    "Unique_GrassMinotaur_Ice_BullRush_Lower": "スノーラッシュ",
    "Unique_LegendDeer_WarpPillarBurst": "セイクリッドレイン",
    "Unique_NightBlueHorse_Neutral_AirStep": "ロイヤルステップ",
    "Unique_KingWhale_WaveTackle": "タイダルチャージ",
    "Unique_Umihebi_WindingTackle": "オーシャンズスネイク",
    "PowerBall": "パワーボム",
    "Unique_FengyunDeeper_CloudTempest": "クラウドテンペスト",
    "Unique_NaughtyCat_CatPress": "キャットプレス",
    "Unique_Gorilla_GroundPunch": "ゴリラウンドコンボ",
    "Unique_GrassMinotaur_BullRush_Lower": "ブルラッシュ",
    "RootAttack": "スパインヴァイン",
    "Unique_LeafMomonga_SomerSault": "木の葉返り",
    "Unique_PandaGirl_RapidKick": "連続回し蹴り",
    "Unique_GrassRabbitMan_GrassRoundKick": "スピンレッグラッシュ",
    "Unique_FlameBuffalo_FlameHorn": "ブレイジングホーン",
    "FireSeed": "スプリットファイアー",
    "Unique_KingWhale_Maelstrom": "メイルストローム",
    "RipTide": "アクアサージ",
    "Unique_BlueSkyDragon_Tossin": "水龍突進",
    "Unique_Manticore_InfernoStrike": "ボルカニックファング",
    "Unique_Umihebi_Fire_FireWindingTackle": "マグマズスネイク",
    "RaidCutter": "レイドカッター",
    "ReflectiveShuriken": "リフレクトリーフ",
    "Unique_Yeti_Grass_GrassBall": "グラスボーリング",
    "Unique_Plesiosaur_LongBreath": "ロングブレス",
    "Unique_KingWhale_HomingBubble": "バブルレイン",
    "CreepingBubble": "バブルマーチ",
    "WaterBall": "スプラッシュボム",
    "Unique_Boar_Tackle": "猪突猛進",
    "Unique_CuteMole_DiggingAttack": "モグリフト",
    "Unique_AmaterasuWolf_BiteV2": "ダブルファング(炎)",
    "FireBlast": "ファイアーショット",
    "Unique_ThunderDog_Ice_BiteV2": "ダブルファング(氷)",
    "FireBall": "ファイアーボール",
    "Unique_KingBahamut_ArmSmash": "アームインパクト",
    "Unique_VolcanoDragon_MagmaSpit": "マグマスピット",
    "Unique_TentacleTurtle_HydroSpin": "ハイドロスピン",
    "LineGeyser": "ラインスプラッシュ",
    "Unique_Ronin_Iai": "居合斬り",
    "Flamethrower": "ファイアーブレス",
    "Unique_GoldenHorse_BiteV2": "ダブルファング(地)",
    "Unique_SamuraiDog_BiteV2": "ダブルファング(地)",
    "MudShot": "マッドシュート",
    "IceWall": "フリーズウォール",
    "Unique_BirdDragon_Ice_IceBreath": "フライングブリザード",
    "Unique_Werewolf_Ice_SnowScratch": "スノークロー",
    "FrostBreath": "コールドブレス",
    "StarMine": "スターマイン",
    "WallSplash": "ウォールスプラッシュ",
    "Unique_StuffedShark_HiddenWeapon": "トリガーハッピー",
    "Unique_KingWhale_AquaBlade": "マリンブレード",
    "Unique_SakuraSaurus_Water_SplashTackle": "スプラッシュタックル",
    "DiversionLaser": "高圧水撃",
    "Unique_PoseidonOrca_TorrentLaser": "タラソニックレーザー",
    "Unique_KingWhale_Breaching": "グランドブリーチ",
    "Unique_BlueSkyDragon_DrainStorm": "天変之渦",
    "Unique_ScorpionMan_Uppercut": "アッパースマッシュ",
    "Unique_DarkAlien_JumpScractch": "イービルクロー",
    "Unique_GhostAnglerfish_SweepBait": "提灯払い",
    "HydroPump": "ハイドロストリーム",
    "ChargeCanon": "チャージキャノン",
    "Unique_DarkMechaDragon_SetFunnel": "サテライトビット",
    "Unique_Yakushima_EyeTossin": "凝視の突進",

    # --- Electricity (element key differs from local: "Electricity" not "Thunder") ---
    "Unique_ThunderDragonMan_NumerousSwordAttack": "ポリケラウノス",
    "ShokeiLaser": "エクスキューションレーザー",
    "ThunderStorm": "サンダーストーム",
    "Unique_BlueThunderHorse_FlashDash": "ボルトブリンク",
    "Unique_ScorpionMan_Erectric_UpperThunder": "アッパーサンダー",
    "Railbolt": "サンダーレール",
    "ThunderFunnel": "プラズマファンネル",
    "Unique_Kirin_LightningTackle": "疾風雷撃",
    "ThunderSpear": "サンダースピア",
    "Unique_ThunderDog_BiteV2": "ダブルファング(雷)",
    "Unique_ElecPomeranian_BiteV2": "ダブルファング(雷)",
    "LightningStrike": "ライトニングストライク",
    "Unique_FengyunDeeper_Electric_ThunderTempest": "サンダーテンペスト",
    "Unique_FlowerDinosaur_Electric_ThunderWhip": "ライトニングスマッシュ",
    "Unique_GrassPanda_Electric_ElectricPunch": "ブラストパンチ",
    "Unique_ThunderBird_ThunderStorm": "ライトニングダイブ",
    "Unique_CaptainPenguin_Black_BodySlide_Electric": "サンダースライディング",
    "ThunderRain": "サンダーレイン",
    "Unique_ElecSnail_ShellCharge": "シェルチャージ",
    "RangeThunder": "オールレンジサンダー",
    "Unique_BlueThunderHorse_Tossin": "フラッシュチャージ",
    "SpreadPulse": "スパークショット",
    "Unique_ElecPomeranian_Bite": "ワイルドファング(雷)",
    "Unique_ThunderDog_Bite": "ワイルドファング(雷)",
    "Unique_ThunderDog_InazumaShorai": "召雷",
    "ThunderBall": "サンダーボール",
    "Unique_ThunderDragonMan_ThunderSwordAttack": "ケラウノス",
    "TriSpark": "トライスパーク",
}

# gamepedia.jpの元データでは未確認(missing)だった21件を、paldb.cc(https://paldb.cc/ja/<英語名>、
# 例: https://paldb.cc/ja/Iceberg)の各技個別ページを直接確認して追加(2026-07-26)。
# 出典が異なるためJP_NAMEとは別辞書にし、match_statusも"paldb.cc確認済み"と区別する。
# 残り約33件(Unique_WorldTreeDragon_*, Unique_YakushimaBoss001/002_*, GYM_Act系)は
# ボス専用の内部スクリプト技で、そもそも英語名すら内部アセットコードのままであり
# (paldb.ccの該当ページでも日本語名の記載なしを確認済み)、捏造禁止ルールにより
# 未確認のまま(英語表記フォールバック)で維持する。
JP_NAME_PALDB = {
    "BlizzardLance": "アイスバーグ",
    "ElecWave": "ショックウェーブ",
    "IceMissile": "アイスミサイル",
    "LineThunder": "ラインサンダー",
    "LockonLaser": "ロックオンレーザー",
    "PoisonFog": "ポイズンフォグ",
    "PredatorBeam": "プレデタービーム",
    "PredatorLockon": "プレデターロックオン",
    "PredatorWave": "プレデターウェーブ",
    "RockLance": "ロックランス",
    "ThreeCommet": "コメットフォール",
    "ThreeThunder": "トライサンダー",
    "Thunderbolt": "ライトニングボルト",
    "Unique_Anubis_Tackle": "フォースドライブ",
    "Unique_BlackMetalDragon_FirePunch": "パンチブレス",
    "Unique_DarkMechaDragon_BeamSlash": "ビームスラッシュ",
    "Unique_ElecPanda_ElecScratch": "ライトニングクロー",
    "Unique_ElecPanda_GatlingAttack": "雷撃の重戦車",
    "Unique_IceDeer_IceHorn": "アイスホーンラッシュ",
    "Unique_LilyQueen_LilyHealing": "豊穣の加護",
    "Unique_Sekhmet_RollingScratch": "ローリングスクラッチ",
}


def main():
    sk = json.load(open(SKILLS_PATH, encoding="utf-8"))
    ls = json.load(open(LEARNSET_PATH, encoding="utf-8"))["learnset"]

    used_waza = set()
    for pal, moves in ls.items():
        for m in moves:
            used_waza.add(m["WazaID"].replace("EPalWazaID::", ""))

    by_asset = {s["asset"]: s for s in sk["skills"]}

    out = {}
    matched = 0
    missing = []
    for asset in sorted(used_waza):
        info = by_asset.get(asset)
        en_name = info["name"] if info else None
        jp = JP_NAME.get(asset)
        if jp:
            matched += 1
            out[asset] = {"jp_name": jp, "en_name": en_name, "match_status": "wiki確認済み"}
        elif asset in JP_NAME_PALDB:
            matched += 1
            out[asset] = {"jp_name": JP_NAME_PALDB[asset], "en_name": en_name, "match_status": "paldb.cc確認済み"}
        else:
            missing.append(asset)
            out[asset] = {"jp_name": None, "en_name": en_name, "match_status": "missing"}

    result = {"active_skills": out}
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"active skills referenced in learnsets: {len(used_waza)}")
    print(f"matched: {matched} ({matched/len(used_waza)*100:.1f}%)")
    print(f"missing ({len(missing)}): {missing}")
    print(f"{OUTPUT_PATH} written")


if __name__ == "__main__":
    main()
