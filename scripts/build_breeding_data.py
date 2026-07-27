import json
import urllib.request

from js_data_writer import write_js_consts

# ══════════════════════════════════════════════════════════════
# 2026-07-27 データソース刷新
#
# 旧データ(game_data/breedingdata.json、出典不明)は1.0リリース前の
# データである疑いが強く、実際に「ボルゼクス+ヤンデリナ」の配合先が
# フロスドンと誤って計算されていた(実機ではアヌビス)ことがユーザー報告で
# 発覚・確認された。原因はコンビランクの数値自体ではなく、自前実装していた
# 「ランク平均に最も近い種族を選ぶ」計算に、ゲーム側が持つ優先順位
# (BreedingPowerPriority)判定が欠けていたこと。
#
# 対応として、tylercamp/palcalc(MIT、1.0リリース当日から追随・継続更新、
# ゲームファイルから直接抽出した配合結果44,851件を保持)を一次データソースに
# 全面切り替えする。自前で配合アルゴリズムを再実装せず、計算済みの結果を
# そのまま採用することで同種のロジックバグを再発させない。
#
# 固定レシピ(「unique」タグ表示用)の判定は、同じくゲームファイル直接抽出の
# Awy64/palworld-atlas-data の uniquePairs(257件)と突き合わせて行う。
#
# JP名・アイコン・図鑑番号は、これまで通り自サイトの palworld_dex_data.json
# (GameWithベースで実在確認済み、複数セッションかけて精査済み)を正とする。
# palcalc側の内部PalDexNoは独自採番で自サイトの図鑑番号と一致しないため、
# パルの同定は英語内部名(InternalName)でのみ行う。
# ══════════════════════════════════════════════════════════════

PALCALC_DB_URL = "https://raw.githubusercontent.com/tylercamp/palcalc/master/PalCalc.Model/db.json"
PALCALC_BREEDING_URL = "https://raw.githubusercontent.com/tylercamp/palcalc/master/PalCalc.Model/breeding.json"
AWY64_BREEDING_URL = "https://raw.githubusercontent.com/Awy64/palworld-atlas-data/main/published/v1/builds/24181105/breeding.json"

DEX_PATH = "palworld_dex_data.json"
OUTPUT_PATH = "palworld_breeding_data.json"
JS_OUTPUT_PATH = "game_data/breeding_data.js"

# palworld_dex_data.json(287体+コラボ11体=298体)には載っていないが、
# paldb.cc/ja/<en_name> を直接確認してJP名を検証済みのパル(未実装・入手不可の
# ゴーストデータ)。palcalc側にも存在しないため、配合対象からは自然に除外される。
# 参考として名前だけは残す(他ページのEXTRA_JP_NAMESと同じ辞書)。
EXTRA_JP_NAMES = {
    "BlackFurDragon": "ドラゴストロフェ",
    "ElecLion": "エレクライオン",
    "WorldTreeDragon": "ゼロヴァース",
}


def fetch_json(url):
    with urllib.request.urlopen(url, timeout=30) as resp:
        return json.load(resp)


def build_jp_index(dex):
    idx = {}
    for p in dex:
        if p.get("en_name"):
            idx[p["en_name"].strip().lower()] = p
    return idx


def match_asset_to_jp(en_name, jp_idx):
    key = en_name.strip().lower()
    if key in jp_idx:
        return jp_idx[key], "exact"
    if " " in en_name:
        variant_key = en_name.strip().lower().replace(" ", "_")
        if variant_key in jp_idx:
            return jp_idx[variant_key], "variant_fallback"
    if "_" in en_name:
        base = en_name.rsplit("_", 1)[0].strip().lower()
        if base in jp_idx:
            return jp_idx[base], "variant_fallback"
    return None, "missing"


def pair_key(a, b):
    return "|".join(sorted([a, b]))


def build_pals(palcalc_pals, jp_idx):
    pals = {}
    matched = 0
    unmatched = []
    for p in palcalc_pals:
        asset = p["InternalName"]
        en_name = p["Name"]
        jp, status = match_asset_to_jp(en_name, jp_idx)
        if jp:
            matched += 1
            pals[asset] = {
                "jp_name": jp["name"],
                "en_name": en_name,
                "icon": jp.get("icon"),
                "dex_id": jp.get("id"),
                "combi_rank": p.get("BreedingPower"),
                "match_status": status,
            }
        else:
            # 自サイトの図鑑(298体)に無いパル。全パル対応は別タスクとして、
            # 配合データからは(旧仕様同様)対象外のまま記録だけ残す。
            unmatched.append(asset)
            pals[asset] = {
                "jp_name": None,
                "en_name": en_name,
                "icon": None,
                "dex_id": None,
                "combi_rank": p.get("BreedingPower"),
                "match_status": "missing",
            }
    return pals, matched, unmatched


def build_forward_and_reverse(palcalc_breeding, awy64_unique_pairs, known_assets):
    # WILDCARD(性別無関係)の組み合わせのみを正式採用する。
    # 性別依存で結果が変わるペアは44,850組中1組(CatMage/FoxMage)のみと確認済みで、
    # 片方を無言で選ぶと捏造になるため、意図的に除外する。
    gendered_only_pairs = set()
    wildcard_forward = {}
    for e in palcalc_breeding["Breeding"]:
        p1, p2, child = e["Parent1InternalName"], e["Parent2InternalName"], e["ChildInternalName"]
        key = pair_key(p1, p2)
        if e["Parent1Gender"] == "WILDCARD" and e["Parent2Gender"] == "WILDCARD":
            wildcard_forward[key] = child
        else:
            gendered_only_pairs.add(key)
    gendered_only_pairs -= set(wildcard_forward.keys())

    forward = {}
    skipped_unknown = 0
    for key, child in wildcard_forward.items():
        a, b = key.split("|")
        if a not in known_assets or b not in known_assets or child not in known_assets:
            skipped_unknown += 1
            continue
        forward[key] = child

    unique_pair_keys = set()
    for uc in awy64_unique_pairs:
        k = pair_key(uc["parentAId"], uc["parentBId"])
        if forward.get(k) == uc["childId"]:
            unique_pair_keys.add(k)

    reverse = {}
    for key, child in forward.items():
        a, b = key.split("|")
        bucket = "unique" if key in unique_pair_keys else "formula"
        reverse.setdefault(child, {"unique": [], "formula": []})
        reverse[child][bucket].append([a, b])

    return forward, reverse, len(gendered_only_pairs), skipped_unknown


def main():
    print("palcalc db.json 取得中...")
    palcalc_db = fetch_json(PALCALC_DB_URL)
    print("palcalc breeding.json 取得中...")
    palcalc_breeding = fetch_json(PALCALC_BREEDING_URL)
    print("Awy64 breeding.json(固定レシピ判定用)取得中...")
    awy64_breeding = fetch_json(AWY64_BREEDING_URL)

    dex = json.load(open(DEX_PATH, encoding="utf-8"))
    jp_idx = build_jp_index(dex)

    pals, matched, unmatched = build_pals(palcalc_db["Pals"], jp_idx)
    known_assets = {a for a, info in pals.items() if info["dex_id"] is not None}

    forward, reverse, gendered_skipped, skipped_unknown = build_forward_and_reverse(
        palcalc_breeding, awy64_breeding["uniquePairs"], known_assets
    )

    out = {"pals": pals, "forwardPairs": forward, "reverseParents": reverse}
    json.dump(out, open(OUTPUT_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    print(f"palcalc総パル数: {len(palcalc_db['Pals'])}")
    print(f"自サイト図鑑とJP名一致: {matched} ({matched/len(palcalc_db['Pals'])*100:.1f}%)")
    print(f"未一致(自サイト図鑑に未収録): {len(unmatched)}件 {unmatched}")
    print(f"forwardPairs件数: {len(forward)}")
    print(f"reverseParents件数(配合ルートが判明している子の数): {len(reverse)}")
    print(f"性別依存のため除外したペア数: {gendered_skipped}")
    print(f"未収録パル絡みで除外したペア数: {skipped_unknown}")
    print(f"{OUTPUT_PATH} written")

    write_js_consts(JS_OUTPUT_PATH, [("BREEDING_DATA", out)])
    print(f"{JS_OUTPUT_PATH} written(palworld_breeding.html・palworld_palbox.html共有)")


if __name__ == "__main__":
    main()
