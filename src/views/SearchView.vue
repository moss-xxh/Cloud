<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { FileItem } from '../types'
import { searchFiles, getFileIcon, formatSize, formatDate, isImageFile } from '../api'
import AuthImage from '../components/AuthImage.vue'
import FilePreview from '../components/FilePreview.vue'

const route = useRoute()
const router = useRouter()

const results = ref<FileItem[]>([])
const loading = ref(false)
const searchError = ref('')
const previewFile = ref<FileItem | null>(null)
const viewMode = ref<'grid' | 'list'>(localStorage.getItem('viewMode') as any || 'grid')

const query = computed(() => (route.query.q as string) || '')

watch(viewMode, (v) => localStorage.setItem('viewMode', v))

async function performSearch() {
  const q = query.value.trim()
  if (!q) { results.value = []; return }
  loading.value = true
  searchError.value = ''
  try {
    const data = await searchFiles('', q)
    results.value = data.items || []
  } catch (e) {
    searchError.value = (e as Error).message
    results.value = []
  } finally {
    loading.value = false
  }
}

function getParentPath(path: string): string {
  const parts = path.split('/')
  parts.pop()
  return parts.join('/') || ''
}

function handleItemClick(item: FileItem) {
  if (item.isDir) {
    router.push('/drive/' + item.path)
  } else {
    previewFile.value = item
  }
}

watch(query, () => performSearch())
onMounted(() => performSearch())
</script>

<template>
  <div class="p-6 h-full">
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-base font-medium text-[#202124]">
        搜索结果："{{ query }}"
        <span v-if="!loading && results.length" class="text-sm font-normal text-[#5f6368] ml-2">
          共 {{ results.length }} 个结果
        </span>
      </h2>
      <!-- View mode toggle -->
      <div v-if="results.length" class="flex items-center bg-[#f1f3f4] rounded-lg p-0.5">
        <button
          @click="viewMode = 'grid'"
          class="p-1.5 rounded-md transition-colors cursor-pointer"
          :class="viewMode === 'grid' ? 'bg-white' : ''"
        >
          <span class="material-icons-round text-lg text-[#5f6368]">grid_view</span>
        </button>
        <button
          @click="viewMode = 'list'"
          class="p-1.5 rounded-md transition-colors cursor-pointer"
          :class="viewMode === 'list' ? 'bg-white' : ''"
        >
          <span class="material-icons-round text-lg text-[#5f6368]">view_list</span>
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-20">
      <div class="animate-spin rounded-full h-8 w-8 border-2 border-[#1a73e8] border-t-transparent"></div>
    </div>

    <!-- Error -->
    <div v-else-if="searchError" class="flex flex-col items-center justify-center py-20">
      <span class="material-icons-round text-6xl mb-4 text-[#dadce0]">error_outline</span>
      <p class="text-base text-[#5f6368]">搜索失败</p>
      <p class="text-sm mt-1 text-[#80868b]">{{ searchError }}</p>
    </div>

    <!-- Empty -->
    <div v-else-if="!results.length" class="flex flex-col items-center justify-center py-20">
      <span class="material-icons-round text-6xl mb-4 text-[#dadce0]">search_off</span>
      <p class="text-base text-[#5f6368]">未找到与「{{ query }}」相关的结果</p>
      <p class="text-sm mt-1 text-[#80868b]">请尝试其他关键词</p>
    </div>

    <!-- Grid View -->
    <div v-else-if="viewMode === 'grid'" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      <div
        v-for="item in results"
        :key="item.path"
        class="group bg-white rounded-xl cursor-pointer transition-all overflow-hidden border border-[#e0e0e0] hover:border-[#1a73e8]"
        @click="handleItemClick(item)"
              >
        <div
          class="h-28 md:h-36 flex items-center justify-center overflow-hidden"
          :class="item.isDir ? 'bg-[#e8f0fe]' : 'bg-[#f8f9fa]'"
        >
          <AuthImage v-if="!item.isDir && isImageFile(item.extension)" :path="item.path" :alt="item.name" />
          <span
            v-else
            class="material-icons-round"
            :class="item.isDir ? 'text-[#5f6368]' : 'text-[#1a73e8]'"
            style="font-size: 48px"
          >
            {{ getFileIcon(item.extension, item.isDir) }}
          </span>
        </div>
        <div class="px-3 py-2.5 border-t border-[#e0e0e0]">
          <p class="text-sm truncate text-[#202124]">{{ item.name }}</p>
          <p class="text-xs text-[#80868b] truncate">{{ getParentPath(item.path) || '根目录' }}</p>
        </div>
      </div>
    </div>

    <!-- List View -->
    <div v-else class="bg-white rounded-xl overflow-hidden border border-[#e0e0e0]">
      <div class="flex items-center px-4 py-3 text-xs font-medium text-[#5f6368] border-b border-[#e0e0e0] select-none">
        <div class="flex-1">名称</div>
        <div class="w-48 hidden md:block">位置</div>
        <div class="w-40 hidden md:block">修改时间</div>
        <div class="w-24 text-right hidden md:block">大小</div>
      </div>
      <div
        v-for="item in results"
        :key="item.path"
        @click="handleItemClick(item)"
                class="flex items-center px-4 py-2.5 cursor-pointer transition-colors border-b border-[#f1f3f4] hover:bg-[#f8f9fa]"
      >
        <div class="flex items-center gap-3 flex-1 min-w-0">
          <span
            class="material-icons-round text-xl shrink-0"
            :class="item.isDir ? 'text-[#5f6368]' : 'text-[#1a73e8]'"
          >
            {{ getFileIcon(item.extension, item.isDir) }}
          </span>
          <span class="text-sm truncate text-[#202124]">{{ item.name }}</span>
        </div>
        <div class="w-48 text-xs text-[#5f6368] truncate hidden md:block">{{ getParentPath(item.path) || '根目录' }}</div>
        <div class="w-40 text-xs text-[#5f6368] hidden md:block">{{ formatDate(item.modified) }}</div>
        <div class="w-24 text-xs text-right text-[#5f6368] hidden md:block">{{ item.isDir ? '—' : formatSize(item.size) }}</div>
      </div>
    </div>

    <!-- File Preview -->
    <Teleport to="body">
      <FilePreview
        v-if="previewFile"
        :file="previewFile"
        :files="results"
        @close="previewFile = null"
        @navigate="(f: FileItem) => previewFile = f"
      />
    </Teleport>

    <!-- Context Menu -->
  </div>
</template>
