# PLACE ORACLE 商用公開準備状況

更新日: 2026-10-10

## 判定: 本番販売は未承認・本番QA未確認

この文書はコード・記録の整合性監査を示すものです。GitHub上の記録だけでは、GitHub Pagesへの反映、実公開ページの動作、実決済の正常性は証明できません。

## 確認できた事実

- PR #2 は 2026-10-05 にマージ済み（merge commit: `afa50c9eebfe7387a10520450d7bdd633e2a875e`）。当該PRの最終記録では、STORY画像は first-party SVG 50件、販売UIはOFFで、公開後の照合を経て販売承認する方針でした。
- その後の main の `PHOTO_QA.html`、`PHOTO_SOURCES.md`、`.github/scripts/verify-story-gallery.mjs` は、Pexelsを主画像とする50件の構成を記載・検証しています。これはPR #2時点の画像方針と異なります。現行実装の採用理由・権利・品質を再確認する必要があります。
- 監査時点の main の `membership-widget.js` は `SALES_ENABLED=true` でした。一方、`BILLING_DESIGN.md` は公開後の最終確認まで販売UIをOFFにする仕様です。
- 本修正ブランチでは `SALES_ENABLED=false` に変更しました。**mainおよび公開サイトへの反映はPRマージとデプロイ後に別途確認が必要です。**
- `BILLING_DESIGN.md` にはSandbox E2E完走の記録がありますが、本監査では再実行していません。

## 未完了の本番リリースゲート

- [ ] G1: 修正PRをレビュー・マージし、mainの販売UI設定がOFFであることを確認
- [ ] G2: GitHub Pagesデプロイ成功と、公開アセットが対象mainコミットに一致することを確認
- [ ] G3: 公開ページのPC・スマートフォン表示、Hero、ナビゲーション、STORY 01〜50を実機またはブラウザで検証
- [ ] G4: STORY画像の現行方針（Pexels／first-party SVG）を確定し、`index.html`、`PHOTO_QA.html`、`PHOTO_SOURCES.md`、検証スクリプトを一致させる
- [ ] G5: 規約・特商法・プライバシー表示、Googleログイン、会員状態、ログアウトを公開環境で確認
- [ ] G6: Stripe本番設定、Webhook、権限、価格、Checkout、Portal、キャンセルを安全な方法で検証。テスト決済と実決済を混同しない
- [ ] G7: 販売開始の明示的承認（承認者、日時、対象コミット、検証証跡）を記録し、別PRで販売UIをONにする

## 販売制御と注意

`SALES_ENABLED` はフロントエンドの購入導線を制御するものであり、Stripe/Worker側の課金機能停止を保証するものではありません。バックエンドの本番モード・Checkout権限・価格設定も別途検証が必要です。

「PR #3マージ済み」「GitHub Pages本番QA成功」「本番販売開始済み」といった従来の完了宣言は、独立した証跡を照合するまで完了扱いにしません。

本書は法的適合性やセキュリティの無欠陥を保証しません。
