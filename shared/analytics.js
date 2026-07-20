// Google Analytics 4 (GA4) 読み込み用。
// GA_MEASUREMENT_IDが空の間は何も起こらない(プロパティ作成後、この値を
// "G-XXXXXXXXXX" に差し替えるだけで全ページで有効になる)。
const GA_MEASUREMENT_ID = "G-D02HM08TSR";

if (GA_MEASUREMENT_ID) {
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  function gtag(){ dataLayer.push(arguments); }
  gtag("js", new Date());
  gtag("config", GA_MEASUREMENT_ID);
}
