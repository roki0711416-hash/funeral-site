# 本番フロントへの差分

このディレクトリは、CLI デプロイ済みの `henreiya` ソースのうち、公開 URL のバイト列と SHA1 が一致した2ファイルへ最小修正を加えたものです。この GitHub リポジトリのルート一式は古い別ビルドです。ルートを本番へデプロイしないでください。

## 置き換えるファイル

- `patches/production/js/catalog-store.js` → 本番ソースの `src/js/catalog-store.js`
- `patches/production/admin/products.html` → 本番ソースの `src/admin/products.html`

`patches/henreiya-live-photo-public.patch` は同じ差分です。適用先のパスは `src/` です。

Windows 側スナップショットの `api/catalog.js` は本番マニフェストに無く、`galleryOnly` も `?id=` の `product` もありません。本番 API の置き換えに使わないでください。

## この差分が変えること

- 商品詳細は、`/api/catalog?id=` が `product` を返さないとき、ショップと同じ公開一覧から `id` または申込番号を探します。非公開と写真なしは詳細にも出しません。
- 管理一覧は、長い data URL や `images` だけのギャラリーを「写真未設定」にしません。
- 複数ファイル追加は、渡された順を保って先頭にまとめて足します。1枚ずつの `unshift` は使いません。ファイル選択ダイアログの並び自体はブラウザ依存なので、保存前の「メインにする」「前へ」「次へ」が確定操作です。

## この差分が変えないこと

- ログイン、注文、予約、`galleryOnly` の保存、`POST /api/admin/products` は触っていません。
- すでに保存された C004-014 の並び（断面がメイン）は、データの書き換えなしには変わりません。デプロイ後、その商品だけ編集画面で箱写真を「メインにする」して保存する必要があります。
