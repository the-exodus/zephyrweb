<script setup lang="ts">
import { useAppStore } from '../composables/useAppStore'

const store = useAppStore()
</script>

<template>
  <div class="flex items-center gap-1 px-2 py-1 border-b border-gray-200 bg-gray-50 shrink-0 select-none">
    <button
      @click="store.openFile()"
      class="px-3 py-1 text-sm rounded hover:bg-gray-200 transition-colors"
      title="Open file (Ctrl+O)"
    >
      Open
    </button>
    <button
      @click="store.save()"
      :disabled="!store.isFileOpen.value"
      class="px-3 py-1 text-sm rounded hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
      title="Save (Ctrl+S)"
    >
      Save
    </button>
    <button
      @click="store.saveAs()"
      :disabled="!store.isFileOpen.value"
      class="px-3 py-1 text-sm rounded hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
      title="Save As (Ctrl+Shift+S)"
    >
      Save As
    </button>
    <button
      @click="store.closeFile()"
      :disabled="!store.isFileOpen.value"
      class="px-3 py-1 text-sm rounded hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
      title="Close file"
    >
      Close
    </button>
    <div class="w-px h-5 bg-gray-300 mx-1"></div>
    <button
      @click="store.doUndo()"
      :disabled="!store.canUndo.value"
      class="px-3 py-1 text-sm rounded hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
      title="Undo (Ctrl+Z)"
    >
      Undo
    </button>
    <button
      @click="store.doRedo()"
      :disabled="!store.canRedo.value"
      class="px-3 py-1 text-sm rounded hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
      title="Redo (Ctrl+Y)"
    >
      Redo
    </button>
  </div>
</template>
