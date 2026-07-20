import glob
import json

from js_data_writer import write_js_consts

DEX_PATH = "palworld_dex_data.json"
RAW_GLOB = "game_data/paldb_raw/*.json"
OUTPUT_PATH = "game_data/paldb_extra.json"
JS_OUTPUT_PATH = "game_data/paldb_extra_data.js"


def main():
    dex = json.load(open(DEX_PATH, encoding="utf-8"))
    all_ids = {p["id"] for p in dex}

    merged = {}
    ok_count = 0
    not_found_count = 0
    for path in sorted(glob.glob(RAW_GLOB)):
        chunk = json.load(open(path, encoding="utf-8"))
        for entry in chunk:
            dex_id = entry.get("dex_id")
            if not dex_id:
                continue
            if entry.get("status") == "ok":
                ok_count += 1
                merged[dex_id] = {
                    "innate_passives": entry.get("innate_passives", []),
                    "drops": entry.get("drops", []),
                    "obtain": entry.get("obtain", {}),
                }
            else:
                not_found_count += 1

    missing_ids = sorted(all_ids - set(merged.keys()), key=lambda x: (len(x), x))

    print(f"dex total: {len(all_ids)}")
    print(f"merged ok: {ok_count}")
    print(f"not_found/error (in raw chunks): {not_found_count}")
    print(f"missing from merged output entirely: {len(missing_ids)}")
    if missing_ids:
        print("  missing ids:", missing_ids[:30], "..." if len(missing_ids) > 30 else "")

    json.dump(merged, open(OUTPUT_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"{OUTPUT_PATH} written ({len(merged)} pals)")

    write_js_consts(JS_OUTPUT_PATH, [("PALDB_EXTRA_DATA", merged)])
    print(f"{JS_OUTPUT_PATH} written(palworld_dex.html・palworld_palbox.html共有)")


if __name__ == "__main__":
    main()
