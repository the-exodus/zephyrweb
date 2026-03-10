export interface Step {
  _uid: number
  description: string | null
  expectedResult: string | null
  testData: string | null
}

export interface CustomField {
  name: string
  type: string
  value: string
}

export interface Issue {
  key: string
  summary: string
}

export interface TestCase {
  _uid: number
  id: string
  key: string
  name: string
  priority: string
  status: string
  createdBy: string
  createdOn: string
  objective: string | null
  updatedBy: string | null
  updatedOn: string | null
  owner: string | null
  customFields: CustomField[]
  issues: Issue[]
  steps: Step[]
}

export interface Folder {
  _uid: number
  index: number
  name: string
  children: Folder[]
  testCases: TestCase[]
}

export interface Project {
  projectId: string
  projectKey: string
  modelVersion: string
  jiraVersion: string
  exportDate: string
  folders: Folder[]
}
