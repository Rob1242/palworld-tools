"""
出現マップ・パル像マップ用のLeafletタイルピラミッドを生成する。

本土(palpagos)は Nifrendil/pal-atlas 由来の4096px素材
(game_data/maps/_sources/palpagos_pal-atlas.webp) を使うが、この画像は
現行の world_map_3072.webp とは光る縁取り(視界マスク)の見た目が違う。
実際にはSIFT特徴点マッチングで地形そのものはほぼ同一位置・同一縮尺と
確認済み(docs/superpowers/specs/2026-07-27-leaflet-tile-map-design.md
「1. 本土マップの位置合わせ校正」参照)。そこで既存の正規化座標データ
(0〜1のx/y)をそのまま使えるよう、pal-atlas画像側をアフィン補正して
既存の座標系に合わせてから4096pxでタイル化する。

世界樹(worldtree)は元々pal-atlas由来のgame_data/maps/worldtree.webpを
そのまま使っているため補正不要(恒等変換)。

再実行可能: このスクリプトは何度実行しても同じ結果になる。
"""
import math
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / "game_data" / "maps" / "_sources"
TILES_OUT = ROOT / "game_data" / "maps" / "tiles"

TILE_SIZE = 256
NATIVE_SIZE = 4096  # both regions end up at this resolution after correction
MAX_ZOOM = int(math.log2(NATIVE_SIZE / TILE_SIZE))  # 4096/256=16 -> zoom 0..4

# SIFTフィッティング結果(2026-07-28、元画像を正規化座標系でRANSACアフィン推定)。
# x' = a*x + b*y + tx, y' = c*x + d*y + ty (正規化 0-1 空間)
# 詳細: docs/superpowers/specs/2026-07-27-leaflet-tile-map-design.md
PALPAGOS_CORRECTION_NORM = {
    "a": 1.00061334, "b": 0.00002798, "tx": -0.00953835,
    "c": 0.00001513, "d": 1.00060018, "ty": -0.06849772,
}


def correction_matrix_px(native_size):
    """正規化空間のアフィン行列を、native_sizeピクセル単位のcv2.warpAffine用行列に変換する。

    フィットしたMは「旧座標→pal-atlas座標」の向き。cv2.warpAffine(src, W, size)は
    dst(xy) = src(W^-1 @ xy) という逆写像で実装されているため、
    dst(旧座標) = pal-atlas画像( M(旧座標) ) を得るには W = M^-1 を渡す必要がある。
    """
    import cv2  # local import: PIL専用の他ページビルドスクリプトに影響しないよう遅延import

    c = PALPAGOS_CORRECTION_NORM
    m_norm = np.array([
        [c["a"], c["b"], c["tx"]],
        [c["c"], c["d"], c["ty"]],
        [0.0, 0.0, 1.0],
    ], dtype=np.float64)
    m_norm_inv = np.linalg.inv(m_norm)
    # 正規化(0-1)のtx,tyだけをnative_size倍にスケールし、a/b/c/dはスケール不変なのでそのまま
    m_px_inv = m_norm_inv[:2].copy()
    m_px_inv[:, 2] *= native_size
    return m_px_inv, cv2


def build_corrected_palpagos():
    """pal-atlas本土画像を既存の座標系に合わせて補正し、4096x4096のRGB配列を返す。"""
    src_path = SOURCES / "palpagos_pal-atlas.webp"
    if not src_path.exists():
        raise FileNotFoundError(
            f"{src_path} が無い。Nifrendil/pal-atlas の public/maps/palpagos.webp を"
            f"取得して置くこと(MITライセンス、既にworldtree.webpも同プロジェクト由来)。"
        )
    src = Image.open(src_path).convert("RGB")
    assert src.size == (NATIVE_SIZE, NATIVE_SIZE), f"想定外のソース解像度: {src.size}"

    M, cv2 = correction_matrix_px(NATIVE_SIZE)
    arr = np.array(src)
    warped = cv2.warpAffine(
        arr, M, (NATIVE_SIZE, NATIVE_SIZE),
        flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_CONSTANT, borderValue=(4, 6, 10),
    )
    return Image.fromarray(warped)


def build_worldtree():
    """世界樹画像は補正不要、そのまま読み込むだけ。"""
    src_path = ROOT / "game_data" / "maps" / "worldtree.webp"
    im = Image.open(src_path).convert("RGB")
    assert im.size == (NATIVE_SIZE, NATIVE_SIZE), f"想定外のworldtree解像度: {im.size}"
    return im


def generate_tiles(master_image, region_name):
    out_root = TILES_OUT / region_name
    total_tiles = 0
    for zoom in range(MAX_ZOOM + 1):
        world_size = TILE_SIZE * (2 ** zoom)
        resized = master_image.resize((world_size, world_size), Image.LANCZOS)
        tiles_per_axis = world_size // TILE_SIZE
        zoom_dir = out_root / str(zoom)
        zoom_dir.mkdir(parents=True, exist_ok=True)
        for ty in range(tiles_per_axis):
            for tx in range(tiles_per_axis):
                box = (tx * TILE_SIZE, ty * TILE_SIZE, (tx + 1) * TILE_SIZE, (ty + 1) * TILE_SIZE)
                tile = resized.crop(box)
                tile.save(zoom_dir / f"{tx}_{ty}.webp", "WEBP", quality=88, method=6)
                total_tiles += 1
    print(f"[{region_name}] zoom 0..{MAX_ZOOM} 完了、{total_tiles}枚出力 -> {out_root}")


def main():
    print("本土(palpagos)マップを位置合わせ補正中...")
    palpagos = build_corrected_palpagos()
    generate_tiles(palpagos, "palpagos")

    print("世界樹(worldtree)マップを読み込み中...")
    worldtree = build_worldtree()
    generate_tiles(worldtree, "worldtree")

    print("完了。")


if __name__ == "__main__":
    main()
