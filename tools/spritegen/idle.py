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


def saturation_weighted_resize(im: Image.Image, nw: int, nh: int) -> Image.Image:
    """面積平均で縮めるが、鮮やかな画素を重く数える。

    ただのBOXだと、狭くて鮮やかな特徴が周りの地味な色に薄められて消える。
    ツッパニャン(Cattiva)で実測したところ、元アイコンの2.60%(260px)を
    占める青い目が、縮小後は**0px**になっていた(2026-08-10)。
    目は白目・黒目・ハイライトと隣り合っているので、平均を取ると灰色に化ける。
    大きい目がこのパルの一番の特徴なので、消えると別のパルに見える。

    彩度を重みにすると、同じセルの中で「地の色」より「差し色」が優先される。
    SATURATION(彩度を上げてから減色する既存の対策)は減色段階の話で、
    平均で消えたものは戻せないため、こちらは縮小段階で効かせる。
    """
    src = im.convert("RGBA")
    w, h = src.size
    px = src.load()
    out = Image.new("RGBA", (nw, nh))
    op = out.load()
    for oy in range(nh):
        y0, y1 = oy * h // nh, max(oy * h // nh + 1, (oy + 1) * h // nh)
        for ox in range(nw):
            x0, x1 = ox * w // nw, max(ox * w // nw + 1, (ox + 1) * w // nw)
            sr = sg = sb = sa = wsum = 0.0
            acount = 0
            for y in range(y0, y1):
                for x in range(x0, x1):
                    r, g, b, a = px[x, y]
                    sa += a
                    acount += 1
                    if a == 0:
                        continue
                    mx, mn = max(r, g, b), min(r, g, b)
                    sat = (mx - mn) / mx if mx else 0.0
                    # 1.0 が従来の面積平均。彩度で最大4倍まで重くする
                    wt = (1.0 + 3.0 * sat) * (a / 255)
                    sr += r * wt; sg += g * wt; sb += b * wt; wsum += wt
            if wsum > 0:
                op[ox, oy] = (round(sr / wsum), round(sg / wsum), round(sb / wsum),
                              round(sa / max(acount, 1)))
            else:
                op[ox, oy] = (0, 0, 0, 0)
    return out


ACCENT_SLOTS = 5        # パレット28色のうち、差し色のために空けておく枠


def _hue_sat(r, g, b):
    mx, mn = max(r, g, b), min(r, g, b)
    if not mx or mx == mn:
        return 0.0, 0.0
    d = mx - mn
    if mx == r:   hue = ((g - b) / d) % 6
    elif mx == g: hue = (b - r) / d + 2
    else:         hue = (r - g) / d + 4
    return hue * 60.0, d / mx


def build_palette(rgba: Image.Image, colors: int = COLORS, accent_slots: int = ACCENT_SLOTS):
    """減色用のパレットを作る。差し色のぶんを先に取り置く。

    多数派の色だけでパレットを組むと、狭い差し色が最寄りの多数派に吸われて
    消える。ツッパニャンの青い目で実測すると、縮小直後は33px残っていたのに
    MEDIANCUT 28色を通した時点で**0px**になっていた(2026-08-10)。
    体のピンクが画面の大半を占めるため、色空間の分割がピンク側に集中する。

    「彩度が高い画素」だけで選ぶと体のピンクも該当してしまうので、
    **主要な色相から離れていること**を条件にする。目・くちばし・差し色は
    地の色と色相が違うから目立つ、という性質をそのまま使う。

    離れ方は100°以上。40°程度まで緩めると、地の色の陰影(クリーム色の体が
    黄色寄りに転ぶ等)を差し色と誤認し、モコロンの顔に黄色い点が散った
    (2026-08-10、実際にそうなって直した)。実測での候補数:

        色相差    40°以上   100°以上
        モコロン      39        4     ← 陰影。拾ってはいけない
        ツッパニャン  27       27     ← 目。拾いたい

    さらに面積が1%未満のものは枠を割かない。数個の点のために色を1つ
    確保すると、その色が他の場所にも現れてノイズになる。
    """
    MIN_HUE_DIST = 100.0
    MIN_SHARE = 0.01
    rgb = rgba.convert("RGB")
    base = rgb.quantize(colors=colors - accent_slots, method=Image.MEDIANCUT)
    data = list(base.getpalette()[: (colors - accent_slots) * 3])

    px = rgba.load(); w, h = rgba.size
    hist = {}
    pixels = []
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 140:
                continue
            hue, sat = _hue_sat(r, g, b)
            pixels.append((r, g, b, hue, sat))
            if sat >= 0.20:
                hist[int(hue) // 20] = hist.get(int(hue) // 20, 0) + 1

    if hist:
        main = max(hist, key=hist.get) * 20 + 10
        accents = [(r, g, b) for r, g, b, hue, sat in pixels
                   if sat >= 0.25
                   and min(abs(hue - main), 360 - abs(hue - main)) > MIN_HUE_DIST]
        if len(accents) < len(pixels) * MIN_SHARE:
            accents = []
        if accents:
            strip = Image.new("RGB", (len(accents), 1))
            strip.putdata(accents)
            k = min(accent_slots, len(set(accents)))
            data += list(strip.quantize(colors=k, method=Image.MEDIANCUT).getpalette()[: k * 3])

    data += [0] * (768 - len(data))
    pal = Image.new("P", (1, 1))
    pal.putpalette(data)
    return pal


def pixelize(im: Image.Image, height: int, palette=None):
    """3Dレンダ → ドット絵。手順はモジュールの説明どおり。"""
    w, h = im.size
    nw = max(1, round(w * height / h))
    small = saturation_weighted_resize(im, nw, height)   # 1. 面積平均(彩度で重み付け)

    rgb = ImageEnhance.Color(small.convert("RGB")).enhance(SATURATION)
    small = Image.merge("RGBA", (*rgb.split(), small.getchannel("A")))

    a = small.getchannel("A").point(lambda v: 255 if v >= 140 else 0)
    src_rgb = small.convert("RGB")
    q = src_rgb.quantize(palette=palette or build_palette(small), dither=Image.NONE)
    q = q.convert("RGBA"); q.putalpha(a)                # 2. 減色
    return despeckle(q)                                  # 3. ゴミ取り


def build(src_path: Path, name: str):
    src = trim(Image.open(src_path))

    # 1コマ目のパレットを基準にして、全コマの色を揃える(チラつき止め)
    # 基準パレットも差し色の枠を確保して作る。ここを素のMEDIANCUTに戻すと、
    # 全コマがそのパレットに揃えられるので差し色が全コマから消える。
    w0, h0 = src.size
    ref = saturation_weighted_resize(src, max(1, round(w0 * SIZE / h0)), SIZE)
    palette = build_palette(ref)

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
