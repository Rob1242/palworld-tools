"""全ページのフッターに「どのゲームバージョンのデータか」を書き込む。

2026-08-11に追加。それまでサイトのどこにも、収録データがいつ時点のものか
書かれていなかった。正式版1.0(2026-07-10)で数値が大きく動いた直後なので、
数字が正しくても「いつのデータか分からないもの」は信用されない。
よそ(palworld-lab)の計算機は「(v1.0.0対応)」と明記している。

**バージョンは実物から決めている。推測で上げないこと。**
`game_data/characters.json` などユーザー提供の生データマイン一式のタイムスタンプが
2026-07-11 10:25 で、これは正式版1.0リリース(2026-07-10)の翌日。
つまり収録している種族値・技・配合表は 1.0 のもの。
その後の 1.0.1 / 1.0.2 は不具合修正が中心で、こちらのデータを取り直してはいない。
**取り直していないバージョンを「対応」と書かない。**

最終更新日は `pages/changelog.js` の先頭から取る。更新履歴とフッターの日付が
食い違うことが構造的に起きないようにするため、日付をここに直接書かない。

再実行すると既存の行を差し替える(seo/faviconの注入と違い、日付が動くため)。
"""
import glob
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# 生データマインを取得した時点のゲームバージョン。データを取り直したときだけ変える。
GAME_VERSION = "正式版 v1.0"
DATA_TAKEN_ON = "2026-07-11"

MARK_RE = re.compile(r'<span class="data-version">.*?</span>', re.S)
FOOTER_RE = re.compile(r'(<p class="footer-note">)(.*?)(</p>)', re.S)


def latest_changelog_date():
    src = (ROOT / "pages" / "changelog.js").read_text(encoding="utf-8")
    dates = re.findall(r'date:\s*"(\d{4}-\d{2}-\d{2})"', src)
    if not dates:
        raise SystemExit("changelog.js から日付を読めなかった。書式が変わっていないか確認すること")
    return max(dates)


def build_line(updated):
    return (
        '<span class="data-version">'
        f'収録データ: パルワールド {GAME_VERSION}({DATA_TAKEN_ON} 取得) / '
        f'サイト最終更新: {updated}'
        '</span>'
    )


def main():
    line = build_line(latest_changelog_date())
    added = replaced = skipped = 0

    for path in sorted(ROOT.glob("palworld_*.html")):
        content = path.read_text(encoding="utf-8")
        m = FOOTER_RE.search(content)
        if not m:
            skipped += 1          # リダイレクト用の小さいページにはフッターが無い
            continue

        inner = m.group(2)
        if MARK_RE.search(inner):
            new_inner = MARK_RE.sub(line, inner)
            replaced += 1
        else:
            new_inner = inner + "<br>" + line
            added += 1

        content = content[:m.start()] + m.group(1) + new_inner + m.group(3) + content[m.end():]
        path.write_text(content, encoding="utf-8")

    print(f"{line}")
    print(f"追加 {added} / 差し替え {replaced} / フッター無しで対象外 {skipped}")


if __name__ == "__main__":
    main()
