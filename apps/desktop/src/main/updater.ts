import { app, BrowserWindow, dialog } from "electron";
import { autoUpdater } from "electron-updater";

/**
 * electron-updater wiring, GitHub Releases provider (configured in package.json's
 * "build.publish"). Only runs in packaged builds — during `npm run dev` there is
 * no update feed to check and autoUpdater would just log noise/errors.
 *
 * Note: import this statically (not via dynamic import()) — electron-updater's
 * named export does not survive the CJS/ESM interop that a dynamic import()
 * goes through once this file is bundled for the packaged app, and ends up
 * undefined at runtime.
 */
export function initAutoUpdater(mainWindow: BrowserWindow): void {
  if (!app.isPackaged) return;

  autoUpdater.logger = console;

  autoUpdater.on("update-available", (info) => {
    mainWindow.webContents.send("updater:status", { status: "available" });
    // The actual startup popup the user asked for — checkForUpdates() (below)
    // leaves autoDownload on, so this is purely informational; the app keeps
    // downloading in the background regardless of whether they dismiss this.
    dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Update available",
      message: `A new version (${info.version}) of Music Theory Visualizer is available.`,
      detail: "It's downloading in the background — you'll get another prompt to restart once it's ready.",
      buttons: ["OK"]
    });
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
  autoUpdater.on("update-downloaded", (info) => {
    mainWindow.webContents.send("updater:status", { status: "ready" });
    dialog
      .showMessageBox(mainWindow, {
        type: "info",
        title: "Update ready",
        message: `Version ${info.version} has finished downloading.`,
        detail: "Restart now to finish installing it, or keep working and restart later.",
        buttons: ["Restart now", "Later"],
        defaultId: 0,
        cancelId: 1
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      });
  });
  autoUpdater.on("error", (err) => {
    mainWindow.webContents.send("updater:status", {
      status: "error",
      message: err.message
    });
  });

  // checkForUpdates() rather than checkForUpdatesAndNotify() — the latter
  // fires its own native OS notification on download completion, which
  // would double up with the dialog above. autoDownload defaults to true,
  // so this still downloads automatically once an update is found.
  autoUpdater.checkForUpdates().catch((err) => {
    console.error("Update check failed:", err);
  });
}

export function quitAndInstallUpdate(): void {
  autoUpdater.quitAndInstall();
}
