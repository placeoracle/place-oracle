# PLACE ORACLE 画像ソース記録

更新日: 2026-10-06

## 現行STORY画像

STORY 01〜50の主画像はすべてPexels Licenseの写真です。

- 現行主画像: 50 / 50件 Pexels
- 各画像のPexels個別ページURL: `PHOTO_QA.html` と `index.html` の各STORYレコードに記録
- 読み込み失敗時: `fallback_01.svg`〜`fallback_50.svg` のPLACE ORACLE first-party SVGを使用
- 旧ローカル `story_XX.jpg`: 公開リポジトリから削除済み
- 写真をPLACE ORACLE所有作品として扱わず、Pexels提供素材として区別する

Pexels公式ライセンスでは、写真はWebサイト・アプリ等で商用利用できます。出典表示は必須ではありませんが、PLACE ORACLEでは内部QA上の追跡のため個別出典を保持します。

第三者の商標・ロゴ・特定可能な人物・著作物・建築物等が写り込む場合は別の権利が関係し得るため、PLACE ORACLEの商品や運営者による推奨・提携を示す使い方はしません。

## Hero

- ファイル: `hero_clean_photo.jpg`
- 分類: PLACE ORACLE用生成ビジュアル
- 第三者写真の画像入力: なし
- 人物: 非特定の合成人物。実在人物の肖像を意図しない

## QA

公開前に以下を自動確認します。

- STORY 01〜50がすべて存在
- Pexels画像URLとPexels個別出典URLの写真IDが一致
- 50件すべての主画像が画像レスポンスを返す
- 各STORYのfallbackが重複せず存在
- モバイル表示のStory galleryをPlaywrightで確認
- Hero・PHOTO_QAのスクリーンショットをartifactへ保存

## 運用ルール

画像差し替え時は `PHOTO_QA.html` と本記録を更新し、主画像URL・出典URL・fallbackの整合をQAで確認してから公開します。
