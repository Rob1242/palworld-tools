import json

from js_data_writer import write_js_consts

# paldb.ccの各パルページ「Movement」「Level 80」カードから全298種統一的にスクレイピング
# (scripts/scrape_movement_data.py、2026-07-20)。従来は走行速度・ライド疾走速度のみ
# 全種対応で、遊泳速度は14種・スタミナは104種の特例対応にとどまっていた。
SRC_PATH = "game_data/movement_raw_0_386.json"
MOVEMENT_OUT = "game_data/movement_data.js"
LEVEL80_OUT = "game_data/level80_stats_data.js"

FIELD_MAP = {
    "SlowWalkSpeed": "slow_walk_speed", "WalkSpeed": "walk_speed", "RunSpeed": "run_speed",
    "RideSprintSpeed": "ride_sprint_speed", "TransportSpeed": "transport_speed",
    "SwimSpeed": "swim_speed", "SwimDashSpeed": "swim_dash_speed", "Stamina": "stamina",
}


def main():
    raw = json.load(open(SRC_PATH, encoding="utf-8"))

    movement_out = {}
    level80_out = {}
    for asset, entry in raw.items():
        mv = entry.get("movement", {})
        cleaned = {}
        for src_key, out_key in FIELD_MAP.items():
            if src_key in mv:
                try:
                    cleaned[out_key] = int(mv[src_key])
                except ValueError:
                    pass
        if cleaned:
            movement_out[asset] = cleaned

        l80 = entry.get("level80")
        if l80:
            level80_out[asset] = {
                "hp": l80.get("HP"),
                "attack": l80.get("攻撃"),
                "defense": l80.get("防御"),
            }

    write_js_consts(MOVEMENT_OUT, [("MOVEMENT_DATA", movement_out)])
    write_js_consts(LEVEL80_OUT, [("LEVEL80_STATS_DATA", level80_out)])
    print(f"movement: {len(movement_out)}件 -> {MOVEMENT_OUT}")
    print(f"level80: {len(level80_out)}件 -> {LEVEL80_OUT}")


if __name__ == "__main__":
    main()
