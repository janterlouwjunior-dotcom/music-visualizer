import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        // midiWorker is a second entry point, not an import of index.ts —
        // it's launched separately via utilityProcess.fork() (see
        // nativeMidi.ts) as its own isolated process, so it needs to exist
        // as its own standalone bundle in out/main/ rather than being pulled
        // into index.js.
        input: {
          index: resolve("src/main/index.ts"),
          midiWorker: resolve("src/main/midiWorker.ts")
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src")
      }
    },
    plugins: [react()]
  }
});
