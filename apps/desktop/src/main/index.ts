import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join } from "path";
import {
  createWorkspace,
  deleteWorkspace,
  duplicateWorkspace,
  listWorkspaces,
  loadWorkspace,
  renameWorkspace,
  reorderWorkspaces,
  saveWorkspace,
  setWorkspaceFolder
} from "./workspaces";
import { createFolder, deleteFolder, listFolders, renameFolder, reorderFolders } from "./folders";
import {
  addMidiInput,
  addMidiOutput,
  deleteMidiInput,
  deleteMidiOutput,
  getMidiSettings
} from "./midiSettings";
import { nativeMidi } from "./nativeMidi";
import { initAutoUpdater, quitAndInstallUpdate } from "./updater";
import type { Workspace } from "../shared/workspace";
import type { MidiNoteEvent } from "../shared/midi";

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

  nativeMidi.onNote((event: MidiNoteEvent) => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send("midi:note", event);
  });
  nativeMidi.onDeviceChange(() => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send("midi:devicechange");
  });

  // Gives the native MIDI worker process a chance to close its ports before
  // the app actually quits — entirely within the main process, independent
  // of renderer health, unlike the browser-based Web MIDI approach this
  // replaced (see the comment on MidiNoteEvent in shared/midi.ts). A port
  // left open when the process just dies has, on at least this machine,
  // sometimes left the underlying driver in a state that hangs the *next*
  // launch's MIDI startup.
  let readyToClose = false;
  mainWindow.on("close", (event) => {
    if (readyToClose) return;
    event.preventDefault();
    nativeMidi.shutdown().finally(() => {
      readyToClose = true;
      mainWindow.destroy();
    });
  });

  // Recovers from a crashed or hung renderer by reloading — but only a
  // few times per short window. A cause that clears itself (a one-off GPU
  // blip, a transient OS hiccup) gets fixed by the reload. A cause that
  // doesn't clear itself would otherwise retrigger the same hang right
  // after every reload, forever, silently: reloading looks like recovery
  // but the window never actually becomes usable again.
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
  ipcMain.handle("workspaces:create", (_event, name: string, folderId: string) =>
    createWorkspace(name, folderId)
  );
  ipcMain.handle("workspaces:duplicate", (_event, id: string, newName: string) =>
    duplicateWorkspace(id, newName)
  );
  ipcMain.handle("workspaces:delete", (_event, id: string) => deleteWorkspace(id));
  ipcMain.handle("workspaces:rename", (_event, id: string, name: string) => renameWorkspace(id, name));
  ipcMain.handle("workspaces:setFolder", (_event, id: string, folderId: string) =>
    setWorkspaceFolder(id, folderId)
  );
  ipcMain.handle("workspaces:reorder", (_event, folderId: string, orderedIds: string[]) =>
    reorderWorkspaces(folderId, orderedIds)
  );
  ipcMain.handle("folders:list", () => listFolders());
  ipcMain.handle("folders:create", (_event, name: string) => createFolder(name));
  ipcMain.handle("folders:rename", (_event, id: string, name: string) => renameFolder(id, name));
  ipcMain.handle("folders:reorder", (_event, orderedIds: string[]) => reorderFolders(orderedIds));
  ipcMain.handle("folders:delete", (_event, id: string) => deleteFolder(id));
  ipcMain.handle("midiSettings:get", () => getMidiSettings());
  // Each of these applies to the live, already-running MIDI worker
  // immediately after saving — not just on next launch — so a device
  // removed here actually stops being listened to/sent to right away.
  ipcMain.handle("midiSettings:addInput", async (_event, name: string, sourceId: string) => {
    const device = await addMidiInput(name, sourceId);
    await nativeMidi.reconfigure();
    return device;
  });
  ipcMain.handle("midiSettings:deleteInput", async (_event, id: string) => {
    await deleteMidiInput(id);
    await nativeMidi.reconfigure();
  });
  ipcMain.handle("midiSettings:addOutput", async (_event, name: string, sourceId: string) => {
    const device = await addMidiOutput(name, sourceId);
    await nativeMidi.reconfigure();
    return device;
  });
  ipcMain.handle("midiSettings:deleteOutput", async (_event, id: string) => {
    await deleteMidiOutput(id);
    await nativeMidi.reconfigure();
  });
  ipcMain.handle("updater:install", () => quitAndInstallUpdate());

  ipcMain.handle("midi:init", () => nativeMidi.start());
  ipcMain.handle("midi:getDeviceInfo", () => nativeMidi.getDeviceInfo());
  ipcMain.handle("midi:getAvailablePorts", () => nativeMidi.getAvailablePorts());
  ipcMain.on("midi:send", (_event, midiEvent: Omit<MidiNoteEvent, "source">) =>
    nativeMidi.sendNote(midiEvent)
  );
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

app.on("child-process-gone", (_event, details) => {
  console.error("Child process gone:", details.type, details.reason, details.exitCode);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
