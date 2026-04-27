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
  const menuWidth = 224
  const menuHeight = 320
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
    class="context-menu cd-floating-menu fixed z-[100] w-56"
    :style="menuStyle"
  >
    <button v-if="!item.isDir" @click="handleDownload" class="cd-floating-item">
      <span class="material-icons-round text-lg text-[var(--cd-text-secondary)]">download</span>
      下载
    </button>
    <button @click="handleRename" class="cd-floating-item">
      <span class="material-icons-round text-lg text-[var(--cd-text-secondary)]">edit</span>
      重命名
    </button>
    <button @click="handleMoveTo" class="cd-floating-item">
      <span class="material-icons-round text-lg text-[var(--cd-text-secondary)]">drive_file_move</span>
      移动到
    </button>
    <button @click="handleShare" class="cd-floating-item">
      <span class="material-icons-round text-lg text-[var(--cd-text-secondary)]">share</span>
      分享链接
    </button>
    <div class="cd-floating-divider"></div>
    <button @click="handleDetails" class="cd-floating-item">
      <span class="material-icons-round text-lg text-[var(--cd-text-secondary)]">info</span>
      详情
    </button>
    <div class="cd-floating-divider"></div>
    <button @click="handleDelete" class="cd-floating-item is-danger">
      <span class="material-icons-round text-lg">delete</span>
      删除
    </button>
  </div>

  <!-- Details Drawer -->
  <Teleport to="body">
    <Transition name="slide">
      <aside
        v-if="showDetails"
        class="details-drawer cd-drawer-shell z-[100]"
      >
        <header class="flex items-center justify-between px-6 py-5 border-b border-[var(--cd-line-soft)]">
          <h3 class="text-base font-semibold text-[var(--cd-text-primary)]">详情</h3>
          <button
            @click="closeDetails"
            class="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-colors text-[var(--cd-text-secondary)] hover:bg-[var(--cd-primary-soft)]"
          >
            <span class="material-icons-round">close</span>
          </button>
        </header>
        <div class="flex-1 overflow-auto p-6">
          <!-- Thumbnail -->
          <div class="text-center mb-6 p-6 rounded-2xl bg-white/60 border border-[var(--cd-border-glass)]">
            <img
              v-if="!item.isDir && isImageFile(item.extension)"
              :src="detailBlobUrl"
              :alt="item.name"
              class="max-w-full max-h-40 rounded-xl mx-auto object-contain"
            />
            <span
              v-else
              class="material-icons-round"
              :class="item.isDir ? 'text-[var(--cd-text-secondary)]' : 'text-[var(--cd-primary)]'"
              style="font-size: 56px"
            >
              {{ getFileIcon(item.extension, item.isDir) }}
            </span>
            <p class="mt-3 text-sm font-medium text-[var(--cd-text-primary)] break-all">{{ item.name }}</p>
          </div>
          <dl class="space-y-5">
            <div>
              <dt class="text-xs mb-1 text-[var(--cd-text-secondary)]">类型</dt>
              <dd class="text-sm text-[var(--cd-text-primary)]">{{ item.isDir ? '文件夹' : (item.extension || '文件') }}</dd>
            </div>
            <div v-if="!item.isDir">
              <dt class="text-xs mb-1 text-[var(--cd-text-secondary)]">大小</dt>
              <dd class="text-sm text-[var(--cd-text-primary)]">{{ formatSize(item.size) }}</dd>
            </div>
            <div>
              <dt class="text-xs mb-1 text-[var(--cd-text-secondary)]">修改时间</dt>
              <dd class="text-sm text-[var(--cd-text-primary)]">{{ formatDate(item.modified) }}</dd>
            </div>
            <div>
              <dt class="text-xs mb-1 text-[var(--cd-text-secondary)]">位置</dt>
              <dd class="text-sm text-[var(--cd-text-primary)] break-all">{{ item.path }}</dd>
            </div>
            <div>
              <dt class="text-xs mb-1 text-[var(--cd-text-secondary)]">权限</dt>
              <dd class="text-sm text-[var(--cd-text-primary)] font-mono">{{ item.mode ? item.mode.toString(8) : '—' }}</dd>
            </div>
          </dl>
        </div>
      </aside>
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
  transition: transform 0.22s ease;
}
.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
}
</style>
