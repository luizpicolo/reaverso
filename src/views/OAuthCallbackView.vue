<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useI18n } from 'vue-i18n'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { t } = useI18n()
const error = ref('')

onMounted(async () => {
  const code = typeof route.query.code === 'string' ? route.query.code : ''
  const state = typeof route.query.state === 'string' ? route.query.state : ''
  const oauthError = typeof route.query.error === 'string' ? route.query.error : ''

  if (oauthError) {
    error.value = typeof route.query.error_description === 'string' ? route.query.error_description : oauthError
    return
  }

  if (!code || !state) {
    error.value = t('oauth.missingCode')
    return
  }

  try {
    await auth.completeLogin(code, state)
    await router.replace('/feed')
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('oauth.failure')
  }
})
</script>

<template>
  <div class="page">
    <div class="center" style="max-width:520px">
      <div class="card">
        <div v-if="!error">
          <div class="eyebrow">{{ t('oauth.title') }}</div>
          <h1>{{ t('oauth.connecting') }}</h1>
          <p class="lead" style="font-size:14px">{{ t('oauth.connectingText') }}</p>
        </div>
        <div v-else>
          <div class="eyebrow">{{ t('oauth.title') }}</div>
          <h1>{{ t('oauth.failure') }}</h1>
          <div class="status bad"><p>{{ error }}</p></div>
          <RouterLink class="btn primary" to="/login">{{ t('oauth.retry') }}</RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>
