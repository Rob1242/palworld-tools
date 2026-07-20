import json

from js_data_writer import write_js_consts

CLEAN_PATH = "palworld_pals_clean.json"
NAME_MAP_PATH = "palworld_name_jp_en_map.json"
COMBAT_PATH = "palworld_combat_stats.json"
OUTPUT_PATH = "palworld_dex_data.json"
JS_OUTPUT_PATH = "game_data/dex_data.js"

STAT_KEYS = [
    "hp",
    "melee_attack",
    "shot_attack",
    "defense",
    "support",
    "craft_speed",
    "max_full_stomach",
    "food_amount",
    "type1",
    "type2",
    "rarity",
    "size",
    "run_speed",
    "ride_sprint_speed",
    "partner_skill_desc",
]


def build_combat_index(combat):
    by_name = {}
    for c in combat:
        by_name.setdefault(c["name"].strip().lower(), []).append(c)
    return by_name


def pick_stats(entry):
    return {k: entry.get(k) for k in STAT_KEYS}


def main():
    clean = json.load(open(CLEAN_PATH, encoding="utf-8"))
    name_map = {e["name"]: e for e in json.load(open(NAME_MAP_PATH, encoding="utf-8"))}
    combat = json.load(open(COMBAT_PATH, encoding="utf-8"))
    combat_by_name = build_combat_index(combat)

    dex = []
    exact_match = 0
    variant_fallback = 0
    no_match = 0

    for p in clean:
        mapping = name_map.get(p["name"], {})
        en_name = mapping.get("en_name")
        icon = mapping.get("icon")

        stats = None
        stats_status = "missing"  # "exact" | "variant_fallback" | "missing"

        if en_name:
            key = en_name.strip().lower()
            if key in combat_by_name:
                stats = pick_stats(combat_by_name[key][0])
                stats_status = "exact"
                exact_match += 1
            elif "_" in en_name:
                base_key = en_name.rsplit("_", 1)[0].strip().lower()
                if base_key in combat_by_name:
                    stats = pick_stats(combat_by_name[base_key][0])
                    stats_status = "variant_fallback"
                    variant_fallback += 1

        if stats is None:
            no_match += 1

        work = {r: lv for r, lv in p["work_suitability"].items() if lv > 0}

        dex.append(
            {
                "id": p["id"],
                "name": p["name"],
                "en_name": en_name,
                "icon": icon,
                "types": p["types"],
                "active_time": p["active_time"],
                "is_dark_type": p["is_dark_type"],
                "ride": p["ride"],
                "work": work,
                "meal_amount": p["meal_amount"],
                "partner_skill": p["partner_skill"],
                "stats": stats,
                "stats_status": stats_status,
                "detail_url": p["detail_url"],
            }
        )

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(dex, f, ensure_ascii=False, indent=2)

    write_js_consts(JS_OUTPUT_PATH, [("PAL_DEX_DATA", dex)])

    print(f"total: {len(dex)}")
    print(f"exact combat-stat match: {exact_match}")
    print(f"variant fallback (1.0 elemental variant, using base-form stats, flagged): {variant_fallback}")
    print(f"no match at all: {no_match}")
    print(f"{OUTPUT_PATH} written, {JS_OUTPUT_PATH} written")


if __name__ == "__main__":
    main()
