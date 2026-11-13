/**
 * Telugu renderings of the place and festival names on the board.
 *
 * The desk is built for Telugu travellers going home for a festival, and until
 * now every place name on it was English-only. This is a client-side dictionary
 * rather than a column on `utsav_corridors`: the ledger holds one name per city,
 * and a second language is a presentation concern. If the board grows past a
 * dozen corridors, or a second language arrives, this belongs in the database and
 * the reasoning in docs/adr/0005 stops applying.
 *
 * Two rules keep it honest:
 *
 * 1. **All of a label translates, or none of it does.** `teluguFor` returns null
 *    unless every token in the label is known, so the UI never shows
 *    "విజయవాడ (Somewhere)" — a half-translated name reads like a mistake, and a
 *    reader who does not know either language cannot tell which half to trust.
 *
 * 2. **Separators are preserved exactly.** "Guntur / Amaravati" and
 *    "Vijayawada (Amaravati)" carry meaning in their punctuation, so the shape of
 *    the English label is rebuilt around the Telugu tokens rather than flattened.
 *
 * There is no webfont for this. Noto Sans Telugu is ~36 kB of woff2 for the
 * Telugu subset alone, on every corridor page, to render one secondary line — and
 * every platform this desk targets already ships a Telugu face. `.telugu` in
 * src/index.css names those faces so the fallback is a choice rather than luck.
 */

/** Place names, lowercased on lookup. Cities and the localities inside them. */
const PLACES: Record<string, string> = {
  amaravati: 'అమరావతి',
  anantapur: 'అనంతపురం',
  bengaluru: 'బెంగళూరు',
  bhimavaram: 'భీమవరం',
  chennai: 'చెన్నై',
  chittoor: 'చిత్తూరు',
  delhi: 'ఢిల్లీ',
  eluru: 'ఏలూరు',
  gachibowli: 'గచ్చిబౌలి',
  guntur: 'గుంటూరు',
  hyderabad: 'హైదరాబాద్',
  kadapa: 'కడప',
  kakinada: 'కాకినాడ',
  kilambakkam: 'కిలాంబాక్కం',
  kurnool: 'కర్నూలు',
  machilipatnam: 'మచిలీపట్నం',
  narsaraopet: 'నరసరావుపేట',
  nellore: 'నెల్లూరు',
  'new delhi': 'న్యూ ఢిల్లీ',
  nizamabad: 'నిజామాబాద్',
  ongole: 'ఒంగోలు',
  rajahmundry: 'రాజమహేంద్రవరం',
  'silk board': 'సిల్క్ బోర్డ్',
  tadepalligudem: 'తాడేపల్లిగూడెం',
  tenali: 'తెనాలి',
  tirupati: 'తిరుపతి',
  vijayawada: 'విజయవాడ',
  visakhapatnam: 'విశాఖపట్నం',
  warangal: 'వరంగల్',
};

/** Festival labels, matched whole: their wording is fixed by the request form. */
const FESTIVALS: Record<string, string> = {
  'sankranti 2027': 'సంక్రాంతి 2027',
  'ugadi 2027': 'ఉగాది 2027',
  'dasara 2027': 'దసరా 2027',
  'kartika purnima / winter wedding peak': 'కార్తీక పూర్ణిమ / శీతాకాల వివాహాల సీజన్',
  'kartika purnima · winter wedding peak': 'కార్తీక పూర్ణిమ · శీతాకాల వివాహాల సీజన్',
  'summer vacation peak 2027': 'వేసవి సెలవుల సీజన్ 2027',
  'other / flexible': 'ఇతరం / సౌకర్యం ప్రకారం',
};

/** Punctuation that separates place tokens, kept so the shape survives. */
const SEPARATORS = /(\s*[/()·,—-]\s*)/;

/**
 * The Telugu rendering of a place label, or null when any part of it is unknown.
 *
 * `lang="te"` belongs on whatever element renders the result: a screen reader
 * switches voice on it, and hyphenation and line breaking differ.
 */
export function teluguFor(label: string): string | null {
  const trimmed = label.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(SEPARATORS);
  let sawPlace = false;

  const translated = parts.map((part, index) => {
    // Odd indices are the separators the capture group kept.
    if (index % 2 === 1) return part;
    const token = part.trim();
    if (!token) return part;
    const found = PLACES[token.toLowerCase()];
    if (!found) return null;
    sawPlace = true;
    // Preserve the whitespace that surrounded the English token.
    const lead = part.slice(0, part.length - part.trimStart().length);
    const trail = part.slice(part.trimEnd().length);
    return `${lead}${found}${trail}`;
  });

  if (!sawPlace || translated.some((part) => part === null)) return null;
  return translated.join('');
}

/** The Telugu rendering of a festival label, or null when it is not one we know. */
export function teluguFestival(label: string): string | null {
  return FESTIVALS[label.trim().toLowerCase()] ?? null;
}

/**
 * True when a label is rendered in Telugu anywhere in the app. Used by the render
 * check to keep the dictionary honest: a city on the board with no Telugu name is
 * a gap a reader would notice and a maintainer would not.
 */
export function teluguCoverage(labels: string[]): { covered: string[]; missing: string[] } {
  const covered: string[] = [];
  const missing: string[] = [];
  for (const label of labels) {
    if (teluguFor(label)) covered.push(label);
    else missing.push(label);
  }
  return { covered, missing };
}
