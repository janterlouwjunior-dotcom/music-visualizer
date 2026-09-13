import { contextBridge, ipcRenderer } from "electron";
import type { Workspace, WorkspaceFolder, WorkspaceSummary } from "../shared/workspace";
import type { MidiInputDevice, MidiOutputDevice, MidiSettings } from "../shared/midiSettings";
import type { UpdaterStatus } from "../shared/updater";

const api = {
  workspaces: {
    list: (): Promise<WorkspaceSummary[]> => ipcRenderer.invoke("workspaces:list"),
    load: (id: string): Promise<Workspace> => ipcRenderer.invoke("workspaces:load", id),
    save: (workspace: Workspace): Promise<void> => ipcRenderer.invoke("workspaces:save", workspace),
    create: (name: string): Promise<Workspace> => ipcRenderer.invoke("workspaces:create", name),
    duplicate: (id: string, newName: string): Promise<Workspace> =>
      ipcRenderer.invoke("workspaces:duplicate", id, newName),
    delete: (id: string): Promise<void> => ipcRenderer.invoke("workspaces:delete", id),
    rename: (id: string, name: string): Promise<Workspace> =>
      ipcRenderer.invoke("workspaces:rename", id, name),
    setFolder: (id: string, folderId: string | null): Promise<Workspace> =>
      ipcRenderer.invoke("workspaces:setFolder", id, folderId)
  },
  folders: {
    list: (): Promise<WorkspaceFolder[]> => ipcRenderer.invoke("folders:list"),
    create: (name: string): Promise<WorkspaceFolder> => ipcRenderer.invoke("folders:create", name),
    rename: (id: string, name: string): Promise<WorkspaceFolder> =>
      ipcRenderer.invoke("folders:rename", id, name),
    delete: (id: string): Promise<void> => ipcRenderer.invoke("folders:delete", id)
  },
  midiSettings: {
    get: (): Promise<MidiSettings> => ipcRenderer.invoke("midiSettings:get"),
    addInput: (name: string, sourceId: string): Promise<MidiInputDevice> =>
      ipcRenderer.invoke("midiSettings:addInput", name, sourceId),
    deleteInput: (id: string): Promise<void> => ipcRenderer.invoke("midiSettings:deleteInput", id),
    addOutput: (name: string): Promise<MidiOutputDevice> =>
      ipcRenderer.invoke("midiSettings:addOutput", name),
    deleteOutput: (id: string): Promise<void> => ipcRenderer.invoke("midiSettings:deleteOutput", id)
  },
  updater: {
    install: (): Promise<void> => ipcRenderer.invoke("updater:install"),
    onStatus: (callback: (status: UpdaterStatus) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, status: UpdaterStatus): void =>
        callback(status);
      ipcRenderer.on("updater:status", listener);
      return () => ipcRenderer.removeListener("updater:status", listener);
    }
  }
};

export type Api = typeof api;

contextBridge.exposeInMainWorld("api", api);
