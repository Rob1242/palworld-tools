import asyncio
import json
import re
from playwright.async_api import async_playwright

URL = "https://gamewith.jp/palworld/433556"
OUTPUT_FILE = "palworld_pals.json"

WORK_ORDER = [
    "火おこし", "水やり", "種まき", "発電", "手作業", "採集",
    "伐採", "採掘", "製薬", "冷却", "運搬", "牧場"
]

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 900}
        )
        page = await context.new_page()
        await page.goto(URL, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(3000)

        # 遅延読み込み画像などが多いので下までスクロールしてDOMを全部展開させる
        await page.evaluate("""
            async () => {
                await new Promise((resolve) => {
                    let total = 0;
                    const step = 800;
                    const timer = setInterval(() => {
                        window.scrollBy(0, step);
                        total += step;
                        if (total > document.body.scrollHeight) {
                            clearInterval(timer);
                            resolve();
                        }
                    }, 50);
                });
            }
        """)
        await page.wait_for_timeout(1500)

        li_count = await page.locator("li.add-checker").count()
        print(f"検出したパル数: {li_count}")

        results = []
        for i in range(li_count):
            li = page.locator("li.add-checker").nth(i)
            try:
                data_id = await li.get_attribute("data-id")
                data_name = await li.get_attribute("data-name")
                data_filter = await li.get_attribute("data-filter")

                sorts = {}
                for k in range(13):
                    v = await li.get_attribute(f"data-sort{k}")
                    sorts[k] = v

                # 図鑑リンク
                link = li.locator("div._head a")
                url = await link.get_attribute("href") if await link.count() else None

                # 作業適正 12項目 (_a1〜_a12)
                work = {}
                for idx, work_name in enumerate(WORK_ORDER, start=1):
                    col = li.locator(f"div._col._a{idx}")
                    if await col.count():
                        text = await col.inner_text()
                        work[work_name] = int(text.strip()) if text.strip().isdigit() else 0
                    else:
                        work[work_name] = 0

                # 食事量
                meal = li.locator("div.mealAmount")
                meal_amount = await meal.get_attribute("data-num") if await meal.count() else None

                # パートナースキル
                pskill_name = None
                pskill_effect = None
                pskill_block = li.locator("div._partner-skill")
                if await pskill_block.count():
                    name_el = pskill_block.locator("div._skill-name")
                    if await name_el.count():
                        pskill_name = (await name_el.inner_text()).replace("◆", "").strip()
                    full_text = await pskill_block.inner_text()
                    if pskill_name:
                        pskill_effect = full_text.replace(f"◆ {pskill_name}", "").strip()
                    else:
                        pskill_effect = full_text.strip()

                # タイプ (data-filterの文字列から抽出。昼/夜も含まれる)
                filter_tokens = data_filter.split() if data_filter else []

                results.append({
                    "id": data_id,
                    "name": data_name,
                    "detail_url": url,
                    "filter_tokens": filter_tokens,
                    "work_suitability": work,
                    "meal_amount": int(meal_amount) if meal_amount else None,
                    "partner_skill": {
                        "name": pskill_name,
                        "effect": pskill_effect
                    }
                })

                if (i + 1) % 20 == 0:
                    print(f"  {i+1}/{li_count} 完了")

            except Exception as e:
                print(f"  [{i}] エラー: {e}")
                continue

        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)

        print(f"\n完了！ {len(results)}体を {OUTPUT_FILE} に保存しました")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())