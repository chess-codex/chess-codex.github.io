import { categoryKey } from './store';

// Comparação de manchetes: o mesmo fato vindo de fontes diferentes (ou traduzido de outro jeito)
// não aparece duas vezes, e o destaque sem texto aproveita o texto da matéria irmã.

// manchetes quase iguais de fontes diferentes contam como repetição
export const titleKey = (s: string) => categoryKey(s).replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 48);
// palavras que identificam a manchete: 4 letras ou mais, e números ("Rodada 9" e "Rodada 10" diferem)
export const titleWords = (s: string) => new Set(categoryKey(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 || /^\d+$/.test(w)));
// sobreposição de palavras (Jaccard); 0,6 ou mais = mesma notícia com tradução diferente
export function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const w of a) if (b.has(w)) common++;
  return common / (a.size + b.size - common);
}
export const similar = (a: Set<string>, b: Set<string>) => overlap(a, b) >= 0.6;

// mesmo fato contado com outras palavras (post de rede sobre a notícia do Hoje): 3 ou mais palavras
// em comum e metade da manchete menor. Jaccard deixa passar "Uzbequistão vence a Olimpíada" contra
// "Uzbequistão conquista ouro na Olimpíada em Samarcanda"
export function sameFact(a: Set<string>, b: Set<string>): boolean {
  let common = 0;
  for (const w of a) if (b.has(w)) common++;
  return common >= 3 && common / Math.min(a.size, b.size) >= 0.5;
}
