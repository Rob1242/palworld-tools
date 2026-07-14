import json
import os
import re

BREEDING_PATH = "game_data/breedingdata.json"
DEX_PATH = "palworld_dex_data.json"
OUTPUT_PATH = "palworld_breeding_data.json"
# このスクリプトが存在すればBREEDING_DATA定数を注入するHTMLファイル一覧。
# まだ存在しないファイルは黙ってスキップする(Task 2/3でファイルが増えたらここに追記する)。
INJECT_TARGETS = ["palworld_breeding.html", "palworld_palbox.html"]

# palworld_dex_data.json(287体+コラボ11体)には載っていないが、
# paldb.cc/ja/<en_name> を直接確認してJP名を検証済みのパル。
# いずれも`partner_skill_desc`が"This Pal is under investigation."という
# 未実装プレースホルダ文言、または属性/速度が未設定(-1)だったため、図鑑への
# 正式追加(build_collab_pals.py)は見送ったが、JP名自体はpaldb.ccで実在確認済み。
# 図鑑側にエントリが無いため dex_id は None のまま。捏造防止のため、必ずpaldb.ccで実在確認したもののみ追加すること。
EXTRA_JP_NAMES = {
    "BlackFurDragon": "ドラゴストロフェ",
    "ElecLion": "エレクライオン",
    "WorldTreeDragon": "ゼロヴァース",
}


def build_jp_index(dex):
    idx = {}
    for p in dex:
        if p.get("en_name"):
            idx[p["en_name"].strip().lower()] = p
    return idx


def match_asset_to_jp(info, jp_idx):
    name = info.get("name", "")
    key = name.strip().lower()
    if key in jp_idx:
        return jp_idx[key], "exact"
    # Try replacing spaces with underscores (for variants like "Kitsun Noct" -> "Kitsun_Noct")
    if " " in name:
        variant_key = name.strip().lower().replace(" ", "_")
        if variant_key in jp_idx:
            return jp_idx[variant_key], "variant_fallback"
    if "_" in name:
        base = name.rsplit("_", 1)[0].strip().lower()
        if base in jp_idx:
            return jp_idx[base], "variant_fallback"
    return None, "missing"


def pal_info_icon(info):
    icon = info.get("icon")
    if icon and icon.startswith("/"):
        return "game_data" + icon
    return icon


def build_pals(pal_info, jp_idx):
    pals = {}
    matched = 0
    unmatched = []
    for asset, info in pal_info.items():
        jp, status = match_asset_to_jp(info, jp_idx)
        if jp:
            matched += 1
            pals[asset] = {
                "jp_name": jp["name"],
                "en_name": info.get("name"),
                "icon": jp.get("icon"),
                "dex_id": jp.get("id"),
                "combi_rank": info.get("combi_rank"),
                "rarity": info.get("rarity"),
                "ignore_combi": bool(info.get("ignore_combi")),
                "match_status": status,
            }
        elif asset in EXTRA_JP_NAMES:
            matched += 1
            pals[asset] = {
                "jp_name": EXTRA_JP_NAMES[asset],
                "en_name": info.get("name"),
                "icon": pal_info_icon(info),
                "dex_id": None,
                "combi_rank": info.get("combi_rank"),
                "rarity": info.get("rarity"),
                "ignore_combi": bool(info.get("ignore_combi")),
                "match_status": "extra_jp_name",
            }
        else:
            unmatched.append(asset)
            pals[asset] = {
                "jp_name": None,
                "en_name": info.get("name"),
                "icon": pal_info_icon(info),
                "dex_id": None,
                "combi_rank": info.get("combi_rank"),
                "rarity": info.get("rarity"),
                "ignore_combi": bool(info.get("ignore_combi")),
                "match_status": "missing",
            }
    return pals, matched, unmatched


def pair_key(a, b):
    return "|".join(sorted([a, b]))


def build_forward_and_reverse(bd):
    forward = {}

    # 1. ランク平均による正規の配合ペア(ベースライン)
    for child, pairs in bd["child_to_parents_formula"].items():
        for p in pairs:
            forward[pair_key(p["parent_a"], p["parent_b"])] = child

    # 2. ignore_combiパル専用の固定配合(正規テーブルを上書き)
    for special_parent, combos in bd["parent_to_children_formula"].items():
        for c in combos:
            k = pair_key(special_parent, c["partner"])
            forward[k] = c["child"]

    # 3. unique_combos(固定レシピ)が最優先で上書き
    for uc in bd["unique_combos"]:
        k = pair_key(uc["parent_a"], uc["parent_b"])
        forward[k] = uc["child"]

    # forwardから逆向きマッピングを構築
    unique_pair_keys = set()
    for special_parent, combos in bd["parent_to_children_formula"].items():
        for c in combos:
            k = pair_key(special_parent, c["partner"])
            if forward.get(k) == c["child"]:
                unique_pair_keys.add(k)
    for uc in bd["unique_combos"]:
        k = pair_key(uc["parent_a"], uc["parent_b"])
        if forward.get(k) == uc["child"]:
            unique_pair_keys.add(k)

    reverse = {}
    for key, child in forward.items():
        a, b = key.split("|")
        bucket = "unique" if key in unique_pair_keys else "formula"
        reverse.setdefault(child, {"unique": [], "formula": []})
        reverse[child][bucket].append([a, b])

    return forward, reverse


def inject_const(html_path, const_name, data):
    if not os.path.exists(html_path):
        print(f"  ({html_path} はまだ存在しないためスキップ)")
        return
    serialized = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    html = open(html_path, encoding="utf-8").read()
    pattern = re.compile(r"^const " + re.escape(const_name) + r" = .*$", re.MULTILINE)
    if not pattern.search(html):
        raise ValueError(f"{html_path} に `const {const_name} = ...;` の行が見つかりません")
    html = pattern.sub(lambda m: f"const {const_name} = {serialized};", html, count=1)
    open(html_path, "w", encoding="utf-8").write(html)
    print(f"  {html_path} に {const_name} を注入しました")


def main():
    bd = json.load(open(BREEDING_PATH, encoding="utf-8"))
    dex = json.load(open(DEX_PATH, encoding="utf-8"))
    jp_idx = build_jp_index(dex)

    pals, matched, unmatched = build_pals(bd["pal_info"], jp_idx)
    forward, reverse = build_forward_and_reverse(bd)

    out = {"pals": pals, "forwardPairs": forward, "reverseParents": reverse}
    json.dump(out, open(OUTPUT_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    print(f"pal_info total: {len(bd['pal_info'])}")
    print(f"JP name matched: {matched} ({matched/len(bd['pal_info'])*100:.1f}%)")
    print(f"unmatched ({len(unmatched)}): {unmatched[:15]}{' ...' if len(unmatched) > 15 else ''}")
    print(f"forwardPairs entries: {len(forward)}")
    print(f"reverseParents entries (children with known route): {len(reverse)}")
    print(f"{OUTPUT_PATH} written")

    for target in INJECT_TARGETS:
        inject_const(target, "BREEDING_DATA", out)


if __name__ == "__main__":
    main()
