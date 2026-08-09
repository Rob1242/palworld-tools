#!/usr/bin/env python3
"""相棒(マスコット)のドット絵と待機モーションを作る。AIは使わない。

**ここで一番大事なのは「縮め方」。**
最近傍で縮小すると、元の3Dレンダの陰影とノイズがそのまま残って、
ドット絵ではなく「モザイク」になる(2026-08-09、実際にそうなって作り直した)。
ドット絵に見せるのに要るのは4つ:

  1. 面積平均(BOX)で縮小 …… ノイズと半透明の縁を先に潰す
  2. 色数を絞る(28色・ディザ無し) …… 平坦な面を作る。彩度を1.3倍にしてから
     減色しないと、くちばしの黄色やお腹の赤のような**小さい差し色が消える**
  3. 孤立ピクセルを消す …… 点在するゴミがモザイク感の正体
  4. **暗い輪郭を1px足す** …… 「絵」と「モザイク」を分ける最大の要素

待機モーションは元の1枚を潰す/伸ばすだけ。縦に潰したら横に広げて体積を保つ。
姿勢そのものが変わるコマ(歩く・手を振る)はこの手では作れない。
そこは tools/spritegen/gen.py(Gemini)側の仕事。

出力: shared/sprites/<name>-idle.png (4コマのシート) と <name>.png (静止画)
使い方: python3 tools/spritegen/idle.py
"""
from pathlib import Path
from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "shared/sprites"

SIZE = 40          # 1コマの高さ。表示は2倍(80px)
COLORS = 28
SATURATION = 1.3
OUTLINE = (10, 12, 20, 255)     # サイト全体が黒1px輪郭なので、それに揃える

SOURCES = {
    "home":     "game_data/icons/pals/T_SheepBall_icon_normal.webp",
    "dex":      "game_data/icons/pals/T_PinkCat_icon_normal.webp",
    "breeding": "game_data/icons/pals/T_ChickenPal_icon_normal.webp",
    "palbox":   "game_data/icons/pals/T_Carbunclo_icon_normal.webp",
    "combat":   "game_data/icons/pals/T_Kitsunebi_icon_normal.webp",
    "base":     "game_data/icons/pals/T_FlowerRabbit_icon_normal.webp",
    "map":      "game_data/icons/pals/T_Penguin_icon_normal.webp",
    "items":    "game_data/icons/pals/T_Hedgehog_icon_normal.webp",
    "boss":     "game_data/icons/pals/T_Anubis_icon_normal.webp",
    "tools":    "game_data/icons/pals/T_Hedgehog_icon_normal.webp",
    "ride":     "ペコドン.png",     # 全身の絵をもらっているのでこちらを使う
}

# (横倍率, 縦倍率, 上下のずれpx)
POSES = [(1.00, 1.00, 0), (1.04, 0.96, 0), (1.00, 1.00, 0), (0.98, 1.03, -1)]


def trim(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    if im.getextrema()[3][0] == 255:            # 背景が不透明なら四隅の色を抜く
        bg = im.getpixel((0, 0)); px = im.load(); w, h = im.size
        for y in range(h):
            for x in range(w):
                r, g, b, _ = px[x, y]
                if abs(r-bg[0]) < 18 and abs(g-bg[1]) < 18 and abs(b-bg[2]) < 18:
                    px[x, y] = (r, g, b, 0)
    box = im.getbbox()
    return im.crop(box) if box else im


def despeckle(im: Image.Image) -> Image.Image:
    """周りとつながっていない点を消す。これが残るとモザイクに見える。"""
    px = im.load(); w, h = im.size
    out = im.copy(); o = out.load()
    for y in range(h):
        for x in range(w):
            n = sum(1 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                    if 0 <= x+dx < w and 0 <= y+dy < h and px[x+dx, y+dy][3] > 0)
            if px[x, y][3] > 0 and n <= 1:
                o[x, y] = (0, 0, 0, 0)
    return out


def outline(im: Image.Image, col=OUTLINE) -> Image.Image:
    """輪郭を1px。上下左右に1pxずつ広がる。"""
    w, h = im.size
    big = Image.new("RGBA", (w+2, h+2), (0, 0, 0, 0)); big.paste(im, (1, 1))
    px = big.load(); out = big.copy(); o = out.load()
    for y in range(h+2):
        for x in range(w+2):
            if px[x, y][3] == 0 and any(
                    0 <= x+dx < w+2 and 0 <= y+dy < h+2 and px[x+dx, y+dy][3] > 0
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                o[x, y] = col
    return out


def pixelize(im: Image.Image, height: int, palette=None):
    """3Dレンダ → ドット絵。手順はモジュールの説明どおり。"""
    w, h = im.size
    nw = max(1, round(w * height / h))
    small = im.resize((nw, height), Image.BOX)          # 1. 面積平均

    rgb = ImageEnhance.Color(small.convert("RGB")).enhance(SATURATION)
    small = Image.merge("RGBA", (*rgb.split(), small.getchannel("A")))

    a = small.getchannel("A").point(lambda v: 255 if v >= 140 else 0)
    src_rgb = small.convert("RGB")
    q = (src_rgb.quantize(palette=palette, dither=Image.NONE) if palette
         else src_rgb.quantize(colors=COLORS, method=Image.MEDIANCUT, dither=Image.NONE))
    q = q.convert("RGBA"); q.putalpha(a)                # 2. 減色
    return despeckle(q)                                  # 3. ゴミ取り


def build(src_path: Path, name: str):
    src = trim(Image.open(src_path))

    # 1コマ目のパレットを基準にして、全コマの色を揃える(チラつき止め)
    ref = pixelize(src, SIZE)
    palette = ref.convert("RGB").quantize(colors=COLORS, method=Image.MEDIANCUT)

    frames = []
    for sx, sy, dy in POSES:
        w, h = src.size
        posed = src.resize((max(1, int(w*sx)), max(1, int(h*sy))), Image.LANCZOS)
        frames.append((outline(pixelize(posed, SIZE, palette)), dy))   # 4. 輪郭

    cw = max(im.width for im, _ in frames)
    ch = SIZE + 3                                   # 輪郭2px + 浮く1px ぶんの余白
    sheet = Image.new("RGBA", (cw*len(frames), ch), (0, 0, 0, 0))
    for i, (im, dy) in enumerate(frames):
        # 足元を下辺に揃える。ここを揃えないと上下に跳ねて見える
        sheet.paste(im, (i*cw + (cw - im.width)//2, ch - im.height + dy))
    sheet.save(OUT / f"{name}-idle.png")

    # シートを読めなかったとき用の静止画。1コマ目と同じ絵にしておく
    still = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    still.paste(frames[0][0], ((cw - frames[0][0].width)//2, ch - frames[0][0].height))
    still.save(OUT / f"{name}.png")

    return cw, ch, len(frames), (OUT / f"{name}-idle.png").stat().st_size


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    for name, rel in SOURCES.items():
        p = ROOT / rel
        if not p.exists():
            print(f"  元画像なし: {rel}"); continue
        w, h, f, size = build(p, name)
        total += size
        print(f"  {name:9} {w:3}x{h} × {f}コマ  {size/1024:5.1f}KB")
    print(f"合計 {total/1024:.1f}KB")
