#!/usr/bin/env python3
"""AIが1枚に描いたコマ並びを、そのまま使えるスプライトシートに整える。

Gemini(Nano Banana)は「4コマを横に並べた絵」までは描いてくれる。
姿勢そのものが違うコマ(しゃがむ・伸び上がる)が手に入るのが利点で、
潰す/伸ばすだけの tools/spritegen/idle.py では作れない動きになる。

ただし**そのままでは使えない**。ここで整える:

  1. 白背景を抜き、縦の空白列でコマに分割
  2. **全コマを同じ倍率で縮小する。** コマごとに高さを揃えてはいけない——
     「伸び上がっている」「縮んでいる」という動きそのものが消える
  3. 面積平均で縮小 → 彩度を上げて減色 → ゴミ取り → **輪郭を引き直す**
     元絵の輪郭は4倍以上の縮小で飛ぶので、最近傍で保とうとしても欠ける。
     色は面積平均で作り、輪郭は後から引くのが確実(2026-08-09 実測)
  4. 足元の重心で横位置を、下辺で縦位置を揃える

使い方:
  python3 tools/spritegen/fromsheet.py <画像> --name ride
"""
import argparse, importlib.util
from pathlib import Path
from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "shared/sprites"

# 減色・ゴミ取り・輪郭は idle.py と同じものを使う(質感を揃えるため)
_spec = importlib.util.spec_from_file_location("idle", Path(__file__).with_name("idle.py"))
idle = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(idle)


def keyout_white(im: Image.Image, thr=238) -> Image.Image:
    """背景の白だけを抜く。

    しきい値は絵ごとに変える(--white)。既定は238。

    生成元は方眼紙の背景で、**罫線が(236,236,236)** と既定値のすぐ下にある。
    罫線が残る絵(ツッパニャンは頭の上に白い四角が浮いていた)では225まで
    下げると消える。

    **ただし一律に下げてはいけない。** キャラ自身の白が背景と地続きだと
    一緒に持っていかれる。実測(2026-08-10、11体を作り直して比較):

        モコロン    白系 1418→1488px   問題なし
        ツッパニャン 罫線が消える       下げたい
        ペンタマ    白系  131→**0**px  **腹が丸ごと消えた**
        レイバーン  白系  607→ 517px   一部欠けた

    なので既定は安全側の238に置き、必要な絵だけ `--white 225` を付ける。
    下げたときは必ず目で確認すること。

    **「白い画素を全部消す」ではいけない**(2026-08-09、颯太の指摘で発覚)。
    モコロンの毛、レイバーンの体、レジェンディアの脚のように
    キャラ自身が白いと、体の内側に穴が開いて禿げたように見える。

    なので**画像の縁から繋がっている白だけ**を塗りつぶしで抜く。
    キャラに囲まれた白は残る。 """
    from collections import deque
    im = im.convert("RGBA")
    px = im.load(); w, h = im.size

    def whiteish(p):
        return p[0] >= thr and p[1] >= thr and p[2] >= thr

    seen = bytearray(w*h)
    q = deque()
    for x in range(w):
        for y in (0, h-1):
            if whiteish(px[x, y]) and not seen[y*w+x]:
                seen[y*w+x] = 1; q.append((x, y))
    for y in range(h):
        for x in (0, w-1):
            if whiteish(px[x, y]) and not seen[y*w+x]:
                seen[y*w+x] = 1; q.append((x, y))

    while q:
        x, y = q.popleft()
        r, g, b, _ = px[x, y]
        px[x, y] = (r, g, b, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x+dx, y+dy
            if 0 <= nx < w and 0 <= ny < h and not seen[ny*w+nx] and whiteish(px[nx, ny]):
                seen[ny*w+nx] = 1; q.append((nx, ny))
    return im


def keep_main_blob(im: Image.Image, min_ratio=0.05) -> Image.Image:
    """本体から離れた小さいカタマリを落とす。

    生成元の絵は方眼紙の上に描かれていて、**グリッド線と枠線が薄いグレー**
    (純白ではない)。keyout_white は白しか抜かないので、この線が残って
    キャラの頭の上に白い四角が浮く(2026-08-10、颯太の指摘で発覚。
    ツッパニャンの頭上に出ていたもの)。

    閾値を下げて灰色まで抜く手もあるが、モコロンの毛のように**キャラ自身が
    白い**場合に体を削ってしまう(2026-08-09に一度やらかしている)。
    そこで「本体と繋がっていない小さい破片だけ落とす」方式にする。
    面積が最大のカタマリの min_ratio 未満のものを消すので、尻尾のような
    大きい離れパーツは残る。
    """
    from collections import deque
    im = im.convert("RGBA")
    px = im.load(); w, h = im.size
    label = [-1] * (w * h)
    sizes = []
    for sy in range(h):
        for sx in range(w):
            if px[sx, sy][3] == 0 or label[sy*w + sx] >= 0:
                continue
            idx = len(sizes); n = 0
            q = deque([(sx, sy)]); label[sy*w + sx] = idx
            while q:
                x, y = q.popleft(); n += 1
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x+dx, y+dy
                    if 0 <= nx < w and 0 <= ny < h and label[ny*w + nx] < 0 and px[nx, ny][3] > 0:
                        label[ny*w + nx] = idx; q.append((nx, ny))
            sizes.append(n)
    if not sizes:
        return im
    biggest = max(sizes)
    for y in range(h):
        for x in range(w):
            i = label[y*w + x]
            if i >= 0 and sizes[i] < biggest * min_ratio:
                r, g, b, _ = px[x, y]
                px[x, y] = (r, g, b, 0)
    return im


def split_frames(im: Image.Image, expect=None):
    """中身のある列を探し、空白列で区切る。"""
    w, h = im.size
    a = im.getchannel("A").load()
    filled = [any(a[x, y] > 0 for y in range(h)) for x in range(w)]
    runs, start = [], None
    for x, f in enumerate(filled):
        if f and start is None: start = x
        elif not f and start is not None: runs.append((start, x)); start = None
    if start is not None: runs.append((start, w))
    runs = [r for r in runs if r[1]-r[0] > w * 0.02]

    # コマ同士が接していると1つの塊になる。期待数に足りないときは、
    # 幅が飛び抜けている塊を等分して割る(モコロンで実際に起きた)
    if expect and len(runs) < expect and runs:
        widths = sorted(r[1]-r[0] for r in runs)
        unit = widths[0]          # 一番狭い塊を1コマ分とみなす
        split = []
        for x0, x1 in runs:
            n = max(1, round((x1-x0) / unit))
            step = (x1-x0) / n
            for k in range(n):
                split.append((round(x0+k*step), round(x0+(k+1)*step)))
        runs = split
        print(f"  接していた塊を分割 → {len(runs)}コマ")

    if expect and len(runs) != expect:
        print(f"  警告: {len(runs)}コマに分かれた(期待 {expect})")
    return [im.crop((x0, 0, x1, h)) for x0, x1 in runs]


def foot_center(im: Image.Image) -> float:
    """下から20%にある中身の横方向の重心。ここを揃えると足がぶれない。"""
    w, h = im.size
    a = im.getchannel("A").load()
    xs = [x for y in range(int(h*0.8), h) for x in range(w) if a[x, y] > 0]
    return sum(xs)/len(xs) if xs else w/2


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source")
    ap.add_argument("--name", required=True)
    ap.add_argument("--size", type=int, default=44, help="一番大きいコマの高さ")
    ap.add_argument("--colors", type=int, default=30)
    ap.add_argument("--sat", type=float, default=1.25)
    ap.add_argument("--frames", type=int, default=4)
    ap.add_argument("--white", type=int, default=238,
                    help="背景として抜く白のしきい値。既定238。方眼紙の罫線(236)が"
                         "残る絵では225まで下げる。ただし**キャラ自身の白が背景と"
                         "地続きだと一緒に消える**ので、下げたら必ず目で確認すること"
                         "(ペンタマの白い腹が全部消えた実例あり)")
    ap.add_argument("--grid", help="2x2 のように指定すると、縦横に等分してコマにする。"
                                   "**1コマに2体いる絵はこちらを使う**"
                                   "(空白で切る自動分割だと、2体を別コマと数えてしまう)")
    ap.add_argument("--center", action="store_true",
                    help="足の重心ではなく絵の中心で横位置を揃える。2体並びのときはこちら")
    a = ap.parse_args()

    if a.grid:
        rows, cols = (int(v) for v in a.grid.lower().split("x"))
        raw = Image.open(a.source).convert("RGB")
        W, H = raw.size
        inset = int(min(W, H) * 0.03)          # 罫線を確実に外す
        frames = []
        for ry in range(rows):
            for cx in range(cols):
                cell = keyout_white(raw.crop((cx*W//cols + inset, ry*H//rows + inset,
                                              (cx+1)*W//cols - inset, (ry+1)*H//rows - inset)),
                                    thr=a.white)
                b = cell.getbbox()
                frames.append(cell.crop(b) if b else cell)
        print(f"  格子 {a.grid} で分割: {len(frames)}コマ")
    else:
        src = keyout_white(Image.open(a.source), thr=a.white)
        frames = [f.crop(f.getbbox()) for f in split_frames(src, a.frames)]

    # 罫線・枠線の残骸を落としてから縮小する。縮小後だと数pxになっていて
    # 本体との区別がつかない
    frames = [keep_main_blob(f) for f in frames]
    frames = [f.crop(f.getbbox() or (0, 0, f.width, f.height)) for f in frames]
    print(f"  分割: {len(frames)}コマ / 元の高さ {[f.height for f in frames]}")

    # 縮小は彩度で重み付けする(idle.py 側の説明を参照)。ただのBOXだと
    # 目のような狭くて鮮やかな特徴が周りの色に薄められて消える。
    scale = a.size / max(f.height for f in frames)      # 全コマ共通の倍率
    smalls = [idle.saturation_weighted_resize(
                  f, max(1, round(f.width*scale)), max(1, round(f.height*scale)))
              for f in frames]

    # 共通パレット。全コマを繋げた画像から作ると、コマ間の色ブレが消える
    strip = Image.new("RGBA", (sum(s.width for s in smalls), a.size), (0, 0, 0, 0))
    x = 0
    for s in smalls:
        strip.paste(s, (x, a.size - s.height)); x += s.width
    # 素のMEDIANCUTだと、面積の小さい差し色(目など)にパレットの枠が回らず
    # 最寄りの多数派に吸われて消える。差し色ぶんの枠を先に確保する。
    strip_rgb = ImageEnhance.Color(strip.convert("RGB")).enhance(a.sat)
    strip_enh = Image.merge("RGBA", (*strip_rgb.split(), strip.getchannel("A")))
    pal = idle.build_palette(strip_enh, colors=a.colors)

    outs = []
    for s in smalls:
        e = ImageEnhance.Color(s.convert("RGB")).enhance(a.sat)
        q = e.quantize(palette=pal, dither=Image.NONE).convert("RGBA")
        q.putalpha(s.getchannel("A").point(lambda v: 255 if v >= 128 else 0))
        outs.append(idle.outline(idle.despeckle(q)))

    cw = max(o.width for o in outs) + 4
    ch = a.size + 4
    anchors = ([o.width/2 for o in outs] if a.center else [foot_center(o) for o in outs])
    sheet = Image.new("RGBA", (cw*len(outs), ch), (0, 0, 0, 0))
    for i, o in enumerate(outs):
        sheet.paste(o, (i*cw + round(cw/2 - anchors[i]), ch - o.height), o)

    OUT.mkdir(parents=True, exist_ok=True)
    p = OUT / f"{a.name}-idle.png"
    sheet.save(p)
    sheet.crop((0, 0, cw, ch)).save(OUT / f"{a.name}.png")
    print(f"  出力: {p.name}  1コマ {cw}x{ch} × {len(outs)}コマ  {p.stat().st_size/1024:.1f}KB")


if __name__ == "__main__":
    main()
