# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Start Vite dev server
- `npm run build` — TypeScript check (`vue-tsc --noEmit`) + Vite production build to `docs/`
- `npm run preview` — Preview production build
- `npx vue-tsc --noEmit` — Type-check only (no build)

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

### Deployment

Production build outputs to `docs/` (not `dist/`) with `base: './'` for relative asset paths. Designed for GitHub Pages serving from the `docs/` folder on `master`.

### Multi-select

Test cases support Ctrl+click (toggle individual) and Shift+click (range select). Selection state is a `Set<TestCase>` in the store. Batch delete and move-to-folder operate on the full selection.

### Identity

Folders, test cases, and steps each have a `_uid: number` field assigned by `uid()` from `xmlService.ts`. These are runtime-only (not serialized to XML) and used as Vue `:key` values. `assignUids()` re-assigns them when restoring from localStorage.

### Persistence

Project state auto-saves to `localStorage` (debounced 500ms) after every change. Restored on page load. The `hasUnsavedChanges` flag is persisted too so the dirty indicator survives reload.

### File I/O

Uses File System Access API (`showOpenFilePicker`/`showSaveFilePicker`) with fallback to `<input type="file">` and download for browsers without support. Reads UTF-8 with ISO-8859-1 fallback for legacy exports. Output is encoded as ISO-8859-1 bytes (matching Zephyr Scale's format) despite the `encoding="UTF-8"` XML declaration.

### Custom fields

Test cases have a `customFields: CustomField[]` array where each entry has `{name, type, value}`. Two known fields are always present in the model: `Scenario` (`SINGLE_LINE_TEXT`) and `System` (`SINGLE_CHOICE_SELECT_LIST`). `ensureKnownCustomFields()` in `xmlService.ts` backfills these on parse, localStorage restore, new test case creation, and AI merge. The Scenario field is always set to the containing folder's name — on parse, localStorage restore, new test case creation, and when moving test cases between folders. Empty custom fields (value `""`) are omitted when serializing to XML. The detail pane in `TestCasePanel.vue` always shows known fields with a `(none)` placeholder when empty, so users can add values even if the imported file didn't have them. Any other custom fields found in the XML are preserved generically.

### Test case IDs

The `id` field on test cases is a numeric string assigned by Zephyr Scale on import. New test cases created in the app use `id: "0"`. Never use UUIDs — Zephyr rejects non-numeric IDs. IDs don't need to be unique (Zephyr replaces them on import). `assignUids()` migrates any legacy UUID IDs from localStorage to sequential integers.

## XML Format

Step text fields use `<br />` in XML ↔ `\n` in the UI. All text fields wrapped in CDATA. Folder hierarchy is flat in XML (slash-separated `fullPath` attributes) but stored as a tree in the app. See `../ZephyrEdit/zephyr-xml-file-format.md` for the full schema.

### AI integration

`src/services/aiService.ts` provides Claude API integration via a streaming agentic tool-use loop. The AI panel (`AiPanel.vue`) scopes conversations to the selected folder and its subfolders.

**Tool registration design**: All tool capabilities are defined via structured JSON schemas in the `tools` array sent to the API — not as prose in the system prompt. The `apply_operations` tool uses `oneOf` with 13 operation variant schemas, each with a `const` discriminator on `op`, typed properties, and `required` arrays. Shared sub-schemas (`STEP_SCHEMA`, `CUSTOM_FIELD_SCHEMA`, `UPDATABLE_FIELDS_SCHEMA`) reduce duplication. The system prompt contains only app context, domain rules (valid priorities/statuses), and the folder summary.

**System prompt**: Lightweight folder summary only (`_uid` + `name` per test case, no full data). The system prompt is rebuilt on every message so Claude sees current data.

**Tools** (executed locally against in-memory data, not API calls):
- `search_test_cases` — regex pattern match across text fields. `search_in` restricts which fields are searched (name, objective, steps, customFields). Field filters: priority, status, folder, `min_steps`/`max_steps`, `customField: {name, value}`. `include` param selects result fields. Returns `_uid` + `name` by default. Results sorted by relevance (name matches first). `limit` param (default 50), response includes `totalMatches`.
- `get_test_cases` — fetch full or partial data for specific `_uid`s. `include` param selects fields. Default: all fields.
- `apply_operations` — apply edit operations. Stops the agentic loop and returns operations to the UI for user approval.

**Agentic loop**: `sendMessage` calls the API with SSE streaming. If `stop_reason === 'tool_use'`, it executes search/get tools locally and loops (max 20 iterations) until `end_turn` or `apply_operations`. Intermediate tool-use/tool-result messages are ephemeral within one call — cross-turn history uses plain text only.

**Streaming**: SSE streaming via `processStream()`. Text deltas appear word-by-word in the UI. Tool calls and results are shown inline as `MessageSegment`s (interleaved text and tool segments) in the assistant message. Tool progress summaries show search terms and matched case names.

**Operations**: `update_test_case`, `batch_update`, `update_step`, `add_test_case`, `delete_test_case`, `add_step` (with optional `atIndex` for insertion), `delete_step`, `move_step`, `set_custom_field` (update single custom field without fetching all), `move_test_case` (moves between folders, updates Scenario), `create_folder`, `delete_folder`, `regex_replace` (bulk regex on `name`/`objective`/`steps.description`/`steps.expectedResult`/`steps.testData`). Result responses generate a human-readable changelog displayed with Apply/Reject buttons. `applyOperations()` mutates the folder in place. Undo uses deep snapshots (`snapshotFolder`/`restoreFolder`).

API calls go directly from the browser using the `anthropic-dangerous-direct-browser-access` header (no proxy needed). The user's API key is stored in localStorage under `zephyrEdit.settings`. Model: `claude-sonnet-4-6`, max_tokens: 16384, `output_config: { effort: 'medium' }`, no extended thinking.

### Settings

API key stored in `localStorage['zephyrEdit.settings']`. `SettingsDialog.vue` provides the UI. Initialized on module load — if absent, created with empty key.

## Component hierarchy

```
App.vue                         — keyboard shortcuts, splitpanes layout
├── AppToolbar.vue              — Open/Save/SaveAs/Close/Undo/Redo/AI toggle/Settings
├── FolderPanel.vue             — draggable root list
│   └── FolderTreeNode.vue      — recursive, expand/collapse, inline name edit
├── TestCasePanel.vue           — table with sortable columns, detail pane, move-to-folder dialog
├── StepPanel.vue               — draggable list
│   └── StepCard.vue            — fields use EditableText
├── AiPanel.vue                 — AI chat panel (togglable, right side)
├── StatusBar.vue
├── ConfirmDialog.vue           — Teleported modal, driven by store.dialog state
└── SettingsDialog.vue          — API key configuration
```
