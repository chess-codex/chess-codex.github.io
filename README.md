# Chess Codex — Gazeta de Xadrez

App de notícias de xadrez em **micro-artigos com contexto**: o meio-termo entre o artigo longo do Chess.com e o post de blog do Lichess. Leitura de cerca de 90 segundos, com tabuleiro interativo dentro da notícia.

Foco inicial: **Google Play**, **sem backend e sem banco de dados**.

## Rodar

```bash
npm install
npx expo start          # abre no celular pelo Expo Go (QR code)
npx expo start --web    # prévia no navegador (usa o snapshot; o navegador bloqueia RSS por CORS)
```

Atualizar o snapshot embutido (notícias e fotos reais para a primeira abertura e o modo offline):

```bash
node scripts/snapshot.mjs
```

Extrair partidas de um PGN de broadcast do Lichess (gratuito) para o "Desafio da notícia":

```bash
curl -s https://lichess.org/api/broadcast/round/<roundId>.pgn -o scripts/r9.pgn
node scripts/games.mjs scripts/r9.pgn "Gukesh" "Sindarov"
```

## Robô de redação (IA, Groq)

`scripts/digest.mjs` baixa os feeds, traduz e resume cada link em PT e agrupa notícias do mesmo fato em histórias. Cada item mantém o link da fonte original.

```bash
GROQ_API_KEY=... node scripts/digest.mjs
```

Em produção roda sozinho a cada 3 horas pelo GitHub Actions (`.github/workflows/digest.yml`) e publica `docs/digest.json` no GitHub Pages. Depois, é só colocar a URL em `src/data/config.ts`. Sem chave, o app mostra a edição de exemplo e as manchetes originais.

## Arquitetura (custo zero)

- **Local-first**: o celular baixa os RSS direto (Chess.com, FIDE, ChessBase, Lichess, blogs do Lichess, r/chess). Não existe servidor.
- **Salvos e ajustes** ficam no AsyncStorage do aparelho. Não há conta nem login.
- **Fotos**: vêm do RSS; quando o feed não traz foto (Chess.com, ChessBase), o app lê a `og:image` da página.
- **Edição do dia** (`src/data/edition.ts`): micro-artigos em PT. Em produção vira um JSON publicado de graça no GitHub Pages.
- **Partidas**: PGN da API de broadcast do Lichess, com avaliação do motor lance a lance. O "lance da virada" é detectado automaticamente pela maior oscilação de avaliação.

## Estrutura

```
src/app/             rotas (Expo Router): (tabs)/index Hoje, feed Agora, radar Radar, saved Salvos, story/[id], settings
src/components/      ui.tsx (cards, cabeçalho, anti-spoiler), MiniBoard.tsx (tabuleiro + desafio), pieces.ts
src/lib/             rss.ts, store.tsx (estado local), spoiler.ts, theme.ts, time.ts
src/data/            sources.ts, edition.ts, games.json, snapshot.json
scripts/             snapshot.mjs, games.mjs
```

## Publicar na Play Store

```bash
npx eas-cli@latest build --platform android --profile production
npx eas-cli@latest submit --platform android
```

Custo: US$ 25, pago uma vez, pela conta de desenvolvedor Google Play. O build roda na nuvem do EAS (plano grátis).

## Créditos

Peças "Chessnut" de Alexis Luengas, licença Apache 2.0.
