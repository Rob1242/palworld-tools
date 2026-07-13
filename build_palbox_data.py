import json
import os
import re

DEX_PATH = "palworld_dex_data.json"
BREEDING_PATH = "palworld_breeding_data.json"
LEARNSET_PATH = "game_data/pals_learnset.json"
PASSIVES_PATH = "palworld_passives_merged.json"
SKILLS_JP_PATH = "game_data/skills_jp.json"
HTML_PATH = "palworld_palbox.html"


def inject_const(html, const_name, data):
    # 各定数は1行に丸ごと注入されるため、プレースホルダ(= {}; / = [];)だけでなく
    # 既に注入済みの行(再実行時)も同じ1行パターンとして一括で置き換えられる。
    serialized = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    pattern = re.compile(r"^const " + re.escape(const_name) + r" = .*$", re.MULTILINE)
    if not pattern.search(html):
        raise ValueError(f"{HTML_PATH} に `const {const_name} = ...;` の行が見つかりません")
    return pattern.sub(lambda m: f"const {const_name} = {serialized};", html, count=1)


def build_learnset_data(dex, breeding, skills_jp):
    # dex(図鑑)に載っている種族だけに絞り込み、WazaID(EPalWazaID::接頭辞)を
    # skills_jp.json用のasset形式(接頭辞無し)に正規化する。
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
            cleaned.append({
                "asset": waza_asset,
                "source": e["source"],
                "level": e.get("level"),
                "jp_name": jp["jp_name"] if jp else None,
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
    if not os.path.exists(HTML_PATH):
        print(f"{HTML_PATH} がまだ存在しません。先にTask 3 Step 2でファイルを作成してください。")
        return
    dex = json.load(open(DEX_PATH, encoding="utf-8"))
    breeding = json.load(open(BREEDING_PATH, encoding="utf-8"))
    skills_jp = build_skills_jp_lookup()
    learnset = build_learnset_data(dex, breeding, skills_jp)
    passives = build_passives_data()

    html = open(HTML_PATH, encoding="utf-8").read()
    html = inject_const(html, "PAL_BOX_DATA", dex)
    html = inject_const(html, "BREEDING_DATA", breeding)
    html = inject_const(html, "LEARNSET_DATA", learnset)
    html = inject_const(html, "PASSIVES_DATA", passives)
    html = inject_const(html, "SKILLS_JP_DATA", skills_jp)
    open(HTML_PATH, "w", encoding="utf-8").write(html)
    print(
        f"PAL_BOX_DATA: {len(dex)}件、BREEDING_DATA: {len(breeding['pals'])}パル、"
        f"LEARNSET_DATA: {len(learnset)}種族、PASSIVES_DATA: {len(passives)}件、"
        f"SKILLS_JP_DATA: {len(skills_jp)}件を{HTML_PATH}に注入しました"
    )
    if not skills_jp:
        print("  (注意: game_data/skills_jp.json が未生成のため技名は英語のままです。"
              "build_skills_jp.py 実行後に再度このスクリプトを実行してください)")


if __name__ == "__main__":
    main()
