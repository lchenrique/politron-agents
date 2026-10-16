// Mesmo plugin usado por src/renderer/postcss.config.js: o app usa Tailwind v4
// no modo CSS-first (ver src/renderer/src/index.css). Este arquivo só existe
// para cobrir ferramentas (como o Vitest, cuja raiz é apps/desktop) que
// resolvem o PostCSS a partir daqui em vez da raiz do Vite (src/renderer).
module.exports = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
}
