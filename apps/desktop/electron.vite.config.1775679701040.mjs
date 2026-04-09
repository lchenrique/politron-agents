// electron.vite.config.ts
import { defineConfig } from "electron-vite";
import { resolve } from "path";
var __electron_vite_injected_dirname = "D:\\projetos pessoais\\politron\\apps\\desktop";
var electron_vite_config_default = defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: ["node-pty"],
        input: {
          index: resolve(__electron_vite_injected_dirname, "src/main/index.ts")
        }
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, "src/preload/index.ts")
        }
      }
    }
  },
  renderer: {
    root: "src/renderer",
    resolve: {
      alias: {
        "@": resolve("src/renderer/src")
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, "src/renderer/index.html")
        }
      }
    }
  }
});
export {
  electron_vite_config_default as default
};
