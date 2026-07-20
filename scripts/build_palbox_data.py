import json
import os

from js_data_writer import write_js_consts

# DEX_PATH/BREEDING_PATHはこのスクリプト自体の出力ではなく、学習ルート(習得技)を
# 図鑑収録種族だけに絞り込むための入力データとして読むのみ(PAL_BOX_DATA/BREEDING_DATA
# 自体はbuild_dex_data.py・build_collab_pals.py・build_breeding_data.pyがgame_data/内の
# 専用JSファイルとして書き出し、palworld_palbox.htmlはそれらを<script src>で共有する)。
DEX_PATH = "palworld_dex_data.json"
BREEDING_PATH = "palworld_breeding_data.json"
LEARNSET_PATH = "game_data/pals_learnset.json"
SKILLS_PATH = "game_data/skills.json"
SKILL_DETAILS_PATH = "game_data/skill_details_raw.json"
PASSIVES_PATH = "palworld_passives_merged.json"
SKILLS_JP_PATH = "game_data/skills_jp.json"
ELEMENT_EN_TO_JP = {"Fire": "炎", "Water": "水", "Electricity": "雷", "Earth": "地", "Leaf": "草", "Ice": "氷", "Dragon": "竜", "Dark": "闇", "Normal": "無"}
JS_OUTPUT_PATH = "game_data/learnset_data.js"
PASSIVES_JS_OUTPUT_PATH = "game_data/passives_data.js"
SKILLS_JP_JS_OUTPUT_PATH = "game_data/skills_jp_data.js"


def build_skills_raw_lookup():
    if not os.path.exists(SKILLS_PATH):
        return {}
    return {s["asset"]: s for s in json.load(open(SKILLS_PATH, encoding="utf-8"))["skills"]}


def build_skill_details_lookup():
    # paldb.cc /ja/Active_Skills の一括スクレイピング結果(scripts/scrape_skill_details.py)。
    # 技1つにつき威力・冷却時間・属性・効果文はパルに依らず共通なので、パルごとではなく
    # 技(WazaID)ごとに1件のみ保持する軽量な参照テーブルとして別途読み込む。
    if not os.path.exists(SKILL_DETAILS_PATH):
        return {}
    return json.load(open(SKILL_DETAILS_PATH, encoding="utf-8"))


def build_learnset_data(dex, breeding, skills_jp, skill_details, skills_raw):
    # dex(図鑑)に載っている種族だけに絞り込み、WazaID(EPalWazaID::接頭辞)を
    # skills_jp.json用のasset形式(接頭辞無し)に正規化する。
    # 威力・冷却時間・属性は game_data/skills.json(実ゲームデータダンプ、数値型で正確)を
    # 正として使い、paldb.ccスクレイピング分(skill_details)は日本語の効果文(英語しか
    # 無いskills.jsonでは補えない)のためだけに使う(2026-07-20、両ソースの役割分担を整理)。
    dex_ids = {p["id"] for p in dex}
    assets = {a for a, info in breeding["pals"].items() if info.get("dex_id") in dex_ids}
    raw = json.load(open(LEARNSET_PATH, encoding="utf-8"))["learnset"]
    out = {}
    for asset in assets:
        entries = raw.get(asset)
        if not entries:
            continue
        seen = set()
        cleaned = []
        for e in entries:
            waza_asset = e["WazaID"].replace("EPalWazaID::", "")
            if waza_asset in seen:
                continue
            seen.add(waza_asset)
            jp = skills_jp.get(waza_asset) if skills_jp else None
            detail = skill_details.get(waza_asset)
            skill = skills_raw.get(waza_asset)
            cleaned.append({
                "asset": waza_asset,
                "source": e["source"],
                "level": e.get("level"),
                "jp_name": jp["jp_name"] if jp else (detail["jp_name"] if detail else None),
                "power": skill["power"] if skill else (detail["power"] if detail else None),
                "cooltime": skill["cooldown"] if skill else (detail["cooltime"] if detail else None),
                "element": ELEMENT_EN_TO_JP.get(skill["element"]) if skill else (detail["element"] if detail else None),
                "effect_jp": detail["effect_jp"] if detail else None,
            })
        out[asset] = cleaned
    return out


def build_passives_data():
    merged = json.load(open(PASSIVES_PATH, encoding="utf-8"))
    return [
        {
            "name": p["name"],
            "asset": p["asset"],
            "rank": p["rank"],
            "effect_text_jp": p["effect_text_jp"],
        }
        for p in merged
    ]


def build_skills_jp_lookup():
    # まだbuild_skills_jp.pyが実行されていない場合は空のまま(技名は英語表示に
    # フォールバックする)。存在すればasset -> {jp_name, match_status}の辞書。
    if not os.path.exists(SKILLS_JP_PATH):
        return {}
    data = json.load(open(SKILLS_JP_PATH, encoding="utf-8"))
    return data.get("active_skills", {})


def main():
    dex = json.load(open(DEX_PATH, encoding="utf-8"))
    breeding = json.load(open(BREEDING_PATH, encoding="utf-8"))
    skills_jp = build_skills_jp_lookup()
    skill_details = build_skill_details_lookup()
    skills_raw = build_skills_raw_lookup()
    learnset = build_learnset_data(dex, breeding, skills_jp, skill_details, skills_raw)
    passives = build_passives_data()

    write_js_consts(JS_OUTPUT_PATH, [("LEARNSET_DATA", learnset)])
    write_js_consts(PASSIVES_JS_OUTPUT_PATH, [("PASSIVES_DATA", passives)])
    write_js_consts(SKILLS_JP_JS_OUTPUT_PATH, [("SKILLS_JP_DATA", skills_jp)])
    print(
        f"LEARNSET_DATA: {len(learnset)}種族、PASSIVES_DATA: {len(passives)}件、"
        f"SKILLS_JP_DATA: {len(skills_jp)}件を書き出しました"
    )
    if not skills_jp:
        print("  (注意: game_data/skills_jp.json が未生成のため技名は英語のままです。"
              "build_skills_jp.py 実行後に再度このスクリプトを実行してください)")


if __name__ == "__main__":
    main()
