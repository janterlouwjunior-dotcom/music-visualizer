import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join } from "path";
import {
  createWorkspace,
  deleteWorkspace,
  duplicateWorkspace,
  listWorkspaces,
  loadWorkspace,
  saveWorkspace
} from "./workspaces";
import { initAutoUpdater, quitAndInstallUpdate } from "./updater";
import type { Workspace } from "../shared/workspace";

function createMainWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#14161c",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false
    }
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (is_dev()) {
    mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
      console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
    });
  }

  if (is_dev() && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return mainWindow;
}

function is_dev(): boolean {
  return !app.isPackaged;
}

function registerIpcHandlers(): void {
  ipcMain.handle("workspaces:list", () => listWorkspaces());
  ipcMain.handle("workspaces:load", (_event, id: string) => loadWorkspace(id));
  ipcMain.handle("workspaces:save", (_event, workspace: Workspace) => saveWorkspace(workspace));
  ipcMain.handle("workspaces:create", (_event, name: string) => createWorkspace(name));
  ipcMain.handle("workspaces:duplicate", (_event, id: string, newName: string) =>
    duplicateWorkspace(id, newName)
  );
  ipcMain.handle("workspaces:delete", (_event, id: string) => deleteWorkspace(id));
  ipcMain.handle("updater:install", () => quitAndInstallUpdate());
}

app.whenReady().then(() => {
  registerIpcHandlers();

  const mainWindow = createMainWindow();
  initAutoUpdater(mainWindow);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
