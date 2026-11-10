import { defineConfig } from 'electron-vite'
import { resolve } from 'path'

/**
 * Diretórios temporários que editores criam dentro de `src` (`.algo.tsx.<pid>.<uuid>.tmpdir/`)
 * não pertencem ao build. Sem esse ignore, o watcher do Vite tenta observá-los, recebe EBUSY
 * no Windows e derruba o processo inteiro de desenvolvimento.
 */
const ignoreEditorTemp = ['**/*.tmpdir/**', '**/*.tmp', '**/.mergetool/**']

export default defineConfig({
  main: {
    build: {
      watch: { exclude: ignoreEditorTemp },
      rollupOptions: {
        // ws carrega otimizações nativas opcionais via require. Bundling transforma
        // essa detecção em um objeto sem mask(), quebrando o handshake no Electron.
        external: ['node-pty', 'playwright', 'ws'],
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    }
  },
  preload: {
    build: {
      watch: { exclude: ignoreEditorTemp },
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    server: {
      watch: { ignored: ignoreEditorTemp },
    },
    resolve: {
      alias: {
        '@': resolve('src/renderer/src')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    }
  }
})
