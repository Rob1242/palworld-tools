import json, re

from js_data_writer import write_js_consts

# フィールドボス(アルファ個体)83体をpaldb.ccのマップデータ(curated_landmarks_raw.json内
# type="Alpha Pal")から抽出。asset欄は「二つ名(英語)+パルの英語名(+属性variant)」が
# アンダースコアで連結された文字列(例: "Gold-Armored_Warrior_Warsect_Terra")なので、
# dex_data.jsのen_nameと後方一致させて二つ名とパル本体を分離する(2026-07-20)。
LANDMARKS_PATH = "game_data/curated_landmarks_raw.json"
DEX_PATH = "game_data/dex_data.js"
OBTAIN_PATH = "game_data/items_obtain_data.js"
ITEMS_DEX_PATH = "game_data/items_dex_data.js"
OUT_PATH = "game_data/field_boss_data.js"

# paldb.ccのアイテムドロップ表は同一パルでも複数の呼称違いの行が混在しており(例:
# Horus_Water(イシス)には「イシス」(野生種)「水天の覇者 イシス」(アルファ個体)
# 「狂暴化した イシス」(別の凶暴化ボス個体、アルファとは無関係)の3種)、これらは
# ドロップ率が食い違う(例: WeaselDragonの「革」は野生100%・アルファ版0%)。
# 塔ボス・レイドボスの勢力名や「狂暴化した」「魔改造」等の既知の非アルファ接頭辞を
# 除外し、残った接頭辞つき行だけをそのアルファ個体固有のドロップ表として採用する。
NON_ALPHA_PREFIXES = {
    "狂暴化した", "魔改造", "突然変異した",
    "密猟団", "自警団", "永炎の同志", "パル愛護団体", "遺伝子研究部隊", "月花衆",
}


def load_const(path):
    content = open(path, encoding="utf-8").read()
    return json.loads(content.split("=", 1)[1].strip().rstrip(";"))


def main():
    landmarks = json.load(open(LANDMARKS_PATH, encoding="utf-8"))
    alphas = [x for x in landmarks if x["type"] == "Alpha Pal"]

    dex = load_const(DEX_PATH)
    by_en = {p["en_name"]: p for p in dex if p.get("en_name")}

    obtain = load_const(OBTAIN_PATH)
    items_dex = load_const(ITEMS_DEX_PATH)
    item_by_asset = {it["asset"]: it for it in items_dex}

    def internal_asset(p):
        m = re.search(r"T_(.+?)_icon_normal\.webp", p["icon"])
        return m.group(1) if m else None

    # pal_asset -> [(item_asset, qty, rate, pal_jp_name)]
    drops_by_pal = {}
    for item_asset, entry in obtain.items():
        for db in entry.get("dropped_by", []):
            drops_by_pal.setdefault(db["pal_asset"], []).append(
                (item_asset, db["qty"], db["rate"], db["pal_jp_name"])
            )

    out = []
    unresolved = []
    ambiguous = []
    for a in alphas:
        tokens = a["asset"].split("_")
        pal_en = None
        for i in range(len(tokens)):
            cand = "_".join(tokens[i:])
            if cand in by_en:
                pal_en = cand
                title_en = "_".join(tokens[:i]).replace("_", " ")
                break
        if not pal_en:
            unresolved.append(a)
            continue
        pal = by_en[pal_en]
        asset = internal_asset(pal)
        plain_jp = pal["name"]

        all_rows = drops_by_pal.get(asset, [])
        title_prefixes = set()
        for _, _, _, jp_name in all_rows:
            if jp_name != plain_jp and jp_name.endswith(plain_jp):
                prefix = jp_name[: -len(plain_jp)].strip()
                if prefix and prefix not in NON_ALPHA_PREFIXES:
                    title_prefixes.add(prefix)

        if len(title_prefixes) == 1:
            title_jp = next(iter(title_prefixes))
            rows = [r for r in all_rows if r[3] == f"{title_jp} {plain_jp}"]
        elif len(title_prefixes) == 0:
            title_jp = None
            rows = [r for r in all_rows if r[3] == plain_jp]
        else:
            title_jp = None
            rows = []
            ambiguous.append((a["name"], asset, title_prefixes))

        raw_drops = sorted(
            rows,
            key=lambda d: int(d[2].rstrip("%")) if d[2].rstrip("%").isdigit() else 999,
        )
        drops = []
        seen_items = set()
        for item_asset, qty, rate, _ in raw_drops:
            if rate == "0%":
                continue
            if item_asset in seen_items:
                continue
            seen_items.add(item_asset)
            item = item_by_asset.get(item_asset)
            drops.append({
                "asset": item_asset,
                "jp_name": item["name_jp"] if item else item_asset,
                "icon": item["icon"] if item else None,
                "qty": qty,
                "rate": rate,
            })

        out.append({
            "title_en": title_en,
            "title_jp": title_jp,
            "jp_name": a["name"],
            "en_name": pal_en,
            "asset": asset,
            "icon": pal["icon"],
            "level": a["lv"],
            "x": a["x"],
            "y": a["y"],
            "types": pal["types"],
            "drops": drops,
        })

    out.sort(key=lambda b: b["level"])
    write_js_consts(OUT_PATH, [("FIELD_BOSS_DATA", out)])
    with_title = sum(1 for b in out if b["title_jp"])
    print(f"{len(out)}件 -> {OUT_PATH} (未解決: {len(unresolved)}, 和名タイトル判明: {with_title}, ドロップ判定曖昧: {len(ambiguous)})")
    for u in unresolved:
        print("  unresolved:", u)
    for name, asset, prefixes in ambiguous:
        print("  ambiguous:", name, asset, prefixes)


if __name__ == "__main__":
    main()
