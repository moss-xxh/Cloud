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
  { key: 'recent', icon: 'schedule', label: '最近', route: 'drive-root' },
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
  <div class="h-screen flex flex-col cd-app-bg">
    <!-- Top bar -->
    <header class="cd-glass-surface h-16 flex items-center px-4 shrink-0 border-x-0 border-t-0 rounded-none shadow-[0_8px_30px_rgba(31,45,75,0.05)]">
      <!-- Mobile: hamburger + logo -->
      <div class="flex items-center gap-2 md:w-64 shrink-0">
        <button
          v-if="isMobile"
          @click="toggleSidebar"
          class="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer text-[#5f6368] hover:bg-[#e8f0fe] transition-colors"
        >
          <span class="material-icons-round text-2xl">menu</span>
        </button>
        <span class="flex h-8 w-8 items-center justify-center rounded-xl bg-[#1a73e8] text-white shadow-[0_8px_18px_rgba(26,115,232,0.18)]">
          <span class="material-icons-round text-[20px]">cloud</span>
        </span>
        <span class="text-lg font-semibold tracking-[-0.02em] text-[#172033] hidden md:inline">Cloud Drive</span>
      </div>
      <div class="flex-1 max-w-2xl mx-auto">
        <form @submit.prevent="handleSearch" class="cd-input flex items-center px-4 py-2.5 shadow-[0_8px_24px_rgba(31,45,75,0.05)]">
          <span class="material-icons-round text-xl mr-3 text-[#667085]">search</span>
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
          class="flex items-center gap-2 rounded-full border border-[#e5e7eb] bg-white px-2.5 py-1 text-sm font-medium text-[#1f2937] cursor-pointer hover:bg-[#f8fafc]"
          title="退出登录"
        >
          <span class="hidden md:inline">张伟</span>
          <span class="flex h-7 w-7 items-center justify-center rounded-full bg-[#1a73e8] text-xs font-semibold text-white">张</span>
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
        class="sidebar-panel cd-glass-surface w-64 shrink-0 flex flex-col p-3 border-y-0 border-l-0 rounded-none z-40"
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
            class="flex items-center gap-3 px-6 py-3.5 rounded-2xl text-sm font-semibold cursor-pointer transition-all duration-200 bg-white text-[#1f2937] border border-[#e5e7eb] shadow-[0_1px_2px_rgba(15,23,42,0.03)] hover:bg-[#f8fafc]"
          >
            <span class="flex h-7 w-7 items-center justify-center rounded-[10px] bg-[#1a73e8]">
              <span class="material-icons-round text-base text-white">add</span>
            </span>
            新建
          </button>
          <NewMenu v-if="showNewMenu" @close="showNewMenu = false" />
        </div>

        <nav class="space-y-0.5 flex-1">
          <button
            v-for="item in navItems"
            :key="item.key"
            @click="navigateTo(item.route)"
            class="nav-item relative w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm cursor-pointer transition-all duration-200 text-[#344054]"
            :class="isActive(item.key) ? 'is-active font-semibold' : 'hover:bg-white/75 hover:shadow-[0_8px_20px_rgba(31,45,75,0.05)]'"
          >
            <span class="material-icons-round text-xl">{{ item.icon }}</span>
            {{ item.label }}
          </button>
        </nav>

        <!-- Storage usage -->
        <div class="cd-panel mt-auto p-4">
          <div class="flex items-center justify-between gap-2 mb-3">
            <div class="flex items-center gap-2">
              <span class="material-icons-round text-lg text-[#1a73e8]">cloud</span>
              <span class="text-xs font-semibold text-[#536079]">存储空间</span>
            </div>
            <span class="text-xs font-semibold text-[#1a73e8]">{{ usagePercent }}%</span>
          </div>
          <div class="w-full h-2 rounded-full bg-[#e6edf7] p-0.5">
            <div
              class="h-full rounded-full transition-all duration-500"
              :style="{ width: usagePercent + '%', background: usageBarColor }"
            ></div>
          </div>
          <p class="text-xs mt-2 text-[#667085]">
            已使用 {{ formatSize(usage.used) }} / {{ formatSize(usage.total) }}
          </p>
          <button type="button" class="mt-2 text-xs text-[#667085] underline underline-offset-4 decoration-black/15 hover:text-[#1a73e8]">联系 IT 扩容</button>
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

.nav-item.is-active {
  color: #1557d6;
  background: linear-gradient(90deg, rgba(26, 115, 232, 0.14), rgba(66, 133, 244, 0.06));
  box-shadow: 0 10px 24px rgba(26, 115, 232, 0.08);
}
.nav-item.is-active::before {
  content: '';
  position: absolute;
  left: 8px;
  top: 10px;
  bottom: 10px;
  width: 3px;
  border-radius: 999px;
  background: #1a73e8;
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
