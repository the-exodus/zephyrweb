<script setup lang="ts">
import { ref, nextTick } from 'vue'
import type { Folder } from '../types'
import { useAppStore } from '../composables/useAppStore'
import draggable from 'vuedraggable'

const props = defineProps<{ folder: Folder; depth?: number }>()
const store = useAppStore()

const expanded = ref(true)
const editingName = ref(false)
const editValue = ref('')
const nameInput = ref<HTMLInputElement>()

const isSelected = () => store.selectedFolder.value === props.folder

function toggle() {
  if (props.folder.children.length > 0) {
    expanded.value = !expanded.value
  }
}

function select() {
  store.selectFolder(props.folder)
}

async function startEdit() {
  editValue.value = props.folder.name
  editingName.value = true
  await nextTick()
  nameInput.value?.focus()
  nameInput.value?.select()
}

function commitEdit() {
  if (!editingName.value) return
  editingName.value = false
  const oldName = props.folder.name
  const newName = editValue.value.trim() || oldName
  if (oldName !== newName) {
    props.folder.name = newName
    store.recordPropertyEdit(props.folder as unknown as Record<string, unknown>, 'name', oldName, newName)
  }
}

function cancelEdit() {
  editingName.value = false
}

function onEditKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') { commitEdit(); e.preventDefault() }
  if (e.key === 'Escape') { cancelEdit(); e.preventDefault() }
  e.stopPropagation()
}

function onChildrenChange(event: Record<string, unknown>) {
  store.onFolderDragChange(props.folder.children, event as Parameters<typeof store.onFolderDragChange>[1])
}
</script>

<template>
  <div>
    <div
      class="flex items-center gap-1 px-2 py-1 rounded cursor-pointer text-sm select-none group"
      :class="isSelected() ? 'bg-blue-100 text-blue-900' : 'hover:bg-gray-100'"
      @click="select"
      @dblclick.stop="startEdit"
    >
      <button
        v-if="folder.children.length > 0"
        @click.stop="toggle"
        class="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 shrink-0"
      >
        <svg class="w-3 h-3 transition-transform" :class="expanded ? 'rotate-90' : ''" viewBox="0 0 12 12">
          <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
      <span v-else class="w-4 shrink-0"></span>

      <template v-if="!editingName">
        <span class="truncate">{{ folder.name }}</span>
        <span class="ml-auto text-xs text-gray-400 opacity-0 group-hover:opacity-100">
          {{ folder.testCases.length }}
        </span>
      </template>
      <input
        v-else
        ref="nameInput"
        v-model="editValue"
        @blur="commitEdit"
        @keydown="onEditKeydown"
        @click.stop
        class="flex-1 px-1 py-0 text-sm border border-blue-400 rounded outline-none bg-white min-w-0"
      />
    </div>

    <div v-show="expanded" class="folder-children">
      <draggable
        :list="folder.children"
        group="folders"
        item-key="_uid"
        :animation="150"
        ghost-class="sortable-ghost"
        @change="onChildrenChange"
        :empty-insert-threshold="20"
      >
        <template #item="{ element }: { element: Folder }">
          <FolderTreeNode :folder="element" :depth="(depth ?? 0) + 1" />
        </template>
      </draggable>
    </div>
  </div>
</template>
