# 株式会社返礼屋 公式サイト

神奈川県綾瀬市の貸式場・安置施設・返礼品「株式会社返礼屋」のホームページです。
トップで **施設予約** と **返礼品ショップ** を選択できます。

法人情報: [GVA 法人検索](https://toukibo.ai-con.lawyer/search-service/result/1021001058529)
本店: 〒252-1111 神奈川県綾瀬市上土棚北4丁目3-6-1

## 表示方法

```bash
cd hp
python3 -m http.server 8080 --bind 0.0.0.0
```

ブラウザで http://localhost:8080 を開いてください。

## 管理画面

http://localhost:8080/admin/login.html

ログイン情報とスプレッドシートのURLは Git に含めません。`js/local-config.example.js` を `js/local-config.js` にコピーし、手元だけで値を入れてください。
