#!/usr/bin/env python3
"""パルの画像1枚から、待機モーション4コマを Gemini に描かせる。

**4コマを別々に生成してはいけない。** 別リクエストにすると、色も大きさも
向きも揃わない。「4コマを横一列に並べた1枚」として描かせると、モデルが
自分でコマ間の一貫性を取る(2026-08-09、画面で試して確認)。

出てきた1枚は tools/spritegen/fromsheet.py で切り分けて整える。
姿勢そのものが変わるコマが手に入るのがこの経路の価値で、
潰す/伸ばすだけの idle.py では「収縮しているだけ」に見える。

使い方:
  export GEMINI_API_KEY=...
  python3 tools/spritegen/gen.py --all          # 未生成のパルをまとめて
  python3 tools/spritegen/gen.py --only map     # 1体だけ
  python3 tools/spritegen/gen.py --list         # 使えるモデルを見る

**キーはファイルに書かないこと。** 環境変数だけで渡す。
"""
import argparse, base64, json, os, sys, time, urllib.request, urllib.error
from pathlib import Path

API = "https://generativelanguage.googleapis.com/v1beta"
ROOT = Path(__file__).resolve().parents[2]
SRC_DIR = ROOT / "tools/spritegen/sources"

ICON = "game_data/icons/pals/"

# ページ用の名前 → (元画像, そのパルらしい動き)
# **パルごとに動きを変える。** 全員が同じ呼吸をしていると、
# 11体並べたときに「同じ処理をかけただけ」に見える。
PALS = {
    "home":     (ICON+"T_SheepBall_icon_normal.webp",
                 "もぐもぐと口を動かして草を食べている。噛むたびに体が少し弾む"),
    "dex":      (ICON+"T_PinkCat_icon_normal.webp",
                 "尻尾を左右に振りながら、時々耳がピクッと動く"),
    "breeding": (ICON+"T_ChickenPal_icon_normal.webp",
                 "地面を軽くついばむ。頭を下げて、上げて、きょろきょろする"),
    "palbox":   (ICON+"T_Carbunclo_icon_normal.webp",
                 "尻尾をパタパタと振る。耳も一緒に揺れる"),
    "combat":   (ICON+"T_Kitsunebi_icon_normal.webp",
                 "尻尾の炎がゆらゆらと揺れる。体はほとんど動かさず、炎の形だけ変える"),
    "base":     (ICON+"T_FlowerRabbit_icon_normal.webp",
                 "その場で小さく跳ねる。着地で少し潰れ、跳んだ瞬間に伸びる"),
    "map":      (ICON+"T_Penguin_icon_normal.webp",
                 "両方の翼をパタパタと上下させる。体はほとんど動かさない"),
    "items":    (ICON+"T_Hedgehog_icon_normal.webp",
                 "背中の針が逆立って、また寝る。針の角度だけを変える"),
    "boss":     (ICON+"T_Anubis_icon_normal.webp",
                 "腕を組んだまま、ゆっくり頷く。頭の角度だけを変える"),
    "tools":    (ICON+"T_Hedgehog_icon_normal.webp",
                 "背中の針が逆立って、また寝る。針の角度だけを変える"),
    "ride":     ("ペコドン.png",
                 "首を縮めてしゃがみ、また伸び上がる"),
}

PROMPT = (
    "この生き物を16bitゲーム風のドット絵にして、待機モーションの4コマを"
    "1枚の画像に横一列で並べてください。背景は白одно色で、方眼や枠線は描かないこと。"
    "4コマとも同じ生き物・同じ色・同じ向き・同じ大きさで、足元の高さを揃えること。"
    "太い暗色の輪郭線、平坦な塗り、粗いピクセル、アンチエイリアスやグラデーションは無し。"
    "動きは「{motion}」。4コマでその動きの各段階を描いてください。"
).replace("одно", "一")     # 打ち間違い対策(白一色)


def http(url, payload=None, timeout=180):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data,
                                 headers={"Content-Type": "application/json"},
                                 method="POST" if data else "GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        raise SystemExit(f"APIエラー {e.code}\n{body[:900]}")


def pick_model(key, override=None):
    """画像を返せるモデルをAPIに問い合わせて選ぶ。名前を決め打ちしない。"""
    names = [m["name"].split("/")[-1]
             for m in http(f"{API}/models?key={key}").get("models", [])]
    if override:
        if override not in names:
            raise SystemExit(f"{override} は使えない。候補:\n  " + "\n  ".join(names))
        return override
    cands = [n for n in names if "image" in n and "embedding" not in n]
    if not cands:
        raise SystemExit("画像を出せるモデルが無い。--list で確認して --model で指定して。")
    cands.sort(key=lambda n: ("lite" in n, "preview" in n))   # 安定版・上位を優先
    return cands[0]


def generate(key, model, src: Path, motion: str, out: Path) -> bool:
    payload = {
        "contents": [{"parts": [
            {"text": PROMPT.format(motion=motion)},
            {"inline_data": {"mime_type": "image/webp" if src.suffix == ".webp" else "image/png",
                             "data": base64.b64encode(src.read_bytes()).decode()}},
        ]}],
        "generationConfig": {"responseModalities": ["IMAGE"]},
    }
    res = http(f"{API}/models/{model}:generateContent?key={key}", payload)
    for cand in res.get("candidates", []):
        for part in cand.get("content", {}).get("parts", []):
            blob = part.get("inline_data") or part.get("inlineData")
            if blob and blob.get("data"):
                out.write_bytes(base64.b64decode(blob["data"]))
                return True
    print(f"    画像が返らなかった: {json.dumps(res)[:300]}", file=sys.stderr)
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--only", action="append", help="この名前だけ生成(複数可)")
    ap.add_argument("--model")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--force", action="store_true", help="既にある元画像も作り直す")
    a = ap.parse_args()

    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise SystemExit("GEMINI_API_KEY が無い。export してから実行して。")

    if a.list:
        for m in http(f"{API}/models?key={key}").get("models", []):
            print(" ", m["name"].split("/")[-1])
        return

    targets = a.only or (list(PALS) if a.all else [])
    if not targets:
        raise SystemExit("--all か --only <名前> を指定して。")

    model = pick_model(key, a.model)
    print(f"モデル: {model}\n")
    SRC_DIR.mkdir(parents=True, exist_ok=True)

    ok = []
    for name in targets:
        if name not in PALS:
            print(f"  {name}: 定義が無い"); continue
        rel, motion = PALS[name]
        src = ROOT / rel
        out = SRC_DIR / f"{name}.png"
        if out.exists() and not a.force:
            print(f"  {name:9} 既にある(--force で作り直し)"); ok.append(name); continue
        if not src.exists():
            print(f"  {name:9} 元画像が無い: {rel}"); continue
        print(f"  {name:9} 生成中… ({motion[:22]}…)", end="", flush=True)
        if generate(key, model, src, motion, out):
            print(f" OK  {out.stat().st_size/1024:.0f}KB")
            ok.append(name)
        time.sleep(2)          # 無料枠のレート制限に当たらないよう少し待つ

    print(f"\n生成できた: {len(ok)}件 → {SRC_DIR}")
    print("次: python3 tools/spritegen/fromsheet.py tools/spritegen/sources/<名前>.png --name <名前>")


if __name__ == "__main__":
    main()
