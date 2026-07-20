import json, re

from js_data_writer import write_js_consts

MERGED_PATH = "game_data/item_obtain_raw/obtain_merged.json"
ITEMS_DEX_PATH = "game_data/items_dex_data.js"
BREEDING_PATH = "game_data/breedingdata_v2.json"
WORKBENCH_JP_PATH = "/tmp/workbench_jp_names.json"
IMPLANT_OBTAIN_PATH = "game_data/implant_obtain_raw.json"
JS_OUTPUT_PATH = "game_data/items_obtain_data.js"

# インプラント(懸賞金対策官/闘技場商人からの通貨交換、遺物リサイクル機からの確率入手)の
# 出典コード -> 日本語表示名。paldb.ccのSource列は内部コードのままなので手動で対応付ける。
SOURCE_JP_NAMES = {
    "Arena_Shop_1": "闘技場の商人",
    "Bounty_Shop_1": "懸賞金対策官",
    "Ancient Ruin": "古代遺跡",
}
for _n in range(1, 6):
    SOURCE_JP_NAMES[f"AncientRelicRecycler_WorldTreeRelic_{_n:02d}"] = f"古代遺物のリサイクル(世界樹の遺物レベル{_n})"

# paldb.ccのアイテム内リンク(href)は内部アセット名ではなく、英語表示名をスラッグ化した
# ものになっている(例: "Paloxite_Ingot"の実アセットは"WorldTreeIngot")。
# 2026-07-19発見(パルの配合データ調査時に発見した同種の問題と同じ)。
# 自前のitems_dex_data.js/breedingdata_v2.jsonのname_enを同じ規則でスラッグ化し、
# 逆引きテーブルを作って正しいアセット名に変換する。


def slugify(name):
    cleaned = name.strip().replace("'", "").replace("’", "")
    return cleaned.replace(" ", "_")


def main():
    merged = json.load(open(MERGED_PATH, encoding="utf-8"))
    workbench_jp = json.load(open(WORKBENCH_JP_PATH, encoding="utf-8"))
    implant_obtain = json.load(open(IMPLANT_OBTAIN_PATH, encoding="utf-8"))

    with open(ITEMS_DEX_PATH, encoding="utf-8") as f:
        content = f.read()
    content = content.split("=", 1)[1].strip().rstrip(";")
    items = json.loads(content)

    item_slug_to_asset = {}
    en_name_by_slug = {}
    for d in items:
        if d.get("name_en"):
            slug = slugify(d["name_en"])
            item_slug_to_asset.setdefault(slug, d["asset"])
            en_name_by_slug.setdefault(slug, d["name_en"])

    bd = json.load(open(BREEDING_PATH, encoding="utf-8"))
    pal_slug_to_asset = {}
    for asset, info in bd["pals"].items():
        if info.get("en_name"):
            pal_slug_to_asset.setdefault(slugify(info["en_name"]), asset)

    # 元データはitems_dex_data.js(en_name)をキーにしているので、そちらもスラッグ化して逆引き
    name_to_asset = {}
    for d in items:
        if d.get("name_en"):
            name_to_asset.setdefault(d["name_en"], d["asset"])

    out = {}
    unresolved_materials = set()
    unresolved_pals = set()

    for name, data in merged.items():
        asset = name_to_asset.get(name)
        if not asset:
            continue  # このスクレイピング専用の名前バリエーション(重複取得分)はスキップ

        entry = {}
        if data.get("dropped_by"):
            rows = []
            seen_rows = set()
            for r in data["dropped_by"]:
                dup_key = (r["pal_asset"], r["pal_jp_name"], r["qty"], r["rate"])
                if dup_key in seen_rows:
                    continue  # 複数レア度ページから同一ドロップ行が重複取得されるための除去
                seen_rows.add(dup_key)
                raw = r["pal_asset"]
                pal_asset = pal_slug_to_asset.get(raw)
                if not pal_asset:
                    # 二つ名付きの個体ボス(例: "Adorable_Phantom_Thief_Wispaw")は末尾が
                    # 元パルのスラッグと一致するので、末尾一致でベース種を解決する
                    # (アイコン表示用。表示名自体はpaldb.ccで取得済みの二つ名込みJP名を
                    # そのまま使うので、ここが多少不正確でも実害は無い)。
                    for slug, base_asset in pal_slug_to_asset.items():
                        if raw.endswith("_" + slug) or raw == slug:
                            pal_asset = base_asset
                            break
                if not pal_asset:
                    unresolved_pals.add(raw)
                    pal_asset = raw
                rows.append({
                    "pal_asset": pal_asset,
                    "pal_jp_name": r["pal_jp_name"],
                    "qty": r["qty"],
                    "rate": r["rate"],
                })
            entry["dropped_by"] = rows

        if data.get("production"):
            # レア度違いなどで複数レシピがあっても、最も基本的な(材料が最少の)ものを代表として使う
            best = min(data["production"], key=lambda p: len(p["materials"]))
            materials = []
            for m in best["materials"]:
                mat_asset = item_slug_to_asset.get(m["item_asset"], m["item_asset"])
                if mat_asset not in {d["asset"] for d in items}:
                    unresolved_materials.add(m["item_asset"])
                materials.append({"item_asset": mat_asset, "qty": m["qty"]})
            entry["production"] = {
                "workbench_jp": workbench_jp.get(best["workbench_asset"], best["workbench_asset"]),
                "materials": materials,
            }

        if entry:
            out[asset] = entry

    for asset, sources in implant_obtain.items():
        entry = out.setdefault(asset, {})
        entry["special_source"] = [
            {
                "type": "闘技場商人/懸賞金対策官からの交換" if s["type"] == "Wandering Merchant" else "宝箱・遺物リサイクル",
                "source": SOURCE_JP_NAMES.get(s["source"], s["source"]),
                "rate": s["rate"],
            }
            for s in sources
        ]

    write_js_consts(JS_OUTPUT_PATH, [("ITEM_OBTAIN_DATA", out)])
    print(f"items with obtain data: {len(out)}")
    print(f"unresolved material refs: {len(unresolved_materials)} {sorted(unresolved_materials)[:20]}")
    print(f"unresolved pal refs: {len(unresolved_pals)} {sorted(unresolved_pals)[:20]}")
    print(f"{JS_OUTPUT_PATH} written")


if __name__ == "__main__":
    main()
