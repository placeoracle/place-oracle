# PLACE ORACLE 商用公開準備状況

更新日: 2026-10-05

## 現在の判定

PR #3のマージ前に実施できる実装・画像・決済・表示・QAは完了しています。
本番販売UIは意図的にOFFのままです。PRをmainへマージした後、GitHub Pagesの実公開内容が監査済みコミットと一致することを確認してから販売有効化を判断します。

## 確認済み

- 料金: 月額500円（税込）／年額5,000円（税込）、自動更新。
- 解約: Customer Portalから次回更新を停止し、支払済み期間末まで利用可能。原則として途中返金なし（法令上必要な場合を除く）。
- 認証: Googleログインを利用し、サーバー側セッションで会員を識別。
- Checkout: 認証済み利用者からWorker経由でStripe Checkout Sessionを生成。
- Webhook: Stripe署名検証、event ID重複防止、subscriptionイベント順不同対策を確認。
- 会員状態: URLやlocalStorageだけでは付与せず、Worker/D1側の購読状態を使用。
- Customer Portal: 認証必須のPortal Session生成を確認。
- Sandbox E2E: Googleログイン → Checkout → テスト決済 → Webhook → D1 → Portal → 期間末解約まで実動確認済み。
- 購入直前表示: プラン、税込価格、更新周期、提供開始、解約・返金条件、利用規約・特商法表示・プライバシーへの導線を確認。
- 販売者情報: 特商法上の請求時開示方式を採用。正式情報は公開リポジトリへ保存しない。
- STORY画像: 01〜50の主画像をすべてPLACE ORACLE first-party SVGへ移行。プレースホルダー文字を廃止し、旅行エディトリアル調のオリジナルビジュアルへ更新。外部Pexels主画像は0件。
- Hero: PLACE ORACLE用生成ビジュアルとして記録。第三者写真を画像入力に使用していない。小さな人物は非特定の合成人物として扱う。
- HTML: 混入していた `Warning: truncated output` 断片を除去済み。
- モバイルHero: 390×844で、人物を右側に保持し、説明文との重なり・背景継ぎ目がないことを目視確認。
- Story gallery QA #120: SUCCESS。
- 一時的な修復workflow/jobは撤去済み。

## 本番リリース手順

1. PR #3をmainへマージする。
2. GitHub Pagesのデプロイ完了後、実公開ページとmainの一致、Hero、STORY、規約ページ、ログイン導線を確認する。
3. 公開一致確認が成功した後にのみ、本番販売UIの有効化を別途承認する。

## 現在の安全設定

- `membership-widget.js`: `SALES_ENABLED=false`
- 本番販売UI: OFF（最終QA完了後に `SALES_ENABLED=true` へ切替）
- PR #3: 最終商品仕上げ・QA中
- 秘密鍵・Webhook secret・販売者の非公開個人情報は公開リポジトリへ保存しない。

## 注意

この文書は技術・運用・画像出所について確認できた状態を記録するもので、法的リスクがゼロであることを保証するものではありません。
