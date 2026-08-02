// クリックジャッキング対策。
//
// 他人のサイトに透明なiframeとしてこのページを重ねられると、利用者は別の物を
// 押しているつもりで「削除」や「バックアップを上書き」を押してしまう。
// パルボックスは所持データの削除・共有ボックスからの削除・バックアップの上書きを
// 持っているため、埋め込まれた状態では中身を表示しない。
//
// 本来はHTTPヘッダー(CSPの frame-ancestors)で防ぐべきだが、GitHub Pagesでは
// レスポンスヘッダーを設定できないため、JavaScriptで代替している(2026-08)。
// ヘッダーが使えるホスティングに移した場合は frame-ancestors 'none' を設定し、
// このファイルは不要になる。
(function () {
  if (window.top === window.self) return;

  // まず中身を隠す。トップへの移動が失敗しても、隠れたままなら押させられない。
  document.documentElement.style.display = "none";
  try {
    window.top.location = window.self.location;
  } catch (e) {
    // iframeのsandbox指定などで移動を止められた場合。非表示のまま維持する。
  }
})();
