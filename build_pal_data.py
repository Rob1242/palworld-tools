import json

from js_data_writer import write_js_consts

CLEAN_PATH = "palworld_pals_clean.json"
NAME_MAP_PATH = "palworld_name_jp_en_map.json"
WORK_SPEED_PATH = "palworld_work_speed_table.json"
JS_OUTPUT_PATH = "game_data/base_planner_data.js"

ROLE_ORDER = [
    "火おこし", "水やり", "種まき", "発電", "手作業", "採集",
    "伐採", "採掘", "製薬", "冷却", "運搬", "牧場",
]


def build_pal_data():
    clean = json.load(open(CLEAN_PATH, encoding="utf-8"))
    name_map = {e["name"]: e for e in json.load(open(NAME_MAP_PATH, encoding="utf-8"))}

    pal_data = []
    for p in clean:
        work = {
            r: p["work_suitability"][r]
            for r in ROLE_ORDER
            if p["work_suitability"].get(r, 0) > 0
        }
        entry = {
            "name": p["name"],
            "types": p["types"],
            "active": p["active_time"],
            "work": work,
            "meal": p["meal_amount"],
            "pskill": p["partner_skill"]["name"],
            "icon": name_map.get(p["name"], {}).get("icon"),
            "ride": p["ride"],
        }
        pal_data.append(entry)
    return pal_data


def build_work_speed_table():
    data = json.load(open(WORK_SPEED_PATH, encoding="utf-8"))
    table = dict(data["work_speed_by_role"])
    # 運搬はthepalprofessor.com実測のスタック数データ(transport_stack_by_level)を
    # 他役職と同じLv1〜5の実測テーブルとしてそのままマージする(牧場用のstar系データとは別物)
    table["運搬"] = data["transport_stack_by_level"]
    return table


def main():
    pal_data = build_pal_data()
    work_speed_table = build_work_speed_table()

    write_js_consts(JS_OUTPUT_PATH, [
        ("PAL_DATA", pal_data),
        ("WORK_SPEED_TABLE", work_speed_table),
    ])

    icons_present = sum(1 for p in pal_data if p["icon"])
    print(f"PAL_DATA生成: {len(pal_data)}体、うちアイコン有り{icons_present}体")
    print(f"WORK_SPEED_TABLE生成: {len(work_speed_table)}役職分")
    print(f"{JS_OUTPUT_PATH} を更新しました")


if __name__ == "__main__":
    main()
