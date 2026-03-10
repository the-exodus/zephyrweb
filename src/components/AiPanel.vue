<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import { useAppStore } from '../composables/useAppStore'

const store = useAppStore()
const input = ref('')
const messagesEl = ref<HTMLElement | null>(null)

function scrollToBottom() {
  nextTick(() => {
    if (messagesEl.value) {
      messagesEl.value.scrollTop = messagesEl.value.scrollHeight
    }
  })
}

watch(() => store.aiMessages.value.length, scrollToBottom)

function send() {
  const text = input.value.trim()
  if (!text) return
  store.aiMessages.value.push({ role: 'user', content: text })
  input.value = ''
  scrollToBottom()
  // TODO: send to Claude API
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}
</script>

<template>
  <div class="flex flex-col h-full border-l border-gray-200 bg-white">
    <div class="flex items-center justify-between px-3 py-1.5 bg-gray-100 border-b border-gray-200 shrink-0 select-none">
      <span class="font-semibold text-sm">AI</span>
      <button
        @click="store.showAiPanel.value = false"
        class="px-2 py-0.5 text-sm rounded hover:bg-gray-200"
        title="Close AI panel"
      >&times;</button>
    </div>

    <div ref="messagesEl" class="flex-1 overflow-y-auto p-3 space-y-3">
      <div v-if="store.aiMessages.value.length === 0" class="flex items-center justify-center h-full text-gray-400 text-sm">
        Ask Claude about your test cases
      </div>
      <div
        v-for="(msg, i) in store.aiMessages.value"
        :key="i"
        :class="msg.role === 'user' ? 'ml-8' : 'mr-8'"
      >
        <div
          :class="[
            'text-sm rounded-lg px-3 py-2 whitespace-pre-wrap',
            msg.role === 'user'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 text-gray-900'
          ]"
        >{{ msg.content }}</div>
      </div>
      <div v-if="store.aiLoading.value" class="mr-8">
        <div class="text-sm text-gray-400 px-3 py-2">Thinking...</div>
      </div>
    </div>

    <div class="shrink-0 border-t border-gray-200 p-2">
      <div class="flex gap-2">
        <textarea
          v-model="input"
          @keydown="onKeydown"
          rows="2"
          placeholder="Ask something..."
          class="flex-1 resize-none px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button
          @click="send"
          :disabled="!input.trim()"
          class="self-end px-3 py-1.5 text-sm text-white bg-blue-500 hover:bg-blue-600 rounded transition-colors disabled:opacity-40"
        >Send</button>
      </div>
    </div>
  </div>
</template>
