# palwatch — サーバーの様子を見て、声でやり取りする

Palworld専用サーバーのセーブデータを読んで、出来事を知らせたりObsidianに書き留めたり、
声で質問に答えたりする。Macで動かす。

## なぜこの作りなのか

Palworldにはゲーム内チャットを読む手段が無く、Botがプレイヤーとして参加することもできない
(マイクラのMineflayerのようなものが存在しない)。そこで**ゲームの外側**で成立させている。

- 出力: Macから声、必要ならサーバーのREST APIでゲーム内にもテキスト表示
- 入力: **Macのマイク**で受ける。PS5で遊びながらMacに話しかける想定
- データ: サーバー側(VM)が5分ごとに更新しているバックアップを読む

音声はすべてMac内で処理され、外部には送られない。

## 準備

```bash
brew install sox whisper-cpp
mkdir -p ~/.local/share/whisper && cd ~/.local/share/whisper
curl -LO https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin
```

`config.example.json` をコピーして `config.json` を作り、合言葉などを埋める。
**config.json は合言葉とAPIキーを含むので、絶対にコミットしないこと**(.gitignore済み)。

初回の録音時にmacOSのマイク許可を求められるので、許可する。

## 使い方

```bash
node palwatch.mjs            # 1回だけ確認して、変化があれば知らせる
node palwatch.mjs --watch    # 常駐(既定5分ごと)。遊ぶ時はこれを立ち上げておく
node palwatch.mjs --talk     # 話しかけモード。Enterを押してから喋る
node palwatch.mjs --advice   # 拠点編成の助言だけ
node palwatch.mjs --quiet    # 声を出さず記録だけ
```

## 話しかけて答えられること

ゲームのデータで確実に答えられる範囲に絞っている(外部のAIには繋いでいない)。

- 「今何体いる」 → 所持数と種類数
- 「図鑑は何種類そろってる」 → 進捗と残り
- 「一番強いパルは」 → 個体値合計が最大の個体
- 「拠点はどうすればいい」 → 手薄な役職・余っている役職・各役職の最適個体
- 「アヌビスは何体いる」 → その種の所持数と最良個体

聞き取りではカタカナが崩れることがあるため(「セクメト」→「セクメと」)、
パル名は平仮名に寄せて照合している。

## ファイル構成

| ファイル | 役割 |
|---|---|
| `events.mjs` | 前回との差分から出来事を組み立てる(検知のみ) |
| `outputs.mjs` | 読み上げとObsidianへの追記 |
| `base-advice.mjs` | 拠点プランナーと同じ作業速度テーブルで手持ちを評価 |
| `voice.mjs` | 録音・文字起こし・意図判定 |
| `palwatch.mjs` | 上記をまとめる本体 |

## 調整できるところ

`config.json` で変えられる。

- `voice` — 声(`Kyoko` / `Eddy` / `Flo` / `Grandma` / `Grandpa`)
- `speakMinWeight` — この重要度以上の出来事だけ読み上げる(既定3)
- `maxSpeechPerTick` — 1回にまとめて喋る上限(既定3)
- `intervalMinutes` — 見守りの間隔(既定5分)
- `voiceSilenceSec` — 何秒黙ったら話し終わりとみなすか(既定1.2秒)

## まだやっていないこと

呼びかけ語(「ルナ」と言ったら反応する)は未実装。Porcupineなどを使えば実現できるが、
アクセスキーの取得が要るのと、ゲーム音が鳴っている環境では誤検知が増えるため、
まずEnterを押す方式で確実に動かしている。
