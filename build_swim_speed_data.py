from js_data_writer import write_js_consts

# ===== ライドパルの水上専用速度データ =====
# 自サイトのgame_data/dex_data.jsには陸上のrun_speed/ride_sprint_speedしか無く、
# 水上専用の泳ぎ速度(Swim Speed / Swim Dash Speed)が存在しなかった。そのため
# ライド速度ランキングの「水上」タブで、水上専用パルにも誤って陸上の速度を表示してしまい、
# 陸上移動速度が高いだけの「クトゥルフのめだま」(Terrariaコラボの特殊パル、実際には泳がない)
# が1位に来てしまう不具合があった(2026-07-16、ユーザー指摘により発覚)。
#
# 出典: https://paldb.cc/en/Mounts (Water Mountsタブ、Swim Speed/Swim Dash Speed/Staminaの
# 実数値テーブル)。調査エージェント経由で取得(2026-07-16)。en_nameで自サイトのdex_idと突き合わせ。
# Whalaskaの行がpaldb.cc上で2回表示されていた(重複、850/950/stamina200で同一内容)ため1件のみ採用。
# Rock Paper Shotgunの記事(https://www.rockpapershotgun.com/palworld-fastest-mounts)が
# 「水上マウントは13種」と明記しており、この13件で全数と考えてよい。
SWIM_SPEED_DATA_RAW = [
    {"en_name": "Chillet", "swim_speed": 1350, "swim_dash_speed": 1890, "stamina": 100},
    {"en_name": "Surfent", "swim_speed": 900, "swim_dash_speed": 1440, "stamina": 100},
    {"en_name": "Azurobe", "swim_speed": 920, "swim_dash_speed": 1000, "stamina": 160},
    {"en_name": "Azurobe_Cryst", "swim_speed": 920, "swim_dash_speed": 1000, "stamina": 160},
    {"en_name": "Ghangler", "swim_speed": 1200, "swim_dash_speed": 1350, "stamina": 320},
    {"en_name": "Elphidran_Aqua", "swim_speed": 1134, "swim_dash_speed": 1440, "stamina": 130},
    {"en_name": "Jormuntide", "swim_speed": 1080, "swim_dash_speed": 1800, "stamina": 150},
    {"en_name": "Ghangler_Ignis", "swim_speed": 1200, "swim_dash_speed": 1350, "stamina": 320},
    {"en_name": "Whalaska", "swim_speed": 850, "swim_dash_speed": 950, "stamina": 200},
    {"en_name": "Neptilius", "swim_speed": 1800, "swim_dash_speed": 2000, "stamina": 410},
    {"en_name": "Solmora", "swim_speed": 1100, "swim_dash_speed": 1300, "stamina": 220},
    {"en_name": "Solmora_Lux", "swim_speed": 1100, "swim_dash_speed": 1300, "stamina": 220},
    {"en_name": "Whalaska_Ignis", "swim_speed": 850, "swim_dash_speed": 950, "stamina": 200},
]

DEX_PATH = "palworld_dex_data.json"
OUTPUT_PATH = "game_data/swim_speed_data.js"


def main():
    import json

    with open(DEX_PATH, encoding="utf-8") as f:
        dex = json.load(f)
    by_en = {p["en_name"]: p for p in dex if p.get("en_name")}

    out = []
    missing = []
    for row in SWIM_SPEED_DATA_RAW:
        p = by_en.get(row["en_name"])
        if not p:
            missing.append(row["en_name"])
            continue
        out.append({
            "dexId": p["id"],
            "swim_speed": row["swim_speed"],
            "swim_dash_speed": row["swim_dash_speed"],
            "stamina": row["stamina"],
        })

    if missing:
        print("見つからなかったen_name:", missing)
    print(f"{len(out)}件のマッチ(全{len(SWIM_SPEED_DATA_RAW)}件中)")

    write_js_consts(OUTPUT_PATH, [("SWIM_SPEED_DATA", out)])
    print(f"{OUTPUT_PATH} 書き出し完了")


if __name__ == "__main__":
    main()
