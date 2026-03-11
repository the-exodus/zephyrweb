import type { Folder, TestCase } from '../types'
import { uid, ensureKnownCustomFields } from './xmlService'

// --- Input serialization (lightweight summary for system prompt) ---

interface FolderSummary {
  name: string
  children: FolderSummary[]
  testCases: Array<{ _uid: number; name: string }>
}

function serializeFolderSummary(folder: Folder): FolderSummary {
  return {
    name: folder.name,
    children: folder.children.map(serializeFolderSummary),
    testCases: folder.testCases.map(tc => ({ _uid: tc._uid, name: tc.name })),
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
  | { op: 'create_folder'; parent: string; name: string }
  | { op: 'delete_folder'; folder: string }
  | { op: 'regex_replace'; _uids: number[]; field: string; pattern: string; replacement: string }

export type AiResponse =
  | { type: 'answer'; text: string }
  | { type: 'result'; operations: Operation[]; reasoning?: string }

// --- Tool definitions ---

const SEARCH_TOOL = {
  name: 'search_test_cases',
  description: 'Search for test cases matching criteria. Returns _uid and name for each match, plus any additional fields requested via "include". Use this to find test cases before retrieving full details or making changes.',
  input_schema: {
    type: 'object' as const,
    properties: {
      pattern: {
        type: 'string' as const,
        description: 'Regex pattern (case-insensitive) to match against test case name, objective, step descriptions, step expected results, step test data, and custom field values. Omit to match all test cases.',
      },
      fields: {
        type: 'object' as const,
        description: 'Filter by exact field values.',
        properties: {
          priority: { type: 'string' as const },
          status: { type: 'string' as const },
          folder: { type: 'string' as const, description: 'Folder name to restrict search to (exact match, not recursive)' },
        },
      },
      include: {
        type: 'array' as const,
        items: { type: 'string' as const },
        description: 'Additional fields to include in results beyond _uid and name. Options: "priority", "status", "objective", "customFields", "stepCount", "folder", "id", "key".',
      },
      limit: {
        type: 'number' as const,
        description: 'Max results to return. Default 50.',
      },
    },
    required: [] as string[],
  },
}

const GET_TOOL = {
  name: 'get_test_cases',
  description: 'Get detailed data for specific test cases by _uid. Returns all fields by default, or a subset if "include" is specified. Use after searching to retrieve full details including steps.',
  input_schema: {
    type: 'object' as const,
    properties: {
      _uids: {
        type: 'array' as const,
        items: { type: 'number' as const },
        description: 'Array of test case _uid values to retrieve.',
      },
      include: {
        type: 'array' as const,
        items: { type: 'string' as const },
        description: 'Fields to include. Options: "priority", "status", "objective", "customFields", "steps", "id", "key", "folder". Default: all fields.',
      },
    },
    required: ['_uids'] as string[],
  },
}

const APPLY_OPERATIONS_TOOL = {
  name: 'apply_operations',
  description: 'Apply edit operations to the test case data. Use this when the user asks to make changes. Each operation must have an "op" field specifying the type.',
  input_schema: {
    type: 'object' as const,
    properties: {
      operations: {
        type: 'array' as const,
        description: 'Array of edit operations. Each must have "op" (e.g. "update_test_case", "batch_update", "add_test_case", "delete_test_case", "update_step", "add_step", "delete_step", "create_folder", "delete_folder", "regex_replace") and operation-specific fields as described in the system prompt.',
        items: {
          type: 'object' as const,
          properties: {
            op: { type: 'string' as const, description: 'Operation type' },
          },
          required: ['op'],
        },
      },
    },
    required: ['operations'],
  },
}

// --- System prompt ---

export function buildSystemPrompt(folder: Folder): string {
  const summary = JSON.stringify(serializeFolderSummary(folder), null, 2)
  return `You are an assistant for a Zephyr Scale test case editor. The user is viewing a folder of test cases and may ask you to analyze, explain, or edit them.

The folder structure below shows folder names and test case names with their _uid identifiers. To see full test case details (steps, custom fields, etc.), use the search_test_cases and get_test_cases tools.

When the user asks to make changes, first use search/get tools to find and verify the relevant test cases, then use apply_operations to make the changes. You may include reasoning or explanation in your text.

If the user's request is ambiguous or you need more information, ask a clarifying question instead of guessing.

Available tools:

search_test_cases — Find test cases matching a regex pattern and/or field filters.
  Returns _uid + name by default; use "include" to add more fields.
  The pattern searches across: name, objective, step text, custom field values.

get_test_cases — Retrieve full details for specific test cases by _uid.
  Returns all fields by default, or specify "include" for a subset.

apply_operations — Apply edit operations. Operation types:

  update_test_case — Update fields on an existing test case
    { "op": "update_test_case", "_uid": <_uid>, "fields": { ... } }
    Updatable: name, priority, status, objective, customFields

  batch_update — Update the same fields on multiple test cases at once (preferred for bulk changes)
    { "op": "batch_update", "_uids": [<_uid1>, <_uid2>, ...], "fields": { ... } }
    Same updatable fields as update_test_case.

  update_step — Update fields on a step
    { "op": "update_step", "_uid": <test case _uid>, "stepIndex": <0-based>, "fields": { ... } }
    Updatable: description, expectedResult, testData

  add_test_case — Create a new test case in a folder
    { "op": "add_test_case", "folder": "<folder path>", "testCase": { "name": "...", "priority": "...", "status": "...", "objective": null, "steps": [{ "description": "...", "expectedResult": "...", "testData": null }] } }

  delete_test_case — Remove a test case
    { "op": "delete_test_case", "_uid": <_uid> }

  add_step — Append a step to a test case
    { "op": "add_step", "_uid": <test case _uid>, "step": { "description": "...", "expectedResult": "...", "testData": null } }

  delete_step — Remove a step by index
    { "op": "delete_step", "_uid": <test case _uid>, "stepIndex": <0-based> }

  create_folder — Create a new subfolder
    { "op": "create_folder", "parent": "<parent folder path>", "name": "New Folder" }

  delete_folder — Remove a folder and all its contents (test cases and subfolders)
    { "op": "delete_folder", "folder": "<folder path>" }

  regex_replace — Apply a regex find/replace to a text field across multiple test cases (preferred for bulk text transformations)
    { "op": "regex_replace", "_uids": [<_uid1>, ...], "field": "<field>", "pattern": "<regex>", "replacement": "<string>" }
    field: "name", "objective", "steps.description", "steps.expectedResult", "steps.testData"
    Pattern is a JavaScript regex (case-sensitive). Replacement supports $1, $2 etc. for capture groups.
    Applied to every matching test case; for step fields, applied to every step in each test case.

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

Current folder structure:
${summary}`
}

// --- Search/get helpers ---

interface TcWithFolder {
  tc: TestCase
  folderName: string
  folderPath: string
}

function collectTestCases(folder: Folder, path: string, result: TcWithFolder[]) {
  for (const tc of folder.testCases) {
    result.push({ tc, folderName: folder.name, folderPath: path })
  }
  for (const child of folder.children) {
    collectTestCases(child, `${path}/${child.name}`, result)
  }
}

function textMatchesPattern(tc: TestCase, re: RegExp): boolean {
  if (re.test(tc.name)) return true
  if (tc.objective && re.test(tc.objective)) return true
  for (const step of tc.steps) {
    if (step.description && re.test(step.description)) return true
    if (step.expectedResult && re.test(step.expectedResult)) return true
    if (step.testData && re.test(step.testData)) return true
  }
  for (const cf of tc.customFields) {
    if (cf.value && re.test(cf.value)) return true
  }
  return false
}

// --- Search tool execution ---

interface SearchInput {
  pattern?: string
  fields?: { priority?: string; status?: string; folder?: string }
  include?: string[]
  limit?: number
}

function executeSearch(folder: Folder, input: SearchInput): { results: Record<string, unknown>[]; totalMatches: number } {
  const all: TcWithFolder[] = []
  collectTestCases(folder, folder.name, all)

  let filtered = all

  if (input.fields?.folder) {
    const fname = input.fields.folder
    filtered = filtered.filter(e => e.folderName === fname)
  }
  if (input.fields?.priority) {
    filtered = filtered.filter(e => e.tc.priority === input.fields!.priority)
  }
  if (input.fields?.status) {
    filtered = filtered.filter(e => e.tc.status === input.fields!.status)
  }

  if (input.pattern) {
    const re = new RegExp(input.pattern, 'i')
    filtered = filtered.filter(e => textMatchesPattern(e.tc, re))
  }

  const totalMatches = filtered.length
  const limit = input.limit ?? 50
  const limited = filtered.slice(0, limit)
  const include = new Set(input.include ?? [])

  const results = limited.map(e => {
    const r: Record<string, unknown> = { _uid: e.tc._uid, name: e.tc.name }
    if (include.has('priority')) r.priority = e.tc.priority
    if (include.has('status')) r.status = e.tc.status
    if (include.has('objective')) r.objective = e.tc.objective
    if (include.has('id')) r.id = e.tc.id
    if (include.has('key')) r.key = e.tc.key
    if (include.has('folder')) r.folder = e.folderPath
    if (include.has('stepCount')) r.stepCount = e.tc.steps.length
    if (include.has('customFields')) {
      r.customFields = e.tc.customFields.filter(cf => cf.value).map(cf => ({ name: cf.name, type: cf.type, value: cf.value }))
    }
    return r
  })

  return { results, totalMatches }
}

// --- Get tool execution ---

interface GetInput {
  _uids: number[]
  include?: string[]
}

function executeGet(folder: Folder, input: GetInput): Record<string, unknown>[] {
  const all: TcWithFolder[] = []
  collectTestCases(folder, folder.name, all)
  const byUid = new Map<number, TcWithFolder>()
  for (const e of all) byUid.set(e.tc._uid, e)

  const include = input.include ? new Set(input.include) : null // null = all fields

  return input._uids.map(id => {
    const e = byUid.get(id)
    if (!e) return { _uid: id, error: 'not found' }
    const tc = e.tc
    const r: Record<string, unknown> = { _uid: tc._uid, name: tc.name }
    if (!include || include.has('priority')) r.priority = tc.priority
    if (!include || include.has('status')) r.status = tc.status
    if (!include || include.has('objective')) r.objective = tc.objective
    if (!include || include.has('id')) r.id = tc.id
    if (!include || include.has('key')) r.key = tc.key
    if (!include || include.has('folder')) r.folder = e.folderPath
    if (!include || include.has('customFields')) {
      r.customFields = tc.customFields.map(cf => ({ name: cf.name, type: cf.type, value: cf.value }))
    }
    if (!include || include.has('steps')) {
      r.steps = tc.steps.map(s => {
        const step: Record<string, unknown> = {}
        if (s.description != null) step.description = s.description
        if (s.expectedResult != null) step.expectedResult = s.expectedResult
        if (s.testData != null) step.testData = s.testData
        return step
      })
    }
    return r
  })
}

// --- Content blocks for API ---

interface ContentBlock {
  type: string
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
  tool_use_id?: string
  content?: string
  is_error?: boolean
}

type ApiMessage = {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

// --- SSE stream parser ---

interface StreamResult {
  content: ContentBlock[]
  stopReason: string
  hadText: boolean
}

async function processStream(
  res: Response,
  onText?: (delta: string) => void,
): Promise<StreamResult> {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const contentBlocks: ContentBlock[] = []
  const partialJson = new Map<number, string>()
  let stopReason = ''
  let hadText = false

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    const events = buffer.split('\n\n')
    buffer = events.pop()!

    for (const eventStr of events) {
      if (!eventStr.trim()) continue

      let eventType = ''
      let dataStr = ''
      for (const line of eventStr.split('\n')) {
        if (line.startsWith('event: ')) eventType = line.slice(7).trim()
        else if (line.startsWith('data: ')) dataStr = line.slice(6)
      }

      if (!dataStr || eventType === 'ping') continue

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any
      try { data = JSON.parse(dataStr) } catch { continue }

      switch (eventType) {
        case 'content_block_start': {
          const block = data.content_block
          const index = data.index as number
          if (block.type === 'text') {
            contentBlocks[index] = { type: 'text', text: '' }
          } else if (block.type === 'tool_use') {
            contentBlocks[index] = { type: 'tool_use', id: block.id, name: block.name, input: {} }
            partialJson.set(index, '')
          }
          break
        }
        case 'content_block_delta': {
          const index = data.index as number
          const delta = data.delta
          if (delta.type === 'text_delta' && delta.text) {
            const block = contentBlocks[index]
            if (block) {
              block.text = (block.text ?? '') + delta.text
              hadText = true
              onText?.(delta.text)
            }
          } else if (delta.type === 'input_json_delta' && delta.partial_json) {
            const prev = partialJson.get(index) ?? ''
            partialJson.set(index, prev + delta.partial_json)
          }
          break
        }
        case 'content_block_stop': {
          const index = data.index as number
          const block = contentBlocks[index]
          if (block?.type === 'tool_use') {
            const json = partialJson.get(index)
            if (json) {
              try { block.input = JSON.parse(json) } catch { block.input = {} }
            }
            partialJson.delete(index)
          }
          break
        }
        case 'message_delta': {
          if (data.delta?.stop_reason) stopReason = data.delta.stop_reason
          break
        }
        case 'error': {
          const msg = data.error?.message ?? 'Stream error'
          throw new Error(msg)
        }
      }
    }
  }

  return { content: contentBlocks.filter(Boolean), stopReason, hadText }
}

// --- Call Claude API with agentic tool-use loop (streaming) ---

const MAX_ITERATIONS = 20

export interface StreamCallbacks {
  onText?: (delta: string) => void
  onToolProgress?: (summary: string) => void
}

export async function sendMessage(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  systemPrompt: string,
  apiKey: string,
  folder: Folder,
  callbacks?: StreamCallbacks,
): Promise<AiResponse> {
  const apiMessages: ApiMessage[] = messages.map(m => ({ role: m.role, content: m.content }))
  const tools = [SEARCH_TOOL, GET_TOOL, APPLY_OPERATIONS_TOOL]
  let prevHadText = false

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
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
        output_config: { effort: 'medium' },
        stream: true,
        system: systemPrompt,
        tools,
        messages: apiMessages,
      }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => null)
      const msg = body?.error?.message ?? `API error ${res.status}`
      throw new Error(msg)
    }

    // Separate text between loop iterations
    if (prevHadText) callbacks?.onText?.('\n\n')

    const { content, stopReason, hadText } = await processStream(res, callbacks?.onText)
    prevHadText = hadText

    // Check for apply_operations — treat as final result
    const applyBlock = content.find(b => b.type === 'tool_use' && b.name === 'apply_operations')
    if (applyBlock?.input) {
      const raw = applyBlock.input.operations
      if (Array.isArray(raw) && raw.length > 0) {
        const operations = validateOperations(raw)
        return { type: 'result', operations }
      }
    }

    // If not a tool_use stop, return text answer
    if (stopReason !== 'tool_use') {
      if (stopReason === 'max_tokens') {
        const warning = '\n\n(Response was cut off — try a simpler request or fewer test cases at a time)'
        callbacks?.onText?.(warning)
      }
      return { type: 'answer', text: '' }
    }

    // stop_reason === 'tool_use' — execute search/get tools and continue the loop
    apiMessages.push({ role: 'assistant', content })

    const toolResults: ContentBlock[] = []

    for (const block of content) {
      if (block.type !== 'tool_use' || !block.id) continue

      if (block.name === 'search_test_cases') {
        try {
          const result = executeSearch(folder, (block.input ?? {}) as SearchInput)
          const summary = `Found ${result.totalMatches} test case(s)` +
            (block.input?.pattern ? ` matching "${block.input.pattern}"` : '')
          callbacks?.onToolProgress?.(summary)
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          callbacks?.onToolProgress?.(`Search error: ${msg}`)
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify({ error: msg }),
            is_error: true,
          })
        }
      } else if (block.name === 'get_test_cases') {
        try {
          const input = (block.input ?? {}) as GetInput
          const result = executeGet(folder, input)
          callbacks?.onToolProgress?.(`Retrieved ${input._uids.length} test case(s)`)
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          callbacks?.onToolProgress?.(`Get error: ${msg}`)
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify({ error: msg }),
            is_error: true,
          })
        }
      } else if (block.name === 'apply_operations') {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify({ status: 'ok', message: 'No operations to apply' }),
        })
      } else {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify({ error: `Unknown tool: ${block.name}` }),
          is_error: true,
        })
      }
    }

    apiMessages.push({ role: 'user', content: toolResults })
  }

  throw new Error('AI agent loop exceeded maximum iterations')
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
      case 'create_folder':
        if (typeof op.parent !== 'string') throw new Error(`operations[${i}].parent: expected string`)
        if (typeof op.name !== 'string') throw new Error(`operations[${i}].name: expected string`)
        break
      case 'delete_folder':
        if (typeof op.folder !== 'string') throw new Error(`operations[${i}].folder: expected string`)
        break
      case 'regex_replace':
        if (!Array.isArray(op._uids)) throw new Error(`operations[${i}]._uids: expected array`)
        if (typeof op.field !== 'string') throw new Error(`operations[${i}].field: expected string`)
        if (typeof op.pattern !== 'string') throw new Error(`operations[${i}].pattern: expected string`)
        if (typeof op.replacement !== 'string') throw new Error(`operations[${i}].replacement: expected string`)
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
        const target = tcs.length <= 5
          ? tcs.map(tc => `"${tc.name}"`).join(', ')
          : `${tcs.length} test cases`
        for (const [key, val] of Object.entries(op.fields)) {
          if (!UPDATABLE_TC_FIELDS.has(key)) continue
          if (key === 'customFields') {
            const cfs = val as Array<{ name: string; value: string }>
            const summary = cfs.map(cf => `${cf.name} \u2192 "${cf.value}"`).join(', ')
            lines.push(`\u2022 ${summary} on ${target}`)
          } else {
            lines.push(`\u2022 ${key} \u2192 "${val}" on ${target}`)
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
      case 'create_folder': {
        lines.push(`\u2022 Created folder "${op.name}" in "${op.parent}"`)
        break
      }
      case 'delete_folder': {
        lines.push(`\u2022 Deleted folder "${op.folder}" and all its contents`)
        break
      }
      case 'regex_replace': {
        const tcs = op._uids.map(u => tcByUid.get(u)).filter((tc): tc is TestCase => !!tc)
        const re = safeRegex(op.pattern)
        let matchCount = 0
        if (re) {
          for (const tc of tcs) {
            matchCount += countRegexMatches(tc, op.field, re)
          }
        }
        const target = tcs.length <= 5
          ? tcs.map(tc => `"${tc.name}"`).join(', ')
          : `${tcs.length} test cases`
        lines.push(`\u2022 Regex replace on ${op.field}: /${op.pattern}/ \u2192 "${op.replacement}" across ${target} (${matchCount} match${matchCount !== 1 ? 'es' : ''})`)
        break
      }
    }
  }

  return lines.join('\n')
}

function safeRegex(pattern: string): RegExp | null {
  try { return new RegExp(pattern, 'g') } catch { return null }
}

function countRegexMatches(tc: TestCase, field: string, re: RegExp): number {
  let count = 0
  if (field === 'name') {
    re.lastIndex = 0; if (re.test(tc.name)) count++
  } else if (field === 'objective') {
    if (tc.objective) { re.lastIndex = 0; if (re.test(tc.objective)) count++ }
  } else if (field.startsWith('steps.')) {
    const stepField = field.slice(6) as 'description' | 'expectedResult' | 'testData'
    for (const step of tc.steps) {
      const val = step[stepField]
      if (val) { re.lastIndex = 0; if (re.test(val)) count++ }
    }
  }
  return count
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
      case 'create_folder': {
        const parentFolder = folderByPath.get(op.parent)
        if (!parentFolder) break
        const newFolder: Folder = {
          _uid: uid(),
          index: parentFolder.children.length,
          name: op.name,
          children: [],
          testCases: [],
        }
        parentFolder.children.push(newFolder)
        folderByPath.set(`${op.parent}/${op.name}`, newFolder)
        break
      }
      case 'delete_folder': {
        const target = folderByPath.get(op.folder)
        if (!target) break
        // Find parent by checking all folders' children
        for (const f of folderByPath.values()) {
          const idx = f.children.indexOf(target)
          if (idx >= 0) {
            f.children.splice(idx, 1)
            break
          }
        }
        break
      }
      case 'regex_replace': {
        const re = safeRegex(op.pattern)
        if (!re) break
        for (const u of op._uids) {
          const tc = tcByUid.get(u)
          if (!tc) continue
          if (op.field === 'name') {
            tc.name = tc.name.replace(re, op.replacement)
          } else if (op.field === 'objective') {
            if (tc.objective) tc.objective = tc.objective.replace(re, op.replacement)
          } else if (op.field.startsWith('steps.')) {
            const stepField = op.field.slice(6) as 'description' | 'expectedResult' | 'testData'
            for (const step of tc.steps) {
              const val = step[stepField]
              if (val) step[stepField] = val.replace(re, op.replacement)
            }
          }
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
