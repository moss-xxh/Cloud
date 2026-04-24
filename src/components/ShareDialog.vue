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
  <div class="fixed inset-0 z-[200] flex items-center justify-center bg-black/40" @click.self="emit('close')">
    <div class="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-base font-medium text-[#202124]">分享「{{ item.name }}」</h3>
        <button
          @click="emit('close')"
          class="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer text-[#5f6368] hover:bg-[#e8f0fe] transition-colors"
        >
          <span class="material-icons-round text-lg">close</span>
        </button>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="flex items-center justify-center py-8">
        <div class="animate-spin rounded-full h-8 w-8 border-2 border-[#1a73e8] border-t-transparent"></div>
      </div>

      <!-- Failed -->
      <div v-else-if="failed" class="text-center py-6">
        <span class="material-icons-round text-4xl mb-3 text-[#ea4335]">error_outline</span>
        <p class="text-sm text-[#5f6368]">{{ errorMsg }}</p>
        <button
          @click="createOrGetShare"
          class="mt-3 px-4 py-2 rounded-lg text-sm font-medium text-[#1a73e8] hover:bg-[#e8f0fe] cursor-pointer transition-colors"
        >
          重试
        </button>
      </div>

      <!-- Success -->
      <div v-else class="space-y-4">
        <div class="flex items-center gap-2">
          <span class="material-icons-round text-xl text-[#34a853]">link</span>
          <span class="text-sm text-[#202124]">分享链接已创建</span>
        </div>
        <div class="flex items-center gap-2">
          <input
            type="text"
            :value="shareLink"
            readonly
            class="flex-1 px-3 py-2 border border-[#dadce0] rounded-lg text-sm text-[#202124] bg-[#f8f9fa] outline-none"
          />
          <button
            @click="copyLink"
            class="px-4 py-2 rounded-lg text-sm font-medium text-white cursor-pointer transition-colors shrink-0"
            :class="copied ? 'bg-[#34a853]' : 'bg-[#1a73e8] hover:bg-[#1557b0]'"
          >
            {{ copied ? '已复制 ✓' : '复制链接' }}
          </button>
        </div>
        <p class="text-xs text-[#80868b]">{{ item.isDir ? '此链接可浏览文件夹内容（JSON格式），文件夹内文件需单独分享' : '任何拥有此链接的人都可以直接下载该文件' }}</p>
        <div class="pt-2 border-t border-[#f1f3f4] flex justify-end">
          <button
            @click="removeShare"
            class="px-3 py-1.5 rounded-lg text-xs font-medium text-[#e53935] hover:bg-[#fbe9e7] cursor-pointer transition-colors"
          >
            取消分享
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
