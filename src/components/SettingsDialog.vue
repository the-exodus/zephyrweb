<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAppStore } from '../composables/useAppStore'

const store = useAppStore()
const localKey = ref('')

watch(() => store.showSettings.value, (visible) => {
  if (visible) localKey.value = store.apiKey.value
})

function save() {
  store.apiKey.value = localKey.value
  store.saveSettings()
  store.showSettings.value = false
}

function cancel() {
  store.showSettings.value = false
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="store.showSettings.value"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      @mousedown.self="cancel"
    >
      <div
        class="bg-white rounded-lg shadow-xl max-w-sm w-full mx-4 p-6"
        @keydown.escape="cancel"
      >
        <h3 class="font-semibold text-gray-900 mb-4">Settings</h3>
        <label class="block text-sm text-gray-700 mb-1">Claude API Key</label>
        <input
          v-model="localKey"
          type="password"
          placeholder="sk-ant-..."
          class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          @keydown.enter="save"
          @keydown.escape="cancel"
        />
        <div class="flex justify-end gap-2 mt-6">
          <button
            @click="cancel"
            class="px-4 py-1.5 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            @click="save"
            class="px-4 py-1.5 text-sm text-white bg-blue-500 hover:bg-blue-600 rounded transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
