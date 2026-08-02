// 画像が読めなかったときの差し替え・非表示を、HTMLに直接書く onerror="..." の代わりに
// ここでまとめて受ける。
//
// CSPから 'unsafe-inline' を外すと onerror="..." のようなHTML属性のスクリプトも
// ブロックされるため(2026-08のCSP強化に伴う対応)、属性で挙動だけ宣言しておき、
// 実際の処理はこのファイルが担当する。
//
//   <img data-onerror="hide">                 … 読めなければ非表示にする
//   <img data-onerror-src="代替画像のパス">    … 読めなければその画像に差し替える
//
// errorイベントはバブリングしないが、キャプチャ段階なら親で拾えるためdocumentで受ける。
document.addEventListener("error", (e) => {
  const el = e.target;
  if (!el || el.tagName !== "IMG") return;
  const fallback = el.getAttribute("data-onerror-src");
  if (fallback) {
    // 差し替え先も読めなかった場合に無限ループしないよう、先に属性を外す
    el.removeAttribute("data-onerror-src");
    el.src = fallback;
    return;
  }
  if (el.getAttribute("data-onerror") === "hide") {
    el.style.display = "none";
  }
}, true);
