<script setup lang="ts">
import { useAppStore } from '../composables/useAppStore'

const store = useAppStore()
</script>

<template>
  <div class="flex items-center px-3 py-1 border-t border-gray-200 bg-gray-50 text-xs text-gray-500 shrink-0 select-none">
    <span class="truncate">{{ store.statusFilePath.value }}</span>
    <span class="ml-auto flex gap-3">
      <span v-if="store.statusContext.value">{{ store.statusContext.value }}</span>
      <span v-if="store.statusModified.value" class="text-amber-600 font-medium">{{ store.statusModified.value }}</span>
    </span>
  </div>
</template>
