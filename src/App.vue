<script setup lang="ts">
import { watch, onMounted, onUnmounted } from 'vue'
import { Splitpanes, Pane } from 'splitpanes'
import 'splitpanes/dist/splitpanes.css'
import { useAppStore } from './composables/useAppStore'
import AppToolbar from './components/AppToolbar.vue'
import FolderPanel from './components/FolderPanel.vue'
import TestCasePanel from './components/TestCasePanel.vue'
import StepPanel from './components/StepPanel.vue'
import StatusBar from './components/StatusBar.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import AiPanel from './components/AiPanel.vue'

const store = useAppStore()

// Update document title
watch(store.title, (t) => { document.title = t }, { immediate: true })

// Keyboard shortcuts on window so they work regardless of focus
function onKeydown(e: KeyboardEvent) {
  // Skip shortcuts when typing in an input/textarea
  const tag = (e.target as HTMLElement)?.tagName
  const isEditing = tag === 'INPUT' || tag === 'TEXTAREA'

  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'o' || e.key === 'O') {
      e.preventDefault()
      store.openFile()
    } else if (e.key === 's' && e.shiftKey) {
      e.preventDefault()
      store.saveAs()
    } else if (e.key === 's') {
      e.preventDefault()
      store.save()
    } else if ((e.key === 'z' && !e.shiftKey) && !isEditing) {
      e.preventDefault()
      store.doUndo()
    } else if ((e.key === 'y' || (e.key === 'z' && e.shiftKey)) && !isEditing) {
      e.preventDefault()
      store.doRedo()
    }
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="flex flex-col h-screen bg-white text-gray-900">
    <AppToolbar />
    <Splitpanes class="flex-1 min-h-0">
      <Pane :size="store.showAiPanel.value ? 75 : 100" min-size="50">
        <Splitpanes class="h-full">
          <Pane :size="25" :min-size="15">
            <FolderPanel />
          </Pane>
          <Pane :size="50" :min-size="20">
            <TestCasePanel />
          </Pane>
          <Pane :size="25" :min-size="15">
            <StepPanel />
          </Pane>
        </Splitpanes>
      </Pane>
      <Pane v-if="store.showAiPanel.value" :size="25" :min-size="15">
        <AiPanel />
      </Pane>
    </Splitpanes>
    <StatusBar />
    <ConfirmDialog />
    <SettingsDialog />
  </div>
</template>
