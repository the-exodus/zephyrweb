<script setup lang="ts">
import type { Step } from '../types'
import { useAppStore } from '../composables/useAppStore'
import StepCard from './StepCard.vue'
import draggable from 'vuedraggable'

const store = useAppStore()

function onDragEnd(event: { oldIndex?: number; newIndex?: number }) {
  if (event.oldIndex != null && event.newIndex != null) {
    store.onStepDragEnd(event.oldIndex, event.newIndex)
  }
}
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="flex items-center justify-between px-3 py-1.5 bg-gray-100 border-b border-gray-200 shrink-0 select-none">
      <span class="font-semibold text-sm">Steps</span>
      <div class="flex gap-1">
        <button
          @click="store.addStep()"
          :disabled="!store.selectedTestCase.value"
          class="px-2 py-0.5 text-sm font-bold rounded hover:bg-gray-200 disabled:opacity-40"
          title="Add step"
        >+</button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto py-1">
      <div v-if="!store.selectedTestCase.value" class="flex items-center justify-center h-full text-gray-400 text-sm">
        Select a test case to see its steps
      </div>
      <draggable
        v-else
        :list="store.steps.value"
        item-key="_uid"
        :animation="150"
        ghost-class="sortable-ghost"
        handle=".drag-handle"
        @end="onDragEnd"
      >
        <template #item="{ element, index }: { element: Step; index: number }">
          <StepCard :step="element" :index="index" />
        </template>
      </draggable>
    </div>
  </div>
</template>
