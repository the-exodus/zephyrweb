import type { Folder, TestCase } from '../types'
import { uid, ensureKnownCustomFields } from './xmlService'

// --- Input serialization (what we send to Claude) ---

interface FolderPayload {
  name: string
  children: FolderPayload[]
  testCases: Array<{
    _uid: number
    id: string
    key?: string
    name: string
    priority: string
    status: string
    objective?: string | null
    customFields?: Array<{ name: string; type: string; value: string }>
    steps: Array<Record<string, string>>
  }>
}

function serializeFolderTree(folder: Folder): FolderPayload {
  return {
    name: folder.name,
    children: folder.children.map(serializeFolderTree),
    testCases: folder.testCases.map(tc => {
      const entry: FolderPayload['testCases'][number] = {
        _uid: tc._uid,
        id: tc.id,
        name: tc.name,
        priority: tc.priority,
        status: tc.status,
        steps: tc.steps.map(s => {
          const step: Record<string, string> = {}
          if (s.description != null) step.description = s.description
          if (s.expectedResult != null) step.expectedResult = s.expectedResult
          if (s.testData != null) step.testData = s.testData
          return step
        }),
      }
      if (tc.key) entry.key = tc.key
      if (tc.objective) entry.objective = tc.objective
      const nonEmpty = tc.customFields.filter(cf => cf.value)
      if (nonEmpty.length > 0) entry.customFields = nonEmpty.map(cf => ({ name: cf.name, type: cf.type, value: cf.value }))
      return entry
    }),
  }
}

// --- Operation types (what Claude sends via tool use) ---

export type Operation =
  | { op: 'update_test_case'; _uid: number; fields: Record<string, unknown> }
  | { op: 'batch_update'; _uids: number[]; fields: Record<string, unknown> }
  | { op: 'update_step'; _uid: number; stepIndex: number; fields: Record<string, unknown> }
  | { op: 'add_test_case'; folder: string; testCase: { name: string; priority: string; status: string; objective?: string | null; customFields?: Array<{ name: string; type: string; value: string }>; steps: Array<{ description: string | null; expectedResult: string | null; testData: string | null }> } }
  | { op: 'delete_test_case'; _uid: number }
  | { op: 'add_step'; _uid: number; step: { description: string | null; expectedResult: string | null; testData: string | null } }
  | { op: 'delete_step'; _uid: number; stepIndex: number }

export type AiResponse =
  | { type: 'answer'; text: string }
  | { type: 'result'; operations: Operation[]; reasoning?: string }

// --- Tool definition ---

const TOOL_DEFINITION = {
  name: 'apply_operations',
  description: 'Apply edit operations to the test case data. Use this when the user asks to make changes.',
  input_schema: {
    type: 'object' as const,
    properties: {
      operations: {
        type: 'array' as const,
        description: 'Array of edit operations to apply',
        items: { type: 'object' as const },
      },
    },
    required: ['operations'],
  },
}

// --- System prompt ---

export function buildSystemPrompt(folder: Folder): string {
  const data = JSON.stringify(serializeFolderTree(folder), null, 2)
  return `You are an assistant for a Zephyr Scale test case editor. The user is viewing a folder of test cases and may ask you to analyze, explain, or edit them.

When the user asks to make changes, use the apply_operations tool. You may include reasoning or explanation in your text before calling the tool.

Available operation types:

update_test_case \u2014 Update fields on an existing test case
  { "op": "update_test_case", "_uid": <_uid>, "fields": { ... } }
  Updatable: name, priority, status, objective, customFields

batch_update \u2014 Update the same fields on multiple test cases at once (preferred for bulk changes)
  { "op": "batch_update", "_uids": [<_uid1>, <_uid2>, ...], "fields": { ... } }
  Same updatable fields as update_test_case.

update_step \u2014 Update fields on a step
  { "op": "update_step", "_uid": <test case _uid>, "stepIndex": <0-based>, "fields": { ... } }
  Updatable: description, expectedResult, testData

add_test_case \u2014 Create a new test case in a folder
  { "op": "add_test_case", "folder": "<folder path>", "testCase": { "name": "...", "priority": "...", "status": "...", "objective": null, "steps": [{ "description": "...", "expectedResult": "...", "testData": null }] } }

delete_test_case \u2014 Remove a test case
  { "op": "delete_test_case", "_uid": <_uid> }

add_step \u2014 Append a step to a test case
  { "op": "add_step", "_uid": <test case _uid>, "step": { "description": "...", "expectedResult": "...", "testData": null } }

delete_step \u2014 Remove a step by index
  { "op": "delete_step", "_uid": <test case _uid>, "stepIndex": <0-based> }

Rules:
- Reference existing test cases by their "_uid" field (a unique number). Do NOT use "id".
- Folder paths: use the folder name (e.g. "Login") or nested path (e.g. "Login/SubFolder").
- Valid priorities: "Critical", "High", "Normal", "Low"
- Valid statuses: "Draft", "Approved", "Deprecated"
- customFields is an array of {name, type, value}. Known types:
  Scenario: { "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "..." }
  System: { "name": "System", "type": "SINGLE_CHOICE_SELECT_LIST", "value": "..." }
  When updating customFields, include ALL custom fields for the test case (not just changed ones).
- Step fields (description, expectedResult, testData) are string|null.
- Use batch_update when applying the same change to multiple test cases.

Current folder data:
${data}`
}

// --- Call Claude API ---

export async function sendMessage(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  systemPrompt: string,
  apiKey: string,
): Promise<AiResponse> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 16384,
      system: systemPrompt,
      tools: [TOOL_DEFINITION],
      messages,
    }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const msg = body?.error?.message ?? `API error ${res.status}`
    throw new Error(msg)
  }

  const body = await res.json()
  return parseResponse(body.content ?? [])
}

// --- Parse response content blocks ---

interface ContentBlock {
  type: string
  text?: string
  name?: string
  input?: Record<string, unknown>
}

function parseResponse(content: ContentBlock[]): AiResponse {
  const textParts: string[] = []
  let operations: Operation[] | null = null

  for (const block of content) {
    if (block.type === 'text' && block.text) {
      textParts.push(block.text)
    } else if (block.type === 'tool_use' && block.name === 'apply_operations' && block.input) {
      operations = validateOperations(block.input.operations as unknown[])
    }
  }

  const reasoning = textParts.join('\n').trim()

  if (operations) {
    return { type: 'result', operations, reasoning: reasoning || undefined }
  }
  return { type: 'answer', text: reasoning || '(no response)' }
}

// --- Validation ---

function validateOperations(data: unknown[]): Operation[] {
  if (!Array.isArray(data)) throw new Error('operations: expected array')
  for (let i = 0; i < data.length; i++) {
    const op = data[i] as Record<string, unknown>
    if (!op || typeof op !== 'object') throw new Error(`operations[${i}]: expected object`)
    switch (op.op) {
      case 'update_test_case':
        if (typeof op._uid !== 'number') throw new Error(`operations[${i}]._uid: expected number`)
        if (!op.fields || typeof op.fields !== 'object') throw new Error(`operations[${i}].fields: expected object`)
        break
      case 'batch_update':
        if (!Array.isArray(op._uids)) throw new Error(`operations[${i}]._uids: expected array`)
        if (!op.fields || typeof op.fields !== 'object') throw new Error(`operations[${i}].fields: expected object`)
        break
      case 'update_step':
        if (typeof op._uid !== 'number') throw new Error(`operations[${i}]._uid: expected number`)
        if (typeof op.stepIndex !== 'number') throw new Error(`operations[${i}].stepIndex: expected number`)
        if (!op.fields || typeof op.fields !== 'object') throw new Error(`operations[${i}].fields: expected object`)
        break
      case 'add_test_case':
        if (typeof op.folder !== 'string') throw new Error(`operations[${i}].folder: expected string`)
        if (!op.testCase || typeof op.testCase !== 'object') throw new Error(`operations[${i}].testCase: expected object`)
        break
      case 'delete_test_case':
        if (typeof op._uid !== 'number') throw new Error(`operations[${i}]._uid: expected number`)
        break
      case 'add_step':
        if (typeof op._uid !== 'number') throw new Error(`operations[${i}]._uid: expected number`)
        if (!op.step || typeof op.step !== 'object') throw new Error(`operations[${i}].step: expected object`)
        break
      case 'delete_step':
        if (typeof op._uid !== 'number') throw new Error(`operations[${i}]._uid: expected number`)
        if (typeof op.stepIndex !== 'number') throw new Error(`operations[${i}].stepIndex: expected number`)
        break
      default:
        throw new Error(`operations[${i}]: unknown op "${op.op}"`)
    }
  }
  return data as Operation[]
}

// --- Lookup helpers ---

function buildLookupMaps(
  folder: Folder,
  path: string,
  tcByUid: Map<number, TestCase>,
  folderByPath: Map<string, Folder>,
) {
  folderByPath.set(path, folder)
  for (const tc of folder.testCases) {
    tcByUid.set(tc._uid, tc)
  }
  for (const child of folder.children) {
    buildLookupMaps(child, `${path}/${child.name}`, tcByUid, folderByPath)
  }
}

const UPDATABLE_TC_FIELDS = new Set(['name', 'priority', 'status', 'objective', 'customFields'])

// --- Generate changelog preview ---

export function generateChangelog(folder: Folder, operations: Operation[]): string {
  if (operations.length === 0) return 'No changes.'

  const tcByUid = new Map<number, TestCase>()
  const folderByPath = new Map<string, Folder>()
  buildLookupMaps(folder, folder.name, tcByUid, folderByPath)

  const lines: string[] = []

  for (const op of operations) {
    switch (op.op) {
      case 'update_test_case': {
        const tc = tcByUid.get(op._uid)
        const name = tc?.name ?? `_uid ${op._uid}`
        appendFieldChanges(lines, name, op.fields, tc)
        break
      }
      case 'batch_update': {
        const tcs = op._uids.map(u => tcByUid.get(u)).filter((tc): tc is TestCase => !!tc)
        for (const [key, val] of Object.entries(op.fields)) {
          if (!UPDATABLE_TC_FIELDS.has(key)) continue
          if (tcs.length <= 5) {
            const names = tcs.map(tc => `"${tc.name}"`).join(', ')
            lines.push(`\u2022 ${key} \u2192 "${val}" on: ${names}`)
          } else {
            lines.push(`\u2022 ${key} \u2192 "${val}" on ${tcs.length} test cases`)
          }
        }
        break
      }
      case 'update_step': {
        const tc = tcByUid.get(op._uid)
        const name = tc?.name ?? `_uid ${op._uid}`
        const changed = Object.keys(op.fields).join(', ')
        lines.push(`\u2022 "${name}": updated step ${op.stepIndex + 1} (${changed})`)
        break
      }
      case 'add_test_case': {
        const stepCount = op.testCase.steps?.length ?? 0
        const stepInfo = stepCount > 0 ? ` (${stepCount} step${stepCount !== 1 ? 's' : ''})` : ''
        lines.push(`\u2022 Added "${op.testCase.name}" to "${op.folder}"${stepInfo}`)
        break
      }
      case 'delete_test_case': {
        const tc = tcByUid.get(op._uid)
        lines.push(`\u2022 Deleted "${tc?.name ?? `_uid ${op._uid}`}"`)
        break
      }
      case 'add_step': {
        const tc = tcByUid.get(op._uid)
        lines.push(`\u2022 Added step to "${tc?.name ?? `_uid ${op._uid}`}"`)
        break
      }
      case 'delete_step': {
        const tc = tcByUid.get(op._uid)
        lines.push(`\u2022 Removed step ${op.stepIndex + 1} from "${tc?.name ?? `_uid ${op._uid}`}"`)
        break
      }
    }
  }

  return lines.join('\n')
}

function appendFieldChanges(lines: string[], name: string, fields: Record<string, unknown>, tc: TestCase | undefined) {
  for (const [key, val] of Object.entries(fields)) {
    if (!UPDATABLE_TC_FIELDS.has(key)) continue
    if (key === 'customFields' && tc) {
      const newCFs = val as Array<{ name: string; value: string }>
      for (const nf of newCFs) {
        const existing = tc.customFields.find(cf => cf.name === nf.name)
        if (!existing || existing.value !== nf.value) {
          lines.push(`\u2022 "${name}": ${nf.name} "${existing?.value ?? ''}" \u2192 "${nf.value}"`)
        }
      }
    } else {
      const oldVal = tc ? (tc as unknown as Record<string, unknown>)[key] ?? '' : ''
      if (oldVal !== val) {
        lines.push(`\u2022 "${name}": ${key} "${oldVal}" \u2192 "${val ?? ''}"`)
      }
    }
  }
}

// --- Apply operations (mutates folder in place) ---

export function applyOperations(folder: Folder, operations: Operation[]): void {
  const tcByUid = new Map<number, TestCase>()
  const folderByPath = new Map<string, Folder>()
  buildLookupMaps(folder, folder.name, tcByUid, folderByPath)

  for (const op of operations) {
    switch (op.op) {
      case 'update_test_case': {
        const tc = tcByUid.get(op._uid)
        if (tc) applyFieldsToTestCase(tc, op.fields)
        break
      }
      case 'batch_update': {
        for (const u of op._uids) {
          const tc = tcByUid.get(u)
          if (tc) applyFieldsToTestCase(tc, op.fields)
        }
        break
      }
      case 'update_step': {
        const tc = tcByUid.get(op._uid)
        const step = tc?.steps[op.stepIndex]
        if (step) {
          for (const [key, val] of Object.entries(op.fields)) {
            if (key === 'description' || key === 'expectedResult' || key === 'testData') {
              ;(step as unknown as Record<string, unknown>)[key] = val
            }
          }
        }
        break
      }
      case 'add_test_case': {
        const targetFolder = folderByPath.get(op.folder)
        if (!targetFolder) break
        const p = op.testCase
        const tc: TestCase = {
          _uid: uid(),
          id: '0',
          key: '',
          name: p.name,
          priority: p.priority ?? 'Normal',
          status: p.status ?? 'Draft',
          objective: p.objective ?? null,
          createdBy: '',
          createdOn: new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC'),
          updatedBy: null,
          updatedOn: null,
          owner: null,
          customFields: ensureKnownCustomFields(
            p.customFields?.map(cf => ({ ...cf })) ?? [],
            targetFolder.name,
          ),
          issues: [],
          steps: (p.steps ?? []).map(s => ({
            _uid: uid(),
            description: s.description ?? null,
            expectedResult: s.expectedResult ?? null,
            testData: s.testData ?? null,
          })),
        }
        targetFolder.testCases.push(tc)
        tcByUid.set(tc._uid, tc)
        break
      }
      case 'delete_test_case': {
        const tc = tcByUid.get(op._uid)
        if (!tc) break
        for (const f of folderByPath.values()) {
          const idx = f.testCases.indexOf(tc)
          if (idx >= 0) { f.testCases.splice(idx, 1); break }
        }
        break
      }
      case 'add_step': {
        const tc = tcByUid.get(op._uid)
        if (!tc) break
        tc.steps.push({
          _uid: uid(),
          description: op.step.description ?? null,
          expectedResult: op.step.expectedResult ?? null,
          testData: op.step.testData ?? null,
        })
        break
      }
      case 'delete_step': {
        const tc = tcByUid.get(op._uid)
        if (tc && op.stepIndex >= 0 && op.stepIndex < tc.steps.length) {
          tc.steps.splice(op.stepIndex, 1)
        }
        break
      }
    }
  }
}

function applyFieldsToTestCase(tc: TestCase, fields: Record<string, unknown>) {
  for (const [key, val] of Object.entries(fields)) {
    if (!UPDATABLE_TC_FIELDS.has(key)) continue
    if (key === 'customFields') {
      tc.customFields = ensureKnownCustomFields(
        (val as Array<{ name: string; type: string; value: string }>).map(cf => ({ ...cf }))
      )
    } else {
      ;(tc as unknown as Record<string, unknown>)[key] = val
    }
  }
}

// --- Deep clone for undo ---

export interface FolderSnapshot {
  name: string
  children: Folder[]
  testCases: TestCase[]
}

export function snapshotFolder(folder: Folder): FolderSnapshot {
  return {
    name: folder.name,
    children: folder.children.map(cloneFolder),
    testCases: folder.testCases.map(cloneTestCase),
  }
}

function cloneFolder(folder: Folder): Folder {
  return {
    _uid: folder._uid,
    index: folder.index,
    name: folder.name,
    children: folder.children.map(cloneFolder),
    testCases: folder.testCases.map(cloneTestCase),
  }
}

function cloneTestCase(tc: TestCase): TestCase {
  return {
    ...tc,
    customFields: tc.customFields.map(cf => ({ ...cf })),
    issues: tc.issues.map(i => ({ ...i })),
    steps: tc.steps.map(s => ({ ...s })),
  }
}

export function restoreFolder(target: Folder, snapshot: FolderSnapshot): void {
  target.name = snapshot.name
  target.children = snapshot.children
  target.testCases = snapshot.testCases
}
