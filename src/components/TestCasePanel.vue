<script setup lang="ts">
import { ref, computed } from 'vue'
import type { TestCase, Folder } from '../types'
import { useAppStore } from '../composables/useAppStore'
import EditableText from './EditableText.vue'
import draggable from 'vuedraggable'

const store = useAppStore()

const sortKey = ref<string | null>(null)
const sortAsc = ref(true)

const showMoveDialog = ref(false)
const moveTarget = ref<Folder | null>(null)

const sortedTestCases = computed(() => {
  const tcs = store.testCases.value
  if (!sortKey.value) return tcs
  const key = sortKey.value as keyof TestCase
  const dir = sortAsc.value ? 1 : -1
  return [...tcs].sort((a, b) => {
    const av = (a[key] ?? '') as string
    const bv = (b[key] ?? '') as string
    return av.localeCompare(bv) * dir
  })
})

function toggleSort(key: string) {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value
  } else {
    sortKey.value = key
    sortAsc.value = true
  }
}

function sortIndicator(key: string) {
  if (sortKey.value !== key) return ''
  return sortAsc.value ? ' \u25B4' : ' \u25BE'
}

function selectRow(tc: TestCase) {
  store.selectTestCase(tc)
}

function onCommit(tc: TestCase, prop: string, oldVal: string | null, newVal: string | null) {
  store.recordPropertyEdit(tc as unknown as Record<string, unknown>, prop, oldVal, newVal)
}

function onDragEnd(event: { oldIndex?: number; newIndex?: number }) {
  if (event.oldIndex != null && event.newIndex != null) {
    store.onTestCaseDragEnd(event.oldIndex, event.newIndex)
  }
}

function openMoveDialog() {
  if (!store.selectedTestCase.value) return
  moveTarget.value = null
  showMoveDialog.value = true
}

function confirmMove() {
  if (store.selectedTestCase.value && moveTarget.value) {
    store.moveTestCaseToFolder(store.selectedTestCase.value, moveTarget.value)
  }
  showMoveDialog.value = false
}

function flatFolders(): Folder[] {
  return store.allFolders()
}

function folderPath(folder: Folder): string {
  // Build display path by searching parents
  const folders = store.allFolders()
  const parts: string[] = [folder.name]
  let current = folder
  for (const f of folders) {
    if (f.children.includes(current)) {
      parts.unshift(f.name)
      current = f
    }
  }
  return parts.join(' / ')
}
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="flex items-center justify-between px-3 py-1.5 bg-gray-100 border-b border-gray-200 shrink-0 select-none">
      <span class="font-semibold text-sm">Test Cases</span>
      <div class="flex gap-1">
        <button
          v-if="store.selectedTestCase.value"
          @click="openMoveDialog"
          class="px-2 py-0.5 text-xs rounded hover:bg-gray-200"
          title="Move to another folder"
        >Move</button>
        <button
          @click="store.addTestCase()"
          :disabled="!store.selectedFolder.value"
          class="px-2 py-0.5 text-sm font-bold rounded hover:bg-gray-200 disabled:opacity-40"
          title="Add test case"
        >+</button>
        <button
          @click="store.deleteTestCase()"
          :disabled="!store.selectedTestCase.value"
          class="px-2 py-0.5 text-sm font-bold rounded hover:bg-gray-200 disabled:opacity-40"
          title="Delete test case"
        >-</button>
      </div>
    </div>

    <div class="flex-1 overflow-auto">
      <div v-if="!store.selectedFolder.value" class="flex items-center justify-center h-full text-gray-400 text-sm">
        Select a folder to see its test cases
      </div>
      <table v-else class="w-full text-sm">
        <thead class="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
          <tr>
            <th @click="toggleSort('key')" class="px-2 py-1.5 text-left font-medium text-gray-600 cursor-pointer hover:bg-gray-100 select-none w-[100px]">
              Key{{ sortIndicator('key') }}
            </th>
            <th @click="toggleSort('name')" class="px-2 py-1.5 text-left font-medium text-gray-600 cursor-pointer hover:bg-gray-100 select-none">
              Name{{ sortIndicator('name') }}
            </th>
            <th @click="toggleSort('priority')" class="px-2 py-1.5 text-left font-medium text-gray-600 cursor-pointer hover:bg-gray-100 select-none w-[80px]">
              Priority{{ sortIndicator('priority') }}
            </th>
            <th @click="toggleSort('status')" class="px-2 py-1.5 text-left font-medium text-gray-600 cursor-pointer hover:bg-gray-100 select-none w-[90px]">
              Status{{ sortIndicator('status') }}
            </th>
            <th @click="toggleSort('owner')" class="px-2 py-1.5 text-left font-medium text-gray-600 cursor-pointer hover:bg-gray-100 select-none w-[100px]">
              Owner{{ sortIndicator('owner') }}
            </th>
          </tr>
        </thead>
        <!-- Sorted view (no drag) -->
        <tbody v-if="sortKey">
          <tr
            v-for="tc in sortedTestCases"
            :key="tc.id"
            @click="selectRow(tc)"
            class="border-b border-gray-100 cursor-pointer"
            :class="store.selectedTestCase.value === tc ? 'bg-blue-50' : 'hover:bg-gray-50'"
          >
            <td class="px-2 py-1 text-gray-500">{{ tc.key || '\u2014' }}</td>
            <td class="px-2 py-1">
              <EditableText :modelValue="tc.name" @update:modelValue="v => tc.name = v ?? ''" @commit="(o, n) => onCommit(tc, 'name', o, n)" />
            </td>
            <td class="px-2 py-1">
              <EditableText :modelValue="tc.priority" @update:modelValue="v => tc.priority = v ?? ''" @commit="(o, n) => onCommit(tc, 'priority', o, n)" />
            </td>
            <td class="px-2 py-1">
              <EditableText :modelValue="tc.status" @update:modelValue="v => tc.status = v ?? ''" @commit="(o, n) => onCommit(tc, 'status', o, n)" />
            </td>
            <td class="px-2 py-1">
              <EditableText :modelValue="tc.owner" @update:modelValue="v => tc.owner = v" @commit="(o, n) => onCommit(tc, 'owner', o, n)" placeholder="(none)" />
            </td>
          </tr>
        </tbody>
        <!-- Draggable view (unsorted) -->
        <draggable
          v-else
          :list="store.testCases.value"
          item-key="id"
          tag="tbody"
          :animation="150"
          ghost-class="sortable-ghost"
          handle=".drag-cell"
          @end="onDragEnd"
        >
          <template #item="{ element: tc }: { element: TestCase }">
            <tr
              @click="selectRow(tc)"
              class="border-b border-gray-100 cursor-pointer"
              :class="store.selectedTestCase.value === tc ? 'bg-blue-50' : 'hover:bg-gray-50'"
            >
              <td class="px-2 py-1 text-gray-500 drag-cell cursor-grab">{{ tc.key || '\u2014' }}</td>
              <td class="px-2 py-1">
                <EditableText :modelValue="tc.name" @update:modelValue="v => tc.name = v ?? ''" @commit="(o, n) => onCommit(tc, 'name', o, n)" />
              </td>
              <td class="px-2 py-1">
                <EditableText :modelValue="tc.priority" @update:modelValue="v => tc.priority = v ?? ''" @commit="(o, n) => onCommit(tc, 'priority', o, n)" />
              </td>
              <td class="px-2 py-1">
                <EditableText :modelValue="tc.status" @update:modelValue="v => tc.status = v ?? ''" @commit="(o, n) => onCommit(tc, 'status', o, n)" />
              </td>
              <td class="px-2 py-1">
                <EditableText :modelValue="tc.owner" @update:modelValue="v => tc.owner = v" @commit="(o, n) => onCommit(tc, 'owner', o, n)" placeholder="(none)" />
              </td>
            </tr>
          </template>
        </draggable>
      </table>
    </div>

    <!-- Move to folder dialog -->
    <Teleport to="body">
      <div v-if="showMoveDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/30" @mousedown.self="showMoveDialog = false">
        <div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
          <h3 class="font-semibold text-gray-900 mb-3">Move to folder</h3>
          <div class="max-h-60 overflow-y-auto border border-gray-200 rounded mb-4">
            <div
              v-for="f in flatFolders()"
              :key="f._uid"
              @click="moveTarget = f"
              class="px-3 py-1.5 text-sm cursor-pointer"
              :class="moveTarget === f ? 'bg-blue-100' : 'hover:bg-gray-50'"
            >
              {{ folderPath(f) }}
            </div>
          </div>
          <div class="flex justify-end gap-2">
            <button @click="showMoveDialog = false" class="px-4 py-1.5 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded">Cancel</button>
            <button @click="confirmMove" :disabled="!moveTarget" class="px-4 py-1.5 text-sm text-white bg-blue-500 hover:bg-blue-600 rounded disabled:opacity-40">Move</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
