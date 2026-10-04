<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ExternalLink, ShieldCheck, Download, LoaderCircle, CheckCircle2, AlertTriangle, X } from 'lucide-vue-next'
import { getResource } from '../api'
import { listMyPleromaResources } from '../api/resources'
import { verifyResourceIdentity, type IpfsVerificationResult } from '../api/ipfs'
import type { Resource } from '../types'

const route = useRoute()
const r = ref<Resource>()
const loading = ref(true)
const verifyingIdentity = ref(false)
const identityVerification = ref<IpfsVerificationResult>()
const identityError = ref('')

async function verifyIdentity() {
  if (!r.value?.ipfs?.cid || !r.value.ipfs.manifestUrl || !r.value.ipfs.signatureUrl) return

  const extractCid = (url: string) => {
    const match = url.match(/\/ipfs\/([^/?#]+)/)
    return match?.[1] || ''
  }
  const manifestCid = extractCid(r.value.ipfs.manifestUrl)
  const signatureCid = extractCid(r.value.ipfs.signatureUrl)
  const timestampCid = r.value.ipfs.timestampUrl ? extractCid(r.value.ipfs.timestampUrl) : undefined
  if (!manifestCid || !signatureCid) {
    identityError.value = 'As evidências criptográficas publicadas não possuem CIDs válidos.'
    return
  }

  verifyingIdentity.value = true
  identityError.value = ''
  identityVerification.value = undefined
  try {
    identityVerification.value = await verifyResourceIdentity({
      cid: r.value.ipfs.cid,
      manifestCid,
      signatureCid,
      ...(timestampCid ? { timestampCid } : {}),
      ...(r.value.authors[0]?.id ? { expectedSignerId: r.value.authors[0].id } : {}),
    })
  } catch (error) {
    identityError.value = error instanceof Error ? error.message : 'Não foi possível verificar a identidade IPFS.'
  } finally {
    verifyingIdentity.value = false
  }
}

onMounted(async () => {
  const id = String(route.params.id)
  try {
    r.value = await getResource(id)
    if (!r.value && id.startsWith('pleroma-')) {
      const resources = await listMyPleromaResources()
      r.value = resources.find(resource => resource.id === id)
    }
    if (r.value?.ipfs?.cid && r.value.ipfs.manifestUrl && r.value.ipfs.signatureUrl) {
      await verifyIdentity()
    }
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="page resource-page" v-if="r">
    <div class="center resource-content">
      <div class="eyebrow">Recurso educacional aberto</div>
      <h1 class="resource-title">{{ r.title }}</h1>
      <p class="lead resource-description">{{ r.description }}</p>

      <div class="source resource-source">
        <div class="source-logo">{{ r.sourcePlatform.name.slice(0, 1) }}</div>
        <div class="source-details"><strong>{{ r.sourcePlatform.name }}</strong><div>Plataforma de origem · {{ r.authors.map(a => a.name).join(', ') }}</div></div>
        <a class="source-link" :href="r.originalUrl" target="_blank" rel="noopener noreferrer"><ExternalLink :size="17" /></a>
      </div>

      <div class="status ok publication-status">
        <strong>✓ Publicado na instância Pleroma</strong>
        <div>O recurso foi recuperado diretamente da publicação federada.</div>
      </div>

      <div class="detail-list resource-details">
        <div class="detail"><b>Arquivo</b>{{ r.fileName }}</div>
        <div class="detail"><b>Tamanho</b>{{ r.fileSize ? `${(r.fileSize / 1000000).toFixed(1)} MB` : 'Informado pela instância na publicação' }}</div>
        <div class="detail"><b>Licença</b>{{ r.license || 'Não informada' }}</div>
        <div class="detail"><b>Publicado</b>{{ r.publishedAt }}</div>
      </div>

      <div v-if="r.ipfs" class="card ipfs-card">
        <div class="section-title-row">
          <div><h3>Identidade IPFS</h3><p>O recurso possui uma identidade independente do anexo de mídia do Pleroma.</p></div>
          <ShieldCheck :size="21" />
        </div>
        <div class="detail-list">
          <div class="detail"><b>CID</b><a :href="r.ipfs.url" target="_blank" rel="noopener noreferrer">{{ r.ipfs.cid }}</a></div>
          <div class="detail"><b>SHA-256</b><span class="break-word">{{ r.ipfs.sha256 || 'Não informado' }}</span></div>
          <div v-if="r.ipfs.manifestUrl" class="detail"><b>Manifesto</b><a :href="r.ipfs.manifestUrl" target="_blank" rel="noopener noreferrer">Abrir evidência</a></div>
          <div v-if="r.ipfs.signatureUrl" class="detail"><b>Assinatura</b><a :href="r.ipfs.signatureUrl" target="_blank" rel="noopener noreferrer">Abrir evidência</a></div>
          <div v-if="r.ipfs.timestampUrl" class="detail"><b>Timestamp OTS</b><a :href="r.ipfs.timestampUrl" target="_blank" rel="noopener noreferrer">Abrir evidência</a></div>
        </div>

        <div class="identity-verify-panel">
          <div class="identity-verify-head">
            <div class="identity-verify-copy">
              <strong>Verificação automática</strong>
              <p>A checagem segue a cadeia: assinatura → OTS → CID → hash → autoria. Primeiro usa os arquivos salvos localmente; só consulta o IPFS quando uma evidência ainda não estiver em cache.</p>
            </div>
            <button class="btn secondary identity-verify-button" type="button" :disabled="verifyingIdentity || !r.ipfs.manifestUrl || !r.ipfs.signatureUrl" @click="verifyIdentity">
              <LoaderCircle v-if="verifyingIdentity" class="spin" :size="17" />
              <ShieldCheck v-else :size="17" />
              {{ verifyingIdentity ? 'Verificando…' : 'Verificar' }}
            </button>
          </div>

          <div v-if="identityError" class="identity-result identity-result-bad">
            <X :size="20" />
            <div><strong>Não foi possível verificar</strong><p>{{ identityError }}</p></div>
          </div>

          <div v-else-if="identityVerification" class="identity-result" :class="identityVerification.overall === 'verified' ? 'identity-result-ok' : identityVerification.overall === 'pending' ? 'identity-result-pending' : 'identity-result-bad'">
            <X v-if="identityVerification.overall !== 'verified' && identityVerification.overall !== 'pending'" :size="22" />
            <AlertTriangle v-else-if="identityVerification.overall === 'pending'" :size="22" />
            <CheckCircle2 v-else :size="22" />
            <div>
              <strong>{{ identityVerification.overall === 'verified' ? 'Autenticidade confirmada' : identityVerification.overall === 'pending' ? 'Identidade confirmada, timestamp pendente' : 'Autenticidade não confirmada' }}</strong>
              <p>{{ identityVerification.signer?.acct ? `Assinado por ${identityVerification.signer.acct}.` : 'A identidade criptográfica foi localizada no manifesto.' }}</p>
              <small v-if="identityVerification.signatureError">{{ identityVerification.signatureError }}</small>
            </div>
          </div>

          <div v-if="identityVerification?.steps?.length" class="identity-checks identity-checks-steps">
            <div v-for="step in identityVerification.steps" :key="step.id" class="identity-step" :class="`identity-step-${step.status}`">
              <span class="identity-step-icon">
                <CheckCircle2 v-if="step.status === 'valid'" :size="19" />
                <AlertTriangle v-else-if="step.status === 'pending'" :size="19" />
                <X v-else :size="19" />
              </span>
              <span class="identity-step-content"><b>{{ step.label }}</b><small>{{ step.detail }}</small></span>
            </div>
          </div>

          <div v-if="identityVerification?.source" class="identity-source">
            Recurso: <b>{{ identityVerification.source.resource === 'local-cache' ? 'cache local' : 'IPFS' }}</b> ·
            Manifesto: <b>{{ identityVerification.source.manifest === 'local-cache' ? 'cache local' : 'IPFS' }}</b> ·
            Assinatura: <b>{{ identityVerification.source.signature === 'local-cache' ? 'cache local' : 'IPFS' }}</b> ·
            Timestamp: <b>{{ identityVerification.source.timestamp === 'local-cache' ? 'cache local' : identityVerification.source.timestamp === 'not-published' ? 'não publicado' : 'IPFS' }}</b> ·
            Chave: <b>{{ identityVerification.source.publicKey === 'local-cache' ? 'cache local' : identityVerification.publicKeySource === 'ipfs-public-key' ? 'IPFS' : 'backend' }}</b>
          </div>
        </div>
      </div>

      <div class="actions resource-actions">
        <a class="btn primary" :href="r.originalUrl" target="_blank" rel="noopener noreferrer"><Download :size="17" /> Abrir arquivo/publicação</a>
        <a class="btn ghost" :href="r.originalUrl" target="_blank" rel="noopener noreferrer"><ExternalLink :size="17" /> Ver no Pleroma</a>
        <button v-if="r.ipfs" class="btn ghost" type="button" @click="verifyIdentity"><ShieldCheck :size="17" /> Verificar identidade</button>
      </div>
    </div>
  </div>
  <div v-else-if="loading" class="page"><div class="center">Carregando recurso…</div></div>
  <div v-else class="page"><div class="center"><h2>Recurso não encontrado</h2><p>O recurso pode ter sido removido ou a sessão do Pleroma expirou.</p></div></div>
</template>

<style>
.resource-page {
  max-width: 1180px;
  padding-top: 42px;
  padding-bottom: 48px;
}

.resource-content {
  width: 100%;
  max-width: 1120px;
}

.resource-title {
  margin: 10px 0 14px;
  font: 600 clamp(30px, 4vw, 46px)/1.12 'Space Grotesk', sans-serif;
  letter-spacing: -1px;
}

.resource-description {
  max-width: 820px;
  margin: 0;
  white-space: pre-line;
}

.resource-source {
  margin: 28px 0 18px;
}

.source-details {
  min-width: 0;
  flex: 1;
}

.source-details > div {
  margin-top: 3px;
  color: #748079;
  font-size: 12px;
}

.source-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: auto;
  padding: 8px;
  border-radius: 9px;
  color: #52665a;
}

.source-link:hover {
  background: #e1ebe4;
}

.publication-status {
  margin: 18px 0;
}

.publication-status > div {
  margin-top: 5px;
  font-size: 13px;
}

.resource-details {
  margin-bottom: 18px;
}

.ipfs-card {
  margin-top: 0;
  background: #f8faf8;
  padding: 24px;
}

.ipfs-card .section-title-row h3 {
  margin: 0;
  font: 600 22px 'Space Grotesk', sans-serif;
}

.break-word {
  overflow-wrap: anywhere;
  word-break: break-word;
}

.identity-verify-panel {
  margin-top: 22px;
}

.identity-verify-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 20px;
}

.identity-verify-copy {
  min-width: 0;
  max-width: 820px;
}

.identity-verify-copy > strong {
  display: block;
  font: 600 20px 'Space Grotesk', sans-serif;
  color: #263b30;
}

.identity-verify-copy p {
  margin: 6px 0 0;
  color: #748079;
  font-size: 13px;
  line-height: 1.65;
}

.identity-verify-button {
  flex: 0 0 auto;
  min-height: 42px;
  white-space: nowrap;
}

.identity-result {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  width: 100%;
  padding: 25px 28px;
  border: 1px solid transparent;
  border-radius: 16px;
  margin: 0 0 18px;
}

.identity-result > svg {
  flex: 0 0 auto;
  margin-top: 2px;
}

.identity-result strong {
  display: block;
  font: 700 24px/1.2 'Space Grotesk', sans-serif;
}

.identity-result p {
  margin: 8px 0 0;
  font-size: 16px;
  line-height: 1.5;
}

.identity-result small {
  display: block;
  margin-top: 8px;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.identity-result-ok {
  background: #edf8f0;
  border-color: #bfe4cb;
  color: #135b38;
}

.identity-result-pending {
  background: #fff7df;
  border-color: #f0dca1;
  color: #7a5b16;
}

.identity-result-bad {
  background: #fff0ee;
  border-color: #f3c8c3;
  color: #9f3328;
}

.identity-checks {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 18px;
}

.identity-step {
  display: flex;
  align-items: flex-start;
  gap: 18px;
  min-width: 0;
  min-height: 128px;
  padding: 25px 24px;
  border: 1px solid #c9e5d1;
  border-radius: 16px;
  background: #edf8f0;
  color: #215b3c;
}

.identity-step-icon {
  display: grid;
  place-items: center;
  flex: 0 0 40px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #f8fbf9;
  color: #6e8177;
}

.identity-step-content {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 8px;
}

.identity-step-content b {
  font: 600 20px/1.2 'Space Grotesk', sans-serif;
  color: #64746b;
}

.identity-step-content small {
  color: #718179;
  font-size: 15px;
  line-height: 1.5;
}

.identity-step-pending {
  background: #fff7df;
  border-color: #f0dca1;
  color: #7a5b16;
}

.identity-step-pending .identity-step-content b,
.identity-step-pending .identity-step-content small {
  color: #7a5b16;
}

.identity-step-invalid,
.identity-step-failed {
  background: #fff0ee;
  border-color: #f3c8c3;
  color: #9f3328;
}

.identity-step-invalid .identity-step-content b,
.identity-step-invalid .identity-step-content small,
.identity-step-failed .identity-step-content b,
.identity-step-failed .identity-step-content small {
  color: #9f3328;
}

.identity-source {
  margin-top: 18px;
  padding: 18px 0 0;
  border-top: 1px solid #e1e6e2;
  color: #748079;
  font-size: 13px;
  line-height: 2;
  overflow-wrap: anywhere;
}

.identity-source b {
  color: #243e2e;
}

.resource-actions {
  flex-wrap: wrap;
  margin-top: 28px;
}

@media (max-width: 800px) {
  .resource-page {
    padding: 28px 16px 36px;
  }

  .ipfs-card {
    padding: 18px;
  }

  .identity-verify-head {
    flex-direction: column;
    gap: 14px;
  }

  .identity-verify-button {
    width: 100%;
  }

  .identity-checks {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .identity-step {
    min-height: 0;
    padding: 20px;
  }

  .identity-result {
    padding: 20px;
  }

  .identity-result strong {
    font-size: 20px;
  }

  .identity-result p {
    font-size: 14px;
  }

  .resource-actions .btn {
    width: 100%;
  }
}
</style>
