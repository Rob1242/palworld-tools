#!/usr/bin/env python3
"""全ページ共通のナビゲーションを shared/nav-items.json から再生成する。

背景:
  同じ20リンクのナビが20個のHTMLにコピーされており、リンクを1つ足すだけで
  20ファイルを編集する必要があった。1箇所でも直し忘れるとそのページだけ
  古いままになる(2026-08にこのスクリプトを用意して解消)。

なぜJSで動的生成しないのか:
  検索エンジンにリンクを確実に拾わせたいので、HTMLに実体として残す。
  そのかわり、編集元は nav-items.json 1つに集約し、ここから書き戻す。

使い方:
  1. shared/nav-items.json を編集する(順番の入れ替え・追加・削除・名前変更)
  2. python3 tools/build-nav.py を実行する
  3. git diff で意図した差分だけになっているか確認する

  変更点だけを確認したい場合は --check を付けると、書き換えずに
  「今のHTMLがJSONと一致しているか」だけを報告する(CI的な使い方)。
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NAV_JSON = os.path.join(ROOT, "shared", "nav-items.json")
NAV_RE = re.compile(r'(<nav class="tabs">)(.*?)(</nav>)', re.S)


def build_inner(items, current_file, indent="      "):
    lines = []
    for it in items:
        cls = ' class="current"' if it["url"] == current_file else ""
        lines.append(f'{indent}<a href="{it["url"]}"{cls}><span>{it["label"]}</span></a>')
    return "\n" + "\n".join(lines) + "\n    "


def main():
    check_only = "--check" in sys.argv
    items = json.load(open(NAV_JSON, encoding="utf-8"))

    # nav-items.json のリンク先が実在するかを先に検証する
    missing = [it["url"] for it in items if not os.path.exists(os.path.join(ROOT, it["url"]))]
    if missing:
        print(f"エラー: nav-items.json のリンク先が存在しません: {missing}")
        return 1

    changed, checked = [], 0
    for name in sorted(os.listdir(ROOT)):
        if not name.endswith(".html"):
            continue
        path = os.path.join(ROOT, name)
        html = open(path, encoding="utf-8").read()
        m = NAV_RE.search(html)
        if not m:
            continue  # リダイレクト用スタブなどナビを持たないページ
        checked += 1
        new_inner = build_inner(items, name)
        if m.group(2) == new_inner:
            continue
        changed.append(name)
        if not check_only:
            open(path, "w", encoding="utf-8").write(
                html[:m.start(2)] + new_inner + html[m.end(2):]
            )

    if check_only:
        if changed:
            print(f"ナビがJSONと一致していないページ({len(changed)}件): {', '.join(changed)}")
            print("→ python3 tools/build-nav.py を実行してください")
            return 1
        print(f"ナビを持つ{checked}ページすべてが nav-items.json と一致しています")
        return 0

    print(f"ナビを持つページ: {checked}件 / 更新: {len(changed)}件")
    for c in changed:
        print(f"  {c}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
