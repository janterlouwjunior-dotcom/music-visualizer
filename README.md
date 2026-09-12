# Music Theory Visualizer

Desktop app (Electron + TypeScript) for building a library of interactive music
theory visualizations and arranging them into per-lesson workspace pages. See
the original spec for full context on architecture and decisions.

## Status

First working prototype. What exists:

- Electron + TypeScript + Vite shell (`apps/desktop`), built with `electron-vite`.
- A `@music-theory-viz/ui-kit` package (`packages/ui-kit`) holding design tokens
  (CSS custom properties) and two reskinned primitives (`Button`, `Panel`), kept
  as a separate npm workspace package so it can be reused later outside this app.
- Sidebar with workspace switching, creation, duplication, and deletion.
- Workspaces can be grouped into folders ("mother workspaces") via the folder
  select on each workspace row. Opening a folder jumps to its first (by name)
  child workspace, and **← / →** cycle between sibling workspaces in the same
  folder (wrapping around) as long as focus isn't in a text/number field.
  Deleting a folder ungroups its children rather than deleting them.
- A per-workspace grid settings menu (columns, row height) in the workspace
  toolbar.
- **Edit / Play mode**, toggled with the **Tab** key (ignored while a text/number
  field has focus, so normal tabbing between fields still works). Edit mode is
  the full authoring experience; Play mode hides the sidebar and all layout
  chrome (add/remove, drag, resize, grid settings) for distraction-free use in
  front of a class — the visualizations' own interactive controls (e.g. Circle
  of Fifths' key selector and MIDI listening) stay live in both modes.
- A grid-based workspace layout (`react-grid-layout`) that persists to JSON
  files under the app's `userData/workspaces` folder — components can be
  dragged and resized, and changes autosave.
- A component registry (`src/renderer/src/components/registry.ts`) — the
  extension point for adding new visualizations without touching existing code.
- One real visualization proving the full component contract: **Circle of
  Fifths** (`components/visualizations/CircleOfFifths.tsx`) — configurable
  highlighted key, and bidirectional MIDI (highlights on incoming notes,
  clicking a segment sends a note out).
- A renderer-side MIDI service (`midi/midiService.ts`) built on the **Web MIDI
  API** (native to Chromium, no native Node module / build toolchain needed).
  It talks to whatever real MIDI devices are already connected. It does **not**
  yet create its own virtual MIDI port — that's a distribution-phase feature
  (virtualMIDI SDK on Windows, CoreMIDI on Mac), not needed to prove the
  component contract.
- A global **Settings** page (gear icon, top of the sidebar; only reachable in
  Edit mode) for managing named MIDI devices, stored in
  `userData/midi-settings.json`:
  - **Input devices**: name + pick from a live-updating dropdown of currently
    connected Web MIDI inputs. Fully functional today.
  - **Virtual output devices**: name only. These are reserved placeholders —
    Web MIDI can send to ports that already exist but can't create a new one
    other apps (Bitwig included) would see, so entries here aren't backed by a
    real port yet. That needs a native MIDI module and, on Windows, bundling a
    virtual-port driver SDK (see the MIDI section above) — deliberately not
    done yet to avoid taking on a native-module/Electron-ABI build risk
    without you at the machine to test it.
- `electron-builder` + `electron-updater` wired in from the start, targeting
  NSIS (Windows) and dmg (macOS), with a GitHub Releases update provider.

## Running it

```bash
npm install
npm run dev
```

This opens the app with hot reload. On first run it seeds one sample workspace
("Week 1 — Circle of Fifths").

## Building

```bash
npm run build       # compile only
npm run build:win   # NSIS installer (Windows)
npm run build:mac   # dmg (macOS, needs a Mac or CI runner)
```

### Known issue: Windows installer build needs Developer Mode or admin

`electron-builder` downloads a cross-platform signing-tools archive
(`winCodeSign`) even for an unsigned Windows build, and extracting it involves
creating a symbolic link. Standard (non-admin) Windows accounts without
**Developer Mode** enabled don't have that privilege, so the download step
retries and eventually fails with:

```
ERROR: Cannot create symbolic link : A required privilege is not held by the client.
```

This doesn't affect the app itself — `npm run build` + a plain
`electron-builder --dir` still produces a working unpacked app
(`release/win-unpacked/Music Theory Visualizer.exe`), which is what was used to
smoke-test this prototype. To produce the actual NSIS `.exe` installer, either:

- Enable **Settings → Privacy & Security → For developers → Developer Mode**, or
- Run the build command from an elevated (Administrator) terminal.

Neither of those is something to do without you present, so it's left as a
manual step.

### Before the first real release

- Replace `REPLACE_WITH_GITHUB_OWNER` / `REPLACE_WITH_GITHUB_REPO` in
  `apps/desktop/package.json`'s `build.publish` with the real GitHub repo once
  one exists.
- macOS distribution needs a paid Apple Developer ID + notarization or
  Gatekeeper will block/warn and auto-update won't work reliably.
- Add a real app icon (`.ico` for Windows, `.icns` for macOS) under
  `apps/desktop/resources` — the prototype ships with electron-builder's
  default icon.

## Project layout

```
music-theory-viz/
  packages/
    ui-kit/          design tokens + reskinned primitives, standalone package
  apps/
    desktop/
      src/
        main/        window creation, workspace file I/O, auto-updater
        preload/      contextBridge API surface exposed to the renderer
        renderer/     React app: sidebar, grid layout, visualizations
        shared/       types shared between main and renderer
```

## Adding a new visualization

1. Create `apps/desktop/src/renderer/src/components/visualizations/YourViz.tsx`
   implementing `VisualizationProps` from `components/types.ts`.
2. Register it in `components/registry.ts`.

No other file needs to change — the sidebar, picker, and grid all read from
the registry.
