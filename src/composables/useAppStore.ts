import { ref, computed, triggerRef } from 'vue'
import type { Project, Folder, TestCase, Step } from '../types'
import { parse, serialize, readFile, uid, ensureKnownCustomFields } from '../services/xmlService'
import * as undo from '../services/undoManager'
import { buildSystemPrompt, sendMessage, generateChangelog, applyOperations, snapshotFolder, restoreFolder } from '../services/aiService'
import type { Operation } from '../services/aiService'

// --- State ---

const project = ref<Project | null>(null)
const fileName = ref<string | null>(null)
const fileHandle = ref<FileSystemFileHandle | null>(null)
const selectedFolder = ref<Folder | null>(null)
const selectedTestCase = ref<TestCase | null>(null)
const selectedTestCases = ref(new Set<TestCase>())
const selectedStep = ref<Step | null>(null)
const hasUnsavedChanges = ref(false)
const clipboardTestCases = ref<TestCase[]>([])

// AI panel state
export type MessageSegment =
  | { type: 'text'; content: string }
  | { type: 'tool'; content: string }

export interface AiMessage {
  role: 'user' | 'assistant'
  content: string
  segments?: MessageSegment[]
  proposal?: {
    operations: Operation[]
    status: 'pending' | 'accepted' | 'rejected'
    folder: Folder
  }
}
const showAiPanel = ref(false)
const aiMessages = ref<AiMessage[]>([])
const aiLoading = ref(false)

// Dialog state
const dialog = ref<{
  visible: boolean
  title: string
  message: string
  confirmText: string
  resolve: ((value: boolean) => void) | null
}>({ visible: false, title: '', message: '', confirmText: 'OK', resolve: null })

// --- Computed ---

const isFileOpen = computed(() => project.value != null)
const testCases = computed(() => selectedFolder.value?.testCases ?? [])
const steps = computed(() => selectedTestCase.value?.steps ?? [])
const canUndo = undo.canUndo
const canRedo = undo.canRedo
const canCopy = computed(() => selectedTestCases.value.size > 0)
const canPaste = computed(() => clipboardTestCases.value.length > 0 && selectedFolder.value != null)

const statusFilePath = computed(() => fileName.value ?? 'No file open')
const statusModified = computed(() => hasUnsavedChanges.value ? 'Modified' : '')
const title = computed(() => {
  const base = fileName.value ? `ZephyrEdit - ${fileName.value}` : 'ZephyrEdit'
  return hasUnsavedChanges.value ? `* ${base}` : base
})

const statusContext = computed(() => {
  if (!project.value) return ''
  if (selectedTestCases.value.size > 1) return `${selectedTestCases.value.size} test cases selected`
  if (selectedTestCase.value) return `${selectedTestCase.value.steps.length} step(s)`
  if (selectedFolder.value) return `${selectedFolder.value.testCases.length} test case(s)`
  const folderCount = countAllFolders(project.value.folders)
  const tcCount = project.value.folders.reduce((sum, f) => sum + countAllTestCases(f), 0)
  return `${folderCount} folders · ${tcCount} test cases`
})

// --- Helpers ---

function countAllFolders(folders: Folder[]): number {
  return folders.reduce((sum, f) => sum + 1 + countAllFolders(f.children), 0)
}

function countAllTestCases(folder: Folder): number {
  return folder.testCases.length + folder.children.reduce((sum, f) => sum + countAllTestCases(f), 0)
}

function allFolders(folders: Folder[]): Folder[] {
  const result: Folder[] = []
  for (const f of folders) {
    result.push(f)
    result.push(...allFolders(f.children))
  }
  return result
}

function findParent(target: Folder, folders?: Folder[]): Folder | null {
  const roots = folders ?? project.value?.folders ?? []
  for (const folder of roots) {
    if (folder.children.includes(target)) return folder
    const found = findParent(target, folder.children)
    if (found) return found
  }
  return null
}

function findFolderContaining(tc: TestCase): Folder | null {
  if (!project.value) return null
  for (const folder of allFolders(project.value.folders)) {
    if (folder.testCases.includes(tc)) return folder
  }
  return null
}

function reindexFolders(folders: Folder[]) {
  for (let i = 0; i < folders.length; i++) folders[i].index = i
}

function markChanged() {
  if (!undo.getIsPerforming()) hasUnsavedChanges.value = true
  schedulePersist()
}

// --- Settings ---

const SETTINGS_KEY = 'zephyrEdit.settings'
const showSettings = ref(false)
const apiKey = ref('')
const projectContext = ref('')

function initSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const settings = JSON.parse(raw)
      apiKey.value = settings.apiKey ?? ''
      projectContext.value = settings.projectContext ?? ''
    } else {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ apiKey: '', projectContext: '' }))
    }
  } catch {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ apiKey: '', projectContext: '' }))
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ apiKey: apiKey.value, projectContext: projectContext.value }))
  } catch {
    // Storage full or unavailable
  }
}

initSettings()

// --- LocalStorage persistence ---

const STORAGE_KEY = 'zephyrEdit.state'
let persistTimer: ReturnType<typeof setTimeout> | null = null

function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(persistToStorage, 500)
}

function persistToStorage() {
  if (!project.value) {
    localStorage.removeItem(STORAGE_KEY)
    return
  }
  try {
    const state = { project: project.value, fileName: fileName.value, hasUnsavedChanges: hasUnsavedChanges.value }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

function restoreFromStorage(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    const state = JSON.parse(raw) as { project: Project; fileName: string | null; hasUnsavedChanges?: boolean }
    if (!state.project?.folders) return false
    // Re-assign _uids so they don't collide with newly created objects
    assignUids(state.project)
    project.value = state.project
    fileName.value = state.fileName
    hasUnsavedChanges.value = state.hasUnsavedChanges ?? false
    return true
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return false
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function assignUids(p: Project) {
  let nextId = 1
  for (const f of allFolders(p.folders)) {
    f._uid = uid()
    for (const tc of f.testCases) {
      tc._uid = uid()
      if (UUID_RE.test(tc.id)) tc.id = String(nextId++)
      if (!tc.customFields) tc.customFields = []
      ensureKnownCustomFields(tc.customFields, f.name)
      for (const s of tc.steps) {
        s._uid = uid()
      }
    }
  }
}

function clearStorage() {
  localStorage.removeItem(STORAGE_KEY)
}

function moveArrayElement<T>(arr: T[], from: number, to: number) {
  const item = arr.splice(from, 1)[0]
  arr.splice(to, 0, item)
}

// --- Confirm dialog ---

function confirm(title: string, message: string, confirmText = 'OK'): Promise<boolean> {
  return new Promise(resolve => {
    dialog.value = { visible: true, title, message, confirmText, resolve }
  })
}

function resolveDialog(value: boolean) {
  dialog.value.resolve?.(value)
  dialog.value.visible = false
}

// --- File operations ---

async function openFile() {
  if (hasUnsavedChanges.value) {
    const discard = await confirm('Unsaved Changes', 'You have unsaved changes. Discard them?', 'Discard')
    if (!discard) return
  }

  try {
    if ('showOpenFilePicker' in window) {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'XML files', accept: { 'text/xml': ['.xml'] } }],
        multiple: false,
      })
      const file = await handle.getFile()
      const text = await readFile(file)
      loadProject(text, file.name)
      fileHandle.value = handle
    } else {
      // Fallback: use hidden file input
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.xml'
      input.onchange = async () => {
        const file = input.files?.[0]
        if (!file) return
        const text = await readFile(file)
        loadProject(text, file.name)
      }
      input.click()
    }
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === 'AbortError') return
    throw e
  }
}

function loadProject(xmlText: string, name: string) {
  const p = parse(xmlText)
  project.value = p
  fileName.value = name
  selectedFolder.value = null
  selectedTestCase.value = null
  selectedStep.value = null
  hasUnsavedChanges.value = false
  undo.clear()
  persistToStorage()
}

async function closeFile() {
  if (!project.value) return
  if (hasUnsavedChanges.value) {
    const discard = await confirm('Unsaved Changes', 'You have unsaved changes. Discard them?', 'Discard')
    if (!discard) return
  }
  project.value = null
  fileName.value = null
  fileHandle.value = null
  selectedFolder.value = null
  selectedTestCase.value = null
  selectedStep.value = null
  hasUnsavedChanges.value = false
  undo.clear()
  clearStorage()
}

async function save() {
  if (!project.value) return
  const content = serialize(project.value)

  const bytes = encodeISO8859(content)
  if (fileHandle.value) {
    try {
      const writable = await fileHandle.value.createWritable()
      await writable.write(bytes)
      await writable.close()
      hasUnsavedChanges.value = false
      return
    } catch {
      // Fall through to download
    }
  }
  downloadFile(content, fileName.value ?? 'export.xml')
  hasUnsavedChanges.value = false
  persistToStorage()
}

async function saveAs() {
  if (!project.value) return
  const content = serialize(project.value)

  try {
    if ('showSaveFilePicker' in window) {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName.value ?? 'export.xml',
        types: [{ description: 'XML files', accept: { 'text/xml': ['.xml'] } }],
      })
      const writable = await handle.createWritable()
      await writable.write(encodeISO8859(content))
      await writable.close()
      fileHandle.value = handle
      const file = await handle.getFile()
      fileName.value = file.name
      hasUnsavedChanges.value = false
      return
    }
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === 'AbortError') return
    throw e
  }

  downloadFile(content, fileName.value ?? 'export.xml')
  hasUnsavedChanges.value = false
}

function encodeISO8859(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length)
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 0xFF
  return bytes
}

function downloadFile(content: string, name: string) {
  const blob = new Blob([encodeISO8859(content)], { type: 'text/xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

// --- Undo/Redo ---

function doUndo() {
  undo.undo()
  hasUnsavedChanges.value = true
  triggerRef(project)
}

function doRedo() {
  undo.redo()
  hasUnsavedChanges.value = true
  triggerRef(project)
}

// --- Property edit recording ---

function recordPropertyEdit(target: Record<string, unknown>, prop: string, oldValue: unknown, newValue: unknown) {
  undo.record({
    undo: () => { target[prop] = oldValue },
    redo: () => { target[prop] = newValue },
  })
  markChanged()
}

// --- Folder operations ---

function selectFolder(folder: Folder | null) {
  selectedFolder.value = folder
  selectedTestCase.value = null
  selectedTestCases.value = new Set()
  selectedStep.value = null
}

function addFolder() {
  if (!project.value) return
  const siblings = selectedFolder.value?.children ?? project.value.folders
  const maxIndex = siblings.length > 0 ? Math.max(...siblings.map(f => f.index)) : -1
  const folder: Folder = { _uid: uid(), index: maxIndex + 1, name: 'New Folder', children: [], testCases: [] }
  siblings.push(folder)
  selectFolder(folder)

  undo.record({
    undo: () => { siblings.splice(siblings.indexOf(folder), 1); selectFolder(null) },
    redo: () => { siblings.push(folder); selectFolder(folder) },
  })
  markChanged()
}

async function deleteFolder() {
  if (!project.value || !selectedFolder.value) return

  const folder = selectedFolder.value
  const childCount = countAllFolders(folder.children)
  const testCaseCount = countAllTestCases(folder)

  if (childCount > 0 || testCaseCount > 0) {
    let message = `Delete "${folder.name}"`
    if (childCount > 0) message += ` and ${childCount} subfolder(s)`
    if (testCaseCount > 0) message += ` with ${testCaseCount} test case(s)`
    message += '?'

    const confirmed = await confirm('Delete Folder', message, 'Delete')
    if (!confirmed) return
  }

  const parent = findParent(folder)
  const siblings = parent?.children ?? project.value.folders
  const index = siblings.indexOf(folder)
  siblings.splice(index, 1)
  selectFolder(parent)

  undo.record({
    undo: () => { siblings.splice(Math.min(index, siblings.length), 0, folder); selectFolder(folder) },
    redo: () => { siblings.splice(siblings.indexOf(folder), 1); selectFolder(parent) },
  })
  markChanged()
}

// Folder drag: called when vuedraggable fires 'change' events on nested lists.
// We track pending removes so we can pair them with adds for cross-list moves.
let pendingFolderDrag: { element: Folder; sourceList: Folder[]; oldIndex: number } | null = null

function onFolderDragChange(list: Folder[], event: { moved?: { element: Folder; oldIndex: number; newIndex: number }; removed?: { element: Folder; oldIndex: number }; added?: { element: Folder; newIndex: number } }) {
  if (event.moved) {
    const { element, oldIndex, newIndex } = event.moved
    reindexFolders(list)
    undo.record({
      undo: () => { moveArrayElement(list, newIndex, oldIndex); reindexFolders(list) },
      redo: () => { moveArrayElement(list, oldIndex, newIndex); reindexFolders(list) },
    })
    selectFolder(element)
    markChanged()
  }
  if (event.removed) {
    pendingFolderDrag = { element: event.removed.element, sourceList: list, oldIndex: event.removed.oldIndex }
    reindexFolders(list)
  }
  if (event.added) {
    const { element, newIndex } = event.added
    reindexFolders(list)
    if (pendingFolderDrag && pendingFolderDrag.element === element) {
      const { sourceList, oldIndex } = pendingFolderDrag
      pendingFolderDrag = null
      undo.record({
        undo: () => {
          list.splice(list.indexOf(element), 1)
          reindexFolders(list)
          sourceList.splice(Math.min(oldIndex, sourceList.length), 0, element)
          reindexFolders(sourceList)
        },
        redo: () => {
          sourceList.splice(sourceList.indexOf(element), 1)
          reindexFolders(sourceList)
          list.splice(Math.min(newIndex, list.length), 0, element)
          reindexFolders(list)
        },
      })
    }
    selectFolder(element)
    markChanged()
  }
}

// --- Test case operations ---

function selectTestCase(tc: TestCase | null) {
  if (tc) {
    selectedTestCases.value = new Set([tc])
  } else {
    selectedTestCases.value = new Set()
  }
  selectedTestCase.value = tc
  selectedStep.value = null
}

function toggleTestCaseSelection(tc: TestCase) {
  const set = selectedTestCases.value
  if (set.has(tc)) {
    set.delete(tc)
    selectedTestCase.value = set.size > 0 ? [...set][set.size - 1] : null
  } else {
    set.add(tc)
    selectedTestCase.value = tc
  }
  selectedStep.value = null
}

function selectTestCaseRange(visibleList: TestCase[], tc: TestCase) {
  const anchor = selectedTestCase.value
  if (!anchor) { selectTestCase(tc); return }
  const from = visibleList.indexOf(anchor)
  const to = visibleList.indexOf(tc)
  if (from < 0 || to < 0) { selectTestCase(tc); return }
  const start = Math.min(from, to)
  const end = Math.max(from, to)
  selectedTestCases.value = new Set(visibleList.slice(start, end + 1))
  // Keep anchor as selectedTestCase for next shift-click
  selectedStep.value = null
}

function addTestCase() {
  if (!selectedFolder.value) return
  const folder = selectedFolder.value
  const tc: TestCase = {
    _uid: uid(),
    id: '0',
    key: '',
    name: 'New Test Case',
    priority: 'High',
    status: 'Draft',
    createdBy: '',
    createdOn: new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC'),
    objective: null,
    updatedBy: null,
    updatedOn: null,
    owner: null,
    customFields: ensureKnownCustomFields([], folder.name),
    issues: [],
    steps: [],
  }
  folder.testCases.push(tc)
  selectTestCase(tc)

  undo.record({
    undo: () => { folder.testCases.splice(folder.testCases.indexOf(tc), 1); selectTestCase(null) },
    redo: () => { folder.testCases.push(tc); selectTestCase(tc) },
  })
  markChanged()
}

function copyTestCase() {
  if (selectedTestCases.value.size === 0) return
  const sourceFolder = findFolderContaining([...selectedTestCases.value][0])
  const ordered = sourceFolder
    ? sourceFolder.testCases.filter(tc => selectedTestCases.value.has(tc))
    : [...selectedTestCases.value]
  clipboardTestCases.value = ordered.map(tc => JSON.parse(JSON.stringify(tc)) as TestCase)
}

function pasteTestCase() {
  if (clipboardTestCases.value.length === 0 || !selectedFolder.value) return
  const folder = selectedFolder.value
  const existing = new Set(folder.testCases.map(t => t.name))
  const pasted: TestCase[] = []

  for (const source of clipboardTestCases.value) {
    const tc = JSON.parse(JSON.stringify(source)) as TestCase
    tc._uid = uid()
    tc.id = '0'
    for (const s of tc.steps) s._uid = uid()

    while (existing.has(tc.name)) tc.name = tc.name + ' - Copy'
    existing.add(tc.name)

    ensureKnownCustomFields(tc.customFields, folder.name)
    folder.testCases.push(tc)
    pasted.push(tc)
  }

  selectedTestCases.value = new Set(pasted)
  selectedTestCase.value = pasted[pasted.length - 1]
  selectedStep.value = null

  undo.record({
    undo: () => {
      for (const tc of pasted) folder.testCases.splice(folder.testCases.indexOf(tc), 1)
      selectTestCase(null)
    },
    redo: () => {
      for (const tc of pasted) folder.testCases.push(tc)
      selectedTestCases.value = new Set(pasted)
      selectedTestCase.value = pasted[pasted.length - 1]
      selectedStep.value = null
    },
  })
  markChanged()
}

function deleteTestCase() {
  if (!selectedFolder.value || selectedTestCases.value.size === 0) return
  const folder = selectedFolder.value
  const toDelete = [...selectedTestCases.value]
  // Capture each item with its original index (in reverse order for safe splicing)
  const entries = toDelete
    .map(tc => ({ tc, index: folder.testCases.indexOf(tc) }))
    .filter(e => e.index >= 0)
    .sort((a, b) => b.index - a.index)

  for (const { tc } of entries) {
    folder.testCases.splice(folder.testCases.indexOf(tc), 1)
  }
  selectTestCase(null)

  undo.record({
    undo: () => {
      for (const { tc, index } of [...entries].reverse()) {
        folder.testCases.splice(Math.min(index, folder.testCases.length), 0, tc)
      }
      selectedTestCases.value = new Set(toDelete)
      selectedTestCase.value = toDelete[0]
    },
    redo: () => {
      for (const { tc } of entries) {
        folder.testCases.splice(folder.testCases.indexOf(tc), 1)
      }
      selectTestCase(null)
    },
  })
  markChanged()
}

function onTestCaseDragEnd(oldIndex: number, newIndex: number) {
  if (oldIndex === newIndex || !selectedFolder.value) return
  const list = selectedFolder.value.testCases
  undo.record({
    undo: () => moveArrayElement(list, newIndex, oldIndex),
    redo: () => moveArrayElement(list, oldIndex, newIndex),
  })
  markChanged()
}

function moveTestCasesToFolder(testCases: TestCase[], targetFolder: Folder) {
  // Group by source folder with original indices
  const moves: Array<{ tc: TestCase; sourceFolder: Folder; oldIndex: number }> = []
  for (const tc of testCases) {
    const source = findFolderContaining(tc)
    if (!source || source === targetFolder) continue
    moves.push({ tc, sourceFolder: source, oldIndex: source.testCases.indexOf(tc) })
  }
  if (moves.length === 0) return

  // Remove from sources (reverse index order to keep indices stable)
  const bySource = new Map<Folder, typeof moves>()
  for (const m of moves) {
    if (!bySource.has(m.sourceFolder)) bySource.set(m.sourceFolder, [])
    bySource.get(m.sourceFolder)!.push(m)
  }
  for (const entries of bySource.values()) {
    entries.sort((a, b) => b.oldIndex - a.oldIndex)
    for (const { sourceFolder, oldIndex } of entries) {
      sourceFolder.testCases.splice(oldIndex, 1)
    }
  }

  // Add to target and update Scenario to match new folder
  for (const { tc } of moves) {
    targetFolder.testCases.push(tc)
    ensureKnownCustomFields(tc.customFields, targetFolder.name)
  }

  selectFolder(targetFolder)
  selectedTestCases.value = new Set(moves.map(m => m.tc))
  selectedTestCase.value = moves[0].tc

  undo.record({
    undo: () => {
      // Remove from target
      for (const { tc } of moves) {
        targetFolder.testCases.splice(targetFolder.testCases.indexOf(tc), 1)
      }
      // Re-insert into sources at original positions
      for (const entries of bySource.values()) {
        for (const { tc, sourceFolder, oldIndex } of [...entries].reverse()) {
          sourceFolder.testCases.splice(Math.min(oldIndex, sourceFolder.testCases.length), 0, tc)
          ensureKnownCustomFields(tc.customFields, sourceFolder.name)
        }
      }
      const firstSource = moves[0].sourceFolder
      selectFolder(firstSource)
      selectedTestCases.value = new Set(moves.map(m => m.tc))
      selectedTestCase.value = moves[0].tc
    },
    redo: () => {
      for (const entries of bySource.values()) {
        entries.sort((a, b) => b.oldIndex - a.oldIndex)
        for (const { sourceFolder, oldIndex } of entries) {
          sourceFolder.testCases.splice(oldIndex, 1)
        }
      }
      for (const { tc } of moves) {
        targetFolder.testCases.push(tc)
        ensureKnownCustomFields(tc.customFields, targetFolder.name)
      }
      selectFolder(targetFolder)
      selectedTestCases.value = new Set(moves.map(m => m.tc))
      selectedTestCase.value = moves[0].tc
    },
  })
  markChanged()
}

// --- Step operations ---

function selectStep(step: Step | null) {
  selectedStep.value = step
}

function addStep() {
  if (!selectedTestCase.value) return
  const tc = selectedTestCase.value
  const step: Step = { _uid: uid(), description: '', expectedResult: null, testData: null }
  tc.steps.push(step)
  selectedStep.value = step

  undo.record({
    undo: () => { tc.steps.splice(tc.steps.indexOf(step), 1) },
    redo: () => { tc.steps.push(step); selectedStep.value = step },
  })
  markChanged()
}

function deleteStep(step: Step) {
  if (!selectedTestCase.value) return
  const tc = selectedTestCase.value
  const index = tc.steps.indexOf(step)

  tc.steps.splice(index, 1)
  selectedStep.value = null

  undo.record({
    undo: () => { tc.steps.splice(Math.min(index, tc.steps.length), 0, step) },
    redo: () => { tc.steps.splice(tc.steps.indexOf(step), 1) },
  })
  markChanged()
}

function onStepDragEnd(oldIndex: number, newIndex: number) {
  if (oldIndex === newIndex || !selectedTestCase.value) return
  const list = selectedTestCase.value.steps
  undo.record({
    undo: () => moveArrayElement(list, newIndex, oldIndex),
    redo: () => moveArrayElement(list, oldIndex, newIndex),
  })
  markChanged()
}

// --- AI operations ---

async function sendAiMessage(text: string) {
  if (!selectedFolder.value || !apiKey.value) return

  const folder = selectedFolder.value
  aiMessages.value.push({ role: 'user', content: text })
  aiLoading.value = true

  // Create assistant message early so streaming text appears immediately
  aiMessages.value.push({ role: 'assistant', content: '', segments: [] })
  const msgIndex = aiMessages.value.length - 1

  try {
    const systemPrompt = buildSystemPrompt(folder, projectContext.value)
    // Build messages for API — exclude the streaming placeholder
    const messages = aiMessages.value.slice(0, -1).map(m => ({ role: m.role, content: m.content }))

    const response = await sendMessage(messages, systemPrompt, apiKey.value, folder, {
      onText: (delta) => {
        const msg = aiMessages.value[msgIndex]
        msg.content += delta
        const segs = msg.segments!
        const last = segs[segs.length - 1]
        if (last?.type === 'text') {
          last.content += delta
        } else {
          segs.push({ type: 'text', content: delta })
        }
      },
      onToolProgress: (summary) => {
        aiMessages.value[msgIndex].segments!.push({ type: 'tool', content: summary })
      },
    })

    const msg = aiMessages.value[msgIndex]

    if (response.type === 'result') {
      const changelog = generateChangelog(folder, response.operations)
      if (msg.content && !msg.content.endsWith('\n')) msg.content += '\n\n'
      msg.content += changelog
      msg.segments!.push({ type: 'text', content: changelog })
      msg.proposal = { operations: response.operations, status: 'pending', folder }
    }
    // For 'answer', text is already populated via onText streaming
    if (!msg.content) msg.content = '(no response)'
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const msg = aiMessages.value[msgIndex]
    const errText = `Error: ${message}`
    msg.content = msg.content ? msg.content + `\n\n${errText}` : errText
    msg.segments!.push({ type: 'text', content: errText })
  } finally {
    aiLoading.value = false
  }
}

function acceptProposal(msg: AiMessage) {
  if (!msg.proposal || msg.proposal.status !== 'pending') return
  const { operations, folder } = msg.proposal

  const before = snapshotFolder(folder)
  applyOperations(folder, operations)
  const after = snapshotFolder(folder)

  msg.proposal.status = 'accepted'

  undo.record({
    undo: () => restoreFolder(folder, before),
    redo: () => restoreFolder(folder, after),
  })
  markChanged()
  triggerRef(project)
}

function rejectProposal(msg: AiMessage) {
  if (!msg.proposal || msg.proposal.status !== 'pending') return
  msg.proposal.status = 'rejected'
}

function clearAiChat() {
  aiMessages.value = []
}

// --- Init: restore from localStorage ---

restoreFromStorage()

// --- Beforeunload warning ---

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedChanges.value) {
      e.preventDefault()
    }
  })
}

// --- Export ---

export function useAppStore() {
  return {
    // State
    project, fileName, selectedFolder, selectedTestCase, selectedTestCases, selectedStep,
    hasUnsavedChanges, dialog, showSettings, apiKey, projectContext,
    showAiPanel, aiMessages, aiLoading,
    // Computed
    isFileOpen, testCases, steps, canUndo, canRedo, canCopy, canPaste,
    statusFilePath, statusContext, statusModified, title,
    // File ops
    openFile, save, saveAs, closeFile,
    // Undo
    doUndo, doRedo,
    // Folders
    selectFolder, addFolder, deleteFolder, onFolderDragChange,
    allFolders: () => project.value ? allFolders(project.value.folders) : [],
    // Test cases
    selectTestCase, toggleTestCaseSelection, selectTestCaseRange,
    addTestCase, deleteTestCase, onTestCaseDragEnd,
    moveTestCasesToFolder, copyTestCase, pasteTestCase,
    // Steps
    selectStep, addStep, deleteStep, onStepDragEnd,
    // Edits
    recordPropertyEdit, markChanged,
    // Dialog
    confirm, resolveDialog,
    // Settings
    saveSettings,
    // AI
    sendAiMessage, acceptProposal, rejectProposal, clearAiChat,
  }
}
