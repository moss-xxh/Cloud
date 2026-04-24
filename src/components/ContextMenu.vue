<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import type { FileItem } from '../types'
import { moveToTrash, renameResource, getRawUrl, isImageFile, getFileIcon, formatSize, formatDate } from '../api'
import MoveModal from './MoveModal.vue'
import ShareDialog from './ShareDialog.vue'

const props = defineProps<{
  item: FileItem
  x: number
  y: number
}>()

const emit = defineEmits<{
  close: []
  refresh: []
}>()

const showDetails = ref(false)
const detailBlobUrl = ref('')
const showMoveModal = ref(false)
const showShareDialog = ref(false)

const menuStyle = computed(() => {
  const style: Record<string, string> = {}
  // Adjust position to keep menu on screen
  const menuWidth = 208
  const menuHeight = 280
  const x = props.x + menuWidth > window.innerWidth ? window.innerWidth - menuWidth - 8 : props.x
  const y = props.y + menuHeight > window.innerHeight ? window.innerHeight - menuHeight - 8 : props.y
  style.left = x + 'px'
  style.top = y + 'px'
  return style
})

function handleDownload() {
  const url = getRawUrl(props.item.path, false)
  window.open(url, '_blank')
  emit('close')
}

async function handleRename() {
  const newName = prompt('重命名为:', props.item.name)
  if (!newName || newName === props.item.name) {
    emit('close')
    return
  }
  const parts = props.item.path.split('/')
  parts.pop()
  const newPath = [...parts, newName].join('/')
  try {
    await renameResource(props.item.path, '/' + newPath)
    emit('refresh')
  } catch (e) {
    alert(`重命名失败: ${(e as Error).message}`)
  }
  emit('close')
}

async function handleDelete() {
  if (!confirm(`确定将「${props.item.name}」移到回收站吗？`)) {
    emit('close')
    return
  }
  try {
    await moveToTrash(props.item.path, props.item.name)
    emit('refresh')
  } catch (e) {
    alert(`删除失败: ${(e as Error).message}`)
  }
  emit('close')
}

function handleMoveTo() {
  showMoveModal.value = true
}

function handleShare() {
  showShareDialog.value = true
}

function handleMoved() {
  showMoveModal.value = false
  emit('refresh')
  emit('close')
}

function handleDetails() {
  showDetails.value = true
  if (!props.item.isDir && isImageFile(props.item.extension)) {
    const token = localStorage.getItem('auth_token') || ''
    fetch(getRawUrl(props.item.path), { headers: { 'X-Auth': token } })
      .then(r => r.blob()).then(b => { detailBlobUrl.value = URL.createObjectURL(b) }).catch(() => {})
  }
}

function closeDetails() {
  showDetails.value = false
  emit('close')
}

function handleClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.context-menu') && !target.closest('.details-drawer') && !target.closest('.move-modal') && !target.closest('.share-dialog')) {
    emit('close')
  }
}

onMounted(() => {
  setTimeout(() => document.addEventListener('click', handleClickOutside), 0)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <!-- Context Menu -->
  <div
    v-if="!showDetails && !showMoveModal && !showShareDialog"
    class="context-menu fixed bg-white rounded-lg shadow-xl py-1 z-[100] w-52 border border-[#dadce0]"
    :style="menuStyle"
  >
    <button
      v-if="!item.isDir"
      @click="handleDownload"
      class="w-full flex items-center gap-3 px-4 py-2 text-sm text-left cursor-pointer transition-colors text-[#202124] hover:bg-[#e8f0fe]"
    >
      <span class="material-icons-round text-lg text-[#5f6368]">download</span>
      下载
    </button>
    <button
      @click="handleRename"
      class="w-full flex items-center gap-3 px-4 py-2 text-sm text-left cursor-pointer transition-colors text-[#202124] hover:bg-[#e8f0fe]"
    >
      <span class="material-icons-round text-lg text-[#5f6368]">edit</span>
      重命名
    </button>
    <button
      @click="handleMoveTo"
      class="w-full flex items-center gap-3 px-4 py-2 text-sm text-left cursor-pointer transition-colors text-[#202124] hover:bg-[#e8f0fe]"
    >
      <span class="material-icons-round text-lg text-[#5f6368]">drive_file_move</span>
      移动到
    </button>
    <button
      @click="handleShare"
      class="w-full flex items-center gap-3 px-4 py-2 text-sm text-left cursor-pointer transition-colors text-[#202124] hover:bg-[#e8f0fe]"
    >
      <span class="material-icons-round text-lg text-[#5f6368]">share</span>
      分享链接
    </button>
    <button
      @click="handleDelete"
      class="w-full flex items-center gap-3 px-4 py-2 text-sm text-left cursor-pointer transition-colors text-[#202124] hover:bg-[#e8f0fe]"
    >
      <span class="material-icons-round text-lg text-[#5f6368]">delete</span>
      删除
    </button>
    <div class="my-1 border-t border-[#e0e0e0]"></div>
    <button
      @click="handleDetails"
      class="w-full flex items-center gap-3 px-4 py-2 text-sm text-left cursor-pointer transition-colors text-[#202124] hover:bg-[#e8f0fe]"
    >
      <span class="material-icons-round text-lg text-[#5f6368]">info</span>
      详情
    </button>
  </div>

  <!-- Details Drawer -->
  <Teleport to="body">
    <Transition name="slide">
      <div
        v-if="showDetails"
        class="details-drawer fixed right-0 top-16 bottom-0 w-80 bg-white shadow-xl z-[100] flex flex-col border-l border-[#dadce0]"
      >
        <div class="flex items-center justify-between px-6 py-4 border-b border-[#dadce0]">
          <h3 class="text-base font-medium text-[#202124]">详情</h3>
          <button
            @click="closeDetails"
            class="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-colors text-[#5f6368] hover:bg-[#e8f0fe]"
          >
            <span class="material-icons-round">close</span>
          </button>
        </div>
        <div class="flex-1 overflow-auto p-6">
          <!-- Thumbnail -->
          <div class="text-center mb-6">
            <img
              v-if="!item.isDir && isImageFile(item.extension)"
              :src="detailBlobUrl"
              :alt="item.name"
              class="max-w-full max-h-40 rounded-lg mx-auto object-contain"
            />
            <span
              v-else
              class="material-icons-round text-6xl"
              :class="item.isDir ? 'text-[#5f6368]' : 'text-[#1a73e8]'"
            >
              {{ getFileIcon(item.extension, item.isDir) }}
            </span>
            <p class="mt-3 text-sm font-medium text-[#202124]">{{ item.name }}</p>
          </div>
          <div class="space-y-4">
            <div>
              <p class="text-xs mb-1 text-[#5f6368]">类型</p>
              <p class="text-sm text-[#202124]">{{ item.isDir ? 'Folder' : (item.extension || 'File') }}</p>
            </div>
            <div v-if="!item.isDir">
              <p class="text-xs mb-1 text-[#5f6368]">大小</p>
              <p class="text-sm text-[#202124]">{{ formatSize(item.size) }}</p>
            </div>
            <div>
              <p class="text-xs mb-1 text-[#5f6368]">修改时间</p>
              <p class="text-sm text-[#202124]">{{ formatDate(item.modified) }}</p>
            </div>
            <div>
              <p class="text-xs mb-1 text-[#5f6368]">位置</p>
              <p class="text-sm text-[#202124] break-all">{{ item.path }}</p>
            </div>
            <div>
              <p class="text-xs mb-1 text-[#5f6368]">Permissions</p>
              <p class="text-sm text-[#202124] font-mono">{{ item.mode ? item.mode.toString(8) : '—' }}</p>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Move Modal -->
  <Teleport to="body">
    <MoveModal
      v-if="showMoveModal"
      :items="[item]"
      @close="showMoveModal = false"
      @moved="handleMoved"
    />
  </Teleport>

  <!-- Share Dialog -->
  <Teleport to="body">
    <ShareDialog
      v-if="showShareDialog"
      :item="item"
      @close="showShareDialog = false; emit('close')"
    />
  </Teleport>
</template>

<style scoped>
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.2s ease;
}
.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
}
</style>
