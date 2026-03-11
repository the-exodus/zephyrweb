<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import { marked } from 'marked'
import { useAppStore } from '../composables/useAppStore'

marked.setOptions({ gfm: true, breaks: true })

function renderMarkdown(text: string): string {
  return marked.parse(text) as string
}

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
              <div v-if="seg.type === 'text'" class="prose-ai" v-html="renderMarkdown(seg.content)"></div>
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
          class="text-sm rounded-lg px-3 py-2 bg-gray-100 text-gray-900 prose-ai"
          v-html="renderMarkdown(msg.content)"
        ></div>
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

<style scoped>
.prose-ai :deep(h1),
.prose-ai :deep(h2),
.prose-ai :deep(h3) {
  font-weight: 600;
  margin-top: 0.75em;
  margin-bottom: 0.25em;
  line-height: 1.3;
}
.prose-ai :deep(h1) { font-size: 1.1em; }
.prose-ai :deep(h2) { font-size: 1em; }
.prose-ai :deep(h3) { font-size: 0.95em; }

.prose-ai :deep(p) {
  margin: 0.4em 0;
}

.prose-ai :deep(ul),
.prose-ai :deep(ol) {
  margin: 0.4em 0;
  padding-left: 1.5em;
}
.prose-ai :deep(ul) { list-style: disc; }
.prose-ai :deep(ol) { list-style: decimal; }
.prose-ai :deep(li) { margin: 0.15em 0; }

.prose-ai :deep(code) {
  background: rgba(0, 0, 0, 0.06);
  padding: 0.15em 0.3em;
  border-radius: 3px;
  font-size: 0.9em;
}

.prose-ai :deep(pre) {
  background: rgba(0, 0, 0, 0.06);
  padding: 0.5em;
  border-radius: 4px;
  overflow-x: auto;
  margin: 0.4em 0;
}
.prose-ai :deep(pre code) {
  background: none;
  padding: 0;
}

.prose-ai :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 0.5em 0;
  font-size: 0.9em;
}
.prose-ai :deep(th),
.prose-ai :deep(td) {
  border: 1px solid #d1d5db;
  padding: 0.3em 0.5em;
  text-align: left;
}
.prose-ai :deep(th) {
  background: rgba(0, 0, 0, 0.04);
  font-weight: 600;
}

.prose-ai :deep(blockquote) {
  border-left: 3px solid #d1d5db;
  padding-left: 0.75em;
  margin: 0.4em 0;
  color: #6b7280;
}

.prose-ai :deep(hr) {
  border: none;
  border-top: 1px solid #d1d5db;
  margin: 0.75em 0;
}

.prose-ai :deep(a) {
  color: #2563eb;
  text-decoration: underline;
}

.prose-ai :deep(> :first-child) {
  margin-top: 0;
}
.prose-ai :deep(> :last-child) {
  margin-bottom: 0;
}
</style>
