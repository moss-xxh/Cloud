<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { FileItem } from '../types'
import { shareResource, deleteShare, getShares } from '../api'

const props = defineProps<{
  item: FileItem
}>()

const emit = defineEmits<{
  close: []
}>()

const shareLink = ref('')
const shareHash = ref('')
const loading = ref(true)
const failed = ref(false)
const copied = ref(false)
const errorMsg = ref('')

async function createOrGetShare() {
  loading.value = true
  failed.value = false
  try {
    // Check if share already exists for this path
    const existing = await getShares()
    const found = existing?.find(s => s.path === '/' + props.item.path || s.path === props.item.path)
    if (found) {
      shareHash.value = found.hash
      shareLink.value = buildLink(found.hash)
    } else {
      // Create new share
      const result = await shareResource(props.item.path)
      if (result && result.hash) {
        shareHash.value = result.hash
        shareLink.value = buildLink(result.hash)
      } else {
        failed.value = true
        errorMsg.value = '创建分享链接失败'
      }
    }
  } catch (e) {
    failed.value = true
    errorMsg.value = (e as Error).message || '创建分享链接失败'
  } finally {
    loading.value = false
  }
}

function buildLink(hash: string): string {
  return `${window.location.origin}/share/${hash}`
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(shareLink.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = shareLink.value
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  }
}

async function removeShare() {
  if (!shareHash.value) return
  try {
    await deleteShare(shareHash.value)
    emit('close')
  } catch (e) {
    alert('删除分享失败: ' + (e as Error).message)
  }
}

onMounted(() => {
  createOrGetShare()
})
</script>

<template>
  <div class="cd-modal-backdrop" @click.self="emit('close')">
    <div class="cd-modal-shell share-dialog">
      <header class="flex items-center justify-between px-7 py-5 border-b border-[var(--cd-line-soft)]">
        <h3 class="text-base font-semibold text-[var(--cd-text-primary)] truncate pr-3">分享「{{ item.name }}」</h3>
        <button
          @click="emit('close')"
          class="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer text-[var(--cd-text-secondary)] hover:bg-[var(--cd-primary-soft)] transition-colors shrink-0"
        >
          <span class="material-icons-round text-lg">close</span>
        </button>
      </header>

      <div class="px-7 py-6">
        <!-- Loading -->
        <div v-if="loading" class="cd-state-loading">
          <div class="animate-spin rounded-full h-9 w-9 border-2 border-[var(--cd-primary)] border-t-transparent"></div>
          <p class="mt-4 text-sm">正在生成分享链接…</p>
        </div>

        <!-- Failed -->
        <div v-else-if="failed" class="cd-state-error">
          <span class="material-icons-round text-4xl mb-3">error_outline</span>
          <p class="text-sm">{{ errorMsg }}</p>
          <button
            @click="createOrGetShare"
            class="cd-secondary-button mt-4 px-5 py-2 text-sm"
          >
            重试
          </button>
        </div>

        <!-- Success -->
        <div v-else class="space-y-5">
          <div class="flex items-center gap-2 text-sm text-[var(--cd-text-primary)]">
            <span class="material-icons-round text-xl text-[#34a853]">link</span>
            分享链接已生成
          </div>
          <div class="flex items-center gap-3">
            <input
              type="text"
              :value="shareLink"
              readonly
              class="cd-input flex-1 px-4 py-2.5 text-sm"
            />
            <button
              @click="copyLink"
              class="cd-primary-button shrink-0 px-5 py-2.5 text-sm"
              :class="copied ? '!bg-[#34a853] hover:!bg-[#2c8d44]' : ''"
            >
              {{ copied ? '已复制' : '复制链接' }}
            </button>
          </div>
          <p class="text-xs text-[var(--cd-text-muted)] leading-relaxed">
            {{ item.isDir ? '此链接可浏览文件夹内容（JSON 格式），文件夹内文件需单独分享。' : '任何拥有此链接的人都可直接下载该文件。' }}
          </p>
        </div>
      </div>

      <footer v-if="!loading && !failed" class="flex justify-end px-7 py-4 border-t border-[var(--cd-line-soft)]">
        <button
          @click="removeShare"
          class="px-4 py-2 rounded-2xl text-sm font-medium text-[#d93025] hover:bg-[rgba(217,48,37,0.08)] cursor-pointer transition-colors"
        >
          取消分享
        </button>
      </footer>
    </div>
  </div>
</template>
