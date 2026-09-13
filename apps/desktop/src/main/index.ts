import { app, BrowserWindow, ipcMain, session, shell } from "electron";
import { join } from "path";
import {
  createWorkspace,
  deleteWorkspace,
  duplicateWorkspace,
  listWorkspaces,
  loadWorkspace,
  saveWorkspace,
  setWorkspaceFolder
} from "./workspaces";
import { createFolder, deleteFolder, listFolders } from "./folders";
import {
  addMidiInput,
  addMidiOutput,
  deleteMidiInput,
  deleteMidiOutput,
  getMidiSettings
} from "./midiSettings";
import { initAutoUpdater, quitAndInstallUpdate } from "./updater";
import type { Workspace } from "../shared/workspace";

// Without this, launching via `electron .` (which the dev shortcut does) reads
// the scoped package name "@music-theory-viz/desktop" as the app name, and
// Electron creates userData at .../Roaming/@music-theory-viz/desktop — a
// literal "/" in a path segment, silently split into two nested folders.
// Setting this explicitly also keeps userData consistent between the dev
// shortcut, `electron out/main/index.js`, and the future packaged app, which
// otherwise use different default-name heuristics and would each get their
// own separate, siloed userData directory.
app.setName("Music Theory Visualizer");

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

  // Recovers from a crashed or hung renderer by reloading — but only a
  // few times per short window. A cause that clears itself (a one-off GPU
  // blip, a transient OS hiccup) gets fixed by the reload. A cause that
  // doesn't clear itself (e.g. a MIDI driver stuck at the OS level — see
  // requestMIDIAccess() in midiService.ts) would otherwise retrigger the
  // same hang right after every reload, forever, silently: reloading looks
  // like recovery but the window never actually becomes usable again.
  const MAX_RECOVERY_ATTEMPTS = 3;
  const RECOVERY_WINDOW_MS = 2 * 60 * 1000;
  let recoveryAttempts = 0;
  let recoveryWindowStart = 0;

  function attemptRecovery(reason: string): void {
    const now = Date.now();
    if (now - recoveryWindowStart > RECOVERY_WINDOW_MS) {
      recoveryWindowStart = now;
      recoveryAttempts = 0;
    }
    recoveryAttempts += 1;
    if (recoveryAttempts > MAX_RECOVERY_ATTEMPTS) {
      console.error(
        `${reason} again after ${MAX_RECOVERY_ATTEMPTS} reload attempts — giving up rather than reloading forever.`
      );
      return;
    }
    console.error(`${reason}; reloading (attempt ${recoveryAttempts}/${MAX_RECOVERY_ATTEMPTS}).`);
    if (!mainWindow.isDestroyed()) {
      mainWindow.reload();
    }
  }

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    attemptRecovery(`Renderer process gone (${details.reason}, exit code ${details.exitCode})`);
  });

  // A hung renderer (distinct from a crashed one, above) still shows a
  // window and passes Electron's own process checks — Task Manager reports
  // it as "Responding" — while being fully dead to mouse and keyboard input.
  mainWindow.webContents.on("unresponsive", () => {
    attemptRecovery("Renderer became unresponsive");
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
  ipcMain.handle("workspaces:setFolder", (_event, id: string, folderId: string | null) =>
    setWorkspaceFolder(id, folderId)
  );
  ipcMain.handle("folders:list", () => listFolders());
  ipcMain.handle("folders:create", (_event, name: string) => createFolder(name));
  ipcMain.handle("folders:delete", (_event, id: string) => deleteFolder(id));
  ipcMain.handle("midiSettings:get", () => getMidiSettings());
  ipcMain.handle("midiSettings:addInput", (_event, name: string, sourceId: string) =>
    addMidiInput(name, sourceId)
  );
  ipcMain.handle("midiSettings:deleteInput", (_event, id: string) => deleteMidiInput(id));
  ipcMain.handle("midiSettings:addOutput", (_event, name: string) => addMidiOutput(name));
  ipcMain.handle("midiSettings:deleteOutput", (_event, id: string) => deleteMidiOutput(id));
  ipcMain.handle("updater:install", () => quitAndInstallUpdate());
}

app.whenReady().then(() => {
  // Without an explicit handler, Electron falls through to Chromium's native
  // permission UI for navigator.requestMIDIAccess() — a bubble Electron has
  // nowhere to anchor, since none of our windows have the omnibox Chrome
  // normally attaches it to. The request (and the app) hangs waiting for a
  // response that can never arrive. Auto-granting the one permission this
  // app actually uses avoids that native prompt entirely.
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "midi" || permission === "midiSysex");
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === "midi" || permission === "midiSysex";
  });

  registerIpcHandlers();

  const mainWindow = createMainWindow();
  initAutoUpdater(mainWindow);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("child-process-gone", (_event, details) => {
  console.error("Child process gone:", details.type, details.reason, details.exitCode);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
