// Coloca no index.html do site as tags que o WhatsApp, o Telegram, o X e o Google leem para
// montar a prévia do link (título, descrição e a imagem docs/og.png). Roda depois do "expo export".
// Uso: node scripts/seo.mjs
import { readFileSync, writeFileSync } from 'node:fs';

import { SITE_URL } from './site.mjs';

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
  `<meta property="og:image" content="${SITE_URL}/og.png">`,
  `<meta property="og:image:width" content="1200">`,
  `<meta property="og:image:height" content="630">`,
  `<meta property="og:image:alt" content="Coruja do Chess Codex com um jornal de xadrez no bico">`,
  `<meta name="twitter:card" content="summary_large_image">`,
  `<meta name="twitter:title" content="${TITLE}">`,
  `<meta name="twitter:description" content="${DESCRIPTION}">`,
  `<meta name="twitter:image" content="${SITE_URL}/og.png">`,
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
