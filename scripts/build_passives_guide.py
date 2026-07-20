import json

from js_data_writer import write_js_consts

# 既存のpassives_data.js(115件、rank+効果文)を、効果文のキーワードから
# 戦闘用/拠点用/騎乗用に分類し直した「おすすめパッシブ早見表」を作る。
# 特定のパルに対する個別の組み合わせ提案(gamewith.jp等の編集記事の見解)は
# 転載になり得るため避け、あくまで効果テキスト(事実データ)からの機械的分類のみを行う。
PASSIVES_PATH = "game_data/passives_data.js"
OUT_PATH = "game_data/passives_guide_data.js"

CATEGORY_KEYWORDS = {
    "combat": ["攻撃", "防御", "ダメージ", "ひるみ", "吹き飛び", "クリティカル", "HP", "クールタイム"],
    "base": ["作業速度", "満腹度", "孵化", "タマゴ生成", "SAN値", "所持重量", "牧場", "効率増加", "取引価格", "眠らず"],
    "mount": ["移動速度", "スタミナ", "ジャンプ回数"],
}


def load_const(path):
    content = open(path, encoding="utf-8").read()
    return json.loads(content.split("=", 1)[1].strip().rstrip(";"))


def categorize(effect_text):
    cats = set()
    for cat, keywords in CATEGORY_KEYWORDS.items():
        if any(k in effect_text for k in keywords):
            cats.add(cat)
    return cats


def main():
    passives = load_const(PASSIVES_PATH)
    out = {"combat": [], "base": [], "mount": []}
    for p in passives:
        cats = categorize(p["effect_text_jp"])
        for cat in cats:
            out[cat].append({"name": p["name"], "rank": p["rank"], "effect": p["effect_text_jp"]})
    for cat in out:
        out[cat].sort(key=lambda p: -p["rank"])

    write_js_consts(OUT_PATH, [("PASSIVES_GUIDE_DATA", out)])
    print(f"combat:{len(out['combat'])} base:{len(out['base'])} mount:{len(out['mount'])} -> {OUT_PATH}")


if __name__ == "__main__":
    main()
