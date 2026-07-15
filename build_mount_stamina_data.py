import json
import re

from js_data_writer import write_js_consts

# ===== ライドパルのスタミナ実測データ(陸上・飛行) =====
# 出典: https://paldb.cc/en/Mounts (Ground Mounts /75, Flying Mounts /29 の各タブ、
# get_page_textで取得・2026-07-16)。水上は既にgame_data/swim_speed_data.jsで
# stamina込みのデータを持っているため、ここでは陸上・飛行の分だけ追加する。
# 「永久機関」パッシブ(最大スタミナ+75%、ライドパルのみ有効)の効果を表示するために使う。

GROUND_TSV = """
Rushoar 500 800 6 3 600 100
Melpaca 500 900 7 2 700 100
Direhowl 800 1050 9 2 800 70
Chillet 750 1050 11 1.8 900 100
Eikthyrdeer 700 900 12 2.5 1000 100
Univolt 720 1100 14 2 1000 100
Arsox 700 1050 15 2.5 700 120
Grintale 650 1000 19 1000 100
Sweepa 650 1020 20 550 120
Tarantriss 640 1000 20 1.5 600 100
Eikthyrdeer_Terra 700 900 21 2.5 1000 100
Kingpaca 700 1040 23 3 1750 170
Dinossom 700 1030 24 130
Surfent_Terra 500 800 25 550 100
Polapup 250 375 26 120
Fenglope 750 1050 26 2 1300 140
Mammorest 600 1030 28 3 1000 180
Dazemu 900 1200 28 0.85 800 100
Pyrin 850 1300 29 3 1500 100
Rayhound 700 1150 30 2.5 1000 100
Reindrix 700 1070 31 2.2 1000 140
Rayhound_Cryst 700 1150 32 2.5 1000 100
Mossanda 600 1000 32 0.25 130
Broncherry 550 1020 33 2.5 700 150
Blazehowl 800 1200 33 3 1300 150
Dinossom_Lux 700 1030 34 130
Pyrin_Noct 850 1300 34 3 1500 100
Mossanda_Lux 600 1000 34 0.25 130
Palumba 550 1000 35 610 180
Blazehowl_Noct 800 1200 35 3 1300 150
Braloha 600 1020 36 2.1 640 270
Maraith 700 1100 37 800 130
Shroomer 740 1050 39 0.75 525 220
Shroomer_Noct 740 1050 39 0.75 525 220
Chillet_Ignis 750 1050 40 1.8 900 100
Grizzbolt 600 1000 40 3 1500 180
Mammorest_Cryst 600 1030 41 3 1000 180
Yakumo 750 1080 41 140
Xenogard 790 1200 41 250
Reptyro 550 1000 42 3 600 220
Whalaska 600 750 42 820 200
Reptyro_Cryst 550 1000 43 3 600 220
Broncherry_Aqua 550 1020 44 2.5 700 150
Relaxaurus 650 1000 45 200
Wumpo 600 1050 45 240
Kingpaca_Cryst 700 1040 46 3 1750 170
Blazamut 800 1200 46 4 1500 190
Relaxaurus_Lux 650 1000 48 200
Dualith 600 800 48 1.2 450 210
Wumpo_Botan 600 1050 51 240
Bulldosu 600 810 53 460 110
Gildane 840 1260 54 2.5 1300 200
Celesdir 800 1200 54 2 1500 260
Polapup_Terra 250 375 55 120
Blazamut_Ryu 800 1200 55 4 1500 190
Fenglope_Lux 750 1050 57 2 1300 140
Kitsun 700 1100 57 2 1000 140
Starryon 900 1250 57 3 1500 230
Azurmane 900 1260 58 3 1500 220
Kitsun_Noct 700 1100 59 2 1000 140
Jormuntide_Ignis 600 1000 59 150
Silvegis 700 1050 60 280
Paladius 800 1800 61 2.5 1000 400
Necromus 1300 1900 61 2.5 900 350
Univolt_Cryst 720 1100 64 2 1000 100
Dualith_Noct 600 800 69 1.2 450 210
Moldron_Cryst 650 850 70 1.5 500 270
Hartalis 900 1900 70 2 1500 400
Whalaska_Ignis 600 750 71 820 200
Ophydia 700 1500 72 550 100
Bastigor 750 1100 73 270
Tetroise_Primo 360 540 75 1.2 450 200
Starryon_Primo 900 1250 77 3 1500 230
Celesdir_Noct 800 1200 78 2 1500 260
Aegidron 850 1100 79 1.5 600 300
""".strip()

FLYING_TSV = """
Panthalus 3000 3000 100
Nitewing 600 750 15 100
Elphidran 700 1000 20 130
Vanwyrm 700 850 21 150
Vanwyrm_Cryst 700 850 22 150
Helzephyr 700 1100 25 170
Beakon 750 1200 29 160
Elphidran_Aqua 700 1000 32 130
Ragnahawk 800 1300 33 150
Quivern 900 1400 38 220
Astegon 700 1100 39 300
Suzaku 850 1100 43 350
Suzaku_Aqua 850 1100 44 350
Quivern_Botan 900 1400 45 220
Helzephyr_Lux 700 1100 47 170
Shadowbeak 1100 1600 47 700 250
Selyne 1000 1600 53 300
Faleris 1000 1400 60 230
Faleris_Aqua 1000 1400 60 230
Frostallion 1200 1800 62 800 300
Frostallion_Noct 1200 1800 62 800 300
Dynamoff 700 1000 66 140
Xenolord 1700 2700 66 300
Eidrolon 1400 2750 68 130
Beakon_Cryst 750 1200 71 160
Roujay 950 1350 72 200
Eidrolon_Ignis 1400 2750 76 130
Shaolong 1400 2800 77 100
Jetragon 1700 3300 79 600 110
""".strip()


def parse_table(tsv):
    out = {}
    for line in tsv.splitlines():
        parts = line.split()
        name = parts[0]
        stamina = int(parts[-1])
        out[name] = stamina
    return out


def main():
    with open("palworld_dex_data.json", encoding="utf-8") as f:
        dex = json.load(f)
    by_en = {p["en_name"]: p for p in dex if p.get("en_name")}

    ground = parse_table(GROUND_TSV)
    flying = parse_table(FLYING_TSV)

    out = {}
    missing = []
    for en, stamina in {**ground, **flying}.items():
        p = by_en.get(en)
        if not p:
            missing.append(en)
            continue
        out[p["id"]] = stamina

    if missing:
        print("見つからなかったen_name:", missing)
    print(f"{len(out)}件のマッチ")

    write_js_consts("game_data/mount_stamina_data.js", [("MOUNT_STAMINA_DATA", out)])
    print("game_data/mount_stamina_data.js 書き出し完了")


if __name__ == "__main__":
    main()
