"""sitemap.xml を実際のページから組み直す。

手で維持していたため取りこぼしが出ていた(2026-08-11時点で
palworld_mutation.html と palworld_official.html の2ページが載っていなかった)。
**ページを1枚足すたびに手で追記する運用は必ず抜ける**ので、実物から生成する。

対象の決め方:
  ・palworld_*.html を全部見る
  ・地図タブへのリダイレクト用の小さいページは除く。実体が無いので
    インデックスさせる意味が無い

除外の判定は2つ見る。**片方だけだと取りこぼす。**
  ・<meta http-equiv="refresh">   … base_spots / statues はこの形
  ・<meta name="robots" content="noindex"> … missions は JS で飛ばしていて
                                             refresh を持たない
noindex のほうが「載せたくない」という意思そのものなので、こちらが本命。

優先度はホームだけ 1.0、あとは 0.7(元の sitemap.xml の値をそのまま踏襲)。
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE_URL = "https://rob1242.github.io/palworld-tools"
HOME = "palworld_home.html"

REDIRECT_RE = re.compile(r'http-equiv=["\']refresh["\']', re.I)
NOINDEX_RE = re.compile(r'name=["\']robots["\'][^>]*noindex', re.I)


def main():
    pages, skipped = [], []
    for path in sorted(ROOT.glob("palworld_*.html")):
        html = path.read_text(encoding="utf-8")
        if REDIRECT_RE.search(html) or NOINDEX_RE.search(html):
            skipped.append(path.name)
            continue
        pages.append(path.name)

    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for name in pages:
        lines.append("  <url>")
        lines.append(f"    <loc>{SITE_URL}/{name}</loc>")
        lines.append(f"    <priority>{'1.0' if name == HOME else '0.7'}</priority>")
        lines.append("  </url>")
    lines.append("</urlset>")

    (ROOT / "sitemap.xml").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"sitemap.xml に {len(pages)}ページ")
    print(f"リダイレクト用のため除外 {len(skipped)}: {', '.join(skipped)}")


if __name__ == "__main__":
    main()
