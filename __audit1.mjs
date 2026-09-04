import { chromium } from '@playwright/test';
const routes = ['/', '/recipes', '/recipes/baumy-biltong', '/recipes/baumy-biltong/revisions/1',
 '/cuisines', '/cuisines/south-african', '/categories', '/categories/technique/air-drying',
 '/ingredients', '/ingredients/salt', '/experiments', '/experiments/biltong-batch-3',
 '/shopping-list', '/search?q=biltong', '/archive', '/connect', '/auth', '/this-page-does-not-exist'];
const widths = [320, 360, 390, 768, 1280];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 320, height: 800 } });
const p = await ctx.newPage();
// seed basket
await p.goto('http://127.0.0.1:3210/');
await p.evaluate(() => { try { localStorage.setItem('nn.basket', JSON.stringify([{slug:'baumy-biltong',title:'Baumy Biltong'}])); } catch(e){} });
const out = [];
for (const w of widths) {
  await p.setViewportSize({ width: w, height: 800 });
  for (const r of routes) {
    await p.goto('http://127.0.0.1:3210' + r, { waitUntil: 'networkidle' });
    const res = await p.evaluate((w) => {
      const de = document.documentElement;
      const overflow = de.scrollWidth - de.clientWidth;
      const bad = [];
      if (overflow > 0) {
        for (const el of document.querySelectorAll('body *')) {
          const rc = el.getBoundingClientRect();
          if (rc.width === 0 && rc.height === 0) continue;
          if (rc.right > de.clientWidth + 0.5) {
            const cs = getComputedStyle(el);
            if (cs.visibility === 'hidden' || cs.display === 'none') continue;
            bad.push({ sel: el.tagName.toLowerCase() + (el.className && typeof el.className==='string' ? '.'+el.className.trim().split(/\s+/).join('.') : ''), right: Math.round(rc.right), w: Math.round(rc.width), text: (el.textContent||'').slice(0,40) });
          }
        }
      }
      // narrowest offender = deepest ones only
      return { overflow, docW: de.clientWidth, sw: de.scrollWidth, bad: bad.slice(0, 6) };
    }, w);
    if (res.overflow > 0) out.push({ w, r, ...res });
  }
}
console.log(JSON.stringify(out, null, 1));
await b.close();
