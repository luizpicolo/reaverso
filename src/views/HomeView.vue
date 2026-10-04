<script setup lang="ts">
import { ArrowRight, Network, Radio, ShieldCheck, Users } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <div class="page">
    <section class="hero">
      <div>
        <div class="eyebrow">{{ t('home.eyebrow') }}</div>
        <h1>{{ t('home.title') }}<br><span>{{ t('home.titleAccent') }}</span></h1>
        <p class="lead">{{ t('home.lead') }}</p>
        <div class="actions">
          <RouterLink class="btn primary" to="/feed">{{ t('home.openFeed') }} <ArrowRight :size="17" /></RouterLink>
          <RouterLink class="btn ghost" to="/federation"><Network :size="17" /> {{ t('home.discover') }}</RouterLink>
        </div>
      </div>
      <div class="trust-card">
        <div class="trust-icon"><Radio :size="30" /></div>
        <h3>{{ t('home.networkTitle') }}</h3>
        <p class="lead" style="font-size:14px">{{ t('home.networkText') }}</p>
        <div class="checks">
          <div class="check"><Users :size="17" /> {{ t('home.followPlatforms') }}</div>
          <div class="check"><Radio :size="17" /> {{ t('home.receive') }}</div>
          <div class="check"><Network :size="17" /> {{ t('home.preserve') }}</div>
          <div class="check"><ShieldCheck :size="17" /> {{ t('home.verifyAuthorship') }}</div>
        </div>
      </div>
    </section>
    <section style="margin-top:70px">
      <div class="section-head"><div><div class="eyebrow">{{ t('home.how') }}</div><h2>{{ t('home.flow') }}</h2></div></div>
      <div class="grid">
        <div class="card"><Network /><h3>{{ t('home.step1') }}</h3><p>{{ t('home.step1Text') }}</p></div>
        <div class="card"><Users /><h3>{{ t('home.step2') }}</h3><p>{{ t('home.step2Text') }}</p></div>
        <div class="card"><Radio /><h3>{{ t('home.step3') }}</h3><p>{{ t('home.step3Text') }}</p></div>
      </div>
    </section>
  </div>
</template>
