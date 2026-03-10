<script setup lang="ts">
import type { Folder } from '../types'
import { useAppStore } from '../composables/useAppStore'
import FolderTreeNode from './FolderTreeNode.vue'
import draggable from 'vuedraggable'

const store = useAppStore()

function onRootChange(event: Record<string, unknown>) {
  if (!store.project.value) return
  store.onFolderDragChange(store.project.value.folders, event as Parameters<typeof store.onFolderDragChange>[1])
}
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="flex items-center justify-between px-3 py-1.5 bg-gray-100 border-b border-gray-200 shrink-0 select-none">
      <span class="font-semibold text-sm">Folders</span>
      <div class="flex gap-1">
        <button
          @click="store.addFolder()"
          :disabled="!store.isFileOpen.value"
          class="px-2 py-0.5 text-sm font-bold rounded hover:bg-gray-200 disabled:opacity-40"
          title="Add subfolder"
        >+</button>
        <button
          @click="store.deleteFolder()"
          :disabled="!store.selectedFolder.value"
          class="px-2 py-0.5 text-sm font-bold rounded hover:bg-gray-200 disabled:opacity-40"
          title="Delete folder"
        >-</button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto p-1">
      <div v-if="!store.isFileOpen.value" class="flex items-center justify-center h-full text-gray-400 text-sm">
        Open a file to get started (Ctrl+O)
      </div>
      <draggable
        v-else-if="store.project.value"
        :list="store.project.value.folders"
        group="folders"
        item-key="_uid"
        :animation="150"
        ghost-class="sortable-ghost"
        @change="onRootChange"
        :empty-insert-threshold="20"
      >
        <template #item="{ element }: { element: Folder }">
          <FolderTreeNode :folder="element" />
        </template>
      </draggable>
    </div>
  </div>
</template>
