import asyncio
from playwright.async_api import async_playwright

URL = "https://gamewith.jp/palworld/433556"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 800}
        )
        page = await context.new_page()
        await page.goto(URL, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(3000)

        # ヘッダー行(アイコン部分)のHTMLを丸ごと取得
        header_html = await page.evaluate("""
            () => {
                // ヘッダーの並び順アイコンを探す。よくあるのは ._aptitude-table の直前や
                // ページ上部の凡例部分。 class名に "legend" "header" "icon" 等を含む要素を広めに拾う
                const candidates = document.querySelectorAll('[class*="head"], [class*="legend"], [class*="icon-list"], [class*="_row"]');
                let out = [];
                for (const el of candidates) {
                    if (el.querySelectorAll('img, [class*="icon"]').length >= 5) {
                        out.push(el.outerHTML);
                    }
                }
                return out.join("\\n\\n===\\n\\n");
            }
        """)
        with open("header_candidates.html", "w", encoding="utf-8") as f:
            f.write(header_html)
        print("保存完了: header_candidates.html")

        await browser.close()

asyncio.run(main())