// Captura o componente real na galeria; não recria seu desenho no teste.
const path = require('node:path');
const { chromium } = require(path.join(__dirname, '../../apps/desktop/node_modules/playwright'));

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://localhost:5173/boo-gallery', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Parar animação', exact: true }).click();
    for (const [pose, mood] of [['idle', 'idle'], ['focus', 'thinking'], ['happy', 'happy'], ['sleep', 'sleep']]) {
      await page.evaluate(mood => {
        document.querySelector('#fidelity-render')?.remove();
        const svg = document.querySelector(`[data-theme-sample="Escuro"] svg.boo[data-mood="${mood}"]`).cloneNode(true);
        svg.id = 'fidelity-render';
        Object.assign(svg.style, { position: 'fixed', left: '0px', top: '0px', width: '200px', height: '200px', zIndex: '2147483647', background: '#151619' });
        document.body.appendChild(svg);
      }, mood);
      await page.screenshot({ path: path.join(__dirname, `comparison/render-${pose}.png`), clip: { x: 0, y: 0, width: 200, height: 200 } });
      // SVG autônomo da mesma instância para inspeção vetorial.
      const svg = await page.locator('#fidelity-render').evaluate(node => {
        const copy = node.cloneNode(true);
        copy.removeAttribute('id');
        copy.style.position = '';
        copy.style.background = '';
        const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
        style.textContent = [...document.styleSheets].flatMap(sheet => {
          try { return [...sheet.cssRules].map(rule => rule.cssText).filter(css => css.includes('.boo') || css.includes('@keyframes boo-')); }
          catch { return []; }
        }).join('\n');
        copy.prepend(style);
        copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        return copy.outerHTML;
      });
      require('node:fs').writeFileSync(path.join(__dirname, `comparison/boo-${pose}.svg`), svg);
    }
    const animation = await page.locator('#fidelity-render').evaluate(node => {
      node.dataset.liquid = 'true';
      const body = node.querySelector('.boo__body');
      const effect = body.getAnimations()[0];
      if (!effect) return { exists: false, changes: false };
      effect.pause(); effect.currentTime = 0;
      const start = getComputedStyle(body).d;
      effect.currentTime = 1600;
      return { exists: true, changes: start !== getComputedStyle(body).d };
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const reducedMotion = await page.locator('#fidelity-render .boo__body').evaluate(node => getComputedStyle(node).animationName === 'none');
    const result = { errors, animation, reducedMotion };
    require('node:fs').writeFileSync(path.join(__dirname, 'comparison/browser-check.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
    if (errors.length || !animation.changes || !reducedMotion) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
