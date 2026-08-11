import re

# 各ページに meta description / Open Graph / Twitter Card タグを追加する。
# 検索結果のスニペットと、Discord/X共有時のリンクプレビューの両方に使われるため、
# 実際の検索キーワード(パルワールド 鉱石、パルワールド 配合 等)を自然に含めた文にする。
SITE_URL = "https://rob1242.github.io/palworld-tools"
OG_IMAGE = f"{SITE_URL}/game_data/art/hero_sphere_2.webp"

DESCRIPTIONS = {
    "palworld_home.html": "パルワールド(Palworld)の非公式攻略ツールまとめ。パル図鑑・配合検索・拠点プランナー・戦闘最適化・アイテム図鑑など全24種のツールを無料で使えます。",
    "palworld_achievements.html": "パルワールドの全実績の解除条件を一覧表示。進行度で絞り込んで、残りの実績をまとめて確認できます。",
    "palworld_base_planner_v2.html": "拠点に置くべきパルの組み合わせを自動計算。役職の重要度と枠数を入れるだけで、287体の中から最適な配置を提案します。",
    "palworld_base_spots.html": "パルワールドのおすすめ拠点候補地を紹介。資源・地形・安全性の観点から選んだ立地ガイドです。",
    "palworld_bossguide.html": "パルワールドの塔ボス全10体・レイドボス・フィールドボス(アルファ個体83体)の弱点・攻略法・おすすめパル編成、ドロップ品をまとめて解説。",
    "palworld_breeding.html": "パルワールドの配合(繁殖)検索ツール。欲しいパルから親候補を逆引き、固定レシピもランク配合ペアも一発で表示します。",
    "palworld_changelog.html": "パルワールド攻略ツールの更新履歴一覧。",
    "palworld_combat.html": "パルワールドの戦闘最適化ツール。理想ビルドでのDPSランキングで全パルを比較、1体で最強の火力を出せるパルが分かります。",
    "palworld_dex.html": "パルワールドのパル図鑑。全298体の種族値、属性相性、ドロップ、入手方法を収録した捕獲前チェック必須のデータベース。",
    "palworld_items.html": "パルワールドのアイテム図鑑。金属鉱石・コラルム鉱石など素材・武器・防具・食料まで2466種を検索できます。",
    "palworld_iv_calc.html": "パルワールドの素質値(IV)計算機。HP・攻撃・防御の現在値からパルの隠れた素質値を逆算します。",
    "palworld_map.html": "パルワールドの出現マップ。パルを選ぶと野生・ボスの出現エリアと個体数を世界地図上に表示、昼夜の違いや世界樹エリアにも対応。",
    "palworld_missions.html": "パルワールドのメイン・サブミッション117件を一覧化。報酬と次に発生するミッションのつながりも確認できます。",
    "palworld_palbox.html": "パルワールドのパルボックス管理ツール。所持パルを個体値・技・パッシブごと記録して、目的パルへの配合ロードマップを自動で組みます。",
    "palworld_party_guide.html": "パルワールドの最強パーティ編成ガイド。序盤・拠点作業班・終盤6体編成を実データの計算に基づいておすすめします。",
    "palworld_passives_guide.html": "パルワールドのおすすめパッシブスキル早見表。戦闘・拠点作業・ライドの用途別に厳選した組み合わせを紹介。",
    "palworld_reference.html": "パルワールドの作業優先度・属性変換パートナースキル・パーティ全体バフ・SAN(正気度)システムの参照表をまとめて掲載。",
    "palworld_ride.html": "パルワールドのライド速度ランキング。陸上・飛行・水上でライド可能なパルを走行速度・疾走速度で比較できます。",
    "palworld_technology.html": "パルワールドのテクノロジーツリー一覧。Lv1〜80の建築物・アイテムを絞り込んで解放レベルとコストを確認できます。",
    "palworld_tierlist.html": "パルワールドの最強Tier表。戦闘・拠点作業・マウントなど複数カテゴリで全パルをSS〜Dランクにランキング。",
}

TITLE_RE = re.compile(r"<title>([^<]*)</title>")


def build_meta_block(title, description, page_url):
    return (
        f'<meta name="description" content="{description}">\n'
        f'<meta property="og:type" content="website">\n'
        f'<meta property="og:title" content="{title}">\n'
        f'<meta property="og:description" content="{description}">\n'
        f'<meta property="og:image" content="{OG_IMAGE}">\n'
        f'<meta property="og:url" content="{page_url}">\n'
        f'<meta name="twitter:card" content="summary_large_image">\n'
    )


def main():
    updated = 0
    for filename, description in DESCRIPTIONS.items():
        content = open(filename, encoding="utf-8").read()
        if 'name="description"' in content:
            continue  # 既に挿入済み(再実行時の重複防止)
        m = TITLE_RE.search(content)
        title = m.group(1) if m else "Palworld 攻略ツール"
        page_url = f"{SITE_URL}/{filename}"
        block = build_meta_block(title, description, page_url)
        new_content = content.replace("</title>\n", "</title>\n" + block, 1)
        open(filename, "w", encoding="utf-8").write(new_content)
        updated += 1
    print(f"{updated}件のページにmeta description/OGタグを追加しました")


if __name__ == "__main__":
    main()
