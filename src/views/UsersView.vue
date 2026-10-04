<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Search, UserPlus, UserMinus, Users, RefreshCw, ExternalLink } from 'lucide-vue-next'
import {
  followPleromaAccount,
  getPleromaFollowingAccounts,
  searchPleromaAccounts,
  unfollowPleromaAccount,
  resolvePleromaMediaUrl,
  type PleromaAccount,
} from '../api/pleroma'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const query = ref('')
const results = ref<PleromaAccount[]>([])
const following = ref<PleromaAccount[]>([])
const loading = ref(false)
const searching = ref(false)
const busy = ref(new Set<string>())
const error = ref('')

const visibleResults = computed(() => results.value)

async function loadFollowing() {
  loading.value = true
  error.value = ''
  try {
    following.value = await getPleromaFollowingAccounts()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Não foi possível carregar quem você segue.'
  } finally {
    loading.value = false
  }
}

async function search() {
  const value = query.value.trim()
  if (!value) {
    results.value = []
    return
  }
  searching.value = true
  error.value = ''
  try {
    results.value = await searchPleromaAccounts(value)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Não foi possível pesquisar usuários.'
  } finally {
    searching.value = false
  }
}

function isFollowing(account: PleromaAccount) {
  return following.value.some(item => item.id === account.id)
}

async function toggle(account: PleromaAccount) {
  busy.value = new Set([...busy.value, account.id])
  error.value = ''
  try {
    if (isFollowing(account)) {
      await unfollowPleromaAccount(account.id)
      following.value = following.value.filter(item => item.id !== account.id)
    } else {
      await followPleromaAccount(account.id)
      // Re-read the server state instead of assuming that a remote follow
      // was accepted. This keeps the UI consistent with Pleroma's relationship.
      await loadFollowing()
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Não foi possível alterar o seguimento.'
  } finally {
    const next = new Set(busy.value)
    next.delete(account.id)
    busy.value = next
  }
}

function accountLabel(account: PleromaAccount) {
  return `@${account.acct || account.username}`
}

function avatarUrl(account: PleromaAccount) {
  return resolvePleromaMediaUrl(account.avatar)
}

onMounted(loadFollowing)
</script>

<template>
  <div class="page">
    <div class="section-head">
      <div>
        <div class="eyebrow">{{ t('users.eyebrow') }}</div>
        <h2>{{ t('users.title') }}</h2>
        <p>{{ t('users.lead') }}</p>
      </div>
      <button class="btn ghost" type="button" @click="loadFollowing">
        <RefreshCw :size="16" /> {{ t('common.update') }}
      </button>
    </div>

    <div v-if="error" class="status bad">{{ error }}</div>

    <section class="card user-search-card">
      <div class="search-row">
        <div class="input-icon-wrap">
          <Search :size="17" />
          <input
            v-model="query"
            class="input"
            :placeholder="t('users.placeholder')"
            @keyup.enter="search"
          />
        </div>
        <button class="btn primary" type="button" :disabled="searching" @click="search">
          <Search :size="16" /> {{ searching ? t('users.searching') : t('common.search') }}
        </button>
      </div>

      <div v-if="searching" class="user-state">{{ t('users.searchState') }}</div>
      <div v-else-if="query.trim() && !visibleResults.length" class="user-state">
        {{ t('users.empty') }}
      </div>
      <div v-else-if="visibleResults.length" class="user-list">
        <article v-for="account in visibleResults" :key="account.id" class="user-row">
          <img v-if="account.avatar" class="user-avatar" :src="avatarUrl(account)" :alt="account.display_name || account.username" />
          <span v-else class="user-avatar user-avatar-fallback">{{ (account.display_name || account.username).slice(0, 1) }}</span>
          <div class="user-copy">
            <strong>{{ account.display_name || account.username }}</strong>
            <span>{{ accountLabel(account) }}</span>
          </div>
          <a class="text-link user-open" :href="account.url" target="_blank" rel="noopener noreferrer">
            <ExternalLink :size="14" /> {{ t('users.profile') }}
          </a>
          <button class="btn" :class="isFollowing(account) ? 'secondary' : 'primary'" type="button" :disabled="busy.has(account.id)" @click="toggle(account)">
            <UserMinus v-if="isFollowing(account)" :size="15" />
            <UserPlus v-else :size="15" />
            {{ busy.has(account.id) ? t('common.wait') : isFollowing(account) ? t('common.following') : t('common.follow') }}
          </button>
        </article>
      </div>
    </section>

    <section class="users-following-section">
      <div class="section-head compact-head">
        <div>
          <div class="eyebrow">{{ t('users.yourList') }}</div>
          <h2>{{ t('users.following') }}</h2>
        </div>
        <span class="pill">{{ t('users.accounts', following.length) }}</span>
      </div>

      <div v-if="loading" class="card user-state">{{ t('users.loading') }}</div>
      <div v-else-if="!following.length" class="card user-state">
        <Users :size="24" />
        <strong>{{ t('users.noFollowing') }}</strong>
        <span>{{ t('users.noFollowingText') }}</span>
      </div>
      <div v-else class="user-list card">
        <article v-for="account in following" :key="account.id" class="user-row">
          <img v-if="account.avatar" class="user-avatar" :src="avatarUrl(account)" :alt="account.display_name || account.username" />
          <span v-else class="user-avatar user-avatar-fallback">{{ (account.display_name || account.username).slice(0, 1) }}</span>
          <div class="user-copy">
            <strong>{{ account.display_name || account.username }}</strong>
            <span>{{ accountLabel(account) }}</span>
          </div>
          <a class="text-link user-open" :href="account.url" target="_blank" rel="noopener noreferrer">{{ t('users.viewProfile') }}</a>
          <button class="btn danger" type="button" :disabled="busy.has(account.id)" @click="toggle(account)">
            <UserMinus :size="15" /> {{ t('users.unfollow') }}
          </button>
        </article>
      </div>
    </section>
  </div>
</template>
