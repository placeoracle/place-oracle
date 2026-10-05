# PLACE ORACLE 会員・課金仕様

更新日: 2026-10-05

## 確定仕様

- 月額500円（税込）／月
- 年額5,000円（税込）／年
- Stripeによる自動更新
- 次回更新日前に解約した場合、次回請求を停止し支払済み期間末まで利用可能
- 契約期間途中の返金は原則行わない（法令上必要な場合を除く）
- 本番販売UIは公開後の最終確認が終わるまでOFF

## 認証・権限

Googleログイン後、Workerが安全なセッションを発行します。会員権はURLパラメータやlocalStorageだけでは付与せず、Worker/D1に保存されたStripe購読状態を基準に判定します。

## 決済フロー

1. ログイン済み利用者がプランを選択。
2. 購入直前画面で価格、更新周期、提供開始、解約・返金条件、規約類を確認。
3. Workerが認証とプランを検証してStripe Checkout Sessionを生成。
4. Stripe Webhookの署名をWorkerで検証。
5. event IDの重複防止とsubscriptionイベントの順不同保護を行い、D1へ購読状態を反映。
6. サイトはサーバー側の会員状態を確認して有料機能を提供。
7. 契約・支払方法の管理は認証済みCustomer Portal Sessionから行う。

## 保存情報

会員管理に必要な利用者ID、Stripe Customer ID、購読ID、Price、状態、有効期限、処理済みイベント情報等をサーバー側で扱います。Stripeの秘密鍵・Webhook secretは公開リポジトリへ保存しません。

## 実動確認

Sandbox環境で、Googleログイン → Checkout → テスト決済 → Webhook → D1 → Customer Portal → 期間末解約まで完走済みです。

## リリース条件

PR #2をmainへ反映した後、GitHub Pagesの実公開内容が監査済みmainと一致することを確認してから、本番販売UIを有効化します。
