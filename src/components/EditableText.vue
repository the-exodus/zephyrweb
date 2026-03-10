<script setup lang="ts">
import { ref, nextTick, computed } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: string | null
  multiline?: boolean
  placeholder?: string
}>(), {
  multiline: false,
  placeholder: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
  'commit': [oldValue: string | null, newValue: string | null]
}>()

const editing = ref(false)
const editValue = ref('')
const inputEl = ref<HTMLInputElement | HTMLTextAreaElement>()

const displayValue = computed(() => props.modelValue)

let capturedOldValue: string | null = null

async function startEdit() {
  capturedOldValue = props.modelValue
  editValue.value = capturedOldValue ?? ''
  editing.value = true
  await nextTick()
  inputEl.value?.focus()
  inputEl.value?.select()
}

function commitEdit() {
  if (!editing.value) return
  editing.value = false
  const newValue = editValue.value || null
  if (capturedOldValue !== newValue) {
    emit('update:modelValue', newValue)
    emit('commit', capturedOldValue, newValue)
  }
}

function cancelEdit() {
  editing.value = false
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    cancelEdit()
    e.preventDefault()
  } else if (e.key === 'Enter' && !props.multiline) {
    commitEdit()
    e.preventDefault()
  } else if (e.key === 'Enter' && props.multiline && !e.shiftKey) {
    commitEdit()
    e.preventDefault()
  }
  e.stopPropagation()
}

defineExpose({ startEdit })
</script>

<template>
  <div @dblclick.stop="startEdit" class="min-h-[1.5em] cursor-default">
    <template v-if="!editing">
      <span v-if="displayValue" class="whitespace-pre-wrap break-words">{{ displayValue }}</span>
      <span v-else class="text-gray-400 italic text-sm">{{ placeholder || '\u00a0' }}</span>
    </template>
    <template v-else>
      <textarea
        v-if="multiline"
        ref="inputEl"
        v-model="editValue"
        @keydown="onKeydown"
        @blur="commitEdit"
        rows="3"
        class="w-full px-1.5 py-0.5 text-sm border border-blue-400 rounded outline-none resize-y bg-white"
      />
      <input
        v-else
        ref="inputEl"
        v-model="editValue"
        @keydown="onKeydown"
        @blur="commitEdit"
        class="w-full px-1.5 py-0.5 text-sm border border-blue-400 rounded outline-none bg-white"
      />
    </template>
  </div>
</template>
