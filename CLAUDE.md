# CLAUDE.md — StaleList Triage for eBay（Claude Code向け引き継ぎ）

このファイルは、Claude Code がこのフォルダを開いたときに最初に読むための引き継ぎ書です。
作業の前に必ず `README.md` と `TASKS.md` も読んでください。残りの作業は `TASKS.md` の順番どおりに進めるのが前提です。

## これは何か

eBay Seller Hub の Active listings 画面で「売れない出品のトリアージ判定」をする、読み取り専用の Chrome 拡張（Manifest V3、v0.1.0 の MVP）。
位置づけは「消す判断を間違えないためのトリアージ」。終了や再出品を自動実行するツールではない。

背景（検証済みの事実）:
- 需要は Reddit（r/Ebay、r/eBaySellers、r/Flipping）の実投稿25件で確認済み。中心層は出品1,000〜3,500点の中堅〜大規模セラー。閾値の共通言語は「30日で判定、60〜90日で終了・再出品、6ヶ月〜1年で処分検討」で、プリセットはこれに合わせてある。
- 無料の先行拡張 AslWipe（フィルタ＋一括選択）が現役で存在する。本製品の差別化は「複合条件のトリアージ判定＋保護ルール＋ページ跨ぎ選択＋CSVレポート」であり、フィルタ単体ではない。
- eBay User Agreement は自動手段を広く禁じるため、設計は「表示中のページを読む＋判定を付ける＋選択を補助するまで」に固定してある。この線引きを動かさないこと。

## 絶対に守る制約（変更禁止）

1. **自動実行の禁止**: 終了 / 再出品 / Sell Similar ボタンをプログラムから押す機能、自動ページ巡回、バックグラウンド・定期実行、非表示エンドポイントへのリクエストを実装しない。
2. **データ送信の禁止**: 出品データを外部サーバへ送らない。外部通信はライセンスキー検証のみ（現状は未接続。下記参照）。
3. **権限の最小化**: `manifest.json` の permissions は `storage` / `downloads` のみ。host_permissions は eBay の Seller Hub 関連パターンに限定し、広げない（cookies / tabs / <all_urls> は追加しない）。実画面で確認できた場合に限り「狭める」方向の変更は可。
4. **保護ルールは常時ON**: 販売実績あり→Protected、入札ありオークション→Protected、価格フロア未満→Protected、ウォッチャー付きは最大でも Review 止まり（End candidate にしない）、複数数量は警告。これらをOFFにできる設定を作らない。
5. **無料機能の後付け有料化をしない**（無料＝Standardプリセット・現ページ・フラグ25件まで。Pro＝Gentle/カスタムルール・ページ跨ぎ・CSV・ルール保存・スコア）。
6. **ライセンス検証を偽装しない**: 決済基盤（Lemon Squeezy）は未開設で `config/license-config.js` は `connected: false`。実エンドポイントが用意されるまで「未接続」の表示を維持し、サーバ検証が動いているように見せない。
7. 検出率ガード（80%未満で判定を停止し明示表示する）を弱めない。静かな誤動作より明示的な停止を優先する。

## 現在の状態（検証済み / 未検証を混同しない）

検証済み:
- ルールエンジン（`lib/rules.js`）の単体テスト 16件が全件パス（`node --test tests/rules.test.js`）。
- デモ用12件の判定分布が想定どおり：End candidate 4 / Review 3 / Keep 3 / Protected 2。
- 全JSの構文チェック、manifest の JSON 妥当性。

未検証（鵜呑みにしない）:
- コンテントスクリプトの実ブラウザでの通し動作（抽出→バージ描画→選択→CSV）は未確認。最初の実地確認は TASKS.md の Task 1。
- Seller Hub 実画面の DOM 構造・現行URLパターンは未確認。抽出は「テーブル見出しテキストから列を特定する汎用方式＋複数フォールバック」で実装済みだが、実物に合わせて調整が必要な可能性が高い（Task 2）。
- 実画面のビュー数が「出品期間の累計」かどうかも未確認。直近の動きとの突き合わせが必要なら Task 2 で判断する。
- ライセンス検証は未接続。テストモード（`testMode: true`、`DEV-` で始まるキーでローカルにPro有効化）がONの開発ビルド。**ストア提出前に `testMode: false` にすること**（Task 4）。

## 構成

```
manifest.json            MV3（権限は storage / downloads のみ）
background.js            意図的に最小の Service Worker（バックグラウンド処理なし）
config/license-config.js connected / verifyEndpoint / testMode の一元管理
lib/rules.js             純粋関数のルールエンジン（判定・保護・スコア・検出率ガード・CSV）
lib/license.js           ライセンス検証スタブ（未接続を正直に表示）
content/content.js       抽出・バージ・ページ内パネル・選択補助・ページ跨ぎ保存
content/panel.css        パネルCSS
popup/                   使い方＋ライセンスキー入力
demo/demo.html           Seller Hub風ダミー（架空12件、拡張なしでもスクリプト直接読み込みで動作）
tests/rules.test.js      node:test 単体テスト（追加依存なし）
store-listing.md         CWS掲載文・権限justification・非提携の免責
privacy-policy.md        プライバシーポリシー文案（Limited Use声明含む）
TASKS.md                 残作業の実行手順と受け入れ条件
```

## 作業の進め方

- 変更のたびに `node --test tests/rules.test.js` を実行し、全件パスを確認してから次へ進む。エンジンの挙動を変えたらテストも合わせて更新する。
- 新しい依存パッケージは追加しない（現状ゼロ依存）。
- DOM抽出を変更する場合は、汎用方式を主軸に維持し、実画面で確認した根拠がある場合のみフォールバックを追加する。推測でセレクタを大量追加しない。
- 各タスクの完了時は、変更点・テスト結果・残る未確認事項を日本語で簡潔にユーザーへ報告する。
- ユーザーの eBay アカウントでのログインや、Chrome Web Store への提出・公開といった対外操作は、ユーザーの明示的な指示があるまで行わない。
