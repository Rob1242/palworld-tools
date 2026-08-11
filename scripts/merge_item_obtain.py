"""スクレイプの断片を obtain_merged.json にまとめ、作業台の日本語名表も作り直す。

2026-08-11に追加。それまでこの2つが**手作業**で、再現手順が残っていなかった。

■ 断片の統合

`game_data/item_obtain_raw/obtain_*.json` は、スクレイプを回した回数だけ増えている
(0_10 / 0_2413 / retry / 今回の 0_1009 …)。これらを1つにまとめる。

**後から取ったものを優先する。** 同じアイテムを取り直したとき、新しいほうが正しい。
ただし**丸ごと差し替えない。節(production / dropped_by / …)ごとに重ねる。**

丸ごと差し替えにしていたら、実際に取りこぼした:

    「火薬」は Gunpowder と Gunpowder2 の2アセットが同じ英語名を共有している。
    再取得で production だけが返り、前回取れていた dropped_by が消えた。

新しい取得に無い節は、前に取れていたものをそのまま残す。逆に相手のサイトから
本当に消えた情報は残り続けるが、黙って失うよりはよい。

■ 作業台の日本語名表(WORKBENCH_JP_PATH)

build_item_obtain_data.py が `/tmp/workbench_jp_names.json` を読むが、
**/tmp なので消える。** 実際に消えていて、ビルドを流し直せない状態だった。

**キーは paldb.cc 側のスラッグで、こちらの asset 名ではない。**
building_items_data.js の asset(例 `Factory_Hard_04`)で表を作ったら、
837件の作業台名が「高度文明の作業工場」→「Advanced_Workshop」に化けた。

正しい対応は手元の2つを突き合わせれば復元できる:

    スクレイプ生データ  … その作業台の paldb スラッグ(Advanced_Workshop)
    既存の完成データ    … 同じアイテムの日本語名(高度文明の作業工場)

同じアイテムで両方を見れば (スラッグ → 日本語名) が1組できる。
これを全アイテムで集めたものを表にする。
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "game_data" / "item_obtain_raw"
MERGED = RAW_DIR / "obtain_merged.json"
BUILDINGS = ROOT / "game_data" / "building_items_data.js"
OBTAIN_JS = ROOT / "game_data" / "items_obtain_data.js"
ITEMS = ROOT / "game_data" / "items_dex_data.js"
WORKBENCH_OUT = Path("/tmp/workbench_jp_names.json")


def load_js(path):
    src = path.read_text(encoding="utf-8")
    return json.loads(src[src.index("=") + 1:].strip().rstrip(";"))


def merge():
    # 更新時刻の古い順に重ねる = 新しく取ったものが後から上書きする
    chunks = sorted((p for p in RAW_DIR.glob("obtain_*.json") if p.name != MERGED.name),
                    key=lambda p: p.stat().st_mtime)
    merged, stats = {}, []
    for path in chunks:
        data = json.loads(path.read_text(encoding="utf-8"))
        new = over = 0
        for name, value in data.items():
            if not value:
                continue                      # 空で既存を潰さない
            if name in merged:
                over += 1
                merged[name] = {**merged[name], **value}   # 節ごとに重ねる
            else:
                new += 1
                merged[name] = value
        stats.append((path.name, len(data), new, over))

    MERGED.write_text(json.dumps(merged, ensure_ascii=False, indent=1), encoding="utf-8")
    for name, total, new, over in stats:
        print(f"  {name:24} {total:>5}件 → 新規 {new:>4} / 上書き {over:>4}")
    print(f"  -> {MERGED.name} {len(merged)}件")
    return merged


def build_workbench_names(merged):
    """(paldbのスラッグ → 日本語名)を、既存の完成データと生データの突き合わせで復元する。"""
    done = load_js(OBTAIN_JS)          # 既に日本語名が入っている完成データ
    items = load_js(ITEMS)
    # 完成データは asset キー、生データは英語名キーなので、英語名 -> asset を用意する
    asset_of = {}
    for it in items:
        if it.get("name_en"):
            asset_of.setdefault(it["name_en"].strip(), it["asset"])

    table, conflicts = {}, []
    for en_name, raw in merged.items():
        prod = raw.get("production")
        if not prod:
            continue
        slug = prod[0].get("workbench_asset") if isinstance(prod, list) else prod.get("workbench_asset")
        if not slug:
            continue
        asset = asset_of.get(en_name.strip())
        jp = (done.get(asset) or {}).get("production", {}).get("workbench_jp")
        if not jp or jp == slug:
            continue                   # まだ日本語名が付いていないものからは学べない
        if slug in table and table[slug] != jp:
            conflicts.append((slug, table[slug], jp))
        table[slug] = jp

    # 突き合わせで学べなかったものは、建築物データの名前で補う(キーが違うので当たれば拾える程度)
    added = 0
    for b in load_js(BUILDINGS):
        if b.get("asset") and b.get("name_jp") and b["asset"] not in table:
            table[b["asset"]] = b["name_jp"]
            added += 1

    WORKBENCH_OUT.write_text(json.dumps(table, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"  作業台の対応表 {len(table)}件(既存データから復元 {len(table)-added} / 建築物データで補完 {added})")
    if conflicts:
        print(f"  ⚠ 同じスラッグに別の日本語名: {conflicts[:3]}")


if __name__ == "__main__":
    merged = merge()
    build_workbench_names(merged)
