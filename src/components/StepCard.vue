<script setup lang="ts">
import type { Step } from '../types'
import { useAppStore } from '../composables/useAppStore'
import EditableText from './EditableText.vue'

const props = defineProps<{ step: Step; index: number }>()
const store = useAppStore()

const isSelected = () => store.selectedStep.value === props.step

function select() {
  store.selectStep(props.step)
}

function onCommit(prop: string, oldVal: string | null, newVal: string | null) {
  store.recordPropertyEdit(props.step as unknown as Record<string, unknown>, prop, oldVal, newVal)
}
</script>

<template>
  <div
    @click="select"
    class="group rounded border p-3 mb-2 mx-1 transition-colors"
    :class="isSelected()
      ? 'border-blue-300 bg-blue-50/50'
      : 'border-gray-200 bg-white hover:bg-gray-50/80'"
  >
    <div class="flex items-start gap-2">
      <!-- Drag handle -->
      <div class="drag-handle cursor-grab mt-0.5 text-gray-400 select-none" title="Drag to reorder">
        &#x2807;
      </div>

      <div class="flex-1 min-w-0">
        <!-- Step header -->
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-bold text-gray-400">Step {{ index + 1 }}</span>
          <button
            @click.stop="store.deleteStep(step)"
            class="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-sm px-1"
            title="Delete step"
          >&#x2715;</button>
        </div>

        <!-- Fields -->
        <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <span class="text-gray-500 font-medium text-xs pt-0.5">Description</span>
          <div class="border border-gray-200 rounded px-2 py-1 hover:border-blue-300 transition-colors">
            <EditableText
              :modelValue="step.description"
              @update:modelValue="v => step.description = v"
              @commit="(o, n) => onCommit('description', o, n)"
              multiline
              placeholder="(empty)"
            />
          </div>

          <span class="text-gray-500 font-medium text-xs pt-0.5">Expected</span>
          <div class="border border-gray-200 rounded px-2 py-1 hover:border-blue-300 transition-colors">
            <EditableText
              :modelValue="step.expectedResult"
              @update:modelValue="v => step.expectedResult = v"
              @commit="(o, n) => onCommit('expectedResult', o, n)"
              multiline
              placeholder="(empty)"
            />
          </div>

          <span class="text-gray-500 font-medium text-xs pt-0.5">Test Data</span>
          <div class="border border-gray-200 rounded px-2 py-1 hover:border-blue-300 transition-colors">
            <EditableText
              :modelValue="step.testData"
              @update:modelValue="v => step.testData = v"
              @commit="(o, n) => onCommit('testData', o, n)"
              multiline
              placeholder="(empty)"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
