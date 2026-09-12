import { app, BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";

/**
 * electron-updater wiring, GitHub Releases provider (configured in package.json's
 * "build.publish"). Only runs in packaged builds — during `npm run dev` there is
 * no update feed to check and autoUpdater would just log noise/errors.
 *
 * Update the "publish.owner"/"publish.repo" placeholders in package.json once the
 * GitHub repo exists, before cutting the first real release.
 *
 * Note: import this statically (not via dynamic import()) — electron-updater's
 * named export does not survive the CJS/ESM interop that a dynamic import()
 * goes through once this file is bundled for the packaged app, and ends up
 * undefined at runtime.
 */
export function initAutoUpdater(mainWindow: BrowserWindow): void {
  if (!app.isPackaged) return;

  autoUpdater.logger = console;

  autoUpdater.on("update-available", () => {
    mainWindow.webContents.send("updater:status", { status: "available" });
  });
  autoUpdater.on("update-not-available", () => {
    mainWindow.webContents.send("updater:status", { status: "up-to-date" });
  });
  autoUpdater.on("download-progress", (progress) => {
    mainWindow.webContents.send("updater:status", {
      status: "downloading",
      percent: progress.percent
    });
  });
  autoUpdater.on("update-downloaded", () => {
    mainWindow.webContents.send("updater:status", { status: "ready" });
  });
  autoUpdater.on("error", (err) => {
    mainWindow.webContents.send("updater:status", {
      status: "error",
      message: err.message
    });
  });

  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.error("Update check failed:", err);
  });
}

export function quitAndInstallUpdate(): void {
  autoUpdater.quitAndInstall();
}
