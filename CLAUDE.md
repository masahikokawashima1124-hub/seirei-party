# せいれい まくらなげ大会（仮）

小学生向けのスマブラ風パーティーゲーム。まなびめぐる のキャラクター（はなびのこびと・きせつのせいれい）が、まくらを投げ合ってステージの外へ ふっとばし合う。一般配布を前提にする。

## 世界観のルール（必ず守る）
- まなびめぐるの設定資料 `C:\Users\admin\my-first-repo\summer-study-app\character-bible.md` に「対戦・バトル・能力バトルは禁止」とある。このゲームは **「遊びで競う」形（まくら投げ）にする** とユーザーが決めた（2026-10-24）。
- 「たおす」「こうげき」「ダメージ」など戦いの言葉は画面に出さない。使う言葉：まくら、ぽよん、ふっとび、ふうせん、かち。
- キャラの名前・口ぐせ・性格は character-bible.md に合わせる。
- 「スマブラ」は他社の作品名。名前や見た目を似せすぎない。

## 技術構成
- Phaser 4 + TypeScript + Vite（my-game と同じ）。画面は横持ち 1280x720。Arcade 物理。
- 開発サーバーは port 5174（`npm run dev`）。親フォルダの `.claude/launch.json` の `seirei`。

## フォルダ
- `src/characters.ts` … 出場キャラと性能（速さ・ジャンプ・重さ・まくらの大きさ）
- `src/battle/rules.ts` … ふっとびの計算、ふうせんの数など（テストあり `npm test`）
- `src/battle/Fighter.ts` … キャラの動き（移動・3段ジャンプ・まくら・ぽよん・伸び縮みの見た目）
- `src/battle/controllers.ts` … 人の操作（キーボード＋画面ボタン）とコンピュータ。ボタン配置は `touchLayout()`（solo／p1／p2）
- 遊び方は3つ：`cpu`（ひとりで）、`versus`（1台を2人で。画面の左半分が1P、右半分が2P）、`online`（2だいで。通信）。キャラえらびの最初に選ぶ
- `src/net/` … 2だいで遊ぶしくみ。PeerJS の無料の取り次ぎサーバー（0.peerjs.com、登録不要）で相手を見つけ、あとは2台が WebRTC で直接やりとりする。へやばんごう（4けた）→ peer ID `seirei-party-v1-<番号>`
  - 親（へやを つくった人＝1P）がゲームを全部計算し、様子（キャラ・まくら・演出）を約60回/秒で子へ送る。子（2P）は操作を送って、届いた様子を映すだけ（`Fighter.makeRemote`）
  - 送るデータの形は `protocol.ts`。形を変えたら `PROTOCOL_VERSION` と ID の `v1` を上げる（古い版どうしが混ざらないように）
  - 画面は `LobbyScene`（へやを つくる／はいる）。切れたら `showLost`（8秒なにも来なければ切れたとみなす）
  - 弱点：中継（TURN）サーバーが無いので、ちがう回線どうし（スマホの電波と家のWi-Fiなど）だと、つながらないことがある。同じWi-Fiなら ほぼ つながる
- `src/battle/stage.ts` … ステージ「なつまつり」の足場と背景
- `src/scenes/` … Boot → Title → Select → Battle → Result

## キャラクター画像
- 元画像：`E:\小学生学習アプリ\キャラクター4方向画像\`（全160体。4方向が1枚に並ぶ、灰色背景）。
- `npm run sprites` で 2番目（ななめ向き）を切り出して背景を透明にし、`public/assets/chars/<id>.png`（高さ256）に保存する。キャラを足すときは `scripts/extract-sprites.mjs` の CHARACTERS と `src/characters.ts` の両方に追加する。
- 切り出した画像が左向きなら `facesLeft: true`。
- 画像は Higgsfield（nano_banana_pro）で作ったもの。ライセンスの扱いは my-first-repo の `summer-study-app/ASSETS.md` を参照。

## コマンド
- `npm run dev` / `npm run build` / `npm test`
- `npm run deploy` … GitHub Pages へ公開。**公開中** https://masahikokawashima1124-hub.github.io/seirei-party/ （リポジトリ masahikokawashima1124-hub/seirei-party、公開設定）

## 動作確認のコツ
- アプリ内ブラウザが隠れていると描画が止まる。開発中は `window.game` があるので、`game.step(now, 16)` で進めるか、Edge を裏で動かす playwright-core で撮影する。
