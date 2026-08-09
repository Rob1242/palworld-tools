#!/usr/bin/env python3
"""1枚のパル画像から、ドット絵のアニメーション用コマを作る。

流れ:
  元画像 → Gemini の画像モデルでポーズ違いを生成 → 後処理で「本物のドット絵」に
  揃える → 横並びのスプライトシート + CSS を出力

**後処理が肝心。** AIが出す絵はコマごとに色も大きさもズレるので、そのままでは
アニメにならない。ここでやること:
  1. 余白を切って、被写体の footprint(足元・幅)で位置を揃える
  2. 最近傍で N px に落とす → 実際にピクセルの粒が揃う
  3. **1コマ目から作った色パレットに全コマを強制的に合わせる** → 色のチラつきが消える

使い方:
  export GEMINI_API_KEY=...          # AI Studio で取得したキー
  python3 tools/spritegen/gen.py --list                  # 使えるモデルを見る
  python3 tools/spritegen/gen.py ペコドン.png --name pecodon
  python3 tools/spritegen/gen.py ペコドン.png --name pecodon --size 48 --colors 24
"""
import argparse, base64, json, os, sys, urllib.request, urllib.error
from pathlib import Path
from PIL import Image

API = "https://generativelanguage.googleapis.com/v1beta"

# 各コマで頼むポーズ。**元の姿を変えず、動きだけ変える**ように書く。
# 「同じキャラ」「同じ向き」「同じ大きさ」を毎回明示しないと別物が出てくる。
FRAMES = [
    ("idle1", "standing still, neutral idle pose"),
    ("idle2", "the same idle pose but squashed slightly downward, body compressed, as the down-beat of a breathing idle animation"),
    ("blink", "the same idle pose with both eyes closed (blinking)"),
    ("wave",  "the same standing pose but one front arm raised in a friendly wave"),
]

BASE_PROMPT = (
    "Pixel art sprite of THIS EXACT creature, faithful to the reference: same colours, "
    "same proportions, same facing direction, same size and position in frame. "
    "Retro 16-bit game sprite, chunky visible pixels, flat cel shading, hard edges, "
    "no anti-aliasing, no gradients, no outline glow, transparent background, "
    "full body visible, centred, feet at the bottom. "
    "Pose: {pose}."
)


def http_json(url, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"},
        method="POST" if data else "GET")
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        sys.exit(f"APIエラー {e.code}\n{body[:1200]}")


def pick_model(key, override=None):
    """画像を返せるモデルを実際に問い合わせて選ぶ。モデル名を決め打ちしない。"""
    models = http_json(f"{API}/models?key={key}").get("models", [])
    names = [m["name"].split("/")[-1] for m in models]
    if override:
        if override not in names:
            sys.exit(f"{override} は使えない。候補:\n  " + "\n  ".join(names))
        return override
    cands = [n for n in names if "image" in n and "embedding" not in n]
    if not cands:
        sys.exit("画像を出せるモデルが見つからない。--list で一覧を確認して --model で指定して。")
    cands.sort(key=lambda n: ("preview" in n, "pro" not in n))   # pro / 安定版を優先
    return cands[0]


def generate(key, model, src_b64, pose, out: Path):
    payload = {
        "contents": [{"parts": [
            {"text": BASE_PROMPT.format(pose=pose)},
            {"inline_data": {"mime_type": "image/png", "data": src_b64}},
        ]}],
        "generationConfig": {"responseModalities": ["IMAGE"]},
    }
    res = http_json(f"{API}/models/{model}:generateContent?key={key}", payload)
    for cand in res.get("candidates", []):
        for part in cand.get("content", {}).get("parts", []):
            blob = part.get("inline_data") or part.get("inlineData")
            if blob and blob.get("data"):
                out.write_bytes(base64.b64decode(blob["data"]))
                return True
    print(f"  画像が返らなかった: {json.dumps(res)[:400]}", file=sys.stderr)
    return False


def trim(im: Image.Image) -> Image.Image:
    """透明な余白を落とす。背景が不透明で返ってきた場合は四隅の色を透明とみなす。"""
    im = im.convert("RGBA")
    if im.getextrema()[3][0] == 255:                 # 完全不透明 = 背景が塗られている
        bg = im.getpixel((0, 0))
        px = im.load()
        w, h = im.size
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if abs(r-bg[0]) < 18 and abs(g-bg[1]) < 18 and abs(b-bg[2]) < 18:
                    px[x, y] = (r, g, b, 0)
    box = im.getbbox()
    return im.crop(box) if box else im


def pixelate(im: Image.Image, size: int) -> Image.Image:
    """縦を size に揃えて最近傍で落とす。横は比率維持。**足元を基準に揃える。**"""
    im = trim(im)
    w, h = im.size
    nw = max(1, round(w * size / h))
    return im.resize((nw, size), Image.NEAREST)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source", nargs="?", help="元になるパルの画像")
    ap.add_argument("--name", default="sprite", help="出力名")
    ap.add_argument("--size", type=int, default=40, help="1コマの高さ(px)")
    ap.add_argument("--colors", type=int, default=20, help="使う色数")
    ap.add_argument("--model", help="モデルを指定する")
    ap.add_argument("--list", action="store_true", help="使えるモデルを表示して終了")
    ap.add_argument("--outdir", default="shared/sprites")
    ap.add_argument("--keep-raw", action="store_true", help="1コマずつのpngも残す")
    ap.add_argument("--raw", action="store_true",
                    help="整える処理をせず、生成したものをそのまま並べる(まず素の状態を見たいとき)")
    ap.add_argument("--fps", type=float, default=6, help="コマ送りの速さ")
    a = ap.parse_args()

    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        sys.exit("GEMINI_API_KEY が無い。 export GEMINI_API_KEY=... してから実行して。")

    if a.list:
        for m in http_json(f"{API}/models?key={key}").get("models", []):
            print(" ", m["name"].split("/")[-1])
        return
    if not a.source:
        sys.exit("元画像を渡して。例: python3 tools/spritegen/gen.py ペコドン.png --name pecodon")

    model = pick_model(key, a.model)
    print(f"モデル: {model}")

    src_b64 = base64.b64encode(Path(a.source).read_bytes()).decode()
    raw_dir = Path("/tmp/spritegen"); raw_dir.mkdir(exist_ok=True)

    frames = []
    for label, pose in FRAMES:
        out = raw_dir / f"{a.name}-{label}.png"
        print(f"  生成: {label} ... ", end="", flush=True)
        if generate(key, model, src_b64, pose, out):
            frames.append((label, Image.open(out)))
            print("OK")
    if not frames:
        sys.exit("1枚も生成できなかった。")

    # --- 後処理。--raw なら飛ばして、生成されたものをそのまま並べる ---
    small = [(l, pixelate(im, a.size)) for l, im in frames]
    cw = max(im.width for _, im in small)

    fixed = []
    if a.raw:
        for label, im in small:
            canvas = Image.new("RGBA", (cw, a.size), (0, 0, 0, 0))
            canvas.paste(im, ((cw - im.width) // 2, a.size - im.height))
            fixed.append((label, canvas))
    else:
        # 1コマ目の色を基準パレットにして、全コマをそこへ寄せる
        base = small[0][1].convert("RGB").quantize(colors=a.colors, method=Image.MEDIANCUT)
        for label, im in small:
            q = im.convert("RGB").quantize(palette=base, dither=Image.NONE).convert("RGBA")
            q.putalpha(im.getchannel("A").point(lambda v: 255 if v > 128 else 0))
            canvas = Image.new("RGBA", (cw, a.size), (0, 0, 0, 0))
            canvas.paste(q, ((cw - q.width) // 2, a.size - q.height))   # 足元を下辺に揃える
            fixed.append((label, canvas))

    sheet = Image.new("RGBA", (cw * len(fixed), a.size), (0, 0, 0, 0))
    for i, (_, im) in enumerate(fixed):
        sheet.paste(im, (i * cw, 0))
    outdir = Path(a.outdir); outdir.mkdir(parents=True, exist_ok=True)
    sheet_path = outdir / f"{a.name}-sheet.png"
    sheet.save(sheet_path)

    if a.keep_raw:
        for label, im in fixed:
            im.save(outdir / f"{a.name}-{label}.png")

    # そのまま見られるGIF。4倍に拡大しておく(等倍だと小さすぎて判断できない)
    scale = 4
    big = [im.resize((cw*scale, a.size*scale), Image.NEAREST) for _, im in fixed]
    gif_path = outdir / f"{a.name}.gif"
    big[0].save(gif_path, save_all=True, append_images=big[1:],
                duration=int(1000/a.fps), loop=0, disposal=2, transparency=0)

    print(f"\n出力:")
    print(f"  {gif_path}        ← まずこれを開いて、コマ送りが成立しているか見る")
    print(f"  {sheet_path}  ({cw}x{a.size} × {len(fixed)}コマ, {sheet_path.stat().st_size/1024:.1f}KB)")
    print(f"""
CSS(表示は4倍に拡大する例):
  .pal-anim{{
    width:{cw*4}px; height:{a.size*4}px;
    background:url("{sheet_path}") 0 0 / {cw*len(fixed)*4}px {a.size*4}px no-repeat;
    image-rendering:pixelated;
    animation:palAnim {len(fixed)*0.18:.2f}s steps({len(fixed)}) infinite;
  }}
  @keyframes palAnim{{ to {{ background-position:-{cw*len(fixed)*4}px 0; }} }}
""")


if __name__ == "__main__":
    main()
