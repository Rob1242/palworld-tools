"""
palworld_palbox.htmlの配合ロードマップ機能向けに、breeding_data.jsを2つに分割する。

- breeding_pals_data.js (BREEDING_PALS_DATA, 数十KB): dex_id/名前/アイコン等の
  基本情報。「所持パル管理」「共有ボックス」タブでも使うため常に読み込む。
- breeding_forward_pairs_data.js (BREEDING_FORWARD_PAIRS_DATA, 1.8MB): 配合の
  親ペア→子の表。「配合ロードマップ」タブを実際に開いた時だけ動的に
  <script>タグを注入して読み込む(2026-07-28、颯太の依頼でforwardPairsも
  完全に遅延読込化)。

reverseParents(子→親候補、breeding.html専用)はどちらにも含めない
(build_breeding_data_no_reverse.pyと同じ理由でpalbox.htmlには不要)。
"""
import json
import re
from pathlib import Path

from js_data_writer import write_js_consts

ROOT = Path(__file__).resolve().parent.parent
SRC_PATH = ROOT / "game_data" / "breeding_data.js"
RAW_PATH = ROOT / "game_data" / "breedingdata.json"
SPAWN_PATH = ROOT / "palworld_spawn_data.json"
PALS_OUT = ROOT / "game_data" / "breeding_pals_data.js"
FORWARD_OUT = ROOT / "game_data" / "breeding_forward_pairs_data.js"

# build_dex_data.py と同じしきい値。片方だけ変えると同じパルに違うバッジが出る。
TIER_EARLY_MAX = 15
TIER_MID_MAX = 35


def merge_ignore_combi(pals):
    """生データにある ignore_combi を合流させる。

    突然変異の変異先になれるかどうかを決めるフラグ(2026-08-10に判明)。
    `breedingdata.json` の pal_info にはあるのに、途中の breedingdata_v2.json で
    落ちており、本番の breeding_data.js にも載っていなかった。
    突然変異ページはこれが無いと候補を絞れないので、ここで戻す。

    ignore_combi=true は43体(伝説・塔ボス・レイド・コラボ等)。
    セレムーン・ゼノドランがこれに該当し、外部サイトの計算例で
    候補から外れていた理由もこれで説明がつく。
    """
    raw = json.loads(open(RAW_PATH, encoding="utf-8").read())["pal_info"]
    hit = 0
    for asset, info in pals.items():
        if asset in raw:
            info["ignore_combi"] = bool(raw[asset].get("ignore_combi"))
            hit += 1
        else:
            # 生データに無いパルは False にしておく(候補に残す)。
            # 分からないものを勝手に除外すると、取りこぼしが黙って起きる。
            info["ignore_combi"] = False
    missing = [a for a in pals if a not in raw]
    print(f"  ignore_combi を合流: {hit}件"
          + (f" / 生データに無い {len(missing)}件: {missing[:5]}" if missing else ""))
    return pals


def merge_obtain_tier(pals):
    """入手時期(early/mid/late/special)を合流させる。

    ボス攻略ページが「そのボスに挑む時点では手に入らないパル」を勧めていた
    (2026-08-11に実測。塔3でゴリガイア=野生Lv35、塔4でヒグルミ=野生に出ない、
    レイドLv30でアズルーナ=野生Lv50)。Tier表と同じくバッジで補足するため、
    ボス攻略が読んでいるこのファイルに tier を持たせる。

    ボス攻略は dex_data.js(285KB)を読んでいない。バッジ1つのために
    読ませるのは重いので、こちら(62KB)に持たせる判断。

    算出は build_dex_data.py の tier_of と同一。dex_data.js の tier と
    287体すべてで一致することを確認済み(食い違い0)。
    生データに無い12体(コラボ等)は野生に出ないので special になる。
    """
    spawn = json.loads(open(SPAWN_PATH, encoding="utf-8").read())
    min_lv = {}
    for p in spawn["pals"]:
        zones = p.get("wildZones") or []
        if zones:
            min_lv[p["asset"].lower()] = min(z.get("minLevel", 99) for z in zones)

    count = {"early": 0, "mid": 0, "late": 0, "special": 0}
    for asset, info in pals.items():
        lv = min_lv.get(asset.lower())
        if lv is None:
            tier = "special"        # 野生に出ない = 配合・ボス・レイドなど
        elif lv <= TIER_EARLY_MAX:
            tier = "early"
        elif lv <= TIER_MID_MAX:
            tier = "mid"
        else:
            tier = "late"
        info["tier"] = tier
        count[tier] += 1
    print(f"  tier を合流: " + " / ".join(f"{k} {v}" for k, v in count.items()))
    return pals


def main():
    content = open(SRC_PATH, encoding="utf-8").read()
    m = re.search(r"const BREEDING_DATA\s*=\s*(.*);\s*$", content, re.S)
    data = json.loads(m.group(1))

    pals = merge_obtain_tier(merge_ignore_combi(data["pals"]))
    write_js_consts(PALS_OUT, [("BREEDING_PALS_DATA", pals)])
    write_js_consts(FORWARD_OUT, [("BREEDING_FORWARD_PAIRS_DATA", data["forwardPairs"])])
    print(f"pals({len(data['pals'])}件) -> {PALS_OUT}")
    print(f"forwardPairs({len(data['forwardPairs'])}件) -> {FORWARD_OUT}")


if __name__ == "__main__":
    main()
