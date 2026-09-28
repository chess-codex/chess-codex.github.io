// Teste dos checadores de fatos: qual IA confere melhor o texto que o redator (GLM) escreve.
// Usa o mesmo CHECK_PROMPT do robô e a mesma referência que ele monta (a matéria baixada e cortada
// pelo extrator). O gabarito (scripts/bench/checker-gold.json) guarda só as nossas frases e os rótulos:
// o texto das matérias é baixado na hora e nunca vai para o repositório.
// Uso: NVIDIA_API_KEY=... GROQ_API_KEY=... node scripts/bench-checker.mjs [modelo ...]
// Mede: erro deixado passar (o pior), frase certa cortada, resposta inválida e tempo.
import { readFileSync } from 'node:fs';

import { essentials, fetchArticle, parseChecks } from './articles.mjs';
import { CHECK_PROMPT } from './prompts.mjs';

const NVIDIA = 'https://integrate.api.nvidia.com/v1/chat/completions';
const GROQ = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT = [
  'z-ai/glm-5.3', // o redator conferindo a si mesmo: a linha de base
  'moonshotai/kimi-k3',
  'moonshotai/kimi-k2.6',
  'deepseek-ai/deepseek-v4.1-flash',
  'nvidia/nemotron-3-super-120b-a12b',
  'nvidia/nemotron-3-ultra-550b-a55b',
  'google/gemma-4-31b-it',
  'mistralai/mistral-large-2-instruct',
  'groq/gpt-oss-120b',
];
const models = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT;
const PARALLEL = 3; // modelos ao mesmo tempo (a NVIDIA limita pedidos por minuto por chave)
const CHECK_TOKENS = 3000;

const gold = JSON.parse(readFileSync(new URL('./bench/checker-gold.json', import.meta.url), 'utf8'));

// referência igual à do robô: "Fonte", "Título" e o trecho essencial da matéria baixada agora
const cases = [];
for (const c of gold.cases) {
  const text = await fetchArticle(c.url);
  if (!text) {
    console.log(`caso ${c.id}: página sem texto, fica de fora`);
    continue;
  }
  cases.push({ ...c, reference: `Fonte: ${c.source}\nTítulo: ${c.title}\n\n${essentials(text)}` });
}
const total = cases.reduce((a, c) => a + c.sentences.length, 0);
console.log(`${cases.length} casos, ${total} frases (${cases.reduce((a, c) => a + c.sentences.filter((s) => !s.expected).length, 0)} com erro)\n`);

function target(model) {
  if (model.startsWith('groq/')) return { url: GROQ, key: process.env.GROQ_API_KEY, model: `openai/${model.slice(5)}` };
  return { url: NVIDIA, key: process.env.NVIDIA_API_KEY, model };
}

// tenta com JSON forçado e raciocínio baixo; se o modelo recusar um dos dois, tira e tenta de novo
const VARIANTS = [
  { response_format: { type: 'json_object' }, reasoning_effort: 'low' },
  { response_format: { type: 'json_object' } },
  {},
];
const works = new Map(); // modelo -> variante aceita

async function call(model, payload) {
  const t = target(model);
  const start = works.has(model) ? works.get(model) : 0;
  for (let v = start; v < VARIANTS.length; v++) {
    const t0 = performance.now();
    let res;
    try {
      res = await fetch(t.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${t.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: t.model,
          temperature: 0.1,
          max_completion_tokens: CHECK_TOKENS,
          ...VARIANTS[v],
          messages: [
            { role: 'system', content: CHECK_PROMPT },
            { role: 'user', content: payload },
          ],
        }),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (e) {
      return { error: `rede/tempo: ${String(e?.message ?? e).slice(0, 60)}`, secs: (performance.now() - t0) / 1000 };
    }
    const secs = (performance.now() - t0) / 1000;
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 20_000));
      v--;
      continue;
    }
    const body = await res.text();
    if (res.status === 400 && v < VARIANTS.length - 1 && /reasoning|response_format|json|unsupported|not support/i.test(body)) continue;
    if (!res.ok) return { error: `HTTP ${res.status}: ${body.slice(0, 100)}`, secs };
    works.set(model, v);
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      return { error: 'corpo inválido', secs };
    }
    const content = data.choices?.[0]?.message?.content ?? '';
    // sem JSON forçado, alguns devolvem texto em volta do objeto
    const json = content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1);
    try {
      return { out: JSON.parse(json), secs, tokens: data.usage?.total_tokens ?? 0, variant: v };
    } catch {
      return { error: `sem JSON (finish ${data.choices?.[0]?.finish_reason})`, secs };
    }
  }
  return { error: 'nenhuma variante aceita', secs: 0 };
}

async function bench(model) {
  const r = { model, passed: 0, caught: 0, falseApprove: 0, falseReject: 0, invalid: 0, secs: [], tokens: 0, misses: [], errors: [] };
  for (const c of cases) {
    const payload = JSON.stringify({ frases: c.sentences.map((s, n) => ({ n: n + 1, texto: s.texto })), referencia: c.reference });
    const res = await call(model, payload);
    r.secs.push(res.secs);
    const checks = res.out ? parseChecks(res.out, c.sentences.length) : null;
    if (!checks) {
      r.invalid += c.sentences.length;
      r.errors.push(`${c.id}: ${res.error ?? 'resposta desalinhada'}`);
      continue;
    }
    r.tokens += res.tokens;
    c.sentences.forEach((s, n) => {
      const v = checks[n].v;
      if (s.expected && v) r.passed++;
      else if (!s.expected && !v) r.caught++;
      else if (!s.expected && v) {
        r.falseApprove++;
        r.misses.push(`deixou passar [${s.trap}] ${s.texto}`);
      } else {
        r.falseReject++;
        r.misses.push(`cortou certa: ${s.texto}`);
      }
    });
  }
  return r;
}

const results = [];
for (let k = 0; k < models.length; k += PARALLEL) {
  results.push(...(await Promise.all(models.slice(k, k + PARALLEL).map(bench))));
}

const errors = cases.reduce((a, c) => a + c.sentences.filter((s) => !s.expected).length, 0);
const rights = total - errors;
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '-');
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
// ordem: menos erro deixado passar, depois menos frase certa cortada, depois mais rápido
results.sort((a, b) => a.falseApprove + a.invalid - (b.falseApprove + b.invalid) || a.falseReject - b.falseReject || median(a.secs) - median(b.secs));
console.log('modelo | erros pegos | erros que passaram | certas cortadas | inválidas | tempo mediano | tokens');
for (const r of results) {
  console.log(
    `${r.model} | ${r.caught}/${errors} (${pct(r.caught, errors)}) | ${r.falseApprove} | ${r.falseReject}/${rights} (${pct(r.falseReject, rights)}) | ${r.invalid} | ${median(r.secs).toFixed(1)}s (máx ${Math.max(0, ...r.secs).toFixed(1)}s) | ${r.tokens}${works.has(r.model) ? ` | variante ${works.get(r.model)}` : ''}`,
  );
}
for (const r of results) {
  if (!r.misses.length && !r.errors.length) continue;
  console.log(`\n${r.model}:`);
  for (const m of [...r.errors, ...r.misses]) console.log(`  - ${m}`);
}
