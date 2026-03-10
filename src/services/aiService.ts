import type { Folder, TestCase, Step } from '../types'
import { uid } from './xmlService'

// --- Payload types (what we send/receive from Claude) ---

export interface FolderPayload {
  name: string
  children: FolderPayload[]
  testCases: TestCasePayload[]
}

interface TestCasePayload {
  id: string
  key: string
  name: string
  priority: string
  status: string
  objective: string | null
  steps: StepPayload[]
}

interface StepPayload {
  description: string | null
  expectedResult: string | null
  testData: string | null
}

export type AiResponse =
  | { type: 'answer'; text: string }
  | { type: 'question'; text: string }
  | { type: 'result'; summary: string; data: FolderPayload }

// --- Serialize folder tree for Claude (strip runtime fields) ---

export function serializeFolderTree(folder: Folder): FolderPayload {
  return {
    name: folder.name,
    children: folder.children.map(serializeFolderTree),
    testCases: folder.testCases.map(tc => ({
      id: tc.id,
      key: tc.key,
      name: tc.name,
      priority: tc.priority,
      status: tc.status,
      objective: tc.objective,
      steps: tc.steps.map(s => ({
        description: s.description,
        expectedResult: s.expectedResult,
        testData: s.testData,
      })),
    })),
  }
}

// --- Build system prompt ---

export function buildSystemPrompt(folder: Folder): string {
  const data = JSON.stringify(serializeFolderTree(folder), null, 2)
  return `You are an assistant for a Zephyr Scale test case editor. The user is viewing a folder of test cases and may ask you to analyze, explain, or edit them.

You will receive the current folder's data as JSON. When the user asks you to make changes, return the complete updated folder tree.

You MUST respond with a single JSON object in one of these formats:

1. To answer a question or provide information:
   { "type": "answer", "text": "Your answer here" }

2. To ask a clarifying question before making changes:
   { "type": "question", "text": "Your question here" }

3. To propose edits to the data:
   { "type": "result", "summary": "Brief description of changes made", "data": <updated folder tree JSON> }

Rules for "result" responses:
- Return the COMPLETE folder tree (same structure as provided), with your changes applied.
- Only modify fields relevant to the user's request. Preserve everything else exactly.
- Preserve "id" and "key" fields on existing test cases exactly as-is.
- For NEW test cases, set "id" to "" (empty string) and "key" to "" (empty string).
- Valid priorities: "High", "Normal", "Low"
- Valid statuses: "Draft", "Approved", "Deprecated"
- Steps have: description (string|null), expectedResult (string|null), testData (string|null)

IMPORTANT: Return ONLY the JSON object. No markdown code fences, no extra text outside the JSON.

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
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: systemPrompt,
      messages,
    }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const msg = body?.error?.message ?? `API error ${res.status}`
    throw new Error(msg)
  }

  const body = await res.json()
  const text: string = body.content?.[0]?.text ?? ''

  return parseResponse(text)
}

function parseResponse(text: string): AiResponse {
  // Strip markdown code fences if Claude wrapped the response
  let cleaned = text.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error(`Invalid JSON response from Claude: ${cleaned.slice(0, 200)}`)
  }

  const obj = parsed as Record<string, unknown>
  if (obj.type === 'answer' && typeof obj.text === 'string') {
    return { type: 'answer', text: obj.text }
  }
  if (obj.type === 'question' && typeof obj.text === 'string') {
    return { type: 'question', text: obj.text }
  }
  if (obj.type === 'result' && typeof obj.summary === 'string' && obj.data) {
    return { type: 'result', summary: obj.summary, data: obj.data as FolderPayload }
  }
  throw new Error(`Unexpected response format: ${JSON.stringify(obj).slice(0, 200)}`)
}

// --- Merge AI result back into a Folder ---

export function applyResult(original: Folder, payload: FolderPayload): Folder {
  // Build lookup of original test cases by id for metadata restoration
  const origTcMap = new Map<string, TestCase>()
  buildTcMap(original, origTcMap)

  return mergeFolder(payload, origTcMap)
}

function buildTcMap(folder: Folder, map: Map<string, TestCase>) {
  for (const tc of folder.testCases) {
    if (tc.id) map.set(tc.id, tc)
  }
  for (const child of folder.children) {
    buildTcMap(child, map)
  }
}

function mergeFolder(payload: FolderPayload, origTcMap: Map<string, TestCase>): Folder {
  return {
    _uid: uid(),
    index: 0, // will be reindexed by caller
    name: payload.name,
    children: payload.children.map((c, i) => {
      const f = mergeFolder(c, origTcMap)
      f.index = i
      return f
    }),
    testCases: payload.testCases.map(tc => mergeTestCase(tc, origTcMap)),
  }
}

function mergeTestCase(payload: TestCasePayload, origTcMap: Map<string, TestCase>): TestCase {
  const orig = payload.id ? origTcMap.get(payload.id) : undefined
  return {
    _uid: uid(),
    id: payload.id,
    key: payload.key,
    name: payload.name,
    priority: payload.priority,
    status: payload.status,
    objective: payload.objective,
    // Restore metadata from original, or set defaults for new test cases
    createdBy: orig?.createdBy ?? '',
    createdOn: orig?.createdOn ?? new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC'),
    updatedBy: orig?.updatedBy ?? null,
    updatedOn: orig?.updatedOn ?? null,
    owner: orig?.owner ?? null,
    issues: orig?.issues ?? [],
    steps: payload.steps.map(s => mergeStep(s)),
  }
}

function mergeStep(payload: StepPayload): Step {
  return {
    _uid: uid(),
    description: payload.description,
    expectedResult: payload.expectedResult,
    testData: payload.testData,
  }
}
