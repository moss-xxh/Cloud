<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'
import type { FileItem } from '../types'
import { getFileIcon, formatSize, formatDate } from '../api'

defineProps<{ item: FileItem }>()
const emit = defineEmits<{ close: [] }>()

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[150] bg-black/20" @click="emit('close')">
      <aside
        class="fixed right-0 top-0 h-full w-80 max-w-[92vw] bg-white shadow-2xl border-l border-[#dadce0] flex flex-col"
        role="dialog"
        aria-label="文件详情"
        @click.stop
      >
        <header class="flex items-center justify-between px-5 py-4 border-b border-[#ebedf0] shrink-0">
          <h3 class="text-sm font-medium text-[#202124]">详情</h3>
          <button
            type="button"
            class="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer text-[#5f6368] hover:bg-[#e8f0fe] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8]/40"
            aria-label="关闭"
            @click="emit('close')"
          >
            <span class="material-icons-round text-lg" aria-hidden="true">close</span>
          </button>
        </header>

        <div class="flex-1 overflow-auto p-5">
          <div class="flex flex-col items-center text-center mb-6 p-6 rounded-xl bg-[#f8f9fa]">
            <span
              class="material-icons-round mb-2"
              :class="item.isDir ? 'text-[#5f6368]' : 'text-[#1a73e8]'"
              style="font-size: 48px"
              aria-hidden="true"
            >
              {{ getFileIcon(item.extension, item.isDir) }}
            </span>
            <p class="text-sm font-medium text-[#202124] break-all leading-snug">{{ item.name }}</p>
          </div>

          <dl class="space-y-4 text-sm">
            <div>
              <dt class="text-xs text-[#5f6368] mb-1">类型</dt>
              <dd class="text-[#202124]">{{ item.isDir ? '文件夹' : (item.extension || '文件') }}</dd>
            </div>
            <div v-if="!item.isDir">
              <dt class="text-xs text-[#5f6368] mb-1">大小</dt>
              <dd class="text-[#202124]">{{ formatSize(item.size) }}</dd>
            </div>
            <div>
              <dt class="text-xs text-[#5f6368] mb-1">修改时间</dt>
              <dd class="text-[#202124]">{{ formatDate(item.modified) }}</dd>
            </div>
            <div>
              <dt class="text-xs text-[#5f6368] mb-1">位置</dt>
              <dd class="text-[#202124] break-all">{{ item.path || '/' }}</dd>
            </div>
          </dl>
        </div>
      </aside>
    </div>
  </Teleport>
</template>
