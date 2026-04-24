<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { FileItem } from '../types'
import { getResources, moveResource } from '../api'

const props = defineProps<{
  items: FileItem[]
}>()

const emit = defineEmits<{
  close: []
  moved: []
}>()

interface FolderNode {
  name: string
  path: string
  children: FolderNode[]
  expanded: boolean
  loaded: boolean
}

const tree = ref<FolderNode[]>([])
const selectedPath = ref<string>('')
const moving = ref(false)
const error = ref('')

async function loadChildren(node: FolderNode) {
  try {
    const data = await getResources(node.path)
    const folders = (data.items || []).filter(i => i.isDir)
    // Filter out items being moved
    const movingPaths = new Set(props.items.map(i => i.path))
    node.children = folders
      .filter(f => !movingPaths.has(f.path))
      .map(f => ({
        name: f.name,
        path: f.path,
        children: [],
        expanded: false,
        loaded: false
      }))
    node.loaded = true
  } catch {
    node.children = []
    node.loaded = true
  }
}

async function toggleExpand(node: FolderNode) {
  if (!node.loaded) {
    await loadChildren(node)
  }
  node.expanded = !node.expanded
}

function selectFolder(path: string) {
  selectedPath.value = path
}

async function handleMove() {
  if (moving.value) return
  moving.value = true
  error.value = ''
  try {
    for (const item of props.items) {
      const destBase = selectedPath.value === '' ? '' : selectedPath.value
      const destPath = destBase ? `/${destBase}/${item.name}` : `/${item.name}`
      await moveResource(item.path, destPath)
    }
    emit('moved')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    moving.value = false
  }
}

onMounted(async () => {
  // Load root
  try {
    const data = await getResources('')
    const folders = (data.items || []).filter(i => i.isDir)
    const movingPaths = new Set(props.items.map(i => i.path))
    tree.value = folders
      .filter(f => !movingPaths.has(f.path))
      .map(f => ({
        name: f.name,
        path: f.path,
        children: [],
        expanded: false,
        loaded: false
      }))
  } catch {
    tree.value = []
  }
})
</script>

<template>
  <div class="fixed inset-0 z-[200] flex items-center justify-center bg-black/40" @click.self="emit('close')">
    <div class="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 flex flex-col max-h-[70vh]">
      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-[#dadce0]">
        <h3 class="text-base font-medium text-[#202124]">移动到</h3>
        <button
          @click="emit('close')"
          class="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer text-[#5f6368] hover:bg-[#e8f0fe] transition-colors"
        >
          <span class="material-icons-round text-lg">close</span>
        </button>
      </div>

      <!-- Tree -->
      <div class="flex-1 overflow-auto p-4">
        <!-- Root option -->
        <button
          @click="selectFolder('')"
          class="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors"
          :class="selectedPath === '' ? 'bg-[#d3e3fd] text-[#202124] font-medium' : 'text-[#202124] hover:bg-[#e8f0fe]'"
        >
          <span class="material-icons-round text-lg text-[#5f6368]">home</span>
          我的云盘（根目录）
        </button>

        <!-- Folder tree -->
        <div class="ml-2">
          <template v-for="node in tree" :key="node.path">
            <div class="folder-tree-node">
              <div class="flex items-center gap-1">
                <button
                  @click="toggleExpand(node)"
                  class="w-6 h-6 flex items-center justify-center cursor-pointer text-[#5f6368] rounded hover:bg-[#e8f0fe] transition-colors shrink-0"
                >
                  <span class="material-icons-round text-sm">
                    {{ node.expanded ? 'expand_more' : 'chevron_right' }}
                  </span>
                </button>
                <button
                  @click="selectFolder(node.path)"
                  class="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm cursor-pointer transition-colors text-left"
                  :class="selectedPath === node.path ? 'bg-[#d3e3fd] text-[#202124] font-medium' : 'text-[#202124] hover:bg-[#e8f0fe]'"
                >
                  <span class="material-icons-round text-lg text-[#5f6368]">folder</span>
                  {{ node.name }}
                </button>
              </div>
              <!-- Children -->
              <div v-if="node.expanded && node.children.length" class="ml-6">
                <div v-for="child in node.children" :key="child.path" class="folder-tree-node">
                  <div class="flex items-center gap-1">
                    <button
                      @click="toggleExpand(child)"
                      class="w-6 h-6 flex items-center justify-center cursor-pointer text-[#5f6368] rounded hover:bg-[#e8f0fe] transition-colors shrink-0"
                    >
                      <span class="material-icons-round text-sm">
                        {{ child.expanded ? 'expand_more' : 'chevron_right' }}
                      </span>
                    </button>
                    <button
                      @click="selectFolder(child.path)"
                      class="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm cursor-pointer transition-colors text-left"
                      :class="selectedPath === child.path ? 'bg-[#d3e3fd] text-[#202124] font-medium' : 'text-[#202124] hover:bg-[#e8f0fe]'"
                    >
                      <span class="material-icons-round text-lg text-[#5f6368]">folder</span>
                      {{ child.name }}
                    </button>
                  </div>
                  <div v-if="child.expanded && child.children.length" class="ml-6">
                    <div v-for="gc in child.children" :key="gc.path">
                      <button
                        @click="selectFolder(gc.path)"
                        class="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm cursor-pointer transition-colors text-left"
                        :class="selectedPath === gc.path ? 'bg-[#d3e3fd] text-[#202124] font-medium' : 'text-[#202124] hover:bg-[#e8f0fe]'"
                      >
                        <span class="material-icons-round text-lg text-[#5f6368]">folder</span>
                        {{ gc.name }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>

      <!-- Error -->
      <p v-if="error" class="px-6 text-sm text-red-500">{{ error }}</p>

      <!-- Footer -->
      <div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#dadce0]">
        <button
          @click="emit('close')"
          class="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer text-[#1a73e8] hover:bg-[#e8f0fe] transition-colors"
        >
          取消
        </button>
        <button
          @click="handleMove"
          :disabled="moving"
          class="px-6 py-2 rounded-lg text-sm font-medium text-white cursor-pointer transition-colors bg-[#1a73e8] hover:bg-[#1557b0] disabled:opacity-50"
        >
          {{ moving ? '移动中...' : '移动到此处' }}
        </button>
      </div>
    </div>
  </div>
</template>
