# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Start Vite dev server
- `npm run build` — TypeScript check (`vue-tsc -b`) + Vite production build
- `npm run preview` — Preview production build
- `npx vue-tsc -b --noEmit` — Type-check only (no build)

## Stack

Vue 3 (Composition API, `<script setup>`), TypeScript, Vite, Tailwind CSS v4 (`@tailwindcss/vite`), vuedraggable (SortableJS), splitpanes.

## What This App Does

Browser-based editor for Zephyr Scale XML test case exports from Jira. Rewrite of a .NET/Avalonia desktop app at `../ZephyrEdit`. XML round-trip fidelity matters — the serializer hand-builds XML to match Zephyr Scale's exact format (element order, CDATA wrapping, `<br />` for newlines).

## Architecture

### Data flow

XML file → `xmlService.parse()` → reactive `Project` tree → `useAppStore()` composable → Vue components → user edits → `xmlService.serialize()` → XML file

### State management

`src/composables/useAppStore.ts` is a module-level singleton (not Pinia). All state lives in `ref()`s at module scope; `useAppStore()` just returns them. Components access state as `store.selectedFolder.value`. The project tree is deeply reactive — mutating nested objects (folder names, step fields) triggers reactivity automatically.

### Undo/Redo

`src/services/undoManager.ts` — stack of `{undo, redo}` function pairs (max 25). Every mutation in the store records an undo action with closures that capture the before/after state. `isPerforming` flag prevents recording during undo/redo replay. After undo/redo, `triggerRef(project)` forces Vue to re-evaluate dependents.

### Inline editing

`EditableText.vue` — double-click toggles between display span and input/textarea. Emits `commit(oldValue, newValue)` so the parent can call `store.recordPropertyEdit()` for undo support. Enter commits (Shift+Enter for newline in multiline mode), Escape cancels, blur commits.

### Drag-and-drop

vuedraggable wraps all three lists. Folder tree uses nested draggable instances with `group="folders"` for cross-level moves. Cross-list folder moves produce separate `removed` and `added` events — the store tracks `pendingFolderDrag` to pair them into a single undo action. Steps use `.drag-handle`, test cases use `.drag-cell` as drag handles.

### Persistence

Project state auto-saves to `localStorage` (debounced 500ms) after every change. Restored on page load. The `hasUnsavedChanges` flag is persisted too so the dirty indicator survives reload.

### File I/O

Uses File System Access API (`showOpenFilePicker`/`showSaveFilePicker`) with fallback to `<input type="file">` and download for browsers without support. Reads UTF-8 with ISO-8859-1 fallback for legacy exports.

## XML Format

Step text fields use `<br />` in XML ↔ `\n` in the UI. All text fields wrapped in CDATA. Folder hierarchy is flat in XML (slash-separated `fullPath` attributes) but stored as a tree in the app. See `../ZephyrEdit/zephyr-xml-file-format.md` for the full schema.

## Component hierarchy

```
App.vue                         — keyboard shortcuts, splitpanes layout
├── AppToolbar.vue              — Open/Save/SaveAs/Close/Undo/Redo
├── FolderPanel.vue             — draggable root list
│   └── FolderTreeNode.vue      — recursive, expand/collapse, inline name edit
├── TestCasePanel.vue           — table with sortable columns, move-to-folder dialog
├── StepPanel.vue               — draggable list
│   └── StepCard.vue            — fields use EditableText
├── StatusBar.vue
└── ConfirmDialog.vue           — Teleported modal, driven by store.dialog state
```
