<script setup lang="ts">
import { computed, ref } from 'vue'
import { verifyResourceWithIpfsApi } from '../api/ipfs'
import type { VerificationStatus } from '../types'
import { ShieldCheck, Upload, AlertTriangle, X, FileCheck2, FileSignature, Clock3, CheckCircle2 } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const file = ref<File>()
const manifest = ref<File>()
const signature = ref<File>()
const ots = ref<File>()
const result = ref<VerificationStatus>()
const loading = ref(false)
const error = ref('')

const signatureInputId = 'verify-signature-file'
const manifestInputId = 'verify-manifest-file'
const otsInputId = 'verify-ots-file'
const originalInputId = 'verify-original-file'

function pick(target: 'file' | 'manifest' | 'signature' | 'ots', event: Event) {
  const selected = (event.target as HTMLInputElement).files?.[0]
  if (!selected) return
  if (target === 'file') file.value = selected
  if (target === 'manifest') manifest.value = selected
  if (target === 'signature') signature.value = selected
  if (target === 'ots') ots.value = selected
  result.value = undefined
  error.value = ''
}

function clear(target: 'file' | 'manifest' | 'signature' | 'ots') {
  if (target === 'file') file.value = undefined
  if (target === 'manifest') manifest.value = undefined
  if (target === 'signature') signature.value = undefined
  if (target === 'ots') ots.value = undefined
  result.value = undefined
}

const evidenceCount = computed(() => [manifest.value, signature.value, ots.value].filter(Boolean).length)
const canVerify = computed(() => Boolean(file.value && manifest.value && signature.value && ots.value))

async function verify() {
  if (!file.value || !manifest.value || !signature.value || !ots.value) return
  loading.value = true
  result.value = undefined
  error.value = ''
  try {
    result.value = await verifyResourceWithIpfsApi({
      file: file.value,
      manifest: manifest.value,
      signature: signature.value,
      ots: ots.value,
    })
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('verify.failure')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="center verify-page">
      <div class="eyebrow">{{ t('verify.eyebrow') }}</div>
      <h1>{{ t('verify.title') }}</h1>
      <p class="lead">
        {{ t('verify.lead') }}
      </p>

      <div class="verification-explainer">
        <div class="explainer-icon"><ShieldCheck :size="22" /></div>
        <div>
          <strong>{{ t('verify.what') }}</strong>
          <p>{{ t('verify.whatText') }}</p>
        </div>
      </div>

      <div class="card verify-card">
        <div class="section-title-row">
          <div>
            <h2>{{ t('verify.original') }}</h2>
            <p>{{ t('verify.originalText') }}</p>
          </div>
          <span class="required-badge">{{ t('common.required') }}</span>
        </div>

        <label class="dropzone dropzone-primary" :class="{ selected: file }" :for="originalInputId">
          <input :id="originalInputId" type="file" @change="pick('file', $event)" />
          <div class="dropzone-content">
            <div class="upload-icon"><Upload :size="25" /></div>
            <strong>{{ file?.name || t('verify.choose') }}</strong>
            <small>{{ file ? `${(file.size / 1000000).toFixed(2)} MB` : t('verify.fileHint') }}</small>
          </div>
        </label>
        <button v-if="file" class="remove-file" type="button" @click="clear('file')">{{ t('verify.remove') }}</button>

        <div class="section-title-row evidence-heading">
          <div>
            <h2>{{ t('verify.evidence') }}</h2>
            <p>{{ t('verify.evidenceText') }}</p>
          </div>
          <span class="evidence-counter">{{ t('verify.selected', { count: evidenceCount }) }}</span>
        </div>

        <div class="evidence-upload-grid">
          <label class="evidence-dropzone" :class="{ selected: manifest }" :for="manifestInputId">
            <input :id="manifestInputId" type="file" accept=".json,.js,application/json,text/javascript,text/plain,application/octet-stream" @change="pick('manifest', $event)" />
            <FileCheck2 :size="24" />
            <span class="evidence-type">MANIFESTO</span>
            <strong>{{ manifest?.name || 'manifest.json' }}</strong>
            <small>{{ manifest ? t('verify.selectedFile') : t('verify.selectEvidence') }}</small>
          </label>

          <label class="evidence-dropzone signature-dropzone" :class="{ selected: signature }" :for="signatureInputId">
            <input :id="signatureInputId" type="file" accept="*/*" @change="pick('signature', $event)" />
            <FileSignature :size="24" />
            <span class="evidence-type">ASSINATURA</span>
            <strong>{{ signature?.name || 'arquivo.sig' }}</strong>
            <small>{{ signature ? t('verify.selectedFile') : t('verify.selectEvidence') }}</small>
          </label>

          <label class="evidence-dropzone" :class="{ selected: ots }" :for="otsInputId">
            <input :id="otsInputId" type="file" accept=".ots,application/octet-stream" @change="pick('ots', $event)" />
            <Clock3 :size="24" />
            <span class="evidence-type">TIMESTAMP</span>
            <strong>{{ ots?.name || 'arquivo.ots' }}</strong>
            <small>{{ ots ? t('verify.selectedFile') : t('verify.selectEvidence') }}</small>
          </label>
        </div>

        <div class="verification-note">
          <CheckCircle2 :size="17" />
          <span>{{ t('verify.note') }}</span>
        </div>

        <div class="actions verify-actions">
          <button class="btn primary verify-button" :disabled="!canVerify || loading" @click="verify">
            <ShieldCheck :size="18" />
            {{ loading ? t('verify.submitting') : t('verify.submit') }}
          </button>
        </div>
        <p v-if="!canVerify && !loading" class="form-hint">{{ t('verify.hint') }}</p>
      </div>

      <div v-if="loading" class="card processing-card">
        <div class="processing-title"><span class="spinner"></span><strong>{{ t('verify.processing') }}</strong></div>
        <p>{{ t('verify.processingText') }}</p>
        <div class="progress"><i></i></div>
      </div>

      <div v-if="error" class="card error-card">
        <div class="status bad"><strong><X :size="18" /> {{ t('verify.failure') }}</strong><p>{{ error }}</p></div>
      </div>

      <div v-if="result" class="card result-card">
        <div v-if="result.overall === 'verified'" class="status ok">
          <strong><ShieldCheck :size="18" /> {{ t('verify.authentic') }}</strong>
          <p>{{ t('verify.authenticText') }}</p>
        </div>
        <div v-else-if="result.overall === 'altered'" class="status warn">
          <strong><AlertTriangle :size="18" /> {{ t('verify.altered') }}</strong>
          <p>{{ result.details[0] }}</p>
        </div>
        <div v-else class="status bad">
          <strong><X :size="18" /> {{ t('verify.unconfirmed') }}</strong>
          <p>{{ result.details[0] }}</p>
        </div>

        <div class="detail-list">
          <div class="detail"><b>{{ t('verify.integrity') }}</b>{{ result.integrity ? t('verify.confirmed') : t('verify.notConfirmed') }}</div>
          <div class="detail"><b>{{ t('verify.signature') }}</b>{{ result.signature ? t('verify.valid') : t('verify.invalid') }}</div>
          <div class="detail"><b>{{ t('verify.authorship') }}</b>{{ result.authorship ? t('verify.verifiable') : t('verify.notVerified') }}</div>
          <div class="detail"><b>{{ t('verify.timestamp') }}</b>{{ result.timestamp ? t('verify.confirmed') : t('verify.notConfirmed') }}</div>
        </div>

        <details style="margin-top:20px">
          <summary>{{ t('verify.technical') }}</summary>
          <ul><li v-for="d in result.details" :key="d">{{ d }}</li></ul>
        </details>
      </div>
    </div>
  </div>
</template>
