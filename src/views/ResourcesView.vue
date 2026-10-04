<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Search, X } from 'lucide-vue-next'
import { listLocalPleromaResources } from '../api/resources'
import type { Resource } from '../types'
import { useI18n } from 'vue-i18n'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const query = ref(typeof route.query.q === 'string' ? route.query.q : '')
const items = ref<Resource[]>([])
const loading = ref(false)
const loadingMore = ref(false)
const error = ref('')
const pagesLoaded = ref(0)
const hasMore = ref(true)
let requestId = 0
let backgroundRequest: Promise<void> | null = null
let nextMaxId: string | undefined

function mergeResources(next: Resource[]) {
  if (!next.length) return
  const byId = new Map(items.value.map(item => [item.id, item]))
  for (const resource of next) byId.set(resource.id, resource)
  items.value = [...byId.values()].sort((a, b) =>
    (b.publishedAtTime || b.publishedAt).localeCompare(a.publishedAtTime || a.publishedAt),
  )
}

async function searchResources(value = query.value) {
  const currentRequest = ++requestId
  loading.value = true
  loadingMore.value = false
  error.value = ''
  items.value = []
  pagesLoaded.value = 0
  hasMore.value = true
  nextMaxId = undefined
  backgroundRequest = null

  try {
    // Render the first 40 local posts immediately. The remaining pages are
    // fetched afterwards so /resources does not stay blocked while scanning
    // the entire local timeline.
    await listLocalPleromaResources(value.trim(), {
      maxPages: 1,
      onPage: (pageResources, info) => {
        if (currentRequest !== requestId) return
        mergeResources(pageResources)
        pagesLoaded.value = info.page
        hasMore.value = info.hasMore
        nextMaxId = info.nextMaxId
        loading.value = false
      },
    })

    if (currentRequest !== requestId) return
    loading.value = false

    // Continue in the background so the catalog eventually contains all
    // local resources without making the initial screen wait for hundreds of
    // timeline requests.
    if (hasMore.value) {
      backgroundRequest = loadRemainingPages(value.trim(), currentRequest, nextMaxId)
      await backgroundRequest
    }
  } catch (err) {
    if (currentRequest !== requestId) return
    loading.value = false
    if (!items.value.length) {
      error.value = err instanceof Error ? err.message : t('resources.failure')
    }
  }
}

async function loadRemainingPages(value: string, currentRequest: number, startMaxId?: string) {
  loadingMore.value = true
  try {
    // Skip the first page, which is already rendered, then continue scanning.
    await listLocalPleromaResources(value, {
      maxPages: 250,
      startMaxId,
      startPage: 2,
      onPage: (pageResources, info) => {
        if (currentRequest !== requestId) return
        mergeResources(pageResources)
        pagesLoaded.value = info.page
        hasMore.value = info.hasMore
      },
    })
  } catch (err) {
    if (currentRequest === requestId && !items.value.length) {
      error.value = err instanceof Error ? err.message : 'Não foi possível continuar carregando os recursos.'
    }
  } finally {
    if (currentRequest === requestId) {
      loadingMore.value = false
      hasMore.value = false
    }
  }
}

async function submitSearch() {
  const value = query.value.trim()
  await router.push({ path: '/resources', query: value ? { q: value } : {} })
  // The route watcher performs the request, avoiding duplicate API calls.
}

async function clearSearch() {
  query.value = ''
  await router.push({ path: '/resources', query: {} })
}

watch(
  () => route.query.q,
  async value => {
    const nextQuery = typeof value === 'string' ? value : ''
    if (nextQuery !== query.value) query.value = nextQuery
    await searchResources(nextQuery)
  },
)

onMounted(() => searchResources(query.value))
onBeforeUnmount(() => { requestId += 1 })
</script>

<template>
  <div class="page resources-page">
    <div class="section-head">
      <div>
        <div class="eyebrow">{{ t('resources.eyebrow') }}</div>
        <h2>{{ t('resources.title') }}</h2>
        <p>{{ t('resources.lead') }}</p>
      </div>
    </div>

    <form class="resource-search" @submit.prevent="submitSearch">
      <div class="resource-search-input">
        <Search :size="19" />
        <input
          v-model="query"
          class="input"
          type="search"
          :placeholder="t('resources.placeholder')"
          :aria-label="t('resources.label')"
        />
        <button v-if="query" class="search-clear" type="button" aria-label="Limpar busca" @click="clearSearch">
          <X :size="17" />
        </button>
      </div>
      <button class="btn primary search-submit" type="submit" :disabled="loading">
        <Search :size="16" />
        {{ t('resources.submit') }}
      </button>
    </form>

    <div v-if="query" class="search-summary">
      <strong>{{ t('resources.resultsFor') }}</strong>
      <span>“{{ query }}”</span>
      <button type="button" @click="clearSearch">{{ t('resources.clear') }}</button>
    </div>

    <div v-if="loading && !items.length" class="card resource-search-state">
      <Search :size="24" />
      <strong>{{ t('resources.loading') }}</strong>
      <p>{{ t('resources.loadingHint') }}</p>
    </div>

    <div v-else-if="error && !items.length" class="card resource-search-state">
      <Search :size="26" />
      <strong>{{ t('resources.failure') }}</strong>
      <p>{{ error }}</p>
      <button class="btn ghost" type="button" @click="searchResources(query)">{{ t('common.retry') }}</button>
    </div>

    <div v-else-if="!items.length && !loadingMore" class="card resource-search-state">
      <Search :size="26" />
      <strong>{{ t('resources.empty') }}</strong>
      <p>{{ t('resources.emptyHint') }}</p>
      <button class="btn ghost" type="button" @click="clearSearch">{{ t('resources.seeAll') }}</button>
    </div>

    <template v-else>
      <div class="resource-catalog-meta">
        <span>{{ t('resources.found', items.length) }}</span>
        <span v-if="loadingMore">{{ t('resources.updating') }}</span>
      </div>

      <div class="grid resource-results">
        <RouterLink v-for="resource in items" :key="resource.id" :to="`/resources/${resource.id}`" class="card resource-card">
          <span class="pill">{{ resource.area }}</span>
          <h3>{{ resource.title }}</h3>
          <p>{{ resource.description }}</p>
          <div class="source" style="margin-top: 16px">
            <div class="source-logo">{{ resource.sourcePlatform.name.slice(0, 1) }}</div>
            <div>
              <strong style="font-size: 13px">{{ resource.sourcePlatform.name }}</strong>
              <div style="font-size: 11px; color: #748079">{{ t('resources.by') }} {{ resource.authors.map(author => author.name).join(', ') }}</div>
            </div>
          </div>
          <div class="resource-foot">
            <span>{{ resource.license }}</span>
            <span>✓ {{ t('common.verified') }}</span>
          </div>
        </RouterLink>
      </div>

      <div v-if="loadingMore" class="resource-loading-more">
        {{ t('resources.loadingMore', { page: pagesLoaded }) }}
      </div>
    </template>
  </div>
</template>
