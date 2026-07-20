import json, re

from js_data_writer import write_js_consts

# paldb.ccの本島マップ用JSデータ(https://paldb.cc/js/map_data_ja.js、extrasIngame変数)には
# type="Home"のコミュニティ推奨拠点候補地12件が、資源・地形に関するコメント付きで
# 収録されている。
#
# 注意: このipos.X/Yは、curated_landmarks(2026-07-20実測)で使ったfixedDungeon側の
# 生ワールド座標(pos.X/Y、10万〜100万オーダー)とは全く別のスケール(-1331〜571程度)。
# 「Cave Entrance」の一部はfixedDungeon側と同一パルのボスとして突合できたため試しに
# アフィン変換を最小二乗フィットしたが、6点で正規化座標(0〜1)換算の残差が最大7%と大きく、
# 信頼できる変換式を導出できなかった。そのため座標は正規化せず、ipos.X/Yをそのまま
# 「参考座標」として表示する(マップ上へのピン配置はしない、2026-07-20)。
SRC_PATH = "/tmp/map_data_ja.js"
OUT_PATH = "game_data/base_spots_data.js"

# 英語コメントは短い定型句のみのため、items_dex_data.jsのname_en/name_jp対応で
# 確認できた単語だけを対訳表として直訳する(未知の語は翻訳せず原文のまま残す)。
TRANSLATIONS = {
    "Early Ore mine base": "序盤の金属鉱石採掘向き拠点",
    "Flat ground fro triple Base": "3拠点分の広さがある平地(fro=forの誤記と思われる原文ママ)",
    "Crude Oil x3": "原油の採取ポイントが3箇所近い",
    "Hexolite Quartz x2, Crude Oil x1": "ヘクソクォーツの採取ポイントが2箇所・原油が1箇所近い",
    "Hexolite Quartz x3, Crude Oil x1": "ヘクソクォーツの採取ポイントが3箇所・原油が1箇所近い",
    "Flat Ground": "平地",
    "Flower Ground": "花畑",
    "Flat Ground in circle and light, no raid": "円形の明るい平地、拠点襲撃(レイド)が発生しにくいとされる",
    "6 Coal and and 8 Ore, no raid": "石炭6箇所・金属鉱石8箇所が近い、拠点襲撃(レイド)が発生しにくいとされる",
    "Flat ground for triple Base": "3拠点分の広さがある平地",
}

def extract_array(content, var_name):
    idx = content.index(f"var {var_name}")
    start = content.index("[", idx)
    depth = 0
    for i in range(start, len(content)):
        if content[i] == "[":
            depth += 1
        elif content[i] == "]":
            depth -= 1
            if depth == 0:
                return json.loads(content[start:i + 1])
    raise ValueError(f"{var_name}: unbalanced brackets")


def main():
    content = open(SRC_PATH, encoding="utf-8").read()
    entries = extract_array(content, "extrasIngame")
    homes = [e for e in entries if e.get("type") == "Home"]

    out = []
    unknown_comments = []
    for h in homes:
        raw_x, raw_y = h["ipos"]["X"], h["ipos"]["Y"]
        comment_en = h.get("comment")
        comment_jp = TRANSLATIONS.get(comment_en) if comment_en else None
        if comment_en and comment_jp is None:
            unknown_comments.append(comment_en)
        out.append({
            "x": raw_x, "y": raw_y,
            "comment_en": comment_en,
            "comment_jp": comment_jp,
        })

    write_js_consts(OUT_PATH, [("BASE_SPOTS_DATA", out)])
    print(f"{len(out)}件 -> {OUT_PATH} (未対訳コメント: {unknown_comments})")


if __name__ == "__main__":
    main()
