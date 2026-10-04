<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Globe2, House, Network, RefreshCw, Users, UserPlus, ExternalLink } from 'lucide-vue-next'
import {
  accountHost,
  accountInstanceUrl,
  getPleromaGlobalTimeline,
  getPleromaHomeTimeline,
  getPleromaLocalTimeline,
  getPleromaFollowingAccounts,
  getRemoteInstanceTimeline,
  type PleromaAccount,
  type PleromaTimelineStatus,
  resolvePleromaMediaUrl,
} from '../api/pleroma'
import type { FeedType } from '../types'
import { useI18n } from 'vue-i18n'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const items = ref<PleromaTimelineStatus[]>([])
const following = ref<PleromaAccount[]>([])
const loading = ref(true)
const error = ref('')
const followedInstances = ref<Array<{
  host: string
  url: string
  local: PleromaTimelineStatus[]
  global: PleromaTimelineStatus[]
  loading: boolean
  error?: string
}>>([])

const feedOptions = computed<Array<{ id: FeedType; label: string; description: string }>>(() => [
  { id: 'local', label: t('feed.local'), description: t('feed.localText') },
  { id: 'following', label: t('feed.following'), description: t('feed.followingText') },
  { id: 'global', label: t('feed.global'), description: t('feed.globalText') },
])

const activeFeed = computed<FeedType>(() => {
  const requested = route.query.feed
  return requested === 'local' || requested === 'global' || requested === 'following' ? requested : 'following'
})
const activeOption = computed(() => feedOptions.value.find(item => item.id === activeFeed.value) || feedOptions.value[1])

function statusAccount(status: PleromaTimelineStatus) {
  return status.reblog?.account || status.account
}

function postContent(status: PleromaTimelineStatus) {
  const value = status.reblog?.content || status.content || ''
  return value.replace(/<br\s*\/?>(\s*)/gi, '\n').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()
}

function hostForStatus(status: PleromaTimelineStatus) {
  return accountHost(statusAccount(status))
}

function avatarUrl(status: PleromaTimelineStatus) {
  return resolvePleromaMediaUrl(statusAccount(status).avatar)
}

function mediaPreviewUrl(url?: string) {
  return resolvePleromaMediaUrl(url)
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    if (activeFeed.value === 'local') items.value = await getPleromaLocalTimeline(40)
    else if (activeFeed.value === 'global') items.value = await getPleromaGlobalTimeline(40)
    else items.value = await getPleromaHomeTimeline(40)
    following.value = await getPleromaFollowingAccounts()
    await loadFollowedInstanceTimelines()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Não foi possível carregar o feed.'
    items.value = []
  } finally {
    loading.value = false
  }
}

async function loadFollowedInstanceTimelines() {
  const map = new Map<string, { host: string; url: string }>()
  for (const account of following.value) {
    const host = accountHost(account)
    const url = accountInstanceUrl(account)
    if (host && !map.has(host)) map.set(host, { host, url })
  }
  const entries = [...map.values()]
  followedInstances.value = entries.map(item => ({ ...item, local: [], global: [], loading: true }))
  await Promise.all(followedInstances.value.map(async entry => {
    try {
      const [local, global] = await Promise.all([
        getRemoteInstanceTimeline(entry.url, true, 20),
        getRemoteInstanceTimeline(entry.url, false, 20),
      ])
      entry.local = local
      entry.global = global
    } catch (err) {
      entry.error = err instanceof Error ? err.message : 'Não foi possível carregar esta instância.'
    } finally {
      entry.loading = false
    }
  }))
}

async function changeFeed(type: FeedType) {
  await router.replace({ query: { ...route.query, feed: type } })
  await load()
}

onMounted(load)

function dateLabel(value: string) {
  return new Intl.DateTimeFormat(locale.value, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}
</script>

<template>
  <div class="page feed-page">
    <div class="feed-layout">
      <section>
        <div class="section-head feed-head">
          <div>
            <div class="eyebrow">{{ t('feed.eyebrow') }}</div>
            <h2>{{ activeOption.label }}</h2>
            <p>{{ activeOption.description }}</p>
          </div>
          <button class="btn ghost" type="button" @click="load"><RefreshCw :size="16" /> {{ t('common.update') }}</button>
        </div>

        <div class="feed-tabs" role="tablist" :aria-label="t('feed.tabs')">
          <button v-for="option in feedOptions" :key="option.id" class="feed-tab" :class="{ active: activeFeed === option.id }" type="button" role="tab" :aria-selected="activeFeed === option.id" @click="changeFeed(option.id)">
            <House v-if="option.id === 'local'" :size="16" />
            <Users v-else-if="option.id === 'following'" :size="16" />
            <Globe2 v-else :size="16" />
            <span>{{ option.label }}</span>
          </button>
        </div>

        <div v-if="error" class="status bad">{{ error }}</div>
        <div v-if="loading" class="card loading-box">{{ t('feed.loading') }}</div>
        <div v-else-if="!items.length" class="card empty-box">
          <Network :size="26" />
          <strong>{{ t('feed.empty') }}</strong>
          <p v-if="activeFeed === 'following'">{{ t('feed.followHint') }}</p>
          <p v-else>{{ t('feed.publicEmpty') }}</p>
          <RouterLink v-if="activeFeed === 'following'" class="btn primary" to="/users"><UserPlus :size="15" /> {{ t('feed.findPeople') }}</RouterLink>
        </div>

        <div v-else class="feed-list">
          <article v-for="status in items" :key="status.id" class="card social-post">
            <div class="social-post-header">
              <img v-if="statusAccount(status).avatar" class="post-avatar" :src="avatarUrl(status)" :alt="statusAccount(status).display_name || statusAccount(status).username" />
              <span v-else class="post-avatar post-avatar-fallback">{{ (statusAccount(status).display_name || statusAccount(status).username).slice(0, 1) }}</span>
              <div class="post-author">
                <strong>{{ statusAccount(status).display_name || statusAccount(status).username }}</strong>
                <span>@{{ statusAccount(status).acct }} · {{ dateLabel(status.created_at) }}</span>
              </div>
              <span class="post-instance">{{ hostForStatus(status) }}</span>
            </div>
            <div class="social-post-content">{{ postContent(status) }}</div>
            <div v-if="status.media_attachments?.length" class="post-media">
              <a v-for="media in status.media_attachments" :key="media.id" :href="media.url" target="_blank" rel="noopener noreferrer">
                <img v-if="media.type === 'image' && media.preview_url" :src="mediaPreviewUrl(media.preview_url)" :alt="media.description || media.filename || t('feed.attachment')" />
                <span v-else><ExternalLink :size="14" /> {{ media.filename || t('feed.openAttachment') }}</span>
              </a>
            </div>
            <div class="post-actions">
              <a v-if="status.url" class="text-link" :href="status.url" target="_blank" rel="noopener noreferrer">{{ t('feed.openPost') }} <ExternalLink :size="13" /></a>
            </div>
          </article>
        </div>

        <section v-if="activeFeed === 'following' && followedInstances.length" class="followed-instances">
          <div class="section-title-row">
            <div><div class="eyebrow">Instâncias das pessoas seguidas</div><h2>Local e Global</h2><p>As linhas abaixo consultam as timelines públicas de cada instância encontrada entre as contas que você segue.</p></div>
          </div>
          <article v-for="instance in followedInstances" :key="instance.host" class="card instance-feed-card">
            <div class="instance-feed-head">
              <div><strong>{{ instance.host }}</strong><span>{{ instance.url }}</span></div>
              <a class="text-link" :href="instance.url" target="_blank" rel="noopener noreferrer">Abrir instância →</a>
            </div>
            <div v-if="instance.loading" class="user-state">Carregando Local e Global…</div>
            <div v-else-if="instance.error" class="status bad">{{ instance.error }}</div>
            <div v-else class="instance-columns">
              <div><h3><House :size="15" /> Local</h3><article v-for="status in instance.local" :key="`l-${status.id}`" class="mini-post"><strong>{{ status.account.display_name || status.account.username }}</strong><span>{{ postContent(status).slice(0, 180) }}</span></article><span v-if="!instance.local.length" class="muted">Sem posts locais retornados.</span></div>
              <div><h3><Globe2 :size="15" /> Global</h3><article v-for="status in instance.global" :key="`g-${status.id}`" class="mini-post"><strong>{{ status.account.display_name || status.account.username }}</strong><span>{{ postContent(status).slice(0, 180) }}</span></article><span v-if="!instance.global.length" class="muted">Sem posts globais retornados.</span></div>
            </div>
          </article>
        </section>
      </section>

      <aside>
        <div class="card side-card">
          <div class="eyebrow">{{ t('feed.network') }}</div>
          <h3>{{ t('feed.people', following.length) }}</h3>
          <p>{{ t('feed.networkHint') }}</p>
          <RouterLink v-for="account in following.slice(0, 8)" :key="account.id" :to="{ path: '/users' }" class="mini-platform">
            <img v-if="account.avatar" class="mini-avatar" :src="account.avatar" :alt="account.display_name || account.username" />
            <span v-else class="source-logo">{{ (account.display_name || account.username).slice(0, 1) }}</span>
            <span><strong>{{ account.display_name || account.username }}</strong><small>@{{ account.acct }}</small></span>
          </RouterLink>
          <RouterLink class="btn ghost full" to="/users">{{ t('feed.manage') }}</RouterLink>
        </div>
      </aside>
    </div>
  </div>
</template>
