import { ref, computed } from 'vue'

export interface UndoAction {
  undo: () => void
  redo: () => void
}

const MAX_SIZE = 25
const undoStack = ref<UndoAction[]>([])
const redoStack = ref<UndoAction[]>([])
const isPerforming = ref(false)

export const canUndo = computed(() => undoStack.value.length > 0)
export const canRedo = computed(() => redoStack.value.length > 0)

export function record(action: UndoAction) {
  if (isPerforming.value) return
  undoStack.value.push(action)
  if (undoStack.value.length > MAX_SIZE) {
    undoStack.value.shift()
  }
  redoStack.value = []
}

export function undo() {
  const action = undoStack.value.pop()
  if (!action) return
  isPerforming.value = true
  try {
    action.undo()
  } finally {
    isPerforming.value = false
  }
  redoStack.value.push(action)
}

export function redo() {
  const action = redoStack.value.pop()
  if (!action) return
  isPerforming.value = true
  try {
    action.redo()
  } finally {
    isPerforming.value = false
  }
  undoStack.value.push(action)
}

export function clear() {
  undoStack.value = []
  redoStack.value = []
}

export function getIsPerforming() {
  return isPerforming.value
}
