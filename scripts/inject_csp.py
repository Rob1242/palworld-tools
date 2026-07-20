import glob

# 全ページが読み込む正当な外部オリジンだけを許可するContent-Security-Policyを設置する。
# サイト全体がインラインscriptで書かれているため script-src には 'unsafe-inline' が
# 必要(外部への不正なscriptタグ追加は防げないが、任意の第三者ドメインからの
# スクリプト読み込み・データ送信は防げる、という現実的な落としどころ)。
CSP = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.gstatic.com; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com; "
    "img-src 'self' data:; "
    "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.google-analytics.com https://*.analytics.google.com; "
    "object-src 'none'; "
    "base-uri 'self';"
)
TAG = f'<meta http-equiv="Content-Security-Policy" content="{CSP}">\n'


def main():
    pages = sorted(glob.glob("palworld_*.html")) + ["index.html"]
    updated = 0
    for p in pages:
        content = open(p, encoding="utf-8").read()
        if "Content-Security-Policy" in content:
            continue
        marker = '<meta name="viewport"'
        idx = content.find(marker)
        if idx == -1:
            print("NO VIEWPORT META in", p)
            continue
        line_end = content.find("\n", idx) + 1
        new_content = content[:line_end] + TAG + content[line_end:]
        open(p, "w", encoding="utf-8").write(new_content)
        updated += 1
    print(f"{updated}件のページにCSPを追加しました")


if __name__ == "__main__":
    main()
