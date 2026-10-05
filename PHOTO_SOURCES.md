# PLACE ORACLE 画像ソース記録

更新日: 2026-10-05

## 現行STORY画像

STORY 01〜50の主画像はすべてPLACE ORACLE first-party SVGです。

- ファイル: `fallback_01.svg`〜`fallback_50.svg`
- 現行主画像: 50 / 50件 first-party
- 外部Pexels主画像: 0件
- 第三者写真: 現行STORY主画像では不使用
- 各STORYは固有のSVGファイルを使用
- 旧 `story_XX.jpg` および旧Pexels URLは現行STORY表示・フォールバックには使用しない

この構成は、人物・商標・店舗表示・書籍表紙・交通施設表示などを含む第三者写真が、通常表示や画像読込失敗時に再導入される経路を避けるためのものです。

## Hero

- ファイル: `hero_clean_photo.jpg`
- 分類: PLACE ORACLE用生成ビジュアル
- 第三者写真の画像入力: なし
- 人物: 非特定の合成人物。実在人物の肖像を意図しない
- 第三者写真ソース/Pexels attribution: なし

生成画像であることは、サービス全体の法的リスクがゼロであることを意味しません。

## 最終表示QA

- モバイル表示: 390×844で確認
- Hero人物: 右側に表示
- Hero説明文: 人物と重ならない幅へ調整
- 背景: 継ぎ目なし
- `index.html`: `Warning: truncated output` 混入断片を除去済み
- Story gallery QA #120: SUCCESS

## 運用ルール

今後STORYまたはHeroを差し替える場合は、公開前にこの記録を更新し、画像の由来と第三者要素を確認します。外部素材を再導入する場合は、その素材の利用条件と必要な第三者権利確認を別途実施します。
