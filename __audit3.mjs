import { chromium } from '@playwright/test';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const w of [320, 390, 768, 1280]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 800 }, hasTouch:false });
  const p = await ctx.newPage();
  await p.goto('http://127.0.0.1:3210/recipes/baumy-biltong', { waitUntil: 'networkidle' });
  const hoverNone = await p.evaluate(()=>matchMedia('(hover: none)').matches);
  const wraps = await p.$$('.tag-wrap');
  const results = [];
  for (let i=0;i<wraps.length;i++){
    await wraps[i].hover().catch(()=>{});
    const r = await p.evaluate((idx)=>{
      const wrap = document.querySelectorAll('.tag-wrap')[idx];
      const tt = wrap.querySelector('.tag-tooltip');
      if(!tt) return null;
      const cs = getComputedStyle(tt);
      const rc = tt.getBoundingClientRect();
      const shell = document.querySelector('.shell').getBoundingClientRect();
      return { vis: cs.visibility, display: cs.display, left: Math.round(rc.left), right: Math.round(rc.right),
        width: Math.round(rc.width), shellRight: Math.round(shell.right),
        clippedPx: Math.round(Math.max(0, rc.right - shell.right)),
        tag: wrap.textContent.replace(/\s+/g,' ').slice(0,30),
        blurb: tt.textContent.replace(/\s+/g,' ').slice(0,40) };
    }, i);
    if (r) results.push(r);
  }
  console.log('=== width', w, 'hover:none=', hoverNone);
  console.log(JSON.stringify(results.filter(r=>r.clippedPx>0 || r.display==='none').slice(0,12), null, 1));
  console.log('total tag-wraps:', results.length, 'clipped:', results.filter(r=>r.clippedPx>0).length);
  await ctx.close();
}
await b.close();
