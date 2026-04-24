<script setup lang="ts">
import type { FileItem } from '../types'
import { isImageFile, getFileIcon, formatSize } from '../api'
import AuthImage from './AuthImage.vue'

defineProps<{
  item: FileItem
  selected: boolean
}>()

defineEmits<{
  click: [e: MouseEvent]
  more: [e: MouseEvent]
}>()
</script>

<template>
  <div
    class="file-item group relative flex flex-col bg-white rounded-xl overflow-hidden border cursor-pointer select-none transition-[box-shadow,border-color,background-color] duration-150"
    :class="selected
      ? 'border-[#1a73e8] shadow-[0_1px_4px_rgba(26,115,232,0.18)]'
      : 'border-[#e6e8eb] hover:border-[#c6c9cc] hover:shadow-[0_2px_8px_rgba(60,64,67,0.12)]'"
    @click="$emit('click', $event)"
  >
    <!-- Thumbnail -->
    <div
      class="relative aspect-[4/3] flex items-center justify-center overflow-hidden"
      :class="selected
        ? 'bg-[#e8f0fe]'
        : item.isDir ? 'bg-[#f3f6fc]' : 'bg-[#f8f9fa]'"
    >
      <AuthImage v-if="!item.isDir && isImageFile(item.extension)" :path="item.path" :alt="item.name" />
      <span
        v-else
        class="material-icons-round leading-none"
        :class="item.isDir ? 'text-[#5f6368]' : 'text-[#1a73e8]'"
        style="font-size: 44px"
        aria-hidden="true"
      >
        {{ getFileIcon(item.extension, item.isDir) }}
      </span>
    </div>

    <!-- Info row: icon / text / action -->
    <div
      class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5 border-t"
      :class="selected ? 'border-[#c6dafc]' : 'border-[#ebedf0]'"
    >
      <span
        class="material-icons-round text-[18px] shrink-0"
        :class="item.isDir ? 'text-[#5f6368]' : 'text-[#1a73e8]'"
        aria-hidden="true"
      >
        {{ getFileIcon(item.extension, item.isDir) }}
      </span>
      <div class="min-w-0 leading-tight">
        <p class="text-[13px] font-medium text-[#202124] truncate" :title="item.name">{{ item.name }}</p>
        <p class="text-[11px] text-[#5f6368] truncate">
          {{ item.isDir ? '文件夹' : formatSize(item.size) }}
        </p>
      </div>
      <button
        type="button"
        class="more-btn w-8 h-8 shrink-0 -mr-1 rounded-full flex items-center justify-center text-[#5f6368] cursor-pointer transition-[background-color,opacity] hover:bg-[#e8f0fe] focus-visible:bg-[#e8f0fe] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8]/40"
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
/* On hover-capable devices, hide the more button until the card is hovered or
   something inside it is focused (keyboard navigation), so cards read as clean. */
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
