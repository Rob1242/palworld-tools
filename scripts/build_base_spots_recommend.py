"""
おすすめ拠点(コミュニティ推奨拠点候補地)データを生成する。

2026-07-28、颯太から「ネット上に大量に出回ってる拠点おすすめ情報を自分の
サイトに収束させたい」と依頼を受け、GameWith/Game8/Palworld Companion/
paldb.cc(既存データ)から座標付きの拠点情報を調査・統合した。

座標の出典は全て「ゲーム内座標表示(プレイヤーがマップキーで確認できるX/Y)」。
この座標系は Nifrendil/pal-atlas(coords.ts)が公開している正式な変換定数
(translX=123930, translY=157935, scale=459)と、うちの`build_spawn_data.py`の
`world_to_map()`が使う定数が完全一致することを確認済み。

実測で確認した変換規則: ゲーム内座標(paldex_x, paldex_y)は
`map_x = paldex_x, map_y = -paldex_y` として`build_spawn_data.py`と同じ
`map_to_normalized()`に通せば、実際の地形と一致する正規化座標(0〜1)が得られる
(タワーボス実データやパル像データとの地形照合、天陽郷エリアの地形照合で検証済み)。

旧`game_data/base_spots_data.js`(paldb.cc ipos由来、12件)の座標も同じ規則で
正しく変換できることが分かったため、このスクリプトで統合し置き換える。
ipos由来の12件のうち7件は新規収集した座標付き情報と同一地点(誤差0.3%未満)
だったため統合、5件は新規リストに無いユニークな地点として残した。

新規収集30件のうち1件(「世界樹の麓」)は変換後に海上に来てしまい、天陽郷/
世界樹どちらの座標系でも地形と一致する解が見つからなかったため除外した
(次回セッションで別ソースを探すこと)。
"""
import json
from pathlib import Path

from js_data_writer import write_js_consts

ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = ROOT / "game_data" / "base_spots_recommend_data.js"

TRANSLATION_X = 123930.0
TRANSLATION_Y = 157935.0
SCALE = 459.0
REF_IMAGE_SIZE = 8192.0
GAME_MIN_X, GAME_MAX_X = -1951, 1198
GAME_MIN_Y, GAME_MAX_Y = -1893, 1243
MAP_WIDTH = GAME_MAX_X - GAME_MIN_X
MAP_HEIGHT = GAME_MAX_Y - GAME_MIN_Y
TRANSFORM_A = REF_IMAGE_SIZE / MAP_WIDTH
TRANSFORM_B = 5075.45
TRANSFORM_C = -REF_IMAGE_SIZE / MAP_HEIGHT
TRANSFORM_D = 4960.62


def paldex_to_normalized(paldex_x, paldex_y):
    map_x, map_y = paldex_x, -paldex_y
    px = TRANSFORM_A * map_x + TRANSFORM_B
    leaflet_y = TRANSFORM_C * map_y + TRANSFORM_D
    py = REF_IMAGE_SIZE - leaflet_y
    return round(px / REF_IMAGE_SIZE, 5), round(py / REF_IMAGE_SIZE, 5)


# name_jp, paldex_x, paldex_y, reason_jp, sources(サイト名のリスト)
SPOTS = [
    ("氷鳥の封域の北・海岸", 110, -320, "大型拠点向けの平地。初心者向けで周囲のパルのレベルも低い", ["GameWith"]),
    ("潮風諸島の観測塔・南西の平原", -195, -702, "木を伐採してスペースを広げられる平原", ["GameWith"]),
    ("さざめきの島の浜・西の平原", -314, -12, "最初からある程度の広さがある平原", ["GameWith"]),
    ("氷イタチの丘・西の塔の上", -80, -193, "付近に宝箱多数、敵もほとんど湧かない", ["GameWith", "Game8"]),
    ("始まりの台地・北(滝近く)", 228, -486, "最序盤最適。岩・木・パルジウム・金属鉱石が揃う", ["GameWith", "Palworld Companion"]),
    ("Penking(ペンキング)ボス付近の浜", 108, -329, "周回ボスと低レベルパル出現地に近い序盤拠点", ["Palworld Companion"]),
    ("小さな集落・南西(金属鉱石8個)", 8, -528, "金属鉱石8個、周囲の敵レベルも低い第2拠点向け", ["GameWith", "Game8", "paldb.cc"]),
    ("さびれた教会・裏(金属)", 60, -400, "金属鉱石まとめて入手可、平地面積は少なめ", ["GameWith", "Game8"]),
    ("雷鳴竜の封域・西の高台(石炭/ペコドン)", -255, -367, "面積広く配合用ペコドンが近距離スポーン。敵レベルやや高め", ["GameWith", "paldb.cc"]),
    ("守護者の封域・東の山頂(石炭6・金属8)", 189, -38, "石炭・金属2種を大量入手、拠点引っ越し先に最適。拠点襲撃が発生しにくいとされる", ["GameWith", "Game8", "Palworld Companion", "paldb.cc"]),
    ("永遠の同志の塔・北西(硫黄)", 747, -444, "硫黄豊富だがファストトラベルで代替可能", ["GameWith"]),
    ("絶対零度の地・南(ピュアクォーツ8・金属2)", -254, 393, "寒冷地のため耐寒装備必須、レベル35〜40向け第3拠点", ["GameWith"]),
    ("遺伝子研究部隊・北(ピュアクォーツ)", -147, 582, "ピュアクォーツ+技の実の木+金属+ダンジョン近接", ["GameWith"]),
    ("小青龍の浜・西(配合向け平地)", -480, -85, "見晴らし良好、面積十分", ["GameWith", "paldb.cc"]),
    ("潮風諸島 漂流者の浜・西", -190, -700, "斜面少なく建築しやすい、金属鉱石も採取可", ["GameWith"]),
    ("レイン密猟団の塔・西の丘上", 86, -432, "斜面凹凸なし、周囲の敵レベル非常に低い低レベル配合向け", ["GameWith"]),
    ("常夏の浜・北(原油×3)", -858, -454, "油田3つを1拠点内に収容可能", ["GameWith", "paldb.cc"]),
    ("桜島・墓地の東(油田)", -646, 270, "資源豊富・平坦な土地が広い、原油効率採取", ["Game8", "Palworld Companion"]),
    ("彩蝶の森の南・火山の麓の南(硫黄)", -77, -310, "硫黄採掘ポイント近い、ある程度の広さ", ["Game8", "paldb.cc"]),
    ("黒曜火山付近(硫黄)", -571, -648, "石炭採掘場解放前の代替拠点", ["Game8"]),
    ("黒曜火山・西(硫黄専用)", -744, -442, "硫黄採掘ポイントが大量、銃弾作成拠点向け", ["Game8"]),
    ("灼けついた高台の西(ヘクソクォーツ)", -1340, -1285, "ヘクソライト生産用の専用採掘拠点、レベル62帯", ["Game8", "paldb.cc"]),
    ("結晶群島・北(天陽郷、硬い木材・ソルライト)", -356, -1422, "天陽郷エリア、硬い木材とソルライトを継続採取可能", ["Game8"]),
    ("雲泥湿地・東(天陽郷)", -305, -1410, "天陽郷エリアの資源収集拠点", ["Game8", "Palworld Companion"]),
    ("密集鉱石採掘拠点(石・鉱石8個)", 270, -230, "単一資源クラスタでは最密、サテライト拠点向け", ["Palworld Companion"]),
    ("砂岩ゲート・シンクホール(地下拠点)", -1281, -633, "地下空間で防御に優れる、襲撃者が見つけにくい", ["Palworld Companion"]),
    ("オアシス(地下砂漠拠点、天陽郷)", -259, -1398, "天陽郷エリア、地下に水場、採掘坑出口2つ、植物系パル向け緑地あり", ["Palworld Companion"]),
    ("オアシス島(原油3)", 917, 193, "水辺で水上建築向き、原油ノード3つ", ["Palworld Companion"]),
    ("火山西の浜(防衛特化)", -788, -659, "進入路が狭く地形で襲撃を絞り込める", ["Palworld Companion"]),
    # 旧paldb.cc(ipos)由来のユニーク5件(新規収集分と重複しなかったもの)
    ("3拠点分の広さがある平地(A)", -361, 13, "3拠点分の広さがある平地", ["paldb.cc"]),
    ("ヘクソクォーツ採取地(3箇所)", -1067, -1430, "ヘクソクォーツの採取ポイントが3箇所・原油が1箇所近い、天陽郷エリア", ["paldb.cc"]),
    ("花畑", -57, -419, "花畑", ["paldb.cc"]),
    ("円形の明るい平地", -85, 195, "円形の明るい平地、拠点襲撃(レイド)が発生しにくいとされる", ["paldb.cc"]),
    ("3拠点分の広さがある平地(B)", -262, 52, "3拠点分の広さがある平地", ["paldb.cc"]),
]


def main():
    out = []
    for name, px, py, reason, sources in SPOTS:
        nx, ny = paldex_to_normalized(px, py)
        out.append({
            "name": name,
            "x": nx, "y": ny,
            "reason": reason,
            "sources": sources,
            "region": "palpagos",
        })
    write_js_consts(OUT_PATH, [("BASE_SPOTS_RECOMMEND_DATA", out)])
    print(f"{len(out)}件 -> {OUT_PATH}")


if __name__ == "__main__":
    main()
