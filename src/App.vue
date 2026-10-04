<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import {
  BookOpen,
  House,
  Network,
  Search,
  Users,
  ShieldCheck,
  Upload,
} from 'lucide-vue-next'
import { useAuthStore } from './stores/auth'
import { useI18n } from 'vue-i18n'
import LanguageSelector from './components/LanguageSelector.vue'

const auth = useAuthStore()
const { t } = useI18n()
onMounted(() => { void auth.hydrate() })
const route = useRoute()
const router = useRouter()
const searchQuery = ref(typeof route.query.q === 'string' ? route.query.q : '')

watch(
  () => route.query.q,
  value => {
    searchQuery.value = typeof value === 'string' ? value : ''
  },
)

async function submitSearch() {
  const query = searchQuery.value.trim()

  await router.push({
    path: '/resources',
    query: query ? { q: query } : {},
  })
}
</script>

<template>
  <header>
    <div class="nav">
      <RouterLink to="/" class="brand">
        <span class="brandmark">
          <BookOpen :size="20" />
        </span>
        <span>REA<span class="muted">.fed</span></span>
      </RouterLink>

      <nav>
        <RouterLink v-if="auth.isAuthenticated" to="/feed">
          <House :size="15" />
          {{ t('nav.feed') }}
        </RouterLink>

        <RouterLink v-if="auth.isAuthenticated" to="/users">
          <Users :size="15" />
          {{ t('nav.people') }}
        </RouterLink>

        <RouterLink to="/resources">
          <Search :size="15" />
          {{ t('nav.explore') }}
        </RouterLink>

        <RouterLink to="/federation">
          <Network :size="15" />
          {{ t('nav.platforms') }}
        </RouterLink>

        <RouterLink to="/verify">
          <ShieldCheck :size="15" />
          {{ t('nav.verify') }}
        </RouterLink>

        <RouterLink v-if="auth.isAuthenticated" to="/resources/new">
          <Upload :size="15" />
          {{ t('nav.publish') }}
        </RouterLink>
      </nav>

      <form class="nav-search" @submit.prevent="submitSearch">
        <Search :size="15" />
        <input
          v-model="searchQuery"
          type="search"
          :aria-label="t('nav.searchLabel')"
          :placeholder="t('nav.search')"
        />
      </form>

      <div class="nav-actions">
        <LanguageSelector />
        <RouterLink v-if="!auth.isAuthenticated" class="btn ghost" to="/login">
          {{ t('nav.login') }}
        </RouterLink>

        <template v-else>
          <RouterLink class="avatar" to="/profile">
            {{ auth.user?.name.slice(0, 1) }}
          </RouterLink>
          <button class="btn ghost" type="button" @click="auth.signOut()">{{ t('nav.logout') }}</button>
        </template>
      </div>
    </div>
  </header>

  <main>
    <RouterView />
  </main>

  <footer>
    <div>
      <strong>REA.fed</strong>
      <span> {{ t('nav.tagline') }}</span>
    </div>
    <span>{{ t('nav.demo') }}</span>
  </footer>
</template>
