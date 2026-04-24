<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { FileItem } from '../types'
import { getResources, getRawUrl, isImageFile, getFileIcon, formatSize, formatDate, uploadFile, moveToTrash, renameResource, createFolder } from '../api'
import AuthImage from '../components/AuthImage.vue'
import UploadToast from '../components/UploadToast.vue'
import FilePreview from '../components/FilePreview.vue'
import MoveModal from '../components/MoveModal.vue'
import ShareDialog from '../components/ShareDialog.vue'

const route = useRoute()
const router = useRouter()

const items = ref<FileItem[]>([])
const loading = ref(false)
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
  const x = Math.min(quickMenu.value.x, globalThis.innerWidth - 200)
  return { left: x + 'px', top: quickMenu.value.y + 'px' }
})
const contextMenu = ref<{ item: FileItem; x: number; y: number } | null>(null)

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
  // Filter out hidden files (starting with .)
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

const selectionCount = computed(() => selectedPaths.value.size)

// Single selected item for enhanced toolbar
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
    // Ctrl+Click: Toggle multi-select
    const newSet = new Set(selectedPaths.value)
    if (newSet.has(item.path)) {
      newSet.delete(item.path)
    } else {
      newSet.add(item.path)
    }
    selectedPaths.value = newSet
    lastClickedIndex.value = index
  } else if (e.shiftKey && lastClickedIndex.value >= 0) {
    // Shift+Click: Range selection
    const start = Math.min(lastClickedIndex.value, index)
    const end = Math.max(lastClickedIndex.value, index)
    const newSet = new Set(selectedPaths.value)
    for (let i = start; i <= end; i++) {
      const it = sortedItems.value[i]
      if (it) newSet.add(it.path)
    }
    selectedPaths.value = newSet
  } else {
    // Single click: Open folder or preview file (Google Drive style)
    clearSelection()
    if (item.isDir) {
      router.push('/drive/' + item.path)
    } else if (item.extension && ['.html', '.htm'].includes(item.extension.toLowerCase())) {
      // HTML files: fetch with auth, then open as blob in new tab
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

// More menu (⋮ button)
function handleMoreClick(e: MouseEvent, item: FileItem) {
  e.stopPropagation()
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  quickMenu.value = { item, x: rect.right, y: rect.bottom }
  contextMenu.value = null
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


function handleQuickDownload() {
  if (!quickMenu.value) return
  const item = quickMenu.value.item
  quickMenu.value = null
  if (!item.isDir) {
    const token = localStorage.getItem('auth_token') || ''
    const encodedPath = item.path.split('/').map(encodeURIComponent).join('/')
    window.open(`/api/raw/${encodedPath}?auth=${token}`, '_blank')
  }
}

function handleQuickMoveTo() {
  if (!quickMenu.value) return
  // 选中该项，打开移动弹窗
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
  // Only clear if clicking on the container itself, not on an item
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
  try {
    const data = await getResources(currentPath.value)
    items.value = data.items || []
  } catch (e) {
    console.error('Failed to load files:', e)
    items.value = []
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

// Batch operations
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

function handleBatchDownload() {
  for (const item of selectedItems.value) {
    if (!item.isDir) {
      const url = getRawUrl(item.path, false)
      window.open(url, '_blank')
    }
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

// Single-selection toolbar actions
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

// Preview navigation
function handlePreviewNavigate(file: FileItem) {
  previewFile.value = file
}

// Drag & drop upload
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
  
  // Check if any item is a directory (webkitGetAsEntry)
  const entries: any[] = []
  for (const item of items) {
    const entry = (item as any).webkitGetAsEntry?.()
    if (entry) entries.push(entry)
  }

  if (entries.length > 0) {
    // Use entry API for full folder support
    const allFiles: Array<{ file: File; relativePath: string }> = []
    
    async function readEntry(entry: any, path: string): Promise<void> {
      if (entry.isFile) {
        const file: File = await new Promise((resolve) => entry.file(resolve))
        allFiles.push({ file, relativePath: path + file.name })
      } else if (entry.isDirectory) {
        const dirPath = path + entry.name + '/'
        // Collect dir path for creation
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

    // Upload all collected files
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
    // Fallback: plain file drop
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
    class="p-4 md:p-6 h-full"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
    @click="handleContainerClick"
  >
    <!-- Selection bar (enhanced: shows Share, and for single-select shows Rename) -->
    <div
      v-if="selectionCount > 0"
      class="selection-bar flex items-center gap-2 md:gap-4 mb-4 px-3 md:px-4 py-2.5 rounded-xl bg-[#d3e3fd]"
    >
      <span class="text-sm font-medium text-[#202124] whitespace-nowrap">已选 {{ selectionCount }} 项</span>
      <div class="flex items-center gap-1 ml-auto flex-wrap">
        <!-- Share (only for single non-dir file) -->
        <button
          v-if="singleSelectedItem && !singleSelectedItem.isDir"
          @click="handleBatchShare"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-colors text-[#202124] hover:bg-[#c2d7f9]"
          title="分享"
        >
          <span class="material-icons-round text-lg">share</span>
          <span class="hidden md:inline">分享</span>
        </button>
        <button
          @click="handleBatchDownload"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-colors text-[#202124] hover:bg-[#c2d7f9]"
          title="下载"
        >
          <span class="material-icons-round text-lg">download</span>
          <span class="hidden md:inline">下载</span>
        </button>
        <!-- Rename (only for single selection) -->
        <button
          v-if="singleSelectedItem"
          @click="handleToolbarRename"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-colors text-[#202124] hover:bg-[#c2d7f9]"
          title="重命名"
        >
          <span class="material-icons-round text-lg">edit</span>
          <span class="hidden md:inline">重命名</span>
        </button>
        <button
          @click="handleBatchDelete"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-colors text-[#202124] hover:bg-[#c2d7f9]"
          title="删除"
        >
          <span class="material-icons-round text-lg">delete</span>
          <span class="hidden md:inline">删除</span>
        </button>
        <button
          @click="handleBatchMove"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-colors text-[#202124] hover:bg-[#c2d7f9]"
          title="移动"
        >
          <span class="material-icons-round text-lg">drive_file_move</span>
          <span class="hidden md:inline">移动</span>
        </button>
        <button
          @click="clearSelection"
          class="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer text-[#5f6368] hover:bg-[#c2d7f9] transition-colors ml-2"
          title="取消选择"
        >
          <span class="material-icons-round text-lg">close</span>
        </button>
      </div>
    </div>

    <!-- Header -->
    <div v-if="selectionCount === 0" class="flex items-center justify-between mb-4">
      <!-- Breadcrumbs -->
      <div class="flex items-center gap-1 text-sm min-w-0 overflow-x-auto">
        <template v-for="(crumb, i) in breadcrumbs" :key="crumb.path">
          <span v-if="i > 0" class="mx-1 text-[#5f6368] shrink-0">›</span>
          <button
            @click="navigateToBreadcrumb(crumb.path)"
            class="px-2 py-1 rounded cursor-pointer transition-colors hover:bg-[#e8f0fe] whitespace-nowrap shrink-0"
            :class="i === breadcrumbs.length - 1 ? 'text-[#202124] font-medium' : 'text-[#5f6368]'"
          >
            {{ crumb.name }}
          </button>
        
    <!-- Detail Drawer (from ⋮ menu) -->
    <Teleport to="body">
      <div v-if="detailItem" class="fixed inset-0 z-[150]" @click="detailItem = null">
        <div
          class="fixed right-0 top-0 h-full w-80 bg-white shadow-2xl border-l border-[#dadce0] p-6 overflow-auto"
          @click.stop
        >
          <div class="flex items-center justify-between mb-6">
            <h3 class="text-base font-medium text-[#202124]">详情</h3>
            <button @click="detailItem = null" class="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer hover:bg-[#e8f0fe]">
              <span class="material-icons-round text-lg text-[#5f6368]">close</span>
            </button>
          </div>
          <div class="flex flex-col items-center mb-6">
            <span class="material-icons-round text-5xl mb-2" :class="detailItem.isDir ? 'text-[#5f6368]' : 'text-[#1a73e8]'">
              {{ detailItem.isDir ? 'folder' : 'insert_drive_file' }}
            </span>
            <p class="text-sm font-medium text-[#202124] text-center break-all">{{ detailItem.name }}</p>
          </div>
          <div class="space-y-4 text-sm">
            <div>
              <p class="text-[#5f6368] mb-1">类型</p>
              <p class="text-[#202124]">{{ detailItem.isDir ? '文件夹' : (detailItem.extension || '文件') }}</p>
            </div>
            <div v-if="!detailItem.isDir">
              <p class="text-[#5f6368] mb-1">大小</p>
              <p class="text-[#202124]">{{ formatSize(detailItem.size) }}</p>
            </div>
            <div>
              <p class="text-[#5f6368] mb-1">修改时间</p>
              <p class="text-[#202124]">{{ formatDate(detailItem.modified) }}</p>
            </div>
            <div>
              <p class="text-[#5f6368] mb-1">位置</p>
              <p class="text-[#202124]">{{ detailItem.path }}</p>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
</template>
      </div>

      <!-- View toggle -->
      <div class="flex items-center gap-1 p-0.5 rounded-lg bg-[#e0e0e0] shrink-0 ml-2">
        <button
          @click="viewMode = 'grid'"
          class="p-1.5 rounded cursor-pointer transition-colors text-[#5f6368]"
          :class="viewMode === 'grid' ? 'bg-white' : ''"
        >
          <span class="material-icons-round text-lg">grid_view</span>
        </button>
        <button
          @click="viewMode = 'list'"
          class="p-1.5 rounded cursor-pointer transition-colors text-[#5f6368]"
          :class="viewMode === 'list' ? 'bg-white' : ''"
        >
          <span class="material-icons-round text-lg">view_list</span>
        </button>
      </div>
    </div>

    <!-- Drag overlay -->
    <div
      v-if="dragOver"
      class="fixed inset-0 z-50 flex items-center justify-center pointer-events-none bg-[#1a73e8]/10"
    >
      <div class="bg-white rounded-xl shadow-xl p-8 text-center">
        <span class="material-icons-round text-5xl mb-2 text-[#1a73e8]">cloud_upload</span>
        <p class="text-sm font-medium text-[#202124]">拖拽文件到此处上传</p>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-20">
      <div class="animate-spin rounded-full h-8 w-8 border-2 border-[#1a73e8] border-t-transparent"></div>
    </div>

    <!-- Empty state -->
    <div v-else-if="!sortedItems.length" class="flex flex-col items-center justify-center py-20">
      <span class="material-icons-round text-6xl mb-4 text-[#dadce0]">folder_open</span>
      <p class="text-base text-[#5f6368]">此文件夹为空</p>
      <p class="text-sm mt-1 text-[#80868b]">拖拽文件到此处上传，或点击「+ 新建」按钮</p>
    </div>

    <!-- Grid View -->
    <div v-else-if="viewMode === 'grid'" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      <div
        v-for="(item, index) in sortedItems"
        :key="item.path"
        class="file-item group bg-white rounded-xl cursor-pointer transition-all overflow-hidden border"
        :class="isSelected(item)
          ? 'border-[#1a73e8] bg-[#d3e3fd]'
          : 'border-[#e0e0e0] hover:border-[#1a73e8]'"
        @click="handleItemClick($event, item, index)"
              >
        <!-- Thumbnail area -->
        <div
          class="h-28 md:h-36 flex items-center justify-center overflow-hidden relative"
          :class="isSelected(item)
            ? 'bg-[#c2d7f9]'
            : item.isDir ? 'bg-[#e8f0fe]' : 'bg-[#f8f9fa]'"
        >
          <AuthImage v-if="!item.isDir && isImageFile(item.extension)" :path="item.path" :alt="item.name" />
          <span
            v-else
            class="material-icons-round"
            :class="item.isDir ? 'text-[#5f6368]' : 'text-[#1a73e8]'"
            style="font-size: 48px"
          >
            {{ getFileIcon(item.extension, item.isDir) }}
          </span>
        </div>
        <!-- Info -->
        <div class="px-3 py-2.5 flex items-center gap-2 border-t" :class="isSelected(item) ? 'border-[#1a73e8]/30' : 'border-[#e0e0e0]'">
          <span
            class="material-icons-round text-lg shrink-0"
            :class="item.isDir ? 'text-[#5f6368]' : 'text-[#1a73e8]'"
          >
            {{ getFileIcon(item.extension, item.isDir) }}
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-sm truncate text-[#202124]">{{ item.name }}</p>
            <p v-if="!item.isDir" class="text-xs text-[#5f6368]">{{ formatSize(item.size) }}</p>
          </div>
          <button
            @click="handleMoreClick($event, item)"
            class="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer hover:bg-[#e8f0fe] transition-colors"
            title="更多操作"
          >
            <span class="material-icons-round text-lg text-[#5f6368]">more_vert</span>
          </button>
        </div>
      </div>
    </div>

    <!-- List View -->
    <div v-else class="bg-white rounded-xl overflow-hidden border border-[#e0e0e0]">
      <!-- Header -->
      <div class="flex items-center px-4 py-3 text-xs font-medium text-[#5f6368] border-b border-[#e0e0e0] select-none">
        <button
          @click="toggleSort('name')"
          class="flex-1 flex items-center gap-1 cursor-pointer hover:text-[#202124] transition-colors text-left"
        >
          名称
          <span v-if="getSortIcon('name')" class="material-icons-round text-xs">{{ getSortIcon('name') }}</span>
        </button>
        <button
          @click="toggleSort('modified')"
          class="w-40 hidden md:flex items-center gap-1 cursor-pointer hover:text-[#202124] transition-colors"
        >
          修改时间
          <span v-if="getSortIcon('modified')" class="material-icons-round text-xs">{{ getSortIcon('modified') }}</span>
        </button>
        <button
          @click="toggleSort('size')"
          class="w-24 hidden md:flex items-center gap-1 justify-end cursor-pointer hover:text-[#202124] transition-colors"
        >
          大小
          <span v-if="getSortIcon('size')" class="material-icons-round text-xs">{{ getSortIcon('size') }}</span>
        </button>
      </div>
      <!-- Rows -->
      <div
        v-for="(item, index) in sortedItems"
        :key="item.path"
        class="file-item group flex items-center px-4 py-2.5 cursor-pointer transition-colors border-b border-[#f1f3f4]"
        :class="isSelected(item) ? 'bg-[#d3e3fd]' : 'hover:bg-[#f8f9fa]'"
        @click="handleItemClick($event, item, index)"
              >
        <div class="flex items-center gap-3 flex-1 min-w-0">
          <span
            class="material-icons-round text-xl shrink-0"
            :class="item.isDir ? 'text-[#5f6368]' : 'text-[#1a73e8]'"
          >
            {{ getFileIcon(item.extension, item.isDir) }}
          </span>
          <span class="text-sm truncate text-[#202124]">{{ item.name }}</span>
        </div>
        <div class="w-40 text-xs text-[#5f6368] hidden md:block">{{ formatDate(item.modified) }}</div>
        <div class="w-24 text-xs text-right text-[#5f6368] hidden md:block mr-2">{{ item.isDir ? '—' : formatSize(item.size) }}</div>
        <button
          @click="handleMoreClick($event, item)"
          class="w-8 h-8 ml-4 rounded-full flex items-center justify-center cursor-pointer hover:bg-[#e8f0fe] transition-colors"
          title="更多操作"
        >
          <span class="material-icons-round text-lg text-[#5f6368]">more_vert</span>
        </button>
      </div>
    </div>


    <!-- Quick Actions Menu (⋮ button) -->
    <Teleport to="body">
      <div
        v-if="quickMenu"
        class="fixed inset-0 z-[99]"
        @click="quickMenu = null"
      >
        <div
          class="fixed bg-white rounded-lg shadow-xl py-1 z-[100] w-52 border border-[#dadce0]"
          :style="quickMenuStyle"
          @click.stop
        >
          <button
            v-if="quickMenu && !quickMenu.item.isDir"
            @click="handleQuickDownload()"
            class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left cursor-pointer transition-colors text-[#202124] hover:bg-[#f5f5f5]"
          >
            <span class="material-icons-round text-lg text-[#5f6368]">download</span>
            下载
          </button>
          <button
            @click="handleQuickRename()"
            class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left cursor-pointer transition-colors text-[#202124] hover:bg-[#f5f5f5]"
          >
            <span class="material-icons-round text-lg text-[#5f6368]">edit</span>
            重命名
          </button>
          <button
            @click="handleQuickShare()"
            class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left cursor-pointer transition-colors text-[#202124] hover:bg-[#f5f5f5]"
          >
            <span class="material-icons-round text-lg text-[#5f6368]">link</span>
            分享链接
          </button>
          <button
            @click="handleQuickMoveTo()"
            class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left cursor-pointer transition-colors text-[#202124] hover:bg-[#f5f5f5]"
          >
            <span class="material-icons-round text-lg text-[#5f6368]">drive_file_move</span>
            移动到
          </button>
          <div class="border-t border-[#e0e0e0] my-1"></div>
          <button
            @click="handleQuickDelete()"
            class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left cursor-pointer transition-colors text-[#e53935] hover:bg-[#fbe9e7]"
          >
            <span class="material-icons-round text-lg">delete</span>
            删除
          </button>
          <div class="border-t border-[#e0e0e0] my-1"></div>
          <button
            @click="handleQuickDetails()"
            class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left cursor-pointer transition-colors text-[#202124] hover:bg-[#f5f5f5]"
          >
            <span class="material-icons-round text-lg text-[#5f6368]">info</span>
            详情
          </button>
        </div>
      </div>
    </Teleport>

    <!-- Context Menu removed: all functions moved to ⋮ button --><!-- File Preview -->
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

    <!-- Share Dialog (from quick menu / context menu) -->
    <Teleport to="body">
      <ShareDialog
        v-if="shareItem"
        :item="shareItem"
        @close="shareItem = null"
      />
    </Teleport>

    <!-- Upload Toast -->
    <UploadToast />
  </div>

    <!-- Detail Drawer (from ⋮ menu) -->
    <Teleport to="body">
      <div v-if="detailItem" class="fixed inset-0 z-[150]" @click="detailItem = null">
        <div
          class="fixed right-0 top-0 h-full w-80 bg-white shadow-2xl border-l border-[#dadce0] p-6 overflow-auto"
          @click.stop
        >
          <div class="flex items-center justify-between mb-6">
            <h3 class="text-base font-medium text-[#202124]">详情</h3>
            <button @click="detailItem = null" class="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer hover:bg-[#e8f0fe]">
              <span class="material-icons-round text-lg text-[#5f6368]">close</span>
            </button>
          </div>
          <div class="flex flex-col items-center mb-6">
            <span class="material-icons-round text-5xl mb-2" :class="detailItem.isDir ? 'text-[#5f6368]' : 'text-[#1a73e8]'">
              {{ detailItem.isDir ? 'folder' : 'insert_drive_file' }}
            </span>
            <p class="text-sm font-medium text-[#202124] text-center break-all">{{ detailItem.name }}</p>
          </div>
          <div class="space-y-4 text-sm">
            <div>
              <p class="text-[#5f6368] mb-1">类型</p>
              <p class="text-[#202124]">{{ detailItem.isDir ? '文件夹' : (detailItem.extension || '文件') }}</p>
            </div>
            <div v-if="!detailItem.isDir">
              <p class="text-[#5f6368] mb-1">大小</p>
              <p class="text-[#202124]">{{ formatSize(detailItem.size) }}</p>
            </div>
            <div>
              <p class="text-[#5f6368] mb-1">修改时间</p>
              <p class="text-[#202124]">{{ formatDate(detailItem.modified) }}</p>
            </div>
            <div>
              <p class="text-[#5f6368] mb-1">位置</p>
              <p class="text-[#202124]">{{ detailItem.path }}</p>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
</template>
