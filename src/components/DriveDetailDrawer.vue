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
    <div class="fixed inset-0 z-[150] bg-[rgba(30,41,59,0.20)] backdrop-blur-sm" @click="emit('close')">
      <aside
        class="cd-drawer-shell"
        role="dialog"
        aria-label="文件详情"
        @click.stop
      >
        <header class="flex items-center justify-between px-6 py-5 border-b border-[var(--cd-line-soft)] shrink-0">
          <h3 class="text-base font-semibold text-[var(--cd-text-primary)]">详情</h3>
          <button
            type="button"
            class="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer text-[var(--cd-text-secondary)] hover:bg-[var(--cd-primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cd-primary)]/40 transition-colors"
            aria-label="关闭"
            @click="emit('close')"
          >
            <span class="material-icons-round text-lg" aria-hidden="true">close</span>
          </button>
        </header>

        <div class="flex-1 overflow-auto p-6">
          <div class="flex flex-col items-center text-center mb-6 p-7 rounded-2xl bg-white/60 border border-[var(--cd-border-glass)]">
            <span
              class="material-icons-round mb-3"
              :class="item.isDir ? 'text-[var(--cd-text-secondary)]' : 'text-[var(--cd-primary)]'"
              style="font-size: 56px"
              aria-hidden="true"
            >
              {{ getFileIcon(item.extension, item.isDir) }}
            </span>
            <p class="text-sm font-medium text-[var(--cd-text-primary)] break-all leading-snug">{{ item.name }}</p>
          </div>

          <dl class="space-y-5 text-sm">
            <div>
              <dt class="text-xs text-[var(--cd-text-secondary)] mb-1">类型</dt>
              <dd class="text-[var(--cd-text-primary)]">{{ item.isDir ? '文件夹' : (item.extension || '文件') }}</dd>
            </div>
            <div v-if="!item.isDir">
              <dt class="text-xs text-[var(--cd-text-secondary)] mb-1">大小</dt>
              <dd class="text-[var(--cd-text-primary)]">{{ formatSize(item.size) }}</dd>
            </div>
            <div>
              <dt class="text-xs text-[var(--cd-text-secondary)] mb-1">修改时间</dt>
              <dd class="text-[var(--cd-text-primary)]">{{ formatDate(item.modified) }}</dd>
            </div>
            <div>
              <dt class="text-xs text-[var(--cd-text-secondary)] mb-1">位置</dt>
              <dd class="text-[var(--cd-text-primary)] break-all">{{ item.path || '/' }}</dd>
            </div>
          </dl>
        </div>
      </aside>
    </div>
  </Teleport>
</template>
