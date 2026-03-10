<script setup lang="ts">
import { useAppStore } from '../composables/useAppStore'

const store = useAppStore()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="store.dialog.value.visible"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      @mousedown.self="store.resolveDialog(false)"
    >
      <div
        class="bg-white rounded-lg shadow-xl max-w-sm w-full mx-4 p-6"
        @keydown.escape="store.resolveDialog(false)"
      >
        <h3 class="font-semibold text-gray-900 mb-2">{{ store.dialog.value.title }}</h3>
        <p class="text-sm text-gray-600 mb-6">{{ store.dialog.value.message }}</p>
        <div class="flex justify-end gap-2">
          <button
            @click="store.resolveDialog(false)"
            class="px-4 py-1.5 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            @click="store.resolveDialog(true)"
            class="px-4 py-1.5 text-sm text-white bg-blue-500 hover:bg-blue-600 rounded transition-colors"
            ref="confirmBtn"
          >
            {{ store.dialog.value.confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
