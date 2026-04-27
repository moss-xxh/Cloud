<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { FileItem } from '../types'
import { getResources, deleteResource, restoreFromTrash, parseTrashName, getFileIcon, formatDate } from '../api'

const items = ref<FileItem[]>([])
const loading = ref(false)

interface TrashItem {
  item: FileItem
  originalName: string
  originalDir: string
}

const trashItems = computed<TrashItem[]>(() => {
  return items.value.map(item => {
    const { originalName, originalDir } = parseTrashName(item.name)
    return { item, originalName, originalDir }
  })
})

async function loadTrash() {
  loading.value = true
  try {
    const data = await getResources('.trash')
    items.value = data.items || []
  } catch {
    items.value = []
  } finally {
    loading.value = false
  }
}

async function handleRestore(ti: TrashItem) {
  try {
    await restoreFromTrash(ti.item.path, ti.item.name)
    loadTrash()
  } catch (e) {
    alert(`还原失败: ${(e as Error).message}`)
  }
}

async function handleDeleteForever(ti: TrashItem) {
  if (!confirm(`确定永久删除「${ti.originalName}」吗？此操作不可撤销。`)) return
  try {
    await deleteResource(ti.item.path)
    loadTrash()
  } catch (e) {
    alert(`删除失败: ${(e as Error).message}`)
  }
}

async function handleEmptyTrash() {
  if (!confirm('确定清空回收站吗？所有项目将被永久删除，此操作不可撤销。')) return
  try {
    for (const ti of trashItems.value) {
      await deleteResource(ti.item.path)
    }
    loadTrash()
  } catch (e) {
    alert(`清空回收站失败: ${(e as Error).message}`)
  }
}

onMounted(() => {
  loadTrash()
})
</script>

<template>
  <div class="p-6 h-full">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-base font-medium text-[var(--cd-text-primary)]">回收站</h2>
      <button
        v-if="trashItems.length > 0"
        @click="handleEmptyTrash"
        class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors text-red-600 hover:bg-red-50"
      >
        <span class="material-icons-round text-lg">delete_forever</span>
        清空回收站
      </button>
    </div>

    <div v-if="loading" class="flex items-center justify-center py-20">
      <div class="animate-spin rounded-full h-8 w-8 border-2 border-[#1a73e8] border-t-transparent"></div>
    </div>

    <div v-else-if="!trashItems.length" class="flex flex-col items-center justify-center py-20">
      <span class="material-icons-round text-6xl mb-4 text-[var(--cd-text-muted)]">delete</span>
      <p class="text-base text-[var(--cd-text-secondary)]">回收站为空</p>
      <p class="text-sm mt-1 text-[var(--cd-text-muted)]">删除的文件将显示在这里</p>
    </div>

    <div v-else class="cd-panel overflow-hidden">
      <div class="flex items-center px-4 py-3 text-xs font-medium text-[var(--cd-text-secondary)] border-b border-[var(--cd-line)]">
        <div class="flex-1">名称</div>
        <div class="w-48 hidden md:block">原始位置</div>
        <div class="w-40 hidden md:block">删除时间</div>
        <div class="w-48 text-right">操作</div>
      </div>
      <div
        v-for="ti in trashItems"
        :key="ti.item.path"
        class="flex items-center px-4 py-2.5 border-b border-[var(--cd-line-soft)] hover:bg-white/60 transition-colors"
      >
        <div class="flex items-center gap-3 flex-1 min-w-0">
          <span
            class="material-icons-round text-xl shrink-0"
            :class="ti.item.isDir ? 'text-[var(--cd-text-secondary)]' : 'text-[var(--cd-primary)]'"
          >
            {{ getFileIcon(ti.item.extension, ti.item.isDir) }}
          </span>
          <span class="text-sm truncate text-[var(--cd-text-primary)]">{{ ti.originalName }}</span>
        </div>
        <div class="w-48 text-xs text-[var(--cd-text-secondary)] truncate hidden md:block">{{ ti.originalDir }}</div>
        <div class="w-40 text-xs text-[var(--cd-text-secondary)] hidden md:block">{{ formatDate(ti.item.modified) }}</div>
        <div class="w-48 flex items-center justify-end gap-2">
          <button
            @click="handleRestore(ti)"
            class="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors text-[var(--cd-primary)] hover:bg-[var(--cd-primary-soft)]"
            title="还原"
          >
            <span class="material-icons-round text-base">restore</span>
            还原
          </button>
          <button
            @click="handleDeleteForever(ti)"
            class="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors text-red-600 hover:bg-red-50"
            title="永久删除"
          >
            <span class="material-icons-round text-base">delete_forever</span>
            删除
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
