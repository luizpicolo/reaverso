# REAVERSO

O REAverso (REA + FEDIVERSO) é uma aplicação web para publicação e compartilhamento de Recursos Educacionais Abertos (REA) em uma rede Federava baseada em Pleroma.

<p align="center">
   <img src="public/reaverso-removebg-preview.png" />
</p>

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
