<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'

interface UploadItem {
  name: string
  percent: number
  status: 'uploading' | 'done' | 'error'
  error?: string
}

const uploads = ref<UploadItem[]>([])

function onStart(e: Event) {
  const { name } = (e as CustomEvent).detail
  const existing = uploads.value.find(u => u.name === name)
  if (existing) {
    existing.percent = 0
    existing.status = 'uploading'
  } else {
    uploads.value.push({ name, percent: 0, status: 'uploading' })
  }
}

function onProgress(e: Event) {
  const { name, percent } = (e as CustomEvent).detail
  const item = uploads.value.find(u => u.name === name)
  if (item) {
    item.percent = percent
  }
}

function onDone(e: Event) {
  const { name } = (e as CustomEvent).detail
  const item = uploads.value.find(u => u.name === name)
  if (item) {
    item.status = 'done'
    item.percent = 100
    setTimeout(() => {
      uploads.value = uploads.value.filter(u => u !== item)
    }, 3000)
  }
}

function onError(e: Event) {
  const { name, error } = (e as CustomEvent).detail
  const item = uploads.value.find(u => u.name === name)
  if (item) {
    item.status = 'error'
    item.error = error
    setTimeout(() => {
      uploads.value = uploads.value.filter(u => u !== item)
    }, 5000)
  }
}

onMounted(() => {
  window.addEventListener('drive:upload-start', onStart)
  window.addEventListener('drive:upload-progress', onProgress)
  window.addEventListener('drive:upload-done', onDone)
  window.addEventListener('drive:upload-error', onError)
})

onBeforeUnmount(() => {
  window.removeEventListener('drive:upload-start', onStart)
  window.removeEventListener('drive:upload-progress', onProgress)
  window.removeEventListener('drive:upload-done', onDone)
  window.removeEventListener('drive:upload-error', onError)
})
</script>

<template>
  <div v-if="uploads.length" class="fixed bottom-6 right-6 z-[200] space-y-3 w-80">
    <div v-for="item in uploads" :key="item.name" class="cd-toast">
      <div class="flex items-center gap-3 mb-2">
        <span
          class="material-icons-round text-lg"
          :style="{ color: item.status === 'error' ? '#ea4335' : item.status === 'done' ? '#34a853' : 'var(--cd-primary)' }"
        >
          {{ item.status === 'error' ? 'error' : item.status === 'done' ? 'check_circle' : 'upload_file' }}
        </span>
        <span class="text-sm flex-1 truncate text-[var(--cd-text-primary)]">{{ item.name }}</span>
        <span class="text-xs text-[var(--cd-text-secondary)]">
          {{ item.status === 'done' ? '完成' : item.status === 'error' ? '失败' : item.percent + '%' }}
        </span>
      </div>
      <div v-if="item.status === 'uploading'" class="w-full h-1 rounded-full bg-[rgba(60,80,140,0.10)] overflow-hidden">
        <div
          class="h-full rounded-full transition-all"
          :style="{ width: item.percent + '%', background: 'var(--cd-primary)' }"
        ></div>
      </div>
      <p v-if="item.status === 'error'" class="text-xs mt-1 text-[#ea4335]">{{ item.error }}</p>
    </div>
  </div>
</template>
