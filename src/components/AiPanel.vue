<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import { useAppStore } from '../composables/useAppStore'

const store = useAppStore()
const input = ref('')
const messagesEl = ref<HTMLElement | null>(null)

const canSend = computed(() =>
  !!input.value.trim()
  && !store.aiLoading.value
  && !!store.selectedFolder.value
  && !!store.apiKey.value
)

const placeholder = computed(() => {
  if (!store.apiKey.value) return 'Set API key in Settings first'
  if (!store.selectedFolder.value) return 'Select a folder first'
  return 'Ask something... (Enter to send, Shift+Enter for newline)'
})

function scrollToBottom() {
  nextTick(() => {
    if (messagesEl.value) {
      messagesEl.value.scrollTop = messagesEl.value.scrollHeight
    }
  })
}

// Scroll on new messages, streaming text, and tool segments
watch(
  () => {
    const msgs = store.aiMessages.value
    const last = msgs[msgs.length - 1]
    return msgs.length + (last?.content?.length ?? 0) + (last?.segments?.length ?? 0)
  },
  scrollToBottom,
)

function send() {
  const text = input.value.trim()
  if (!text || !canSend.value) return
  input.value = ''
  store.sendAiMessage(text)
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
      <div class="flex gap-1">
        <button
          v-if="store.aiMessages.value.length > 0"
          @click="store.clearAiChat()"
          class="px-2 py-0.5 text-xs rounded hover:bg-gray-200 text-gray-500"
          title="Clear chat"
        >Clear</button>
        <button
          @click="store.showAiPanel.value = false"
          class="px-2 py-0.5 text-sm rounded hover:bg-gray-200"
          title="Close AI panel"
        >&times;</button>
      </div>
    </div>

    <div ref="messagesEl" class="flex-1 overflow-y-auto p-3 space-y-3">
      <div v-if="store.aiMessages.value.length === 0" class="flex items-center justify-center h-full text-gray-400 text-sm text-center px-4">
        <span v-if="!store.apiKey.value">Set your Claude API key in Settings to use AI</span>
        <span v-else-if="!store.selectedFolder.value">Select a folder to chat about its test cases</span>
        <span v-else>Ask Claude about your test cases</span>
      </div>
      <div
        v-for="(msg, i) in store.aiMessages.value"
        :key="i"
        :class="msg.role === 'user' ? 'ml-8' : 'mr-4'"
      >
        <!-- User message -->
        <div v-if="msg.role === 'user'"
          class="text-sm rounded-lg px-3 py-2 whitespace-pre-wrap bg-blue-500 text-white"
        >{{ msg.content }}</div>

        <!-- Assistant message (with optional proposal) -->
        <div v-else-if="msg.segments?.length" class="space-y-2">
          <div class="text-sm rounded-lg px-3 py-2 bg-gray-100 text-gray-900">
            <template v-for="(seg, j) in msg.segments" :key="j">
              <div v-if="seg.type === 'text'" class="whitespace-pre-wrap">{{ seg.content }}</div>
              <div v-else class="text-xs text-gray-500 my-1.5 py-1 px-2 bg-white rounded border border-gray-200">{{ seg.content }}</div>
            </template>
          </div>
          <template v-if="msg.proposal">
            <div v-if="msg.proposal.status === 'pending'" class="flex gap-2 px-1">
              <button
                @click="store.acceptProposal(msg)"
                class="px-3 py-1 text-xs text-white bg-green-600 hover:bg-green-700 rounded transition-colors"
              >Apply</button>
              <button
                @click="store.rejectProposal(msg)"
                class="px-3 py-1 text-xs text-gray-700 bg-gray-200 hover:bg-gray-300 rounded transition-colors"
              >Reject</button>
            </div>
            <div v-else-if="msg.proposal.status === 'accepted'" class="text-xs text-green-600 px-1">Applied</div>
            <div v-else class="text-xs text-gray-400 px-1">Rejected</div>
          </template>
        </div>

        <!-- Fallback for messages without segments (e.g. from older conversations) -->
        <div v-else-if="msg.content"
          class="text-sm rounded-lg px-3 py-2 whitespace-pre-wrap bg-gray-100 text-gray-900"
        >{{ msg.content }}</div>
      </div>
      <div v-if="store.aiLoading.value && !store.aiMessages.value[store.aiMessages.value.length - 1]?.content" class="mr-4">
        <div class="text-sm text-gray-400 px-3 py-2">Thinking...</div>
      </div>
    </div>

    <div class="shrink-0 border-t border-gray-200 p-2">
      <div class="flex gap-2">
        <textarea
          v-model="input"
          @keydown="onKeydown"
          rows="2"
          :placeholder="placeholder"
          :disabled="!store.apiKey.value || !store.selectedFolder.value"
          class="flex-1 resize-none px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
        />
        <button
          @click="send"
          :disabled="!canSend"
          class="self-end px-3 py-1.5 text-sm text-white bg-blue-500 hover:bg-blue-600 rounded transition-colors disabled:opacity-40"
        >Send</button>
      </div>
    </div>
  </div>
</template>
