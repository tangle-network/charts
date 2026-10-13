"""Capture comparison pages at the requested widths and color schemes."""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parent.parent
output = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "docs/screenshots"
output.mkdir(parents=True, exist_ok=True)
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path="/snap/bin/chromium", headless=True, args=["--no-sandbox"])
    for kind in ("heatmap", "phase-waterfall", "latency-range"):
        page_url = (root / "docs" / f"{kind}-comparison.html").as_uri()
        for width in (390, 1440):
            for theme in ("light", "dark"):
                page = browser.new_page(viewport={"width": width, "height": 900}, device_scale_factor=1, color_scheme=theme)
                page.goto(page_url)
                page.locator(".reference").content_frame.locator("main").wait_for()
                page.screenshot(path=str(output / f"{kind}-{width}-{theme}.png"), full_page=True)
                page.close()
    browser.close()
