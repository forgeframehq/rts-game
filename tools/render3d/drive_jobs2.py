import asyncio, base64, json, sys, subprocess, os
from playwright.async_api import async_playwright
# usage: python3 drive_jobs.py jobs.json out_dir [model_override] [only,names]
# Needs setup.sh to have put lib/ and the GLBs here first.
# Browser: Chrome if the machine has it, otherwise whatever Playwright brought with it.
# Don't hardcode a path — a cloud container usually has only the bundled chromium.
CHROME = next((p for p in ('/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser')
               if os.path.exists(p)), None)
async def main(jobs_file, out_dir, model=None, only=None):
    J = json.load(open(jobs_file)); os.makedirs(out_dir, exist_ok=True)
    here = os.path.dirname(os.path.abspath(__file__))
    if not os.path.exists(os.path.join(here, 'lib', 'three.module.js')):
        sys.exit('lib/ is missing — run tools/render3d/setup.sh first')
    srv = subprocess.Popen(['python3', '-m', 'http.server', '8798'], cwd=here, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        await asyncio.sleep(1)
        async with async_playwright() as p:
            launch = {'args': ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']}
            if CHROME:
                launch['executable_path'] = CHROME
            b = await p.chromium.launch(**launch)
            pg = await b.new_page()
            errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto('http://localhost:8798/render.html'); await pg.wait_for_function('window.ready === true', timeout=30000)
            anims = [a for a in J['anims'] if not only or a['name'] in only]
            for a in anims:
                res = await pg.evaluate('cfg => window.renderAll(cfg)', {'url': model or J['model'], 'anims': [a], 'height': J['height'], 'frame': J['frame'], 'clipsUrl': J.get('clipsUrl'), 'mount': J.get('mount'), 'horse': J.get('horse'), 'vehicle': J.get('vehicle')})
                for k, v in res.items():
                    if 'png' not in v: print(k, v); continue
                    open(f'{out_dir}/{k}.png', 'wb').write(base64.b64decode(v['png'].split(',')[1]))
                    meta = {kk: vv for kk, vv in v.items() if kk != 'png'}
                    span = (a.get('end', 1) - a.get('start', 0)) * v.get('duration', 1)
                    meta['cycle'] = round(span * (2 if a.get('pingpong') else 1), 3)
                    if a.get('stride'): meta['stride'] = a['stride']
                    json.dump(meta, open(f'{out_dir}/{k}.json', 'w'))
                    print(k, v['frames'], 'x', v['dirs'], flush=True)
            if errs: print('ERR', errs[:5])
            await b.close()
    finally:
        srv.terminate()
a = sys.argv
asyncio.run(main(a[1], a[2], a[3] if len(a) > 3 and a[3] != '-' else None, a[4].split(',') if len(a) > 4 else None))
