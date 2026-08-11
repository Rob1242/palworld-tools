"""game_data/*.js の参照に、**中身のハッシュ**を ?v= として付ける。

2026-08-11に追加。共通スクリプト(shared/*.js)のキャッシュ問題は
bump_cache_version.py で塞いだが、**データ側は素通しだった。**

実際に踏んだ:
    items_obtain_data.js に321件足したのに、ブラウザは1,038件のまま読んでいた。

■ なぜ一律のバージョンにしないか

game_data は大きい。dex_data 278KB / learnset_data 537KB /
breeding_forward_pairs 1.8MB もある。サイトを更新するたびに全部へ同じ
バージョンを振ると、**中身が変わっていないファイルまで毎回取り直させる。**

そこで中身のSHA-256の先頭8桁を使う。変わったファイルだけが変わるので、
更新のたびに落とし直すのは実際に差し替えたものだけになる。

■ 使い方

    python3 scripts/version_game_data.py

データを作り直したあと、コミットの前に毎回実行する。
既に付いているハッシュは新しい値に置き換わる。
"""
import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# 対象は .js だけ。画像(webp)は中身を差し替えることが稀で、
# 差し替えるときは名前を変えるか個別に対応すればよい。
REF_RE = re.compile(r'src="(game_data/[^"?]+\.js)(\?v=[^"]*)?"')

# HTMLの <script src> だけでなく、JS の中で動的に読み込んでいる参照も対象にする。
# shared/global_search.js が breeding_pals_data.js を注入しており、そこだけ
# 手書きの古い版(?v=20260810j)が残っていた。HTMLしか見ていないと永久に気づけない。
JS_REF_RE = re.compile(r'"(game_data/[^"?]+\.js)(\?v=[^"]*)?"')


def short_hash(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()[:8]


def main():
    cache = {}
    missing = set()

    def resolve(rel):
        if rel not in cache:
            f = ROOT / rel
            if not f.exists():
                missing.add(rel)
                cache[rel] = None
            else:
                cache[rel] = short_hash(f)
        return cache[rel]

    touched = refs = changed = 0
    for html in sorted(ROOT.glob("*.html")):
        text = original = html.read_text(encoding="utf-8")

        def sub(m):
            nonlocal refs, changed
            rel, old = m.group(1), m.group(2)
            h = resolve(rel)
            if h is None:
                return m.group(0)
            refs += 1
            new = f"?v={h}"
            if old != new:
                changed += 1
            return f'src="{rel}{new}"'

        text = REF_RE.sub(sub, text)
        if text != original:
            html.write_text(text, encoding="utf-8")
            touched += 1

    # JS の中から動的に読んでいる分
    js_refs = js_changed = js_touched = 0
    for js in sorted((ROOT / "shared").glob("*.js")):
        text = original = js.read_text(encoding="utf-8")

        def sub_js(m):
            nonlocal js_refs, js_changed
            rel, old = m.group(1), m.group(2)
            h = resolve(rel)
            if h is None:
                return m.group(0)
            js_refs += 1
            new = f"?v={h}"
            if old != new:
                js_changed += 1
            return f'"{rel}{new}"'

        text = JS_REF_RE.sub(sub_js, text)
        if text != original:
            js.write_text(text, encoding="utf-8")
            js_touched += 1

    print(f"game_data の参照 {refs}件 / 値が変わった {changed}件 / 書き換えたHTML {touched}枚")
    print(f"  JS内の動的参照 {js_refs}件 / 値が変わった {js_changed}件 / 書き換えたJS {js_touched}本")
    print(f"  ハッシュを計算したファイル {len([v for v in cache.values() if v])}種")
    if missing:
        print(f"  ⚠ 参照されているが存在しない: {sorted(missing)}")


if __name__ == "__main__":
    main()
