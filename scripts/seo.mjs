// Coloca no index.html do site as tags que o WhatsApp, o Telegram, o X e o Google leem para
// montar a prévia do link (título, descrição e a imagem docs/og.jpg). Roda depois do "expo export".
// Uso: node scripts/seo.mjs
import { readFileSync, writeFileSync } from 'node:fs';

import { SITE_URL } from './site.mjs';

// suba quando trocar docs/og.jpg
const OG_VERSION = 2;
const TITLE = 'Chess Codex · Notícias de xadrez';
const DESCRIPTION = 'As notícias de xadrez do dia em português, resumidas, com as partidas decisivas e o desafio no tabuleiro.';

const tags = [
  `<meta name="description" content="${DESCRIPTION}">`,
  `<meta property="og:type" content="website">`,
  `<meta property="og:site_name" content="Chess Codex">`,
  `<meta property="og:locale" content="pt_BR">`,
  `<meta property="og:title" content="${TITLE}">`,
  `<meta property="og:description" content="${DESCRIPTION}">`,
  `<meta property="og:url" content="${SITE_URL}/">`,
  // JPEG nítido (o WhatsApp recomprime PNG e borra); o ?v= força o WhatsApp a buscar de novo
  // quando a capa muda, porque ele guarda a prévia de cada endereço
  `<meta property="og:image" content="${SITE_URL}/og.jpg?v=${OG_VERSION}">`,
  `<meta property="og:image:secure_url" content="${SITE_URL}/og.jpg?v=${OG_VERSION}">`,
  `<meta property="og:image:type" content="image/jpeg">`,
  `<meta property="og:image:width" content="1200">`,
  `<meta property="og:image:height" content="630">`,
  `<meta property="og:image:alt" content="Coruja do Chess Codex com um jornal de xadrez no bico">`,
  // quadrada para a miniatura pequena (sem cortar a coruja no meio)
  `<meta property="og:image" content="${SITE_URL}/og-square.jpg?v=${OG_VERSION}">`,
  `<meta property="og:image:type" content="image/jpeg">`,
  `<meta property="og:image:width" content="600">`,
  `<meta property="og:image:height" content="600">`,
  `<meta name="twitter:card" content="summary_large_image">`,
  `<meta name="twitter:title" content="${TITLE}">`,
  `<meta name="twitter:description" content="${DESCRIPTION}">`,
  `<meta name="twitter:image" content="${SITE_URL}/og.jpg?v=${OG_VERSION}">`,
  `<link rel="canonical" href="${SITE_URL}/">`,
].join('\n    ');

const file = new URL('../dist/index.html', import.meta.url);
let html = readFileSync(file, 'utf8');
if (!html.includes('og:image')) {
  html = html
    .replace(/<html[^>]*>/, '<html lang="pt-BR">')
    .replace(/<title>[^<]*<\/title>/, `<title>${TITLE}</title>`)
    .replace('</head>', `    ${tags}\n  </head>`);
  writeFileSync(file, html);
}
console.log('prévia do link: ok');
