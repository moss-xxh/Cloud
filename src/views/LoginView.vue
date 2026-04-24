<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { login } from '../api'

const router = useRouter()
const username = ref('admin')
const password = ref('admin123admin123')
const error = ref('')
const loading = ref(false)

async function handleLogin() {
  error.value = ''
  loading.value = true
  try {
    await login(username.value, password.value)
    router.push('/drive')
  } catch {
    error.value = '用户名或密码错误'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-[#f8f9fa]">
    <div class="bg-white rounded-2xl shadow-lg p-10 w-full max-w-md">
      <div class="text-center mb-8">
        <div class="text-5xl mb-4">☁️</div>
        <h1 class="text-2xl font-medium text-[#202124]">Cloud Drive</h1>
        <p class="text-sm mt-2 text-[#5f6368]">登录以访问您的文件</p>
      </div>

      <form @submit.prevent="handleLogin" class="space-y-5">
        <div>
          <input
            v-model="username"
            type="text"
            placeholder="用户名"
            required
            class="w-full px-4 py-3 border rounded-lg text-sm outline-none transition-colors text-[#202124] focus:border-[#1a73e8]"
            :class="error ? 'border-red-400' : 'border-[#dadce0]'"
          />
        </div>
        <div>
          <input
            v-model="password"
            type="password"
            placeholder="密码"
            required
            class="w-full px-4 py-3 border rounded-lg text-sm outline-none transition-colors text-[#202124] focus:border-[#1a73e8]"
            :class="error ? 'border-red-400' : 'border-[#dadce0]'"
          />
        </div>

        <p v-if="error" class="text-red-500 text-sm">{{ error }}</p>

        <button
          type="submit"
          :disabled="loading"
          class="w-full py-3 rounded-lg text-white font-medium text-sm transition-colors cursor-pointer disabled:opacity-60 bg-[#1a73e8] hover:bg-[#1557b0]"
        >
          {{ loading ? '登录中...' : '登录' }}
        </button>
      </form>
    </div>
  </div>
</template>
