# REAVERSO

O REAverso (REA + FEDIVERSO) é uma aplicação web para publicação e compartilhamento de Recursos Educacionais Abertos (REA) em uma rede Federava baseada em Pleroma.

<p align="center">
   <img src="public/reaverso-removebg-preview.png" />
</p>

## Idiomas

A interface detecta o idioma do navegador e permite alternar entre **Português (Brasil)**, **English** e **Español** pelo seletor no cabeçalho. A escolha fica salva no navegador e é reaplicada nas próximas visitas.

As traduções ficam centralizadas em `src/i18n/index.ts`. Para adicionar outro idioma, inclua o código em `supportedLocales` e forneça o mesmo conjunto de mensagens usado pelos idiomas existentes. O português brasileiro é o idioma de fallback.

## Identificação de Recursos Educacionais Abertos

O aplicativo exibe nos catálogos e feeds somente publicações reconhecidas como REA. Novas publicações recebem o marcador estável `[REA.fed:v1]` e a tag `#REA`. Para impedir que uma publicação comum entre no feed apenas pelo uso da tag, a leitura também exige um arquivo anexado, título no formato REA.fed, licença Creative Commons aberta e as referências de IPFS, SHA-256, manifesto e assinatura.

Publicações criadas por versões anteriores, sem o marcador versionado, continuam aceitas quando possuem toda essa estrutura. O protocolo usa campos estáveis no conteúdo federado e independe do idioma escolhido para a interface.

## Testes automatizados

A suíte não depende de instâncias públicas. Pleroma, Kubo/IPFS e OpenTimestamps são simulados nos testes unitários, de componentes e de aceitação. O E2E inicia somente o Vite local e intercepta as APIs no navegador. Os testes de integração exercitam a aplicação Express real com diretórios temporários e requisições HTTP em memória.

Use Node.js 20 ou superior e instale as dependências dos dois pacotes:

```bash
npm install
npm --prefix backend install
PLAYWRIGHT_BROWSERS_PATH=.playwright-browsers npx playwright install chromium
```

Comandos disponíveis:

```bash
npm run test:unit         # funções do frontend, autenticação, parsing e cliente IPFS
npm run test:component    # telas Vue de login, publicação e verificação
npm run test:acceptance   # comportamento do catálogo e navegação
npm run test:integration  # endpoints Express e fluxo criptográfico real
npm run test:e2e          # login, navegação, publicação e verificação no Chromium
npm run test:coverage     # cobertura frontend e backend
npm run test:all          # todas as camadas, incluindo E2E
npm run lint
npm run typecheck
npm run build
```

Os relatórios HTML de cobertura são gravados em `coverage/` e `backend/coverage/`. Falhas E2E preservam um trace em `test-results/` para inspeção pelo Playwright.

## Integração contínua

O workflow `.github/workflows/ci.yml` roda automaticamente em pull requests e em pushes para `main`. Ele executa lint, typecheck, build, testes frontend e backend com cobertura e o E2E no Chromium. Relatórios de cobertura, traces e resultados do Playwright ficam disponíveis como artefatos da execução durante sete dias.
