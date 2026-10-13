/** Neighbourhoods of Tema, used as a type-ahead when a customer can't share their location. Names only — no coordinates. */
export const TEMA_AREAS: string[] = [
  ...Array.from({ length: 25 }, (_, i) => `Community ${i + 1}`),
  'Tema New Town',
  'Tema Manhean',
  'Tema Industrial Area',
  'Sakumono',
  'Lashibi',
  'Kpone',
  'Baatsona',
  'Ashaiman',
  'Nungua',
  'Adjei Kojo',
  'Klagon',
  'Michel Camp',
  'Appolonia',
];

export function matchAreas(query: string, limit = 6): string[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!q) return [];
  const starts = TEMA_AREAS.filter((a) => a.toLowerCase().startsWith(q));
  const contains = TEMA_AREAS.filter((a) => !a.toLowerCase().startsWith(q) && a.toLowerCase().replace(/^community /, 'c').includes(q.replace(/^community /, 'c')));
  return [...starts, ...contains].slice(0, limit);
}
