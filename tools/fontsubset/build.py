#!/usr/bin/env python3
"""サイトで実際に出る文字だけを含む DotGothic16 を作る。

なぜ自前でやるか:
  Google Fonts の DotGothic16 は unicode-range で123分割されている。
  このサイトの日本語だと37サブセット=201KBが落ちてくる(2026-08-09 実測)。
  出る文字は決まっている(ユーザー投稿が無い)ので、その分だけ詰めれば桁が変わる。

集める場所:
  *.html / pages/*.js / shared/*.js …… 画面に出る固定文言
  game_data/*.js                  …… パル名・技名・説明文。**描画されるのはこちら**
                                      (script タグで読み込まれる。JSONは素材で、多くは未使用)
  *.json / game_data/**/*.json    …… 取りこぼし防止の保険。多めに入れて豆腐を出さない

使い方:
  python3 tools/fontsubset/build.py
  → shared/fonts/dotgothic16-subset.woff2 を更新する

データを足したら必ず再実行すること。**足りない字は豆腐(□)になる。**
"""
import json, re, sys, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC_TTF = Path("/tmp/DotGothic16-Regular.ttf")
OUT = ROOT / "shared/fonts/dotgothic16-subset.woff2"

# 日本語(かな・漢字・記号)と、フォントに含めたい約物
JP = re.compile(r'[　-〿぀-ヿㇰ-ㇿ㐀-䶿一-鿿＀-￯‐-‧‰-⁞]')

def collect() -> set:
    chars = set()
    targets = []
    targets += sorted(ROOT.glob("*.html"))
    targets += sorted(ROOT.glob("pages/*.js"))
    targets += sorted(ROOT.glob("shared/*.js"))
    targets += sorted(ROOT.glob("game_data/*.js"))
    targets += sorted(ROOT.glob("*.json"))
    targets += sorted(ROOT.glob("game_data/**/*.json"))
    seen = 0
    for p in targets:
        if p.stat().st_size > 40 * 1024 * 1024:
            print(f"  skip (too big): {p.relative_to(ROOT)}", file=sys.stderr)
            continue
        try:
            text = p.read_text(encoding="utf-8", errors="ignore")
        except Exception as e:
            print(f"  skip ({e}): {p.relative_to(ROOT)}", file=sys.stderr)
            continue
        # JSONは \uXXXX でエスケープされていることがあるので戻してから拾う
        if p.suffix == ".json":
            try:
                text = json.dumps(json.loads(text), ensure_ascii=False)
            except Exception:
                pass
        chars |= set(JP.findall(text))
        seen += 1
    print(f"走査: {seen} ファイル")
    return chars

def main():
    if not SRC_TTF.exists():
        sys.exit(f"元フォントが無い: {SRC_TTF}\n"
                 "  curl -sL -o /tmp/DotGothic16-Regular.ttf \\\n"
                 "    https://github.com/google/fonts/raw/main/ofl/dotgothic16/DotGothic16-Regular.ttf")

    chars = collect()
    # ASCIIと基本記号は常に入れる(英数字はSilkscreen側だが、混植の取りこぼし対策)
    chars |= set(chr(c) for c in range(0x20, 0x7f))
    chars |= set("　、。・「」『』()〜ー…※→←↑↓±×÷℃%°")
    print(f"収集した文字: {len(chars)} 種")

    text_arg = "".join(sorted(chars))
    (ROOT / "tools/fontsubset/charset.txt").write_text(text_arg, encoding="utf-8")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([
        sys.executable, "-m", "fontTools.subset", str(SRC_TTF),
        f"--text-file={ROOT/'tools/fontsubset/charset.txt'}",
        "--flavor=woff2",
        "--layout-features=",          # 日本語の異体字置換等は使わないので落とす
        "--no-hinting",
        "--desubroutinize",
        "--drop-tables+=DSIG",
        f"--output-file={OUT}",
    ], check=True)

    src_kb = SRC_TTF.stat().st_size / 1024
    out_kb = OUT.stat().st_size / 1024
    print(f"\n元:     {src_kb:>8.0f} KB (TTF 全字)")
    print(f"出力:   {out_kb:>8.0f} KB (woff2 サブセット)  → {OUT.relative_to(ROOT)}")
    print(f"Google Fonts 経由だと 201 KB(2026-08-09 実測)")

if __name__ == "__main__":
    main()
