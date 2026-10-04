<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Eye, EyeOff, LockKeyhole, UserRound } from 'lucide-vue-next'
import { loginWithPleromaPassword, verifyPleromaConnection } from '../api/pleroma'
import { useAuthStore } from '../stores/auth'
import { useI18n } from 'vue-i18n'

const username = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const error = ref('')
const router = useRouter()
const auth = useAuthStore()
const { t } = useI18n()

async function submit() {
  error.value = ''
  if (!username.value.trim() || !password.value) return
  loading.value = true
  try {
    const config = await loginWithPleromaPassword(username.value, password.value)
    const { account } = await verifyPleromaConnection(config)
    auth.setAuthenticatedAccount(account, config.instanceUrl)
    await router.replace('/feed')
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('login.failure')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="center" style="max-width:520px">
      <div class="card">
        <div class="eyebrow">{{ t('login.eyebrow') }}</div>
        <h1 style="font-size:34px">{{ t('login.title') }}</h1>
        <p class="lead" style="font-size:14px">
          {{ t('login.lead') }}
        </p>

        <form @submit.prevent="submit">
          <div class="field">
            <label>{{ t('login.username') }}</label>
            <div class="input-icon-wrap"><UserRound :size="16"/><input class="input" v-model="username" type="text" autocomplete="username" :placeholder="t('login.usernamePlaceholder')" required /></div>
          </div>
          <div class="field">
            <label>{{ t('login.password') }}</label>
            <div class="input-icon-wrap"><LockKeyhole :size="16"/><input class="input" v-model="password" :type="showPassword ? 'text' : 'password'" autocomplete="current-password" :placeholder="t('login.passwordPlaceholder')" required /><button class="input-action" type="button" @click="showPassword = !showPassword" :aria-label="showPassword ? t('login.hide') : t('login.show')"><EyeOff v-if="showPassword" :size="16"/><Eye v-else :size="16"/></button></div>
          </div>

          <div v-if="error" class="status bad"><strong>{{ t('login.failure') }}</strong><p>{{ error }}</p></div>

          <button class="btn primary" style="width:100%;margin-top:8px" :disabled="loading">
            {{ loading ? t('login.submitting') : t('login.submit') }}
          </button>
        </form>

        <div class="auth-divider"><span>{{ t('login.or') }}</span></div>
        <RouterLink class="btn secondary" style="width:100%" to="/register">{{ t('login.create') }}</RouterLink>
        <p class="form-hint">{{ t('login.hint') }}</p>
      </div>
    </div>
  </div>
</template>
