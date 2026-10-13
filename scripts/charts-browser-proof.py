
import json,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
url=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:46489'
out=Path(sys.argv[2] if len(sys.argv)>2 else '/tmp/charts-browser-proof')
out.mkdir(parents=True,exist_ok=True)
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/snap/bin/chromium',args=['--no-sandbox'])
 for name,width,dark in [('desktop-light',1100,False),('desktop-dark',1100,True),('phone-light',390,False)]:
  context=browser.new_context(viewport={'width':width,'height':760},reduced_motion='reduce',has_touch=width<500,record_video_dir=str(out/'videos'))
  page=context.new_page()
  errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(url,wait_until='networkidle')
  if dark:page.evaluate("document.documentElement.dataset.theme='dark'")
  bars=page.get_by_role('button')
  second=bars.nth(1)
  box=second.bounding_box()
  x=box['x']+box['width']/2;y=box['y']+box['height']/2
  page.mouse.move(x,y)
  tip=page.locator('[data-chart-tooltip]')
  tip.wait_for(state='visible')
  bounds=tip.bounding_box()
  assert abs(bounds['x']-(x+14))<2,(bounds,x)
  assert abs(bounds['y']-(y+14))<2,(bounds,y)
  assert tip.evaluate("e=>e.matches(':popover-open')")
  assert 'Inference: $16.80' in tip.inner_text()
  highlight=page.locator('[data-selection]')
  assert highlight.count()==1
  assert float(highlight.get_attribute('height'))<100
  assert bounds['x']>=0 and bounds['x']+bounds['width']<=width
  assert bounds['y']>=0 and bounds['y']+bounds['height']<=760
  page.screenshot(path=str(out/(name+'.png')))
  second.focus();page.keyboard.press('Enter')
  assert page.get_by_role('status').inner_text().startswith('Sep 7')
  assert tip.count()==0
  page.keyboard.press('Escape')
  assert 'Hover, tap' in page.get_by_role('status').inner_text()
  if width<500:
   second.tap()
   assert page.get_by_role('status').inner_text().startswith('Sep 7')
   assert tip.count()==0
  assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
  page.get_by_text('View data',exact=True).click()
  assert page.get_by_role('table').count()==1
  assert not errors,errors
  results.append({'case':name,'width':width,'tooltip_top_layer':True,'transformed_ancestor':True,'reduced_motion':True,'keyboard':True,'touch':width<500,'page_errors':errors})
  context.close()
 browser.close()
(out/'results.json').write_text(json.dumps(results,indent=2))
print(json.dumps(results))
