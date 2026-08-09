#!/usr/bin/env python3
"""作業適性を、ゲームの生データ(データマイン)から作り直す。

■ なぜ要るのか(2026-08-09)

palworld_pals_clean.json の work_suitability は **GameWith からスクレイプした値**
(各パルの detail_url が gamewith.jp を指している)。この値がゲームの実データと
食い違っていた。287体中137体、295項目が**すべて実際より低い**方向にずれていた。

  例) ユキカゲ   サイト 手作業2 / 冷却3
                実際   手作業4 / 冷却4   ← paldb.cc とデータマインが一致
      マスクロウ サイト 伐採1
                実際   伐採2 / 牧場1     ← 役職ごと抜けていた

拠点プランナーはこの値で「287体の中から最適な組み合わせ」を計算しているので、
**入力が間違っている＝出す答えが間違っている**。しかも低い方向なので、
本当は優秀なパルが候補から落ちていた。

■ 直し方

game_data/characters.json(データマイン)の work_suitabilities を正とし、
palworld_pals_clean.json を書き換える。照合は
palworld_name_jp_en_map.json の icon(アセット名)で行う。
名前は表記ゆれがあるが、アセット名は一意なので確実。

このスクリプトを流したあと、必ず両方を再生成すること:
  python3 scripts/build_dex_data.py
  python3 scripts/build_pal_data.py

使い方:
  python3 scripts/fix_work_suitability.py            # 差分を表示するだけ
  python3 scripts/fix_work_suitability.py --write    # 実際に書き換える
"""
import argparse, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CLEAN = ROOT / "palworld_pals_clean.json"
NAMEMAP = ROOT / "palworld_name_jp_en_map.json"
CHARS = ROOT / "game_data/characters.json"

# データマインの英語キー → サイトで使っている日本語の役職名
JP = {
    "EmitFlame": "火おこし", "Watering": "水やり", "Seeding": "種まき",
    "GenerateElectricity": "発電", "Handcraft": "手作業", "Collection": "採集",
    "Deforest": "伐採", "Mining": "採掘", "Transport": "運搬",
    "MonsterFarm": "牧場", "ProductMedicine": "製薬", "Cool": "冷却",
    # OilExtraction(石油抽出)は実際のパルには付いていないため入れない
}
ORDER = ["火おこし", "水やり", "種まき", "発電", "手作業", "採集",
         "伐採", "採掘", "製薬", "冷却", "運搬", "牧場"]


def asset_of(icon: str) -> str:
    return icon.split("/")[-1].replace("T_", "").replace("_icon_normal.webp", "")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="実際に書き換える")
    a = ap.parse_args()

    clean = json.load(open(CLEAN, encoding="utf-8"))
    namemap = {e["name"]: asset_of(e["icon"]) for e in json.load(open(NAMEMAP, encoding="utf-8"))}

    # アセット名は生データ側で大文字小文字が揺れている
    # (CowPal / Cowpal、Kirin_Ice / Kirin_ice、SwordCutlassfish / SwordCutlassFish …)。
    # 小文字に潰して引く。BOSS_/GYM_/PREDATOR_ は別個体なので除外する。
    raw = {}
    for p in json.load(open(CHARS, encoding="utf-8"))["pals"]:
        asset_name = p["asset"]
        if asset_name.upper().startswith(("BOSS_", "GYM_", "PREDATOR_", "RAID_")):
            continue
        raw.setdefault(asset_name.lower(), p.get("work_suitabilities") or {})

    changed, unmatched, same = [], [], 0
    for p in clean:
        asset = namemap.get(p["name"])
        src = raw.get(asset.lower()) if asset else None
        if src is None:
            unmatched.append(p["name"]); continue

        correct = {k: 0 for k in ORDER}
        for en, lv in src.items():
            if en in JP and lv:
                correct[JP[en]] = lv

        old = {k: p["work_suitability"].get(k, 0) for k in ORDER}
        if old == correct:
            same += 1
        else:
            changed.append((p["name"],
                            {k: v for k, v in old.items() if v},
                            {k: v for k, v in correct.items() if v}))
            if a.write:
                p["work_suitability"] = correct

    print(f"一致 {same} / 修正 {len(changed)} / 照合できず {len(unmatched)}")
    if unmatched:
        print("  照合できなかったパル:", unmatched[:10])

    up = down = added = removed = 0
    for _, o, n in changed:
        for k in set(o) | set(n):
            a1, b1 = o.get(k, 0), n.get(k, 0)
            if k not in o: added += 1
            elif k not in n: removed += 1
            elif b1 > a1: up += 1
            elif b1 < a1: down += 1
    print(f"  引き上げ {up} / 引き下げ {down} / 役職の追加 {added} / 削除 {removed}")

    for n, o, c in changed[:8]:
        print(f"  {n}\n    旧: {o}\n    新: {c}")

    if a.write:
        json.dump(clean, open(CLEAN, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print(f"\n{CLEAN.name} を書き換えた。次を必ず実行すること:")
        print("  python3 scripts/build_dex_data.py")
        print("  python3 scripts/build_pal_data.py")
    else:
        print("\n(表示しただけ。書き換えるには --write)")


if __name__ == "__main__":
    main()
