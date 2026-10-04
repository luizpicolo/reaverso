<script setup lang="ts">
import { Languages } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { setLocale, supportedLocales, type SupportedLocale } from '../i18n'

const { locale, t } = useI18n()

function change(event: Event) {
  setLocale((event.target as HTMLSelectElement).value as SupportedLocale)
}
</script>

<template>
  <label class="language-selector" :aria-label="t('language.label')">
    <Languages :size="15" />
    <select :value="locale" :title="t('language.label')" @change="change">
      <option v-for="item in supportedLocales" :key="item.code" :value="item.code">
        {{ item.short }}
      </option>
    </select>
  </label>
</template>
