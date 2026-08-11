# 読み込み中スプライト(waiting-idle.png)用の Gemini プロンプト

カーテシー(`curtsy.png`)と**同じキャラ・同じ画風・別の動き**にする。
出来上がった画像は `tools/spritegen/sources/waiting.png` に置いて:

    python3 tools/spritegen/fromsheet.py tools/spritegen/sources/waiting.png \
      --name waiting --size 56 --colors 16

## 狙い

| | 起動演出(既存) | これ |
|---|---|---|
| 動き | カーテシー。**1回で終わる** | 待ち。**永久にループする** |
| コマの順 | 0→1→2→3 で止まる | 0→1→2→3→2→1 の往復 |

**往復ループなので、コマ0とコマ3が動きの両端になる。**
コマ3からコマ0に戻っても飛ばないよう、0と3は「同じ動きの左端と右端」にすること。

**頭は下げない。** カーテシーでは頭を下げたコマで赤い瞳が0pxになり、
一番の特徴が消えていた。待ちの動きでは全コマで正面を向かせ、瞳を残す。

---

## プロンプト(このまま Gemini に貼る)

```
Create a single horizontal sprite sheet with exactly 4 frames of the SAME
character, evenly spaced left to right on a plain pure-white background.

Character: the attached reference — a regal gothic-lolita queen in a black
dress with pale lavender-white hair and bright RED eyes.
Keep her design, colours and proportions identical to the reference in
every frame. Front-facing, full body, head to hem.

Animation: a calm IDLE WAIT loop — she stands and waits patiently.
This is NOT a bow and NOT a curtsy. Her head stays UP and her face stays
visible in all 4 frames.

The 4 frames are one continuous sway that will be played back and forth
(1-2-3-4-3-2-1...), so frame 1 and frame 4 must be the two END points of
the same motion:

  Frame 1  weight on her LEFT foot; skirt and hair swept slightly left;
           shoulders level
  Frame 2  passing through centre, rising slightly
  Frame 3  passing through centre, settling
  Frame 4  weight on her RIGHT foot; skirt and hair swept slightly right

The movement is small and elegant — a gentle side-to-side sway with the
skirt and hair trailing one beat behind. No walking, no arm waving,
no props, no fan.

CRITICAL REQUIREMENTS
- Her RED eyes must be clearly visible and open in ALL 4 frames.
- Head upright and facing the viewer in ALL 4 frames.
- Identical camera distance, identical eye height, and identical vertical
  position in all 4 frames, so she does not jump when the frames cycle.
- Pure white (#FFFFFF) background, nothing else on it.
- No grid lines, no guide lines, no frame borders, no numbers, no labels,
  no drop shadow, no ground shadow.
- No outline glow, no gradients on the background.
- Crisp flat colours with hard edges — this will be reduced to a 41x60
  pixel-art sprite, so avoid soft anti-aliased blending and fine detail
  that will not survive downscaling.
```

## 出来たら確認すること

1. **4コマとも赤い瞳が残っているか**(README の数えるコマンド)
2. **4コマとも目の高さが同じか** — ずれるとループでガタつく
3. コマ1とコマ4が左右対称の両端になっているか

3が崩れていると往復ループが不自然になる。その場合は
`shared/arcade.js` の `WAIT_FRAMES` を `[0,1,2,3]` の一方向ループに変えれば
逃げられるが、絵を直すほうがきれい。
