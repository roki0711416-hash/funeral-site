/* 本番ドメイン確定後だけ siteOrigin を設定する。
   空の間は canonical と絶対URLを出さない。架空のドメインは書かない。
   例: siteOrigin: 'https://確定したドメイン'
   設定後は node scripts/build-seo-files.js を実行する。 */
const HENREIYA_SEO = {
  siteOrigin: 'https://henreiya.vercel.app',
};

if (typeof window !== 'undefined') window.HENREIYA_SEO = HENREIYA_SEO;
if (typeof module !== 'undefined' && module.exports) module.exports = HENREIYA_SEO;
