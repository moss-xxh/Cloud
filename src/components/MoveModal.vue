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
  <div class="cd-modal-backdrop" @click.self="emit('close')">
    <div class="cd-modal-shell move-modal" style="max-height: min(70vh, 640px)">
      <!-- Header -->
      <header class="flex items-center justify-between px-7 py-5 border-b border-[var(--cd-line-soft)]">
        <h3 class="text-base font-semibold text-[var(--cd-text-primary)]">移动到</h3>
        <button
          @click="emit('close')"
          class="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer text-[var(--cd-text-secondary)] hover:bg-[var(--cd-primary-soft)] transition-colors"
        >
          <span class="material-icons-round text-lg">close</span>
        </button>
      </header>

      <!-- Tree -->
      <div class="flex-1 overflow-auto px-5 py-4">
        <!-- Root option -->
        <button
          @click="selectFolder('')"
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm cursor-pointer transition-colors"
          :class="selectedPath === '' ? 'bg-[var(--cd-primary-soft)] text-[var(--cd-primary)] font-semibold' : 'text-[var(--cd-text-primary)] hover:bg-[var(--cd-primary-soft)]'"
        >
          <span class="material-icons-round text-lg text-[var(--cd-text-secondary)]">home</span>
          我的云盘（根目录）
        </button>

        <!-- Folder tree -->
        <div class="ml-2 mt-1">
          <template v-for="node in tree" :key="node.path">
            <div class="folder-tree-node">
              <div class="flex items-center gap-1">
                <button
                  @click="toggleExpand(node)"
                  class="w-7 h-7 flex items-center justify-center cursor-pointer text-[var(--cd-text-secondary)] rounded-lg hover:bg-[var(--cd-primary-soft)] transition-colors shrink-0"
                >
                  <span class="material-icons-round text-sm">
                    {{ node.expanded ? 'expand_more' : 'chevron_right' }}
                  </span>
                </button>
                <button
                  @click="selectFolder(node.path)"
                  class="flex-1 flex items-center gap-3 px-3 py-2 rounded-xl text-sm cursor-pointer transition-colors text-left"
                  :class="selectedPath === node.path ? 'bg-[var(--cd-primary-soft)] text-[var(--cd-primary)] font-semibold' : 'text-[var(--cd-text-primary)] hover:bg-[var(--cd-primary-soft)]'"
                >
                  <span class="material-icons-round text-lg text-[var(--cd-text-secondary)]">folder</span>
                  {{ node.name }}
                </button>
              </div>
              <!-- Children -->
              <div v-if="node.expanded && node.children.length" class="ml-7">
                <div v-for="child in node.children" :key="child.path" class="folder-tree-node">
                  <div class="flex items-center gap-1">
                    <button
                      @click="toggleExpand(child)"
                      class="w-7 h-7 flex items-center justify-center cursor-pointer text-[var(--cd-text-secondary)] rounded-lg hover:bg-[var(--cd-primary-soft)] transition-colors shrink-0"
                    >
                      <span class="material-icons-round text-sm">
                        {{ child.expanded ? 'expand_more' : 'chevron_right' }}
                      </span>
                    </button>
                    <button
                      @click="selectFolder(child.path)"
                      class="flex-1 flex items-center gap-3 px-3 py-2 rounded-xl text-sm cursor-pointer transition-colors text-left"
                      :class="selectedPath === child.path ? 'bg-[var(--cd-primary-soft)] text-[var(--cd-primary)] font-semibold' : 'text-[var(--cd-text-primary)] hover:bg-[var(--cd-primary-soft)]'"
                    >
                      <span class="material-icons-round text-lg text-[var(--cd-text-secondary)]">folder</span>
                      {{ child.name }}
                    </button>
                  </div>
                  <div v-if="child.expanded && child.children.length" class="ml-7">
                    <div v-for="gc in child.children" :key="gc.path">
                      <button
                        @click="selectFolder(gc.path)"
                        class="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm cursor-pointer transition-colors text-left"
                        :class="selectedPath === gc.path ? 'bg-[var(--cd-primary-soft)] text-[var(--cd-primary)] font-semibold' : 'text-[var(--cd-text-primary)] hover:bg-[var(--cd-primary-soft)]'"
                      >
                        <span class="material-icons-round text-lg text-[var(--cd-text-secondary)]">folder</span>
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
      <p v-if="error" class="px-7 text-sm text-[#d93025]">{{ error }}</p>

      <!-- Footer -->
      <footer class="flex items-center justify-end gap-3 px-7 py-4 border-t border-[var(--cd-line-soft)]">
        <button
          @click="emit('close')"
          class="cd-secondary-button px-5 py-2.5 text-sm"
        >
          取消
        </button>
        <button
          @click="handleMove"
          :disabled="moving"
          class="cd-primary-button px-6 py-2.5 text-sm"
        >
          {{ moving ? '移动中…' : '移动到此处' }}
        </button>
      </footer>
    </div>
  </div>
</template>
