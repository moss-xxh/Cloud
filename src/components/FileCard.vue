<script setup lang="ts">
import { computed } from 'vue'
import type { FileItem } from '../types'
import { isImageFile, formatSize } from '../api'
import AuthImage from './AuthImage.vue'

const props = defineProps<{
  item: FileItem
  selected: boolean
}>()

defineEmits<{
  click: [e: MouseEvent]
  more: [e: MouseEvent]
}>()

const ext = computed(() => props.item.extension?.toLowerCase() || '')

const fileMeta = computed(() => {
  if (props.item.isDir) {
    return { label: 'DIR', color: '#5f6368', icon: 'folder' }
  }
  if (ext.value === '.pdf') return { label: 'PDF', color: '#ea4335', icon: 'description' }
  if (['.doc', '.docx'].includes(ext.value)) return { label: 'DOC', color: '#1a73e8', icon: 'description' }
  if (['.xls', '.xlsx', '.csv'].includes(ext.value)) return { label: 'XLS', color: '#34a853', icon: 'table_chart' }
  if (['.ppt', '.pptx'].includes(ext.value)) return { label: 'PPT', color: '#fbbc04', icon: 'slideshow' }
  if (['.fig'].includes(ext.value)) return { label: 'FIG', color: '#a142f4', icon: 'interests' }
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(ext.value)) return { label: 'IMG', color: '#ff6d00', icon: 'image' }
  if (['.mp4', '.mov', '.avi', '.mkv', '.webm'].includes(ext.value)) return { label: 'MP4', color: '#e91e63', icon: 'movie' }
  if (['.mp3', '.m4a', '.wav', '.flac', '.aac'].includes(ext.value)) return { label: 'AUD', color: '#00897b', icon: 'graphic_eq' }
  if (['.js', '.ts', '.vue', '.html', '.css', '.json', '.py', '.java', '.go', '.php', '.md'].includes(ext.value)) return { label: 'CODE', color: '#34a853', icon: 'code' }
  if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext.value)) return { label: 'ZIP', color: '#5f6368', icon: 'folder_zip' }
  return { label: 'FILE', color: '#5f6368', icon: 'insert_drive_file' }
})
</script>

<template>
  <div
    class="file-item group relative flex flex-col overflow-hidden cd-file-card cursor-pointer select-none"
    :class="selected ? 'is-selected' : 'hover:border-[#cfd6df]'"
    @click="$emit('click', $event)"
  >
    <div
      class="relative aspect-[4/3] flex items-center justify-center overflow-hidden bg-[#fafbfc]"
      :class="selected ? 'bg-[#eef4ff]' : ''"
    >
      <AuthImage v-if="!item.isDir && isImageFile(item.extension)" :path="item.path" :alt="item.name" />

      <svg v-else-if="!item.isDir" class="drop-shadow-[0_4px_10px_rgba(15,23,42,0.06)]" width="54" height="66" viewBox="0 0 36 44" fill="none" aria-hidden="true">
        <path d="M5 4a3 3 0 0 1 3-3h15l8 8v32a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V4Z" fill="#fff" stroke="#d8dde3" />
        <path d="M23 1v6a3 3 0 0 0 3 3h6" stroke="#d8dde3" />
        <path d="M23 1l8 8h-5a3 3 0 0 1-3-3V1Z" fill="#f1f3f4" />
        <rect x="6" y="32" width="16" height="8" rx="2" :fill="fileMeta.color" />
        <text x="14" y="38" text-anchor="middle" font-size="5" font-weight="700" fill="#fff" font-family="Inter, sans-serif" letter-spacing="0.2">{{ fileMeta.label }}</text>
      </svg>

      <div v-else class="relative flex h-16 w-16 items-center justify-center">
        <svg width="56" height="45" viewBox="0 0 40 32" fill="none" aria-hidden="true" class="drop-shadow-[0_4px_10px_rgba(15,23,42,0.08)]">
          <defs>
            <linearGradient id="folder-neutral" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#5f6368" stop-opacity="0.92" />
              <stop offset="1" stop-color="#5f6368" stop-opacity="0.78" />
            </linearGradient>
          </defs>
          <path d="M2 6a3 3 0 0 1 3-3h10l3 3h17a3 3 0 0 1 3 3v18a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V6Z" fill="url(#folder-neutral)" />
        </svg>
      </div>
    </div>

    <div class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 border-t border-[#edf2f7] px-3.5 py-3">
      <span
        class="material-icons-round flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#f1f3f4] text-[18px] text-[#5f6368]"
        aria-hidden="true"
      >
        {{ fileMeta.icon }}
      </span>
      <div class="min-w-0 leading-tight">
        <p class="truncate text-[13px] font-semibold text-[#172033]" :title="item.name">{{ item.name }}</p>
        <p class="mt-1 truncate text-[11px] font-medium text-[#7b8496]">
          {{ item.isDir ? '文件夹' : formatSize(item.size) }}
        </p>
      </div>
      <button
        type="button"
        class="more-btn -mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#667085] transition-all duration-200 hover:bg-[#eef4ff] hover:text-[#1a73e8] focus-visible:bg-[#eef4ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8]/35"
        :class="selected ? '!opacity-100' : ''"
        :aria-label="`${item.name} 更多操作`"
        title="更多操作"
        @click.stop="$emit('more', $event)"
      >
        <span class="material-icons-round text-[18px]" aria-hidden="true">more_vert</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
@media (hover: hover) and (pointer: fine) {
  .more-btn {
    opacity: 0;
  }
  .file-item:hover .more-btn,
  .file-item:focus-within .more-btn,
  .more-btn:focus-visible {
    opacity: 1;
  }
}
</style>
