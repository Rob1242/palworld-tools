# spritegen — 相棒(マスコット)の絵を作る

| ファイル | 役割 |
|---|---|
| `idle.py` | AIを使わず、1枚の絵を潰す/伸ばすだけで4コマを作る。姿勢は変わらない |
| `gen.py` | Gemini APIで4コマを描かせる。**画像生成は無料枠が0なので課金が要る**(2026-08-09 確認) |
| `fromsheet.py` | AIが描いた「4コマ1枚」を、使えるスプライトシートに整える |
| `sources/` | Geminiに描かせた元画像。ここから何度でも作り直せる |

## 通常

    python3 tools/spritegen/fromsheet.py tools/spritegen/sources/map.png --name map

## 1コマに2体いる絵(アイテム図鑑のウゴクゾー+ノロウゾー)

空白で切る自動分割だと**2体を別コマと数えてしまう**。格子指定と中心揃えを使う:

    python3 tools/spritegen/fromsheet.py tools/spritegen/sources/items.png --name items --grid 2x2 --center

## 絵を作り直したら

`shared/arcade.js` の `var V = "?v=..."` を上げること。上げないと古い絵を掴む。
