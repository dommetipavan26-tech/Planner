export type LinearStateType = 'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled';

export interface LinearIssue {
  key: string;
  title: string;
  url: string;
  state: string;
  stateType: LinearStateType;
  priority: 'Urgent' | 'High' | 'Medium' | 'Low';
  label: string;
  due: string;
  estimate: number;
  milestone: string;
}

export interface LinearMilestone {
  name: string;
  target: string;
  blurb: string;
  issues: LinearIssue[];
}

export const LINEAR_PROJECT = {
  name: 'UtsavAir — Festival Bulk Corridor Desk',
  team: 'PAV',
  url: 'https://linear.app/pavan-dommeti/project/def95f3a-2f9c-4bca-9972-9e62ad335ddb',
  window: '12 Nov 2026 → 10 Jan 2027',
} as const;

export const MILESTONES: LinearMilestone[] = [
  {
    name: 'M1 — Carrier supply & group allotment contracts',
    target: '15 Nov 2026',
    blurb: 'Signed group allotment terms with airline group desks and coach fleet operators on AP ↔ Delhi / Hyderabad / Bengaluru corridors.',
    issues: [
      {
        key: 'PAV-12',
        title: 'Sign Air India group desk series contract for VGA → DEL Sankranti block',
        url: 'https://linear.app/pavan-dommeti/issue/PAV-12/sign-air-india-group-desk-series-contract-for-vga-del-sankranti-block',
        state: 'Todo',
        stateType: 'unstarted',
        priority: 'Urgent',
        label: 'integration',
        due: '15 Nov 2026',
        estimate: 8,
        milestone: 'M1',
      },
      {
        key: 'PAV-13',
        title: 'Onboard APSRTC Vennela × Orange Volvo fleet for HYD ↔ Amaravati night corridor',
        url: 'https://linear.app/pavan-dommeti/issue/PAV-13/onboard-apsrtc-vennela-orange-volvo-fleet-for-hyd-amaravati-night',
        state: 'Todo',
        stateType: 'unstarted',
        priority: 'High',
        label: 'integration',
        due: '16 Nov 2026',
        estimate: 5,
        milestone: 'M1',
      },
    ],
  },
  {
    name: 'M2 — Demand aggregation, escrow & realtime cohort engine',
    target: '17 Nov 2026',
    blurb: 'Traveler pledge flow, refundable escrow, tier slab engine, and Supabase Realtime cohort board.',
    issues: [
      {
        key: 'PAV-14',
        title: 'Ship live corridor board with Supabase Realtime cohort fill updates',
        url: 'https://linear.app/pavan-dommeti/issue/PAV-14/ship-live-corridor-board-with-supabase-realtime-cohort-fill-updates',
        state: 'Done',
        stateType: 'completed',
        priority: 'Urgent',
        label: 'realtime',
        due: '13 Nov 2026',
        estimate: 8,
        milestone: 'M2',
      },
      {
        key: 'PAV-15',
        title: 'Tier slab pricing engine + atomic pledge RPC (utsav_join_cohort)',
        url: 'https://linear.app/pavan-dommeti/issue/PAV-15/tier-slab-pricing-engine-atomic-pledge-rpc-utsav-join-cohort',
        state: 'Done',
        stateType: 'completed',
        priority: 'Urgent',
        label: 'platform',
        due: '13 Nov 2026',
        estimate: 5,
        milestone: 'M2',
      },
      {
        key: 'PAV-16',
        title: 'Refundable escrow hold via RBI-compliant nodal account partner',
        url: 'https://linear.app/pavan-dommeti/issue/PAV-16/refundable-escrow-hold-via-rbi-compliant-nodal-account-partner',
        state: 'Todo',
        stateType: 'unstarted',
        priority: 'Urgent',
        label: 'integration',
        due: '30 Nov 2026',
        estimate: 13,
        milestone: 'M2',
      },
    ],
  },
  {
    name: 'M3 — Sankranti 2027 pilot (VGA → DEL)',
    target: '10 Jan 2027',
    blurb: 'First live corridor: 60-seat Air India group block on 12 Jan 2027, with named-passenger issuance at T-72h.',
    issues: [
      {
        key: 'PAV-17',
        title: 'Named-passenger manifest capture + group PNR issuance at T-72h',
        url: 'https://linear.app/pavan-dommeti/issue/PAV-17/named-passenger-manifest-capture-group-pnr-issuance-at-t-72h',
        state: 'In Progress',
        stateType: 'started',
        priority: 'High',
        label: 'integration',
        due: '05 Jan 2027',
        estimate: 8,
        milestone: 'M3',
      },
      {
        key: 'PAV-18',
        title: 'Cohort community layer: WhatsApp broadcast + boarding marshalling',
        url: 'https://linear.app/pavan-dommeti/issue/PAV-18/cohort-community-layer-whatsapp-broadcast-boarding-marshalling',
        state: 'Backlog',
        stateType: 'backlog',
        priority: 'Medium',
        label: 'Feature',
        due: '20 Dec 2026',
        estimate: 5,
        milestone: 'M3',
      },
    ],
  },
  {
    name: 'M4 — Compliance, unit economics & scale plan',
    target: '10 Dec 2026',
    blurb: 'IATA/TASF accreditation path, PCI-DSS + RBI escrow partner, cohort fill-rate model, cancellation and no-show loss exposure.',
    issues: [
      {
        key: 'PAV-19',
        title: 'Unit economics model: cohort fill rate vs. EMD exposure and refund loss',
        url: 'https://linear.app/pavan-dommeti/issue/PAV-19/unit-economics-model-cohort-fill-rate-vs-emd-exposure-and-refund-loss',
        state: 'In Progress',
        stateType: 'started',
        priority: 'Urgent',
        label: 'Improvement',
        due: '25 Nov 2026',
        estimate: 8,
        milestone: 'M4',
      },
      {
        key: 'PAV-20',
        title: 'IATA / TASF accreditation path + DGCA group-desk compliance review',
        url: 'https://linear.app/pavan-dommeti/issue/PAV-20/iata-tasf-accreditation-path-dgca-group-desk-compliance-review',
        state: 'Todo',
        stateType: 'unstarted',
        priority: 'High',
        label: 'Bug',
        due: '05 Dec 2026',
        estimate: 5,
        milestone: 'M4',
      },
      {
        key: 'PAV-21',
        title: 'Deployment pipeline: Vercel production project + env wiring',
        url: 'https://linear.app/pavan-dommeti/issue/PAV-21/deployment-pipeline-vercel-production-project-env-wiring',
        state: 'Done',
        stateType: 'completed',
        priority: 'High',
        label: 'platform',
        due: '12 Nov 2026',
        estimate: 3,
        milestone: 'M4',
      },
    ],
  },
];

export const ALL_ISSUES: LinearIssue[] = MILESTONES.flatMap((m) => m.issues);
