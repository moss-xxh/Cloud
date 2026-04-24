<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { getUsage, formatSize } from '../api'
import NewMenu from './NewMenu.vue'

const router = useRouter()
const route = useRoute()
const showNewMenu = ref(false)
const usage = ref({ total: 0, used: 0 })
const searchQuery = ref('')

// Responsive sidebar
const sidebarOpen = ref(window.innerWidth >= 768)
const isMobile = ref(window.innerWidth < 768)

function onResize() {
  const mobile = window.innerWidth < 768
  isMobile.value = mobile
  if (!mobile) {
    sidebarOpen.value = true
  } else {
    sidebarOpen.value = false
  }
}

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value
}

function closeSidebarIfMobile() {
  if (isMobile.value) {
    sidebarOpen.value = false
  }
}

interface NavItem {
  key: string
  icon: string
  label: string
  route: string
}

const navItems: NavItem[] = [
  { key: 'drive', icon: 'folder', label: '我的云盘', route: 'drive-root' },
  { key: 'shared', icon: 'people', label: '共享', route: 'shared' },
  { key: 'starred', icon: 'star', label: '星标', route: 'starred' },
  { key: 'trash', icon: 'delete', label: '回收站', route: 'trash' }
]

const currentNav = computed(() => {
  const path = route.path
  if (path.startsWith('/search')) return 'search'
  if (path.startsWith('/drive')) return 'drive'
  if (path.startsWith('/shared')) return 'shared'
  if (path.startsWith('/starred')) return 'starred'
  if (path.startsWith('/trash')) return 'trash'
  return 'drive'
})

const usagePercent = computed(() => {
  if (!usage.value.total) return 0
  return Math.round((usage.value.used / usage.value.total) * 100)
})

const usageBarColor = computed(() => usagePercent.value > 90 ? '#ea4335' : '#1a73e8')

function navigateTo(name: string) {
  searchQuery.value = ''
  closeSidebarIfMobile()
  router.push({ name })
}

function handleLogout() {
  localStorage.removeItem('auth_token')
  router.push('/login')
}

function isActive(key: string) {
  return currentNav.value === key
}

function handleSearch() {
  const q = searchQuery.value.trim()
  if (q) {
    router.push({ path: '/search', query: { q } })
  }
}

function clearSearch() {
  searchQuery.value = ''
  router.push({ name: 'drive-root' })
}

// Sync search query from URL
watch(() => route.query.q, (val) => {
  if (route.path === '/search' && typeof val === 'string') {
    searchQuery.value = val
  }
}, { immediate: true })

onMounted(async () => {
  window.addEventListener('resize', onResize)
  try {
    usage.value = await getUsage()
  } catch {
    // ignore
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
})
</script>

<template>
  <div class="h-screen flex flex-col bg-[#f8f9fa]">
    <!-- Top bar -->
    <header class="h-16 flex items-center px-4 shrink-0 bg-white border-b border-[#dadce0]">
      <!-- Mobile: hamburger + logo -->
      <div class="flex items-center gap-2 md:w-64 shrink-0">
        <button
          v-if="isMobile"
          @click="toggleSidebar"
          class="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer text-[#5f6368] hover:bg-[#e8f0fe] transition-colors"
        >
          <span class="material-icons-round text-2xl">menu</span>
        </button>
        <span class="text-2xl">☁️</span>
        <span class="text-lg font-medium text-[#202124] hidden md:inline">云盘</span>
      </div>
      <div class="flex-1 max-w-2xl mx-auto">
        <form @submit.prevent="handleSearch" class="flex items-center rounded-full px-4 py-2 bg-[#f1f3f4]">
          <span class="material-icons-round text-xl mr-3 text-[#5f6368]">search</span>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索文件"
            class="flex-1 bg-transparent outline-none text-sm text-[#202124]"
          />
          <button
            v-if="searchQuery"
            type="button"
            @click="clearSearch"
            class="ml-2 w-6 h-6 rounded-full flex items-center justify-center cursor-pointer text-[#5f6368] hover:bg-[#dadce0] transition-colors"
          >
            <span class="material-icons-round text-sm">close</span>
          </button>
        </form>
      </div>
      <div class="md:w-64 flex justify-end shrink-0">
        <button
          @click="handleLogout"
          class="w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium text-white cursor-pointer bg-[#1a73e8] hover:bg-[#1557b0]"
          title="退出登录"
        >
          A
        </button>
      </div>
    </header>

    <div class="flex flex-1 overflow-hidden relative">
      <!-- Mobile overlay -->
      <Transition name="overlay-fade">
        <div
          v-if="isMobile && sidebarOpen"
          class="fixed inset-0 bg-black/50 z-30"
          @click="sidebarOpen = false"
        ></div>
      </Transition>

      <!-- Sidebar -->
      <aside
        class="sidebar-panel w-64 shrink-0 flex flex-col p-3 bg-white border-r border-[#e0e0e0] z-40"
        :class="{
          'fixed inset-y-0 left-0 top-16': isMobile,
          'translate-x-0': sidebarOpen,
          '-translate-x-full': !sidebarOpen && isMobile,
          'hidden': !sidebarOpen && !isMobile,
        }"
      >
        <div class="relative mb-4">
          <button
            @click="showNewMenu = !showNewMenu"
            class="flex items-center gap-3 px-6 py-3.5 rounded-2xl shadow-md text-sm font-medium cursor-pointer transition-shadow hover:shadow-lg bg-white text-[#202124] border border-[#dadce0]"
          >
            <span class="material-icons-round text-2xl text-[#1a73e8]">add</span>
            新建
          </button>
          <NewMenu v-if="showNewMenu" @close="showNewMenu = false" />
        </div>

        <nav class="space-y-0.5 flex-1">
          <button
            v-for="item in navItems"
            :key="item.key"
            @click="navigateTo(item.route)"
            class="w-full flex items-center gap-3 px-4 py-2 rounded-full text-sm cursor-pointer transition-colors text-[#202124]"
            :class="isActive(item.key) ? 'bg-[#d3e3fd] font-semibold' : 'hover:bg-[#e8f0fe]'"
          >
            <span class="material-icons-round text-xl">{{ item.icon }}</span>
            {{ item.label }}
          </button>
        </nav>

        <!-- Storage usage -->
        <div class="mt-auto pt-4 px-2 border-t border-[#e0e0e0]">
          <div class="flex items-center gap-2 mb-2">
            <span class="material-icons-round text-lg text-[#5f6368]">cloud</span>
            <span class="text-xs text-[#5f6368]">存储空间</span>
          </div>
          <div class="w-full h-1 rounded-full bg-[#e0e0e0]">
            <div
              class="h-full rounded-full transition-all"
              :style="{ width: usagePercent + '%', background: usageBarColor }"
            ></div>
          </div>
          <p class="text-xs mt-1 text-[#5f6368]">
            已使用 {{ formatSize(usage.used) }} / {{ formatSize(usage.total) }}
          </p>
        </div>
      </aside>

      <!-- Main content -->
      <main class="flex-1 overflow-auto">
        <router-view />
      </main>
    </div>
  </div>
</template>

<style scoped>
.sidebar-panel {
  transition: transform 0.25s ease;
}

.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity 0.25s ease;
}
.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}
</style>
