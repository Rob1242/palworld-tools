import glob

TAG = (
    '<link rel="icon" type="image/svg+xml" href="favicon.svg">\n'
    '<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">\n'
    '<link rel="icon" type="image/png" sizes="16x16" href="favicon-16.png">\n'
    '<link rel="apple-touch-icon" sizes="180x180" href="favicon-180.png">\n'
)


def main():
    pages = sorted(glob.glob("palworld_*.html")) + ["index.html"]
    updated = 0
    for p in pages:
        content = open(p, encoding="utf-8").read()
        if 'rel="icon"' in content:
            continue
        idx = content.find("<title>")
        if idx == -1:
            print("NO <title> in", p)
            continue
        new_content = content[:idx] + TAG + content[idx:]
        open(p, "w", encoding="utf-8").write(new_content)
        updated += 1
    print(f"{updated}件のページにfaviconタグを追加しました")


if __name__ == "__main__":
    main()
