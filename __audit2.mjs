import { chromium } from '@playwright/test';
const routes = ['/', '/recipes', '/recipes/baumy-biltong', '/recipes/baumy-biltong/revisions/1',
 '/cuisines', '/cuisines/south-african', '/categories', '/categories/technique/air-drying',
 '/ingredients', '/ingredients/salt', '/experiments', '/experiments/biltong-batch-3',
 '/shopping-list', '/search?q=biltong', '/archive', '/connect', '/auth'];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 320, height: 800 } });
const p = await ctx.newPage();
await p.goto('http://127.0.0.1:3210/');
await p.evaluate(() => { try { localStorage.setItem('nn.basket', JSON.stringify([{slug:'baumy-biltong',title:'Baumy Biltong'}])); } catch(e){} });
const out = [];
for (const w of [320, 360, 390]) {
  await p.setViewportSize({ width: w, height: 800 });
  for (const r of routes) {
    await p.goto('http://127.0.0.1:3210' + r, { waitUntil: 'networkidle' });
    const res = await p.evaluate(() => {
      const shell = document.querySelector('.shell');
      if (!shell) return [];
      const sr = shell.getBoundingClientRect();
      const clipped = [];
      for (const el of shell.querySelectorAll('*')) {
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        const rc = el.getBoundingClientRect();
        if (rc.width === 0) continue;
        // element itself overflows shell right edge
        if (rc.right > sr.right + 0.5) {
          // ignore if an ancestor is a scroll container that can reach it
          let anc = el.parentElement, scrollable = false;
          while (anc && anc !== shell) {
            const acs = getComputedStyle(anc);
            if (/(auto|scroll)/.test(acs.overflowX)) { scrollable = true; break; }
            anc = anc.parentElement;
          }
          if (scrollable) continue;
          clipped.push({ sel: el.tagName.toLowerCase()+(typeof el.className==='string'&&el.className?'.'+el.className.trim().split(/\s+/).join('.'):''),
            right: Math.round(rc.right), shellRight: Math.round(sr.right), lost: Math.round(rc.right - sr.right),
            text: (el.textContent||'').replace(/\s+/g,' ').slice(0,50) });
        }
      }
      return clipped;
    });
    if (res.length) out.push({ w, r, clipped: res.slice(0,8) });
  }
}
console.log(JSON.stringify(out, null, 1));
await b.close();
