#!/usr/bin/env python3
"""ローカル確認用サーバー。gzipを掛ける。

なぜ要るか(2026-08-09 実測):
  python3 -m http.server は無圧縮で返す。パル図鑑は 1906KB 流れてくる。
  本番の GitHub Pages は gzip を掛けるので実際は 296KB。**6倍違う。**
  無圧縮のまま体感を判断すると、無い問題を追いかけることになる。

使い方:
  python3 tools/serve.py            # http://127.0.0.1:8777/
  python3 tools/serve.py 9000       # ポート指定
"""
import gzip, io, sys, functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

# 既に圧縮済みのものは触らない(woff2/webp/pngは掛けても縮まないどころかCPUの無駄)
SKIP = (".woff2", ".woff", ".webp", ".png", ".jpg", ".jpeg", ".gif", ".zip", ".gz")


class GzipHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # 確認用なのでキャッシュさせない。古いCSSを掴んで悩まないため
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_head(self):
        path = self.translate_path(self.path)
        accepts = "gzip" in self.headers.get("Accept-Encoding", "")
        if not accepts or path.lower().endswith(SKIP):
            return super().send_head()

        try:
            f = open(path, "rb")
        except OSError:
            return super().send_head()   # ディレクトリや404は元の処理に任せる

        with f:
            raw = f.read()
        body = gzip.compress(raw, 6)

        self.send_response(200)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Encoding", "gzip")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        return io.BytesIO(body)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8777
    handler = functools.partial(GzipHandler)
    print(f"http://127.0.0.1:{port}/  (gzip あり / キャッシュ無効)")
    ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
