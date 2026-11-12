export interface ScoreDimension {
  key: string;
  label: string;
  score: number;
  weight: number;
  verdict: string;
  evidence: string;
}

export interface RiskItem {
  title: string;
  severity: 'critical' | 'high' | 'medium';
  reality: string;
  mitigation: string;
}

export interface StrengthItem {
  title: string;
  body: string;
}

/**
 * Founder-grade assessment of the festival bulk-corridor idea.
 * Scores are weighted; `weightedScore` is derived, never hand-set.
 */
export const DIMENSIONS: ScoreDimension[] = [
  {
    key: 'pain',
    label: 'Problem severity & urgency',
    score: 9,
    weight: 0.15,
    verdict: 'Exceptional',
    evidence:
      'Festival fares on AP ↔ Delhi run 2.4x–3.8x off-season on the seeded corridors (₹5,400 → ₹14,850). The pain is dated, emotional and non-negotiable: a family that misses Sankranti does not defer the trip, it pays. Urgency is the single best ingredient a consumer marketplace can have.',
  },
  {
    key: 'market',
    label: 'Market size & corridor density',
    score: 7.5,
    weight: 0.1,
    verdict: 'Real but narrow',
    evidence:
      'Domestic air traffic in India is in the ~160M passengers/year band and growing; group/series contracts are an established but digitisation-poor slice of it. The catch: only a handful of corridors are dense enough to fill a 45–60 seat block on one specific day (VGA/VTZ/TIR → DEL, HYD/BLR → AP by coach). You are not opening a ₹10,000 Cr market on day one — you are opening ~8–12 corridors worth a few crore each.',
  },
  {
    key: 'value-prop',
    label: 'Willingness to pay & clarity',
    score: 8,
    weight: 0.15,
    verdict: 'Instantly understood',
    evidence:
      '"Pay ₹7,995 landed instead of ₹14,850, and your ₹344 fee is printed on the receipt" needs no education. Savings are concrete, comparable and verifiable against what the traveler sees on Ixigo/MakeMyTrip five minutes later. That is a rare, self-proving value proposition.',
  },
  {
    key: 'economics',
    label: 'Unit economics & take rate',
    score: 5.5,
    weight: 0.2,
    verdict: 'Thin as designed',
    evidence:
      '4.5% of a ₹7,650 net fare is ₹344/seat. A full 60-seat block grosses ₹20,640. Twenty corridors × four festival windows ≈ ₹16.5 lakh/yr gross — before refunds, ops and the EMD you forfeit when a cohort collapses. The platform fee alone cannot carry a company; you need the carrier override (2–5%), ancillaries (meals, transfers, insurance, excess baggage) and a white-label group desk for agents to reach a 12%+ effective take rate.',
  },
  {
    key: 'supply',
    label: 'Supply-side feasibility',
    score: 6,
    weight: 0.15,
    verdict: 'Possible, but you are a price-taker',
    evidence:
      'Airline group desks genuinely sell 10+ pax blocks at contracted net fares with EMD deposits and a named-manifest deadline around T-72h — the mechanics you describe are real. But festival-window inventory is exactly what revenue management pulls back first, allotments are discretionary, and you do not control the asset. Coach fleets (APSRTC Vennela, Orange, Kaveri, Morning Star) are far easier to contract and margin better — that is your realistic beachhead, not air.',
  },
  {
    key: 'regulatory',
    label: 'Regulatory & trust burden',
    score: 4.5,
    weight: 0.1,
    verdict: 'The hard blocker',
    evidence:
      'Two things need solving before scale: (1) selling air tickets in India needs IATA accreditation or a TASF-approved non-IATA arrangement; (2) collecting money from travelers and paying carriers later is pooling of funds — that requires an RBI-compliant nodal/escrow route through a licensed PA, not your current account. Neither is fatal, both are slow, and both must be designed in from day one.',
  },
  {
    key: 'moat',
    label: 'Defensibility & moat',
    score: 5,
    weight: 0.1,
    verdict: 'The software is not the moat',
    evidence:
      'This app is reproducible in a weekend — it is a table, a tier ladder and an RPC. Your real competitors are a Hyderabad travel agent with a 400-member WhatsApp group taking ₹200/seat, and OTA group-desk phone lines. The durable assets are (a) exclusive corridor series contracts and (b) owned demand communities (alumni wings, PSU families, tech-park commuter groups) that re-form every festival without paid acquisition.',
  },
  {
    key: 'timing',
    label: 'Timing & distribution',
    score: 7.5,
    weight: 0.05,
    verdict: 'Favourable',
    evidence:
      'Festival dates are known a year ahead, so demand is forecastable and pre-sellable — unlike almost any other travel product. UPI-made payments, cheap data and WhatsApp communities make zero-CAC aggregation viable now in a way it was not five years ago. New airports at Vijayawada/Tirupati/Rajahmundry and the Amaravati capital build-out add genuine corridor growth.',
  },
];

export const WEIGHTED_SCORE = Number(
  (
    DIMENSIONS.reduce((sum, d) => sum + d.score * d.weight, 0) /
    DIMENSIONS.reduce((sum, d) => sum + d.weight, 0)
  ).toFixed(1),
);

export function gradeFor(score: number): string {
  if (score >= 8.5) return 'A';
  if (score >= 7.5) return 'B+';
  if (score >= 6.5) return 'B';
  if (score >= 5.5) return 'C+';
  return 'C';
}

export const VERDICT_HEADLINE =
  'A real, urgent, forecastable problem attached to a structurally thin business model.';

export const VERDICT_BODY = [
  'The insight is correct and worth building on: carriers already sell group inventory at 25–40% below festival retail, and individuals cannot reach that rate card. Aggregating corridor demand is a legitimate arbitrage.',
  'What is over-claimed is the size of the prize and who controls it. You are a demand aggregator standing on someone else\'s inventory, in a business whose revenue lands in four to six weeks a year, whose take rate as designed is ~₹344 a seat, and whose legal structure requires an escrow partner and ticketing accreditation you do not yet have.',
  'Build it — but as a corridor operator, not a "platform". Own three to five AP corridors, contract coach fleets first (faster, better margin, no IATA gate), pre-sell against anchor communities, and treat the airline group desk as the second act. Prove you can fill 45+ seats per corridor twice in a row before you write another line of software.',
].join('\n\n');

export const STRENGTHS: StrengthItem[] = [
  {
    title: 'Demand is forecastable',
    body: 'Festival dates are published a year ahead. You can pre-sell, pre-contract and pre-fund — no other leisure travel product gets that.',
  },
  {
    title: 'The arbitrage genuinely exists',
    body: 'Group/series fares below retail surge buckets are standard airline practice (IATA group contracts from 10+ pax). You are monetising a real rate-card gap, not inventing a discount.',
  },
  {
    title: 'Coach corridors are an easier wedge',
    body: 'APSRTC Vennela and private Volvo/Scania fleets negotiate faster than airline group desks, hold better margins and carry no accreditation gate. HYD → Amaravati at ₹1,150 against a ₹2,950 surge is a cleaner first win.',
  },
  {
    title: 'Near-zero CAC through owned communities',
    body: 'Alumni wings, PSU family groups, tech-park commuter channels and NRI chapters re-form every festival. One organiser per cohort replaces paid acquisition entirely.',
  },
  {
    title: 'Underserved geography',
    body: 'Tier-2 AP airfields (VGA, TIR, RJA) are thin on non-stop connectivity, so aggregated coach + connecting-flight bundles solve a gap OTAs ignore.',
  },
  {
    title: 'Trust is the product',
    body: 'Showing the tier ladder, the contract reference, the deadline and the refund rule turns an opaque price into an auditable one. That transparency is itself the differentiator against a WhatsApp agent.',
  },
];

export const RISKS: RiskItem[] = [
  {
    title: 'You do not own the inventory',
    severity: 'critical',
    reality:
      'A group block can be withdrawn, re-priced or capped by carrier revenue management at any point before ticketing. If AI pulls 60 seats eleven days before Sankranti, you have 60 stranded travelers, refunds to process and a reputation you cannot rebuild before the next festival.',
    mitigation:
      'Two-carrier redundancy per corridor, signed series agreements with EMD-backed seat guarantees, and a coach fallback on every air corridor. Never sell a seat you cannot re-source within 24 hours.',
  },
  {
    title: 'Pooling traveler money is regulated activity',
    severity: 'critical',
    reality:
      'Holding pledges on your own account while waiting for a cohort to fill looks like deposit-taking. Air ticket resale additionally requires IATA accreditation or a TASF non-IATA arrangement.',
    mitigation:
      'Route all collections through a licensed PA nodal/escrow account with auto-release on failure; authorise (not capture) at pledge time and capture only at tier lock. Get the accreditation question answered in writing before the first paid cohort.',
  },
  {
    title: 'The discount is smaller than the pitch',
    severity: 'high',
    reality:
      'Festival flights leave at ~95% load factor, so carriers have little reason to discount deeply. Realistic group net fares are 25–40% under retail surge, not 55%+. On the seeded VGA→DEL block that is ₹8,900 / ₹7,650 / ₹6,800 against a ₹14,850 surge — strong, but the Tier-3 slab only exists if you actually fill 45 seats.',
    mitigation:
      'Publish tiers as conditional, never as promised. Escrow-hold below Tier-1 and refund instantly if the corridor fails. Sell the ladder, not the lowest rung.',
  },
  {
    title: 'Chicken-and-egg cohort formation',
    severity: 'high',
    reality:
      'Travelers will not pay until the tier is locked; the tier will not lock until travelers pay. A corridor stuck at 11 of 15 seats for three weeks dies quietly.',
    mitigation:
      'Anchor cohorts: get one organiser (alumni association, PSU welfare wing, tech-park community) to commit 15 seats before the corridor goes public. Soft-pledge with pay-on-lock to remove the trust barrier.',
  },
  {
    title: 'Revenue concentrated in six weeks',
    severity: 'high',
    reality:
      'Sankranti, Ugadi, Diwali and summer cover most of the volume. A team hired for the peak is idle for eight months, and one bad window wipes the year.',
    mitigation:
      'Stack adjacent demand into the same rails: wedding-season blocks, pilgrimage charters (Tirupati), college fest and sports travel, corporate annual-home-leave series. Same corridor engine, twelve-month calendar.',
  },
  {
    title: 'Cancellation asymmetry',
    severity: 'medium',
    reality:
      'Group fares are frequently non-refundable or heavily penalised after the named manifest is submitted at T-72h. A passenger who drops out on day T-3 leaves a hole you absorb.',
    mitigation:
      'Name-swap window until T-72h, a waitlist per corridor, and optional refund-insurance attach at pledge time priced into the platform fee.',
  },
  {
    title: 'The moat is not the app',
    severity: 'medium',
    reality:
      'Any OTA can ship a "group pledge" tab in one quarter, and local agents already run this informally at ₹200/seat with a WhatsApp group and zero tech.',
    mitigation:
      'Compete on contracts and community: exclusive corridor series, organiser revenue share, and per-corridor cohorts that persist year over year. Make the switching cost social, not technical.',
  },
  {
    title: 'Manifest ops are brutal and manual',
    severity: 'medium',
    reality:
      'Named manifests with ID-exact spellings, infant fares, unaccompanied minors and meal codes for 60 people × 20 corridors is an operations load that does not scale with software alone.',
    mitigation:
      'Hire per-window manifest ops from the start, budget it into unit economics (₹60–120/seat), and automate ID capture with validation at pledge time, not at T-72h.',
  },
];

export const WHAT_WOULD_RAISE_THE_SCORE = [
  'Signed LOIs from two airline group desks for Sankranti 2027 showing actual net fares, EMD terms and the manifest deadline — this alone moves supply feasibility from 6 to 8.',
  'A nodal/escrow term sheet from a licensed PA and a written answer on the IATA/TASF question — moves regulatory from 4.5 to 6.5.',
  '500 soft pledges across three corridors captured before any inventory is committed, with at least one anchor community per corridor.',
  'One completed paid pilot where 45+ seats filled and every ticket issued without a manual rescue.',
  'An ancillary attach plan (meals, transfers, insurance, baggage) that lifts effective take rate from 4.5% to 12%+ of GMV.',
];

export const MONEY_FLOW = [
  { step: '01', label: 'Pledge', body: 'Traveler joins a corridor cohort with a soft hold. No charge until the tier locks.' },
  { step: '02', label: 'Escrow', body: 'Funds sit in a licensed PA nodal account, never on the platform balance sheet.' },
  { step: '03', label: 'Tier unlock', body: 'At 15 / 30 / 45 seats the contracted wholesale slab releases for everyone in the pool.' },
  { step: '04', label: 'Carrier block', body: 'Group desk confirms the block against the contract reference; EMD is posted.' },
  { step: '05', label: 'Manifest T-72h', body: 'Named passengers submitted, group PNR issued, e-tickets delivered.' },
  { step: '06', label: 'Fee retained', body: 'Platform keeps the printed coordination fee plus carrier override; balance settles to the carrier.' },
];

export const UNIT_ECON_DEFAULTS = {
  seats: 60,
  netFare: 7650,
  surgeFare: 14850,
  feePct: 4.5,
  overridePct: 2.5,
  mdrPct: 1.6,
  opsPerSeat: 95,
  corridorsPerWindow: 20,
  windowsPerYear: 4,
  fillRate: 0.75,
  failureRate: 0.2,
};
