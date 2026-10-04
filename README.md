# REAVERSO

O REAverso (REA + FEDIVERSO) é uma aplicação web para publicação e compartilhamento de Recursos Educacionais Abertos (REA) em uma rede Federava baseada em Pleroma.

<p align="center">
   <img src="public/reaverso-removebg-preview.png" />
</p>

## Idiomas

A interface detecta o idioma do navegador e permite alternar entre **Português (Brasil)**, **English** e **Español** pelo seletor no cabeçalho. A escolha fica salva no navegador e é reaplicada nas próximas visitas.

As traduções ficam centralizadas em `src/i18n/index.ts`. Para adicionar outro idioma, inclua o código em `supportedLocales` e forneça o mesmo conjunto de mensagens usado pelos idiomas existentes. O português brasileiro é o idioma de fallback.
