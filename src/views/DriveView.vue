<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { FileItem } from '../types'
import { getResources, getRawUrl, getFileIcon, formatSize, formatDate, uploadFile, moveToTrash, renameResource, createFolder } from '../api'
import UploadToast from '../components/UploadToast.vue'
import FilePreview from '../components/FilePreview.vue'
import MoveModal from '../components/MoveModal.vue'
import ShareDialog from '../components/ShareDialog.vue'
import FileCard from '../components/FileCard.vue'
import DriveDetailDrawer from '../components/DriveDetailDrawer.vue'

const route = useRoute()
const router = useRouter()

const items = ref<FileItem[]>([])
const loading = ref(false)
const loadError = ref('')
const viewMode = ref<'grid' | 'list'>(localStorage.getItem('viewMode') as any || 'grid')
const dragOver = ref(false)

// Multi-select
const selectedPaths = ref<Set<string>>(new Set())
const lastClickedIndex = ref<number>(-1)

// Sorting
const sortBy = ref<'name' | 'modified' | 'size'>('name')
const sortAsc = ref(true)

// Context menu
const quickMenu = ref<{ item: FileItem; x: number; y: number } | null>(null)
const detailItem = ref<FileItem | null>(null)
const shareItem = ref<FileItem | null>(null)
const quickMenuStyle = computed(() => {
  if (!quickMenu.value) return {}
  const x = Math.min(quickMenu.value.x, globalThis.innerWidth - 220)
  const y = Math.min(quickMenu.value.y, globalThis.innerHeight - 320)
  return { left: Math.max(8, x) + 'px', top: Math.max(8, y) + 'px' }
})

// File preview
const previewFile = ref<FileItem | null>(null)

// Move modal for multi-select
const showBatchMoveModal = ref(false)

// Share dialog for selection bar
const showBatchShareDialog = ref(false)

const currentPath = computed(() => {
  const params = route.params.pathMatch
  if (!params) return ''
  if (Array.isArray(params)) return params.join('/')
  return params
})

const breadcrumbs = computed(() => {
  const parts = currentPath.value.split('/').filter(Boolean)
  const crumbs = [{ name: '我的云盘', path: '' }]
  let accumulated = ''
  for (const part of parts) {
    accumulated += (accumulated ? '/' : '') + part
    crumbs.push({ name: decodeURIComponent(part), path: accumulated })
  }
  return crumbs
})

const sortedItems = computed(() => {
  const visible = items.value.filter(i => !i.name.startsWith('.'))
  const dirs = visible.filter(i => i.isDir)
  const files = visible.filter(i => !i.isDir)

  const sortFn = (a: FileItem, b: FileItem) => {
    let cmp = 0
    switch (sortBy.value) {
      case 'name':
        cmp = a.name.localeCompare(b.name)
        break
      case 'modified':
        cmp = new Date(a.modified).getTime() - new Date(b.modified).getTime()
        break
      case 'size':
        cmp = (a.size || 0) - (b.size || 0)
        break
    }
    return sortAsc.value ? cmp : -cmp
  }

  dirs.sort(sortFn)
  files.sort(sortFn)
  return [...dirs, ...files]
})

const selectedItems = computed(() =>
  sortedItems.value.filter(i => selectedPaths.value.has(i.path))
)

const folderItems = computed(() => sortedItems.value.filter(i => i.isDir))
const fileItems = computed(() => sortedItems.value.filter(i => !i.isDir))

const selectionCount = computed(() => selectedPaths.value.size)

const singleSelectedItem = computed(() => {
  if (selectionCount.value === 1) {
    return selectedItems.value[0] || null
  }
  return null
})

function isSelected(item: FileItem): boolean {
  return selectedPaths.value.has(item.path)
}

function clearSelection() {
  selectedPaths.value = new Set()
  lastClickedIndex.value = -1
}

function handleItemClick(e: MouseEvent, item: FileItem, index: number) {
  if (e.ctrlKey || e.metaKey) {
    const newSet = new Set(selectedPaths.value)
    if (newSet.has(item.path)) {
      newSet.delete(item.path)
    } else {
      newSet.add(item.path)
    }
    selectedPaths.value = newSet
    lastClickedIndex.value = index
  } else if (e.shiftKey && lastClickedIndex.value >= 0) {
    const start = Math.min(lastClickedIndex.value, index)
    const end = Math.max(lastClickedIndex.value, index)
    const newSet = new Set(selectedPaths.value)
    for (let i = start; i <= end; i++) {
      const it = sortedItems.value[i]
      if (it) newSet.add(it.path)
    }
    selectedPaths.value = newSet
  } else {
    clearSelection()
    if (item.isDir) {
      router.push('/drive/' + item.path)
    } else if (item.extension && ['.html', '.htm'].includes(item.extension.toLowerCase())) {
      const token = localStorage.getItem('auth_token') || ''
      fetch(getRawUrl(item.path), { headers: { 'X-Auth': token } })
        .then(res => res.blob())
        .then(blob => {
          const url = URL.createObjectURL(new Blob([blob], { type: 'text/html' }))
          window.open(url, '_blank')
        })
        .catch(() => window.open(getRawUrl(item.path), '_blank'))
    } else {
      previewFile.value = item
    }
  }
}

function handleMoreClick(e: MouseEvent, item: FileItem) {
  e.stopPropagation()
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  quickMenu.value = { item, x: rect.right, y: rect.bottom + 4 }
}

async function handleQuickRename() {
  if (!quickMenu.value) return
  const item = quickMenu.value.item
  const newName = prompt('重命名为:', item.name)
  quickMenu.value = null
  if (!newName || newName === item.name) return
  const parts = item.path.split('/')
  parts.pop()
  const newPath = [...parts, newName].join('/')
  try {
    await renameResource(item.path, '/' + newPath)
    await loadFiles()
  } catch (e) {
    alert('重命名失败: ' + (e as Error).message)
  }
}

function handleQuickShare() {
  if (!quickMenu.value) return
  shareItem.value = quickMenu.value.item
  quickMenu.value = null
}

async function handleQuickDelete() {
  if (!quickMenu.value) return
  const item = quickMenu.value.item
  quickMenu.value = null
  if (!confirm('确定删除 "' + item.name + '"？')) return
  try {
    await moveToTrash(item.path, item.name)
    await loadFiles()
  } catch (e) {
    alert('删除失败: ' + (e as Error).message)
  }
}

async function downloadFile(item: FileItem) {
  if (item.isDir) return
  const token = localStorage.getItem('auth_token') || ''
  const res = await fetch(getRawUrl(item.path, false), { headers: { 'X-Auth': token } })
  if (!res.ok) throw new Error(`下载失败: ${res.statusText}`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = item.name
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

async function handleQuickDownload() {
  if (!quickMenu.value) return
  const item = quickMenu.value.item
  quickMenu.value = null
  try {
    await downloadFile(item)
  } catch (e) {
    alert((e as Error).message)
  }
}

function handleQuickMoveTo() {
  if (!quickMenu.value) return
  selectedPaths.value = new Set([quickMenu.value.item.path])
  quickMenu.value = null
  showBatchMoveModal.value = true
}

function handleQuickDetails() {
  if (!quickMenu.value) return
  detailItem.value = quickMenu.value.item
  quickMenu.value = null
}

function handleContainerClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (target.closest('.file-item') || target.closest('.context-menu') || target.closest('.selection-bar')) return
  clearSelection()
  quickMenu.value = null
}

function toggleSort(field: 'name' | 'modified' | 'size') {
  if (sortBy.value === field) {
    sortAsc.value = !sortAsc.value
  } else {
    sortBy.value = field
    sortAsc.value = true
  }
}

function getSortIcon(field: string): string {
  if (sortBy.value !== field) return ''
  return sortAsc.value ? 'arrow_upward' : 'arrow_downward'
}

async function loadFiles() {
  loading.value = true
  loadError.value = ''
  try {
    const data = await getResources(currentPath.value)
    items.value = data.items || []
  } catch (e) {
    console.error('Failed to load files:', e)
    items.value = []
    loadError.value = (e as Error).message || '网络错误，请稍后重试'
  } finally {
    loading.value = false
    clearSelection()
  }
}

function navigateToBreadcrumb(path: string) {
  if (path === '') {
    router.push('/drive')
  } else {
    router.push('/drive/' + path)
  }
}

async function handleBatchDelete() {
  const count = selectionCount.value
  if (!confirm(`确定将 ${count} 个项目移到回收站吗？`)) return
  try {
    for (const item of selectedItems.value) {
      await moveToTrash(item.path, item.name)
    }
    clearSelection()
    loadFiles()
  } catch (e) {
    alert(`删除失败: ${(e as Error).message}`)
  }
}

async function handleBatchDownload() {
  try {
    for (const item of selectedItems.value) {
      await downloadFile(item)
    }
  } catch (e) {
    alert((e as Error).message)
  }
}

function handleBatchMove() {
  showBatchMoveModal.value = true
}

function handleBatchMoved() {
  showBatchMoveModal.value = false
  clearSelection()
  loadFiles()
}

function handleBatchShare() {
  showBatchShareDialog.value = true
}

async function handleToolbarRename() {
  const item = singleSelectedItem.value
  if (!item) return
  const newName = prompt('重命名为:', item.name)
  if (!newName || newName === item.name) return
  const parts = item.path.split('/')
  parts.pop()
  const newPath = [...parts, newName].join('/')
  try {
    await renameResource(item.path, '/' + newPath)
    loadFiles()
  } catch (e) {
    alert(`重命名失败: ${(e as Error).message}`)
  }
}

function handlePreviewNavigate(file: FileItem) {
  previewFile.value = file
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
  dragOver.value = true
}

function onDragLeave() {
  dragOver.value = false
}

async function onDrop(e: DragEvent) {
  e.preventDefault()
  dragOver.value = false

  const items = e.dataTransfer?.items
  if (!items?.length) return

  const basePath = currentPath.value || ''

  const entries: any[] = []
  for (const item of items) {
    const entry = (item as any).webkitGetAsEntry?.()
    if (entry) entries.push(entry)
  }

  if (entries.length > 0) {
    const allFiles: Array<{ file: File; relativePath: string }> = []

    async function readEntry(entry: any, path: string): Promise<void> {
      if (entry.isFile) {
        const file: File = await new Promise((resolve) => entry.file(resolve))
        allFiles.push({ file, relativePath: path + file.name })
      } else if (entry.isDirectory) {
        const dirPath = path + entry.name + '/'
        const dirToCreate = basePath ? `${basePath}/${dirPath.slice(0, -1)}` : dirPath.slice(0, -1)
        try { await createFolder(dirToCreate) } catch { /* 409 ok */ }

        const reader = entry.createReader()
        const subEntries: any[] = await new Promise((resolve) => reader.readEntries(resolve))
        for (const sub of subEntries) {
          await readEntry(sub, dirPath)
        }
      }
    }

    for (const entry of entries) {
      await readEntry(entry, '')
    }

    let uploaded = 0
    for (const { file, relativePath } of allFiles) {
      uploaded++
      const dirPart = relativePath.split('/').slice(0, -1).join('/')
      const uploadPath = dirPart ? (basePath ? `${basePath}/${dirPart}` : dirPart) : basePath
      const label = `(${uploaded}/${allFiles.length}) ${file.name}`
      try {
        window.dispatchEvent(new CustomEvent('drive:upload-start', { detail: { name: label } }))
        await uploadFile(uploadPath, file, (percent) => {
          window.dispatchEvent(new CustomEvent('drive:upload-progress', { detail: { name: label, percent } }))
        })
        window.dispatchEvent(new CustomEvent('drive:upload-done', { detail: { name: label } }))
      } catch (err) {
        window.dispatchEvent(new CustomEvent('drive:upload-error', { detail: { name: file.name, error: (err as Error).message } }))
      }
    }
  } else {
    const files = e.dataTransfer?.files
    if (!files?.length) return
    for (const file of files) {
      try {
        window.dispatchEvent(new CustomEvent('drive:upload-start', { detail: { name: file.name } }))
        await uploadFile(basePath, file, (percent) => {
          window.dispatchEvent(new CustomEvent('drive:upload-progress', { detail: { name: file.name, percent } }))
        })
        window.dispatchEvent(new CustomEvent('drive:upload-done', { detail: { name: file.name } }))
      } catch (err) {
        window.dispatchEvent(new CustomEvent('drive:upload-error', { detail: { name: file.name, error: (err as Error).message } }))
      }
    }
  }
  loadFiles()
}

function onRefreshEvent() {
  loadFiles()
}

watch(viewMode, (v) => localStorage.setItem('viewMode', v))

watch(() => route.params.pathMatch, () => {
  loadFiles()
})

onMounted(() => {
  loadFiles()
  window.addEventListener('drive:refresh', onRefreshEvent)
})

onBeforeUnmount(() => {
  window.removeEventListener('drive:refresh', onRefreshEvent)
})
</script>

<template>
  <div
    class="drive-root h-full cd-app-bg p-4 md:p-6"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
    @click="handleContainerClick"
  >
    <!-- Selection bar -->
    <div
      v-if="selectionCount > 0"
      class="selection-bar flex items-center gap-2 mb-4 px-3 md:px-4 py-2.5 rounded-full bg-[#d3e3fd] shadow-sm"
    >
      <button
        type="button"
        class="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer text-[#1a73e8] hover:bg-[#c2d7f9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8]/40 shrink-0"
        title="取消选择"
        aria-label="取消选择"
        @click="clearSelection"
      >
        <span class="material-icons-round text-lg" aria-hidden="true">close</span>
      </button>
      <span class="text-sm font-medium text-[#202124] whitespace-nowrap">已选 {{ selectionCount }} 项</span>

      <div class="flex items-center gap-1 ml-auto flex-wrap justify-end">
        <button
          v-if="singleSelectedItem && !singleSelectedItem.isDir"
          type="button"
          class="selection-action"
          title="分享"
          aria-label="分享"
          @click="handleBatchShare"
        >
          <span class="material-icons-round text-[18px]" aria-hidden="true">share</span>
          <span class="hidden md:inline">分享</span>
        </button>
        <button
          type="button"
          class="selection-action"
          title="下载"
          aria-label="下载"
          @click="handleBatchDownload"
        >
          <span class="material-icons-round text-[18px]" aria-hidden="true">download</span>
          <span class="hidden md:inline">下载</span>
        </button>
        <button
          v-if="singleSelectedItem"
          type="button"
          class="selection-action"
          title="重命名"
          aria-label="重命名"
          @click="handleToolbarRename"
        >
          <span class="material-icons-round text-[18px]" aria-hidden="true">edit</span>
          <span class="hidden md:inline">重命名</span>
        </button>
        <button
          type="button"
          class="selection-action"
          title="移动"
          aria-label="移动"
          @click="handleBatchMove"
        >
          <span class="material-icons-round text-[18px]" aria-hidden="true">drive_file_move</span>
          <span class="hidden md:inline">移动</span>
        </button>
        <button
          type="button"
          class="selection-action"
          title="删除"
          aria-label="删除"
          @click="handleBatchDelete"
        >
          <span class="material-icons-round text-[18px]" aria-hidden="true">delete</span>
          <span class="hidden md:inline">删除</span>
        </button>
      </div>
    </div>

    <!-- Header: breadcrumbs + view toggle -->
    <div class="cd-panel mb-6 flex items-center justify-between gap-3 px-4 py-3 md:px-5">
      <div class="min-w-0">
        <nav class="mb-2 flex items-center min-w-0 overflow-x-auto py-1" aria-label="路径">
        <template v-for="(crumb, i) in breadcrumbs" :key="crumb.path">
          <span v-if="i > 0" class="mx-0.5 text-[#80868b] text-base shrink-0 select-none" aria-hidden="true">›</span>
          <button
            type="button"
            class="crumb px-3 py-1.5 rounded-xl cursor-pointer transition-all duration-200 hover:bg-[#eef4ff] whitespace-nowrap shrink-0 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8]/40"
            :class="i === breadcrumbs.length - 1
              ? 'text-[#202124] font-semibold'
              : 'text-[#5f6368]'"
            :aria-current="i === breadcrumbs.length - 1 ? 'page' : undefined"
            @click="navigateToBreadcrumb(crumb.path)"
          >
            {{ crumb.name }}
          </button>
        </template>
        </nav>
        <h1 class="truncate text-[28px] font-bold tracking-[-0.03em] text-[#1f2937]">{{ breadcrumbs[breadcrumbs.length - 1]?.name || '我的云盘' }}</h1>
      </div>

      <div class="flex items-center gap-2 shrink-0">
        <button type="button" class="hidden md:inline-flex h-8 items-center gap-1 rounded-full border border-[#e5e7eb] bg-white px-3 text-[13px] font-medium text-[#1f2937]">
          <span class="material-icons-round text-[14px] text-[#667085]">sort</span>名称
          <span class="material-icons-round text-[12px] text-[#667085]">expand_more</span>
        </button>
        <button type="button" class="hidden md:inline-flex h-8 items-center gap-1 rounded-full border border-[#e5e7eb] bg-white px-3 text-[13px] font-medium text-[#1f2937]">
          <span class="material-icons-round text-[14px] text-[#667085]">filter_list</span>类型
        </button>
        <button type="button" class="hidden md:inline-flex h-8 items-center rounded-full border border-[#e5e7eb] bg-white px-3 text-[13px] font-medium text-[#1f2937]">所有人</button>

        <div
        class="view-toggle inline-flex items-center p-1 rounded-2xl bg-[#eef4ff] border border-white/80 shadow-inner shrink-0"
        role="group"
        aria-label="视图模式"
      >
        <button
          type="button"
          class="view-toggle-btn"
          :class="viewMode === 'grid' ? 'is-active' : ''"
          :aria-pressed="viewMode === 'grid'"
          title="网格视图"
          aria-label="网格视图"
          @click="viewMode = 'grid'"
        >
          <span class="material-icons-round text-[18px]" aria-hidden="true">grid_view</span>
        </button>
        <button
          type="button"
          class="view-toggle-btn"
          :class="viewMode === 'list' ? 'is-active' : ''"
          :aria-pressed="viewMode === 'list'"
          title="列表视图"
          aria-label="列表视图"
          @click="viewMode = 'list'"
        >
          <span class="material-icons-round text-[18px]" aria-hidden="true">view_list</span>
        </button>
      </div>
    </div>
    </div>

    <!-- Drag overlay -->
    <div
      v-if="dragOver"
      class="fixed inset-0 z-50 flex items-center justify-center pointer-events-none bg-[#1a73e8]/10 backdrop-blur-sm"
    >
      <div class="cd-panel bg-white/90 rounded-[32px] p-8 text-center">
        <span class="material-icons-round text-5xl mb-2 text-[#1a73e8]" aria-hidden="true">cloud_upload</span>
        <p class="text-sm font-medium text-[#202124]">拖拽文件到此处上传</p>
      </div>
    </div>

    <!-- Loading skeleton (v3: cd-skel pulses on glass-aware background) -->
    <div v-if="loading" class="space-y-9 pb-6">
      <section>
        <div class="mb-3 flex items-center gap-2">
          <div class="cd-skel h-3.5 w-12"></div>
          <div class="cd-skel h-3 w-5"></div>
        </div>
        <div class="file-grid gap-5 md:gap-6">
          <div v-for="n in 6" :key="`folder-skel-${n}`" class="cd-file-card flex h-[84px] items-center gap-3 px-4">
            <div class="cd-skel h-9 w-9 shrink-0 rounded-lg"></div>
            <div class="flex flex-1 flex-col gap-2">
              <div class="cd-skel h-2.5 w-3/5"></div>
              <div class="cd-skel h-2 w-1/3"></div>
            </div>
          </div>
        </div>
      </section>
      <section>
        <div class="mb-3 flex items-center gap-2">
          <div class="cd-skel h-3.5 w-10"></div>
          <div class="cd-skel h-3 w-5"></div>
        </div>
        <div class="file-grid gap-5 md:gap-6">
          <div v-for="n in 8" :key="`file-skel-${n}`" class="cd-file-card flex h-[208px] flex-col overflow-hidden">
            <div class="flex flex-1 items-center justify-center bg-[#fafbfc]">
              <div class="cd-skel h-10 w-10"></div>
            </div>
            <div class="flex flex-col gap-2 border-t border-[var(--cd-line-soft)] px-3 py-3">
              <div class="cd-skel h-2.5 w-4/5"></div>
              <div class="cd-skel h-2 w-1/2"></div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- Error state (v3: centered illustration + primary/secondary actions) -->
    <div v-else-if="loadError" class="cd-state-center">
      <div class="cd-state-card">
        <svg class="cd-state-illustration" width="96" height="96" viewBox="0 0 84 84" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="42" cy="42" r="32" />
          <path d="M30 30l24 24M54 30 30 54" />
        </svg>
        <h3 class="cd-state-title">加载失败</h3>
        <p class="cd-state-desc">{{ loadError || '网络连接异常，无法加载文件列表。请检查网络后重试。' }}</p>
        <div class="flex items-center justify-center gap-2">
          <button type="button" class="cd-primary-button h-10 px-5 text-sm" @click="loadFiles">重新加载</button>
          <button type="button" class="cd-secondary-button h-10 px-5 text-sm">联系 IT</button>
        </div>
      </div>
    </div>

    <!-- Empty state (v3: line-only cloud + primary CTA) -->
    <div v-else-if="!sortedItems.length" class="cd-state-center">
      <div class="cd-state-card">
        <svg class="cd-state-illustration" width="120" height="84" viewBox="0 0 120 84" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" aria-hidden="true">
          <path d="M30 64a18 18 0 1 1 3.6-35.7A22 22 0 0 1 79 36a14 14 0 0 1 0 28H30Z" />
          <path d="M48 50h24M60 42v16" stroke-width="1.5" stroke-linecap="round" />
        </svg>
        <h3 class="cd-state-title">还没有任何文件</h3>
        <p class="cd-state-desc">将文件拖入此处，或点击「新建」上传第一个文件。</p>
      </div>
    </div>

    <!-- Grid View -->
    <div v-else-if="viewMode === 'grid'" class="space-y-7 pb-6">
      <section v-if="folderItems.length">
        <div class="mb-3 flex items-center gap-2">
          <span class="text-[13px] font-semibold text-[#1f2937]">文件夹</span>
          <span class="text-xs text-[#9aa3af]">{{ folderItems.length }}</span>
        </div>
        <div class="file-grid gap-5 md:gap-6">
          <FileCard
            v-for="item in folderItems"
            :key="item.path"
            :item="item"
            :selected="isSelected(item)"
            @click="(e) => handleItemClick(e, item, sortedItems.findIndex(i => i.path === item.path))"
            @more="(e) => handleMoreClick(e, item)"
          />
        </div>
      </section>

      <section v-if="fileItems.length">
        <div class="mb-3 flex items-center gap-2">
          <span class="text-[13px] font-semibold text-[#1f2937]">文件</span>
          <span class="text-xs text-[#9aa3af]">{{ fileItems.length }}</span>
        </div>
        <div class="file-grid gap-5 md:gap-6">
          <FileCard
            v-for="item in fileItems"
            :key="item.path"
            :item="item"
            :selected="isSelected(item)"
            @click="(e) => handleItemClick(e, item, sortedItems.findIndex(i => i.path === item.path))"
            @more="(e) => handleMoreClick(e, item)"
          />
        </div>
      </section>
    </div>

    <!-- List View -->
    <div v-else class="cd-panel overflow-hidden rounded-3xl">
      <div class="file-list-row file-list-row--head px-4 py-3 text-xs font-medium text-[#5f6368] border-b border-[#ebedf0] select-none">
        <button
          type="button"
          class="flex items-center gap-1 cursor-pointer hover:text-[#202124] transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8]/40 rounded px-1 -ml-1 w-fit"
          @click="toggleSort('name')"
        >
          名称
          <span v-if="getSortIcon('name')" class="material-icons-round text-[14px]" aria-hidden="true">{{ getSortIcon('name') }}</span>
        </button>
        <button
          type="button"
          class="hidden md:flex items-center gap-1 cursor-pointer hover:text-[#202124] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8]/40 rounded px-1 w-fit"
          @click="toggleSort('modified')"
        >
          修改时间
          <span v-if="getSortIcon('modified')" class="material-icons-round text-[14px]" aria-hidden="true">{{ getSortIcon('modified') }}</span>
        </button>
        <button
          type="button"
          class="hidden md:flex items-center gap-1 justify-end cursor-pointer hover:text-[#202124] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8]/40 rounded px-1 w-fit ml-auto"
          @click="toggleSort('size')"
        >
          大小
          <span v-if="getSortIcon('size')" class="material-icons-round text-[14px]" aria-hidden="true">{{ getSortIcon('size') }}</span>
        </button>
        <span class="sr-only">操作</span>
      </div>

      <div
        v-for="(item, index) in sortedItems"
        :key="item.path"
        class="file-item file-list-row px-4 py-2.5 cursor-pointer transition-colors border-b border-[#f1f3f4] last:border-b-0"
        :class="isSelected(item) ? 'bg-[#e8f0fe]' : 'hover:bg-[#f8f9fa]'"
        @click="handleItemClick($event, item, index)"
      >
        <div class="flex items-center gap-3 min-w-0">
          <span
            class="material-icons-round text-[20px] shrink-0"
            :class="item.isDir ? 'text-[#5f6368]' : 'text-[#1a73e8]'"
            aria-hidden="true"
          >
            {{ getFileIcon(item.extension, item.isDir) }}
          </span>
          <span class="text-sm truncate text-[#202124]" :title="item.name">{{ item.name }}</span>
        </div>
        <div class="text-xs text-[#5f6368] hidden md:block truncate">{{ formatDate(item.modified) }}</div>
        <div class="text-xs text-right text-[#5f6368] hidden md:block">{{ item.isDir ? '—' : formatSize(item.size) }}</div>
        <div class="flex justify-end">
          <button
            type="button"
            class="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer text-[#5f6368] hover:bg-[#e8f0fe] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8]/40 transition-colors shrink-0"
            :aria-label="`${item.name} 更多操作`"
            title="更多操作"
            @click.stop="handleMoreClick($event, item)"
          >
            <span class="material-icons-round text-[18px]" aria-hidden="true">more_vert</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Quick Actions Menu (⋮ button) — v3 cd-floating-menu -->
    <Teleport to="body">
      <div
        v-if="quickMenu"
        class="fixed inset-0 z-[99]"
        @click="quickMenu = null"
      >
        <div
          class="cd-floating-menu fixed z-[100] w-52 p-1.5"
          :style="quickMenuStyle"
          role="menu"
          @click.stop
        >
          <button
            v-if="!quickMenu.item.isDir"
            type="button"
            class="cd-floating-item w-full"
            role="menuitem"
            @click="handleQuickDownload()"
          >
            <span class="material-icons-round text-[18px] text-[var(--cd-text-secondary)]" aria-hidden="true">download</span>
            下载
          </button>
          <button
            type="button"
            class="cd-floating-item w-full"
            role="menuitem"
            @click="handleQuickRename()"
          >
            <span class="material-icons-round text-[18px] text-[var(--cd-text-secondary)]" aria-hidden="true">edit</span>
            重命名
          </button>
          <button
            type="button"
            class="cd-floating-item w-full"
            role="menuitem"
            @click="handleQuickShare()"
          >
            <span class="material-icons-round text-[18px] text-[var(--cd-text-secondary)]" aria-hidden="true">link</span>
            分享链接
          </button>
          <button
            type="button"
            class="cd-floating-item w-full"
            role="menuitem"
            @click="handleQuickMoveTo()"
          >
            <span class="material-icons-round text-[18px] text-[var(--cd-text-secondary)]" aria-hidden="true">drive_file_move</span>
            移动到
          </button>
          <div class="my-1 h-px bg-[var(--cd-line-soft)]"></div>
          <button
            type="button"
            class="cd-floating-item is-danger w-full"
            role="menuitem"
            @click="handleQuickDelete()"
          >
            <span class="material-icons-round text-[18px]" aria-hidden="true">delete</span>
            删除
          </button>
          <div class="my-1 h-px bg-[var(--cd-line-soft)]"></div>
          <button
            type="button"
            class="cd-floating-item w-full"
            role="menuitem"
            @click="handleQuickDetails()"
          >
            <span class="material-icons-round text-[18px] text-[var(--cd-text-secondary)]" aria-hidden="true">info</span>
            详情
          </button>
        </div>
      </div>
    </Teleport>

    <!-- File Preview -->
    <Teleport to="body">
      <FilePreview
        v-if="previewFile"
        :file="previewFile"
        :files="sortedItems"
        @close="previewFile = null"
        @navigate="handlePreviewNavigate"
      />
    </Teleport>

    <!-- Batch Move Modal -->
    <Teleport to="body">
      <MoveModal
        v-if="showBatchMoveModal"
        :items="selectedItems"
        @close="showBatchMoveModal = false"
        @moved="handleBatchMoved"
      />
    </Teleport>

    <!-- Share Dialog (from selection bar) -->
    <Teleport to="body">
      <ShareDialog
        v-if="showBatchShareDialog && singleSelectedItem"
        :item="singleSelectedItem"
        @close="showBatchShareDialog = false"
      />
    </Teleport>

    <!-- Share Dialog (from quick menu) -->
    <Teleport to="body">
      <ShareDialog
        v-if="shareItem"
        :item="shareItem"
        @close="shareItem = null"
      />
    </Teleport>

    <!-- Detail Drawer -->
    <DriveDetailDrawer
      v-if="detailItem"
      :item="detailItem"
      @close="detailItem = null"
    />

    <!-- Upload Toast -->
    <UploadToast />
  </div>
</template>

<style scoped>
.file-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
}
@media (min-width: 640px) {
  .file-grid {
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  }
}
@media (min-width: 1024px) {
  .file-grid {
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  }
}

.file-list-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 3rem;
  align-items: center;
  column-gap: 12px;
}
@media (min-width: 768px) {
  .file-list-row {
    grid-template-columns: minmax(0, 1fr) 10rem 6rem 3rem;
  }
}

.selection-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 9999px;
  font-size: 13px;
  line-height: 1;
  color: #1f1f1f;
  background: transparent;
  cursor: pointer;
  transition: background-color 0.15s ease;
}
.selection-action:hover {
  background: rgba(26, 115, 232, 0.12);
}
.selection-action:focus-visible {
  outline: none;
  background: rgba(26, 115, 232, 0.18);
  box-shadow: 0 0 0 2px rgba(26, 115, 232, 0.4);
}

.view-toggle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 28px;
  border-radius: 9999px;
  color: #5f6368;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
}
.view-toggle-btn:hover {
  color: #202124;
}
.view-toggle-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px rgba(26, 115, 232, 0.4);
}
.view-toggle-btn.is-active {
  background: linear-gradient(135deg, #ffffff 0%, #f8fbff 100%);
  color: #1a73e8;
  box-shadow: 0 6px 16px rgba(26, 115, 232, 0.12);
}

.quick-menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 14px;
  font-size: 13px;
  color: #202124;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.12s ease;
}
.quick-menu-item:hover,
.quick-menu-item:focus-visible {
  background: #f1f3f4;
  outline: none;
}
.quick-menu-item--danger {
  color: #d93025;
}
.quick-menu-item--danger .material-icons-round {
  color: #d93025 !important;
}
.quick-menu-item--danger:hover,
.quick-menu-item--danger:focus-visible {
  background: #fce8e6;
}
</style>
