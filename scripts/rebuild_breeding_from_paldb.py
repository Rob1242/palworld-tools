import json, re

from js_data_writer import write_js_consts

RAW_PATH = "game_data/breeding_raw/paldb_pal_pages_0_386.json"
OLD_PATH = "game_data/breedingdata.json"
DEX_PATH = "palworld_dex_data.json"
OUT_PATH = "game_data/breedingdata_v2.json"
JS_OUTPUT_PATH = "game_data/breeding_data.js"
JSON_OUTPUT_PATH = "palworld_breeding_data.json"

# 2026-07-19、Ver1.0(2026-07-10)リリース後の配合ランク大幅見直しにより
# 旧データ(2026-07-11生成、リリース翌日でコミュニティ側のデータもまだ追いついて
# いなかった)で298体中87体が配合データテーブルに一切載っていない欠落を発見。
# paldb.ccを直接スクレイピングして配合ランク(CombiRank)とレア度違い個体の
# 固定レシピ(Unique Combo)を再取得し、これを正として再構築する。
#
# タイブレークルール(同点時にどちらが選ばれるか)は、二次情報源(「内部インデックスが
# 若い方」という説明)を鵜呑みにせず、実際にpaldb.ccのBreedingカリキュレーターを
# ブラウザで操作して検証した:
#   - シェルガドラ(30) + アヌビス(480) → 目標255、780/790ではなく250/260のケースで検証、
#     実際は250側(エレメンタル変異個体)が候補プールから除外されるため実質タイなし
#   - シェルガドラ(30) + ブルフェルノ(2320) → 目標1175、Gildra(1170)とWistella(1180)の
#     同着 → 実際の結果はWistella(1180、高い方)
#   - シェルガドラ(30) + ウラミィ(1540) → 目標785、Splatterina(780)とTetroise(790)の
#     同着 → 実際の結果はTetroise(790、高い方)
#   2件とも「高い方が勝つ」で一致したため、これを正式なタイブレークルールとして採用する。
VARIANT_SUFFIX_RE = re.compile(r'[ _](Cryst|Noct|Ignis|Aqua|Lux|Terra|Gild|Ryu|Libero|Botan|Primo)$')
EXCLUDE_ASSET_PREFIXES = ("YakushimaMonster", "YakushimaBoss")  # Terrariaコラボパル、通常配合の対象外

# 図鑑データに未収録(Ver1.0世界樹エリアの新パル等)だがpaldb.ccで日本語名を実在確認済みのもの。
# build_breeding_data.pyのEXTRA_JP_NAMESを踏襲。
EXTRA_JP_NAMES = {
    "WorldTreeDragon": "ゼロヴァース",
}


def pair_key(a, b):
    return "|".join(sorted([a, b]))


def build_jp_index(dex):
    idx = {}
    for p in dex:
        if p.get("en_name"):
            idx[p["en_name"].strip().lower()] = p
    return idx


def main():
    raw = json.load(open(RAW_PATH, encoding="utf-8"))
    old = json.load(open(OLD_PATH, encoding="utf-8"))
    dex = json.load(open(DEX_PATH, encoding="utf-8"))
    jp_idx = build_jp_index(dex)

    # Unique Comboのリンク先(href)はpaldb.ccの表示用スラッグであり、真のゲーム内アセット名
    # とは限らない(例: Katressの真のアセットは"CatMage"だが、hrefは表示スラッグ"Katress"に
    # なっていた。2026-07-19発見。このズレを放置すると固定レシピの親子データが全部ズレる)。
    # 同じ生データ内の"slug"→"asset"対応表を使って、Unique Combo内のリンク先を必ず
    # 真のアセット名に変換してから使う。
    slug_to_asset = {}
    for v in raw.values():
        if v.get("slug") and v.get("asset"):
            slug_to_asset.setdefault(v["slug"], v["asset"])

    def resolve_asset(slug_or_asset):
        return slug_to_asset.get(slug_or_asset, slug_or_asset)

    for v in raw.values():
        uc = v.get("unique_combo")
        if not uc:
            continue
        for key in ("parent_a", "parent_b", "child"):
            uc[key]["asset"] = resolve_asset(uc[key]["asset"])

    # ---- 1. asset単位に集約(名前の空白/アンダースコア違いで同じassetが重複取得されている) ----
    by_asset = {}
    for name, v in raw.items():
        asset = v.get("asset")
        if not asset or not v.get("combi_rank"):
            continue
        if asset not in by_asset:
            by_asset[asset] = {
                "asset": asset,
                "en_name": name.strip(),
                "combi_rank": int(v["combi_rank"]),
                "male_probability": v.get("male_probability"),
                "unique_combo": v.get("unique_combo"),
            }

    # ---- 2. jp_name/dex_idの突き合わせ(既存のbuild_breeding_data.pyと同じロジック) ----
    pals = {}
    for asset, info in by_asset.items():
        key = info["en_name"].strip().lower()
        jp = jp_idx.get(key)
        if not jp and " " in key:
            jp = jp_idx.get(key.replace(" ", "_"))
        if not jp and "_" in key:
            jp = jp_idx.get(key.rsplit("_", 1)[0])
        jp_name = jp["name"] if jp else EXTRA_JP_NAMES.get(asset)
        pals[asset] = {
            "jp_name": jp_name,
            "en_name": (jp["en_name"] if jp else info["en_name"]),
            "icon": (jp.get("icon") if jp else f"game_data/icons/pals/T_{asset}_icon_normal.webp"),
            "dex_id": jp.get("id") if jp else None,
            "combi_rank": info["combi_rank"],
            "male_probability": info["male_probability"],
            "is_variant": bool(VARIANT_SUFFIX_RE.search(info["en_name"])),
        }

    # old pal_info側にしか無い情報(EXTRA_JP_NAMES由来のDragostrophe/Boltmane等)を補完
    for asset, info in old["pal_info"].items():
        if asset not in pals:
            pals[asset] = {
                "jp_name": info.get("jp_name"),
                "en_name": info.get("en_name") or info.get("name"),
                "icon": info.get("icon"),
                "dex_id": info.get("dex_id"),
                "combi_rank": info.get("combi_rank"),
                "male_probability": None,
                "is_variant": False,
                "legacy_only": True,
            }

    # ---- 3. 配合ランクの一般プール(通常配合の対象。エレメンタル変異個体・コラボパル・
    #      プレースホルダー(rank 9999)は除外。理由: 実データ検証で変異個体はランク平均の
    #      対象候補にならず、固定レシピ経由でのみ生まれることを確認したため) ----
    pool = []
    for asset, p in pals.items():
        if p.get("is_variant"):
            continue
        if p.get("legacy_only"):
            continue
        if any(asset.startswith(pre) for pre in EXCLUDE_ASSET_PREFIXES):
            continue
        rank = p.get("combi_rank")
        if rank is None or rank == 9999:
            continue
        pool.append((asset, rank))
    pool.sort(key=lambda x: x[1])
    pool_ranks = [r for _, r in pool]

    def nearest_in_pool(target):
        # 二分探索: target以上で最初の位置と、その直前の位置の2候補を比較
        import bisect
        idx = bisect.bisect_left(pool_ranks, target)
        candidates = []
        if idx < len(pool):
            candidates.append(pool[idx])
        if idx > 0:
            candidates.append(pool[idx - 1])
        if not candidates:
            return None
        min_dist = min(abs(target - r) for _, r in candidates)
        tied = [(a, r) for a, r in candidates if abs(target - r) == min_dist]
        # タイブレーク: 実機検証により「ランクが高い方」が優先される
        tied.sort(key=lambda x: -x[1])
        return tied[0][0]

    # ---- 4. 通常配合(ランク平均)の全ペアを計算 ----
    forward = {}
    n = len(pool)
    for i in range(n):
        a_asset, a_rank = pool[i]
        for j in range(i + 1, n):
            b_asset, b_rank = pool[j]
            target = (a_rank + b_rank + 1) // 2
            child = nearest_in_pool(target)
            if child:
                forward[pair_key(a_asset, b_asset)] = child

    # ---- 5. 固定レシピ(Unique Combo)で上書き。新規スクレイピング分を優先。 ----
    unique_pairs = set()
    special_gendered = []  # 性別で結果が変わるペア(現状Katress×Wixenのみ確認)
    for asset, info in by_asset.items():
        uc = info.get("unique_combo")
        if not uc:
            continue
        pa, pb, ch = uc["parent_a"]["asset"], uc["parent_b"]["asset"], uc["child"]["asset"]
        k = pair_key(pa, pb)
        if pa == pb:
            # 同種のみで生まれる(伝説パル等): 通常のforwardには乗らないので専用キーで保持
            forward[f"{pa}|{pa}"] = ch
            unique_pairs.add(f"{pa}|{pa}")
            continue
        if uc["parent_a"].get("gender") or uc["parent_b"].get("gender"):
            special_gendered.append(uc)
            continue  # 性別依存ペアはforwardPairsに単純上書きせず、専用データで別管理
        forward[k] = ch
        unique_pairs.add(k)

    # 性別依存の特殊ケース(Katress×Wixen)は、両方向の結果をひとまとめにして専用フィールドへ
    gendered_pairs = {}
    for uc in special_gendered:
        pa, pb, ch = uc["parent_a"]["asset"], uc["parent_b"]["asset"], uc["child"]["asset"]
        k = pair_key(pa, pb)
        gendered_pairs.setdefault(k, []).append({
            "parent_a": pa, "parent_a_gender": uc["parent_a"]["gender"],
            "parent_b": pb, "parent_b_gender": uc["parent_b"]["gender"],
            "child": ch,
        })
        # forwardPairsにも「代表値」として一方を登録しておく(既存UIが単純文字列lookupのため)
        # ただし優先度は低く保ち、専用UIができるまでの暫定措置とする
        forward.setdefault(k, ch)
        unique_pairs.add(k)

    # ---- 6. 旧データの2件(Dragostrophe/Boltmane、paldb.cc未収録の特殊パル)を維持 ----
    old_name_of_asset = {a: i.get("name") for a, i in old["pal_info"].items()}
    legacy_keep_assets = {"BlackFurDragon", "ElecLion"}
    for uc in old["unique_combos"]:
        if uc["child"] in legacy_keep_assets or uc["parent_a"] in legacy_keep_assets or uc["parent_b"] in legacy_keep_assets:
            k = pair_key(uc["parent_a"], uc["parent_b"])
            forward[k] = uc["child"]
            unique_pairs.add(k)

    # ---- 7. ignore_combi専用の全partnerテーブルは、今回の調査で欠落や誤りの証拠が
    #      見つからなかったため、旧データをそのまま引き継ぐ(43パル分、299partner分)。
    #      優先度は固定レシピと同等の最上位。 ----
    for special_parent, combos in old["parent_to_children_formula"].items():
        for c in combos:
            k = pair_key(special_parent, c["partner"])
            forward[k] = c["child"]
            unique_pairs.add(k)

    # ---- 8. reverse(子→親候補)の構築 ----
    reverse = {}
    for key, child in forward.items():
        a, b = key.split("|")
        bucket = "unique" if key in unique_pairs else "formula"
        reverse.setdefault(child, {"unique": [], "formula": []})
        reverse[child][bucket].append([a, b])

    out = {
        "pals": pals,
        "forwardPairs": forward,
        "reverseParents": reverse,
        "genderedPairs": gendered_pairs,
        "poolSize": len(pool),
    }
    json.dump(out, open(OUT_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"pals: {len(pals)}")
    print(f"generic pool size: {len(pool)}")
    print(f"forwardPairs: {len(forward)}")
    print(f"unique/fixed pairs: {len(unique_pairs)}")
    print(f"gendered special pairs: {len(gendered_pairs)}")
    print(f"{OUT_PATH} written")

    # 実際にpalworld_breeding.html / palworld_palbox.htmlが読み込む本番ファイル
    site_out = {"pals": pals, "forwardPairs": forward, "reverseParents": reverse}
    json.dump(site_out, open(JSON_OUTPUT_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    write_js_consts(JS_OUTPUT_PATH, [("BREEDING_DATA", site_out)])
    print(f"{JSON_OUTPUT_PATH} / {JS_OUTPUT_PATH} 書き出し完了(本番反映用)")


if __name__ == "__main__":
    main()
