"""キャッシュ用バージョンを上げ、**付け忘れを機械的に無くす**。

2026-08-11に追加。それまで手で sed していたため、付いていないファイルがあった。

■ なぜ必要か(実際に起きたこと)

`shared/util.js` にバージョンが付いていないまま中身を変えたことがあり、
再訪ユーザーが古い util.js を掴んで `obtainBadge is not defined` になる
一歩手前だった。同じ日に調べたら、**8本の共通スクリプトが同じ状態**だった:

    img-fallback / global_search / analytics / text-normalize
    icons / combat-formula / palsave-import / frame-guard

実害も出た。global_search.js にページを1件足したのに、
ブラウザが古い版を使い続けて検索に出てこなかった。

■ やること

1. 全HTMLと shared/arcade.js の中の旧バージョン文字列を新しいものに置換
2. **shared/*.js と pages/*.js の参照に ?v= が無ければ付ける**

leaflet だけは対象外。第三者のライブラリで中身を触らないうえ、
サイトを更新するたびに数百KBを取り直させるのは損なだけのため。

使い方:
    python3 scripts/bump_cache_version.py 20260811j
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VERSION_RE = re.compile(r"\?v=(\d{8}[a-z]*)")

# 中身を触らない第三者のライブラリ。バージョンを付けない。
EXCLUDE = ("shared/leaflet/",)

# ?v= を必ず付ける対象。game_data は別枠で、大きく更新頻度も低いので今は含めない
# (含めるなら、どのデータが変わったかで個別に判断すること)。
NEEDS_VERSION = re.compile(r'src="((?:shared|pages)/[^"?]+\.js)"')


def current_version():
    """いま一番多く使われているバージョン文字列を今の版とみなす。"""
    counts = {}
    for path in list(ROOT.glob("*.html")) + [ROOT / "shared" / "arcade.js"]:
        for v in VERSION_RE.findall(path.read_text(encoding="utf-8")):
            counts[v] = counts.get(v, 0) + 1
    if not counts:
        raise SystemExit("既存のバージョン文字列が見つからない")
    return max(counts, key=counts.get)


def main():
    if len(sys.argv) != 2:
        raise SystemExit("使い方: python3 scripts/bump_cache_version.py <新バージョン 例 20260811j>")
    new = sys.argv[1]
    if not re.fullmatch(r"\d{8}[a-z]*", new):
        raise SystemExit(f"バージョンの書式が違う: {new}(例: 20260811j)")

    old = current_version()
    if old == new:
        raise SystemExit(f"すでに {new} です")

    bumped = added = 0
    for path in sorted(list(ROOT.glob("*.html")) + [ROOT / "shared" / "arcade.js"]):
        text = original = path.read_text(encoding="utf-8")
        text = text.replace(f"?v={old}", f"?v={new}")

        # ?v= が付いていない参照に足す
        def add_version(m):
            nonlocal added
            src = m.group(1)
            if any(src.startswith(e) for e in EXCLUDE):
                return m.group(0)
            added += 1
            return f'src="{src}?v={new}"'

        text = NEEDS_VERSION.sub(add_version, text)

        if text != original:
            path.write_text(text, encoding="utf-8")
            bumped += 1

    print(f"{old} -> {new}")
    print(f"  更新 {bumped}ファイル / ?v= を新たに付けた参照 {added}件")

    # 付け忘れが残っていないか、最後に必ず見る
    missing = {}
    for path in ROOT.glob("*.html"):
        for src in NEEDS_VERSION.findall(path.read_text(encoding="utf-8")):
            if not any(src.startswith(e) for e in EXCLUDE):
                missing.setdefault(src, 0)
                missing[src] += 1
    if missing:
        print("  ⚠ まだ ?v= の無い参照:")
        for src, n in sorted(missing.items()):
            print(f"      {src} ({n}ページ)")
    else:
        print("  ?v= の無い shared/pages 参照は残っていない")


if __name__ == "__main__":
    main()
