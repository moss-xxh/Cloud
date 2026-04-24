<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import type { FileItem } from '../types'
import { getRawUrl, isImageFile, isVideoFile, isAudioFile, isPdfFile, isHtmlFile, isTextFile, getFileIcon, formatSize } from '../api'

const props = defineProps<{
  file: FileItem
  files: FileItem[]
}>()

const emit = defineEmits<{
  close: []
  navigate: [file: FileItem]
}>()

const textContent = ref('')
const htmlContent = ref('')
const textLoading = ref(false)
const imageScale = ref(1)

const previewType = computed(() => {
  const ext = props.file.extension
  if (isImageFile(ext)) return 'image'
  if (isVideoFile(ext)) return 'video'
  if (isAudioFile(ext)) return 'audio'
  if (isPdfFile(ext)) return 'pdf'
  if (isHtmlFile(ext)) return 'html'
  if (isTextFile(ext)) return 'text'
  return 'unknown'
})

const rawUrl = computed(() => getRawUrl(props.file.path, true))
const downloadUrl = computed(() => getRawUrl(props.file.path, false))
const blobUrl = ref('')

async function loadBlobUrl() {
  blobUrl.value = ''
  try {
    const token = localStorage.getItem('auth_token') || ''
    const res = await fetch(rawUrl.value, { headers: { 'X-Auth': token } })
    if (res.ok) {
      const blob = await res.blob()
      blobUrl.value = URL.createObjectURL(blob)
    }
  } catch (e) { console.error('Blob load failed:', e) }
}

const navigableFiles = computed(() => props.files.filter(f => !f.isDir))

const currentIndex = computed(() =>
  navigableFiles.value.findIndex(f => f.path === props.file.path)
)

const hasPrev = computed(() => currentIndex.value > 0)
const hasNext = computed(() => currentIndex.value < navigableFiles.value.length - 1)

function goPrev() {
  if (hasPrev.value) {
    const prev = navigableFiles.value[currentIndex.value - 1]; if (prev) emit('navigate', prev)
  }
}

function goNext() {
  if (hasNext.value) {
    const next = navigableFiles.value[currentIndex.value + 1]; if (next) emit('navigate', next)
  }
}

async function loadTextContent() {
  textLoading.value = true
  textContent.value = ''
  try {
    const res = await fetch(rawUrl.value, {
      headers: { 'X-Auth': localStorage.getItem('auth_token') || '' }
    })
    if (res.ok) {
      textContent.value = await res.text()
    } else {
      textContent.value = 'Failed to load file content.'
    }
  } catch {
    textContent.value = 'Failed to load file content.'
  } finally {
    textLoading.value = false
  }
}

function handleWheel(e: WheelEvent) {
  if (previewType.value !== 'image') return
  e.preventDefault()
  const delta = e.deltaY > 0 ? -0.1 : 0.1
  imageScale.value = Math.max(0.1, Math.min(5, imageScale.value + delta))
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close')
  } else if (e.key === 'ArrowLeft') {
    goPrev()
  } else if (e.key === 'ArrowRight') {
    goNext()
  }
}

function handleBackdropClick(e: MouseEvent) {
  if ((e.target as HTMLElement).classList.contains('preview-backdrop')) {
    emit('close')
  }
}

function handleDownload() {
  window.open(downloadUrl.value, '_blank')
}

watch(() => props.file.path, () => {
  imageScale.value = 1
  if (blobUrl.value) { URL.revokeObjectURL(blobUrl.value); blobUrl.value = '' }
  if (previewType.value === 'html') {
    htmlContent.value = ''
    const token = localStorage.getItem('auth_token') || ''
    fetch(rawUrl.value, { headers: { 'X-Auth': token } })
      .then(res => res.ok ? res.text() : '')
      .then(text => { htmlContent.value = text })
      .catch(() => {})
  }
  if (previewType.value === 'text') {
    loadTextContent()
  }
  if (['image', 'video', 'audio', 'pdf'].includes(previewType.value)) {
    loadBlobUrl()
  }
}, { immediate: false })

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  // Initial load for media
  if (['image', 'video', 'audio', 'pdf'].includes(previewType.value)) loadBlobUrl()
  if (previewType.value === 'html') {
    const tk = localStorage.getItem('auth_token') || ''
    fetch(rawUrl.value, { headers: { 'X-Auth': tk } })
      .then(r => r.ok ? r.text() : '').then(t => { htmlContent.value = t }).catch(() => {})
  }
  if (previewType.value === 'text') loadTextContent()
  if (previewType.value === 'text') {
    loadTextContent()
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div
    class="preview-backdrop fixed inset-0 z-[300] flex flex-col bg-black/80"
    @click="handleBackdropClick"
  >
    <!-- Top bar -->
    <div class="flex items-center justify-between px-4 py-3 bg-black/50 shrink-0">
      <div class="flex items-center gap-3 min-w-0">
        <span class="material-icons-round text-xl text-white/70">
          {{ getFileIcon(file.extension, false) }}
        </span>
        <span class="text-sm text-white truncate">{{ file.name }}</span>
        <span class="text-xs text-white/50">{{ formatSize(file.size) }}</span>
      </div>
      <div class="flex items-center gap-2">
        <button
          @click="handleDownload"
          class="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          title="下载"
        >
          <span class="material-icons-round text-xl">download</span>
        </button>
        <button
          @click="emit('close')"
          class="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          title="关闭 (Esc)"
        >
          <span class="material-icons-round text-xl">close</span>
        </button>
      </div>
    </div>

    <!-- Content area -->
    <div class="flex-1 flex items-center justify-center overflow-hidden relative">
      <!-- Left arrow -->
      <button
        v-if="hasPrev"
        @click.stop="goPrev"
        class="absolute left-4 z-10 w-10 h-10 rounded-full flex items-center justify-center cursor-pointer bg-black/40 text-white/70 hover:bg-black/60 hover:text-white transition-colors"
      >
        <span class="material-icons-round">chevron_left</span>
      </button>

      <!-- Image -->
      <div
        v-if="previewType === 'image'"
        class="flex items-center justify-center w-full h-full overflow-auto"
        @wheel="handleWheel"
      >
        <img
          :src="blobUrl || rawUrl"
          :alt="file.name"
          class="max-w-full max-h-full object-contain transition-transform"
          :style="{ transform: `scale(${imageScale})` }"
          @click.stop
        />
      </div>

      <!-- Video -->
      <div v-else-if="previewType === 'video'" class="flex items-center justify-center w-full h-full p-8" @click.stop>
        <video :src="blobUrl || rawUrl" controls autoplay class="max-w-full max-h-full rounded-lg shadow-2xl" @click.stop>
          Your browser does not support the video tag.
        </video>
      </div>

      <!-- Audio -->
      <div v-else-if="previewType === 'audio'" class="flex flex-col items-center justify-center gap-6" @click.stop>
        <span class="material-icons-round text-white/30" style="font-size: 96px">audio_file</span>
        <audio :src="blobUrl || rawUrl" controls autoplay class="w-96" @click.stop>
          Your browser does not support the audio tag.
        </audio>
      </div>

      <!-- PDF -->
      <div v-else-if="previewType === 'pdf'" class="w-full h-full p-4" @click.stop>
        <iframe :src="blobUrl || rawUrl" class="w-full h-full rounded-lg border-0 bg-white" @click.stop></iframe>
      </div>

      <!-- HTML: fetched and rendered in iframe -->
      <div v-else-if="previewType === 'html'" class="w-full h-full p-4" @click.stop>
        <iframe v-if="htmlContent" :srcdoc="htmlContent" class="w-full h-full rounded-lg border-0 bg-white" sandbox="allow-scripts allow-same-origin" @click.stop></iframe>
        <div v-else class="flex items-center justify-center h-full">
          <div class="animate-spin rounded-full h-8 w-8 border-2 border-white border-t-transparent"></div>
        </div>
      </div>

      <!-- Text -->
      <div v-else-if="previewType === 'text'" class="w-full h-full p-4 overflow-auto" @click.stop>
        <div v-if="textLoading" class="flex items-center justify-center h-full">
          <div class="animate-spin rounded-full h-8 w-8 border-2 border-white border-t-transparent"></div>
        </div>
        <pre v-else class="text-sm text-white/90 font-mono whitespace-pre-wrap break-words bg-black/40 rounded-lg p-6 max-w-4xl mx-auto min-h-full">{{ textContent }}</pre>
      </div>

      <!-- Unknown -->
      <div v-else class="flex flex-col items-center justify-center gap-4" @click.stop>
        <span class="material-icons-round text-white/30" style="font-size: 96px">
          {{ getFileIcon(file.extension, false) }}
        </span>
        <p class="text-lg text-white/70">{{ file.name }}</p>
        <p class="text-sm text-white/40">暂无法预览</p>
        <button
          @click="handleDownload"
          class="mt-2 px-6 py-2.5 rounded-full bg-[#1a73e8] text-white text-sm font-medium cursor-pointer hover:bg-[#1557b0] transition-colors"
        >
          Download
        </button>
      </div>

      <!-- Right arrow -->
      <button
        v-if="hasNext"
        @click.stop="goNext"
        class="absolute right-4 z-10 w-10 h-10 rounded-full flex items-center justify-center cursor-pointer bg-black/40 text-white/70 hover:bg-black/60 hover:text-white transition-colors"
      >
        <span class="material-icons-round">chevron_right</span>
      </button>
    </div>
  </div>
</template>
