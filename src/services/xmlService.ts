import type { Project, Folder, TestCase, Step, Issue } from '../types'

let nextUid = 0
export function uid(): number { return ++nextUid }

function htmlToText(value: string | null | undefined): string | null {
  if (value == null) return null
  return value.replace(/<br\s*\/?>/g, '\n')
}

function textToHtml(value: string): string {
  return value.replace(/\n/g, '<br />')
}

function cdata(text: string): string {
  return `<![CDATA[${text}]]>`
}

function escapeAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function getText(parent: Element, tag: string): string {
  const el = parent.querySelector(`:scope > ${tag}`)
  return el?.textContent ?? ''
}

function getTextOrNull(parent: Element, tag: string): string | null {
  const el = parent.querySelector(`:scope > ${tag}`)
  return el ? (el.textContent ?? null) : null
}

export async function readFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('iso-8859-1').decode(buffer)
  }
}

export function parse(xmlText: string): Project {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, 'text/xml')
  const root = doc.documentElement

  const parseError = root.querySelector('parsererror')
  if (parseError) {
    throw new Error('Invalid XML: ' + parseError.textContent)
  }

  // Parse folder metadata
  const folderMeta = new Map<string, number>()
  for (const elem of root.querySelector('folders')?.querySelectorAll('folder') ?? []) {
    folderMeta.set(elem.getAttribute('fullPath')!, parseInt(elem.getAttribute('index')!, 10))
  }

  // Parse test cases grouped by folder
  const tcByFolder = new Map<string, TestCase[]>()
  for (const path of folderMeta.keys()) {
    tcByFolder.set(path, [])
  }

  for (const tcElem of root.querySelector('testCases')?.querySelectorAll(':scope > testCase') ?? []) {
    const folderPath = getText(tcElem, 'folder')

    const issues: Issue[] = []
    for (const ie of tcElem.querySelector('issues')?.querySelectorAll('issue') ?? []) {
      issues.push({ key: getText(ie, 'key'), summary: getText(ie, 'summary') })
    }

    const steps: Step[] = []
    const stepsElem = tcElem.querySelector('testScript > steps')
    if (stepsElem) {
      for (const se of stepsElem.querySelectorAll('step')) {
        steps.push({
          _uid: uid(),
          description: htmlToText(getTextOrNull(se, 'description')),
          expectedResult: htmlToText(getTextOrNull(se, 'expectedResult')),
          testData: htmlToText(getTextOrNull(se, 'testData')),
        })
      }
    }

    const tc: TestCase = {
      id: tcElem.getAttribute('id')!,
      key: tcElem.getAttribute('key')!,
      name: getText(tcElem, 'name'),
      priority: getText(tcElem, 'priority'),
      status: getText(tcElem, 'status'),
      createdBy: getText(tcElem, 'createdBy'),
      createdOn: getText(tcElem, 'createdOn'),
      objective: getTextOrNull(tcElem, 'objective'),
      updatedBy: getTextOrNull(tcElem, 'updatedBy'),
      updatedOn: getTextOrNull(tcElem, 'updatedOn'),
      owner: getTextOrNull(tcElem, 'owner'),
      issues,
      steps,
    }

    const list = tcByFolder.get(folderPath)
    if (list) list.push(tc)
  }

  // Build folder tree
  const childrenOf = new Map<string, string[]>()
  for (const path of folderMeta.keys()) {
    childrenOf.set(path, [])
  }

  const rootPaths: string[] = []
  for (const path of folderMeta.keys()) {
    const lastSlash = path.lastIndexOf('/')
    const parentPath = lastSlash >= 0 ? path.substring(0, lastSlash) : null
    if (parentPath && folderMeta.has(parentPath)) {
      childrenOf.get(parentPath)!.push(path)
    } else {
      rootPaths.push(path)
    }
  }

  function buildFolder(path: string): Folder {
    const children = (childrenOf.get(path) ?? [])
      .map(buildFolder)
      .sort((a, b) => a.index - b.index)

    return {
      _uid: uid(),
      index: folderMeta.get(path)!,
      name: path.includes('/') ? path.substring(path.lastIndexOf('/') + 1) : path,
      children,
      testCases: tcByFolder.get(path) ?? [],
    }
  }

  return {
    projectId: getText(root, 'projectId'),
    projectKey: getText(root, 'projectKey'),
    modelVersion: getText(root, 'modelVersion'),
    jiraVersion: getText(root, 'jiraVersion'),
    exportDate: getText(root, 'exportDate'),
    folders: rootPaths.map(buildFolder).sort((a, b) => a.index - b.index),
  }
}

export function serialize(project: Project): string {
  const lines: string[] = []
  function W(line: string) { lines.push(line) }

  W('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')
  W('<project>')
  W(`    <projectId>${project.projectId}</projectId>`)
  W(`    <projectKey>${project.projectKey}</projectKey>`)
  W(`    <modelVersion>${project.modelVersion}</modelVersion>`)
  W(`    <jiraVersion>${project.jiraVersion}</jiraVersion>`)
  W(`    <exportDate>${project.exportDate}</exportDate>`)

  const allFolders: Array<{ path: string; folder: Folder }> = []
  function collectFolders(folders: Folder[], parentPath: string) {
    for (const folder of [...folders].sort((a, b) => a.index - b.index)) {
      const fullPath = parentPath ? `${parentPath}/${folder.name}` : folder.name
      allFolders.push({ path: fullPath, folder })
      collectFolders(folder.children, fullPath)
    }
  }
  collectFolders(project.folders, '')

  W('    <folders>')
  for (const { path, folder } of allFolders) {
    W(`        <folder fullPath="${escapeAttr(path)}" index="${folder.index}"/>`)
  }
  W('    </folders>')

  W('    <testCases>')
  for (const { path, folder } of allFolders) {
    for (const tc of folder.testCases) {
      W(`        <testCase id="${tc.id}" key="${tc.key}">`)
      W('            <attachments/>')
      W('            <confluencePageLinks/>')
      W(`            <createdBy>${tc.createdBy}</createdBy>`)
      W(`            <createdOn>${tc.createdOn}</createdOn>`)
      W('            <customFields/>')
      W(`            <folder>${cdata(path)}</folder>`)

      if (tc.issues.length > 0) {
        W('            <issues>')
        for (const issue of tc.issues) {
          W('                <issue>')
          W(`                    <key>${issue.key}</key>`)
          W(`                    <summary>${cdata(issue.summary)}</summary>`)
          W('                </issue>')
        }
        W('            </issues>')
      } else {
        W('            <issues/>')
      }

      W('            <labels/>')
      W(`            <name>${cdata(tc.name)}</name>`)
      if (tc.objective != null) W(`            <objective>${cdata(tc.objective)}</objective>`)
      if (tc.owner != null) W(`            <owner>${tc.owner}</owner>`)
      W(`            <priority>${cdata(tc.priority)}</priority>`)
      W(`            <status>${cdata(tc.status)}</status>`)
      W('            <parameters/>')

      W('            <testScript type="steps">')
      W('                <steps>')
      for (let i = 0; i < tc.steps.length; i++) {
        const step = tc.steps[i]
        W(`                    <step index="${i}">`)
        W('                        <customFields/>')
        if (step.description != null)
          W(`                        <description>${cdata(textToHtml(step.description))}</description>`)
        if (step.expectedResult != null)
          W(`                        <expectedResult>${cdata(textToHtml(step.expectedResult))}</expectedResult>`)
        if (step.testData != null)
          W(`                        <testData>${cdata(textToHtml(step.testData))}</testData>`)
        W('                    </step>')
      }
      W('                </steps>')
      W('            </testScript>')

      if (tc.updatedBy != null) W(`            <updatedBy>${tc.updatedBy}</updatedBy>`)
      if (tc.updatedOn != null) W(`            <updatedOn>${tc.updatedOn}</updatedOn>`)
      W('        </testCase>')
    }
  }
  W('    </testCases>')
  W('</project>')

  return lines.join('\r\n') + '\r\n'
}
