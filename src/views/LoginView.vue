<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { login } from '../api'

const router = useRouter()
const username = ref('admin')
const password = ref('admin123admin123')
const rememberMe = ref(true)
const showPassword = ref(false)
const error = ref('')
const loading = ref(false)
const focusKey = ref<'email' | 'pw' | null>(null)

const passwordType = computed(() => (showPassword.value ? 'text' : 'password'))

async function handleLogin() {
  error.value = ''
  loading.value = true
  try {
    await login(username.value, password.value)
    router.push('/drive')
  } catch {
    error.value = '用户名或密码错误，请联系 IT 确认账号状态'
  } finally {
    loading.value = false
  }
}

function handleResetPassword() {
  error.value = '请联系 IT 管理员重置密码'
}
</script>

<template>
  <div class="login-page">
    <!-- single radial wash — only color anchor on this page -->
    <div class="login-radial" aria-hidden="true"></div>

    <!-- top-left brand only; v3 dropped 帮助中心 / English -->
    <header class="login-brand">
      <span class="brand-mark brand-mark--sm">
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M7 18a5 5 0 1 1 .85-9.93A6 6 0 0 1 19 10a4 4 0 0 1 0 8H7Z" />
        </svg>
      </span>
      <span class="brand-name">Cloud Drive</span>
    </header>

    <main class="login-card" aria-labelledby="login-title">
      <h1 id="login-title" class="login-title">登录到 Cloud Drive</h1>
      <p class="login-subtitle">使用公司账号继续访问您的文件</p>

      <form class="login-form" @submit.prevent="handleLogin">
        <label class="field">
          <span class="field-label">用户名 / 邮箱</span>
          <input
            v-model="username"
            type="text"
            autocomplete="username"
            required
            class="field-input"
            :class="{ 'field-input--focus': focusKey === 'email' }"
            @focus="focusKey = 'email'"
            @blur="focusKey = null"
          />
        </label>

        <label class="field">
          <span class="field-label">密码</span>
          <span class="password-wrap">
            <input
              v-model="password"
              :type="passwordType"
              autocomplete="current-password"
              required
              class="field-input field-input--password"
              :class="{ 'field-input--focus': focusKey === 'pw' }"
              @focus="focusKey = 'pw'"
              @blur="focusKey = null"
            />
            <button
              type="button"
              class="password-toggle"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'"
              @click="showPassword = !showPassword"
            >
              <svg v-if="showPassword" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M2 12s3.5-7 10-7c2.4 0 4.4.8 6 1.9" />
                <path d="M22 12s-3.5 7-10 7c-2.4 0-4.4-.8-6-1.9" />
                <path d="m4 4 16 16" />
              </svg>
            </button>
          </span>
        </label>

        <div class="field-row">
          <label class="remember">
            <span
              class="checkbox"
              :class="{ 'checkbox--checked': rememberMe }"
              @click="rememberMe = !rememberMe"
            >
              <svg v-if="rememberMe" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="m5 12 4 4 10-10" />
              </svg>
            </span>
            <input v-model="rememberMe" type="checkbox" class="sr-only" />
            <span>记住我</span>
          </label>
          <button type="button" class="reset-link" @click="handleResetPassword">联系 IT 重置</button>
        </div>

        <p v-if="error" class="form-error" role="alert">{{ error }}</p>

        <button type="submit" :disabled="loading" class="primary-btn">
          {{ loading ? '登 录 中' : '登 录' }}
        </button>
      </form>
    </main>

    <footer class="login-footer">© 2026 Cloud Drive</footer>
  </div>
</template>

<style scoped>
.login-page {
  position: relative;
  min-height: 100vh;
  /* glass canvas: lavender → violet → mint */
  background: var(--cd-canvas-grad);
  color: var(--cd-text-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 80px 24px 64px;
  overflow: hidden;
}

/* perf: single radial blob (was 3) — paints once, costs less.
   The lavender→mint canvas already provides color variety to refract through. */
.login-radial {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(720px 520px at 50% 55%, rgba(26, 115, 232, 0.16), transparent 62%);
}

.login-brand {
  position: absolute;
  top: 32px;
  left: 40px;
  display: flex;
  align-items: center;
  gap: 10px;
  z-index: 2;
}

.brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--cd-primary);
  color: #fff;
  flex-shrink: 0;
}

.brand-mark--sm {
  width: 28px;
  height: 28px;
  border-radius: 9px;
}

.brand-mark--sm svg {
  width: 18px;
  height: 18px;
}

.brand-name {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.1px;
  color: var(--cd-text-primary);
}

.login-card {
  position: relative;
  z-index: 1;
  width: min(460px, calc(100vw - 48px));
  padding: 44px 44px 36px;
  border-radius: 24px;
  /* glass: more transparent + stronger blur than crisp */
  background: rgba(255, 255, 255, 0.5);
  backdrop-filter: blur(40px) saturate(180%);
  -webkit-backdrop-filter: blur(40px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.9);
  box-shadow: var(--cd-shadow-login);
}

.login-title {
  margin: 0 0 8px;
  font-size: 32px;
  line-height: 1.2;
  font-weight: 700;
  letter-spacing: -0.7px;
  color: var(--cd-text-primary);
}

.login-subtitle {
  margin: 0 0 28px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--cd-text-secondary);
}

.login-form {
  display: block;
}

.field + .field {
  margin-top: 18px;
}

.field-label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--cd-text-primary);
}

.field-input {
  width: 100%;
  height: 52px;
  padding: 0 18px;
  border-radius: 16px;
  border: 1px solid var(--cd-line);
  background: #fff;
  color: var(--cd-text-primary);
  font-size: 15px;
  font-family: inherit;
  outline: none;
  transition: border-color var(--cd-transition), box-shadow var(--cd-transition);
}

.field-input::placeholder {
  color: var(--cd-text-muted);
}

.field-input:focus,
.field-input--focus {
  border-color: var(--cd-primary);
  box-shadow: 0 0 0 4px rgba(26, 115, 232, 0.12);
}

.password-wrap {
  position: relative;
  display: block;
}

.field-input--password {
  padding-right: 48px;
}

.password-toggle {
  position: absolute;
  right: 8px;
  top: 8px;
  width: 36px;
  height: 36px;
  border: 0;
  background: transparent;
  border-radius: 12px;
  display: grid;
  place-items: center;
  color: var(--cd-text-secondary);
  cursor: pointer;
  transition: background-color var(--cd-transition);
}

.password-toggle:hover {
  background: var(--cd-line-soft);
}

.field-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 20px 0 24px;
}

.remember {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--cd-text-primary);
  user-select: none;
}

.checkbox {
  width: 18px;
  height: 18px;
  border-radius: 6px;
  border: 1.5px solid #cbd5e1;
  background: #fff;
  display: grid;
  place-items: center;
  transition: all var(--cd-transition);
}

.checkbox--checked {
  border-color: var(--cd-primary);
  background: var(--cd-primary);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

.reset-link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--cd-text-secondary);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: rgba(0, 0, 0, 0.15);
  transition: color var(--cd-transition);
}

.reset-link:hover {
  color: var(--cd-primary);
}

.form-error {
  margin: -8px 0 12px;
  padding: 9px 14px;
  border-radius: 12px;
  background: #fff1f2;
  color: #be123c;
  font-size: 12px;
  line-height: 1.5;
}

.primary-btn {
  width: 100%;
  height: 52px;
  border: 0;
  border-radius: 16px;
  background: var(--cd-primary);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  font-family: inherit;
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: background-color var(--cd-transition), opacity var(--cd-transition);
}

.primary-btn:hover {
  background: var(--cd-primary-hover);
}

.primary-btn:active {
  background: var(--cd-primary-dim);
}

.primary-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.login-footer {
  position: absolute;
  bottom: 28px;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 12px;
  color: var(--cd-text-muted);
}

@media (max-width: 520px) {
  .login-page {
    align-items: flex-start;
    padding-top: 96px;
  }

  .login-brand {
    top: 24px;
    left: 24px;
  }

  .login-card {
    padding: 32px 24px 28px;
  }

  .login-title {
    font-size: 26px;
  }
}
</style>
