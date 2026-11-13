# 8. A light departure-board identity, and clarity over atmosphere

Status: accepted · 2026-11 · supersedes nothing; amends the visual half of ADR-0001's documents

## Context

The board shipped dark: night-#06080e stock, ivory type, an Instrument Serif
display face, a film grain over everything and a marigold wash behind the hero.
It looked like an airside magazine, and it read like one.

The complaint that prompted this was not aesthetic. A traveller landing on the
board could not quickly answer three questions: what a corridor is, what a tier
means, and what to do next. Two of those three are vocabulary problems —
"Tier II locked", "pledged against allotment", "25% EMD after Tier II clears" —
and the third was a rendering problem: the tier ladder, which is the entire
mechanic of the product, appeared on the corridor card as three 1px ticks on a
meter whose labels lived in a `title` attribute. On a phone there is no hover,
so the one thing a traveller has to understand was the one thing they could not
see.

Atmosphere was competing with information. Dark surfaces made every hairline,
wash and grain a thing to look past; the serif display face set headlines as
editorial rather than as departure information; and the palette's own logic —
ivory on night, mist for secondary, marigold for emphasis — asked the reader to
infer hierarchy from luminosity rather than from size and weight.

## Decision

**Paper, not night.** The page is a warm sheet (`--color-page`), a card is laid
on it (`--color-surface`), the brightest panel is reserved for the sticky header
and sheets (`--color-raised`), and wells, stripes and interaction states go the
other way (`--color-sunken`, `--color-hover`, `--color-press`). Ink runs
`#14181f → #5b6370` in four steps, and every step was measured against every
surface that carries text before it shipped: the floor is 4.72:1, so AA holds
including the faintest label. The measurement is the point — the ratios are
recorded in the token block, not asserted in a commit message.

**One accent, two uses that are never interchangeable.** Marigold as a *fill* is
the bright stamp with near-black type on it (8.53:1): the primary action, the
threshold reached, the live count. Marigold as *text* is the deep cut, because
the bright hue on paper is 1.96:1 and would be decoration pretending to be a
label. The token names encode the rule so it cannot be broken by accident:
there is no `text-accent`, only `text-accent-deep` and `text-accent-ink`.

**One type family.** Geist Variable now carries headings as well as body, at
650–700 and tracked tight, so hierarchy comes from weight and size rather than
from a second download. `@fontsource/instrument-serif` is gone; two fewer font
files ship to all twelve documents. Eyebrows grew from 10.5px/0.16em to
11px/0.11em, because at the old size on paper the small caps broke into noise
and an eyebrow a traveller squints at is the label they needed.

**Tokens are named for the job, not the pigment.** Surfaces, ink and rules are
role names — `page`, `surface`, `raised`, `ink`, `ink-soft`, `rule` — so a theme
change is a change of values rather than a change of meaning. The four status
hues keep their pigment names (`jade`, `ember`, `lagoon`, `clay`) because there
the colour *is* the meaning, and each ships a `-deep` cut for text, a `-tint`
for a wash and a `-line` for an edge.

**Jargon retreats to where it is defined.** The card and the pledge sheet now
speak in seats and rupees: "Pledges open", "Second fare cut", "12 seats to
₹7,800", "Nothing is charged until 15 seats are pledged". The word "tier"
survives in the ladder and in the explainer section, which is where it is
defined, and nowhere a traveller meets it first. The ladder itself is now a
visible three-cell row on every card — threshold, landed fare, distance to it —
instead of ticks with a tooltip.

**Contrast is measured for graphics as well as for type.** Light paper made the
text side easy to hold to a floor; it made the *non-text* side visibly wrong, and
WCAG 1.4.11 is the requirement no tool in this repository checks — axe's
`color-contrast` is about text, in jsdom or in Chromium alike. Three real
failures were sitting in the shipped light theme and were found by hand: a text
field's border at 1.36:1 against the panel it sits on (and `raised` against
`surface` is 1.016:1, so that border was the only thing on the page saying "this
is a field"); a focus indicator at 1.70:1, on a control that opts out of the
global ring; and a marigold meter fill at **1.63:1 against its own track**, which
made the board's most common graphic a bar nobody could see filling. The seat map
had the same defect at 1.63:1, and marked its tier thresholds with a ring colour
that was both invisible and the *only* thing carrying that meaning, which is a
1.4.1 failure on top of a 1.4.11 one.

The rule that came out of it is the accent rule applied consistently: **bright
marigold is a fill only where it carries near-black type; as a graphic it takes
the deep cut**, at 4.90:1 against the track it sits in. Anything a reader has to
see in order to *use* it — a field, a button, a meter track — takes a new
`--color-edge`, which clears 3:1 against every panel in the neutral ramp
including the pressed state a control turns into mid-click (worst case 3.24:1).
Hairlines stay hairlines: `rule`, `rule-soft`, `rule-strong` and `rule-strongest`
measure 1.12–2.31:1 and are used only where a rule separates content, which
1.4.11 asks nothing of. Thresholds in the seat map are now a **taller cell**, so
the meaning survives greyscale as well as low contrast. And a state encoded as
one background against another has to clear 3:1 between the two, *opaque* — a
translucent fill has no contrast of its own, it inherits whatever ends up behind
it, so it cannot be reasoned about at all.

**A static gate, because these defects were invisible to everything that ran.** A component asking for a token the design system does not
define produces no error anywhere: Tailwind v4 generates utilities from
`@theme`, so an unknown name emits nothing, the build succeeds, and the element
simply has no colour. And a background paired with a foreground at 1.16:1 in one
class string passes the local audit, because jsdom runs axe with
`color-contrast` disabled for want of a layout engine. Both were hit. So were the
three non-text failures above, which no axe run anywhere would ever have
reported. All of them are now caught by `npm run tokens` — pure source
arithmetic, no build, under a second — which runs first in `npm run audit`, and
which was checked against deliberately sabotaged files before being trusted: a
probe carrying `bg-accent-tint text-white` was written into `src/`, the gate was
watched to fail on it at 1.12:1 while passing `bg-lagoon text-white` beside it,
and the probe was deleted. Every branch of it has been seen firing on a real
defect rather than only on a fixture.

## Consequences

- Contrast is a measured floor with the numbers written down, not a claim.
  The browser suite remains the authority on inherited colour; the token gate
  exists so the obvious cases never reach a CI run.
- Writing the numbers down found two wrong ones. This ADR's own earlier draft,
  the token comment in `src/index.css` and the README all quoted floors measured
  against eleven surfaces and named `clay-tint-strong` as the darkest; the
  darkest is `ember-tint-strong`, against which `ink-faint` was 4.47:1 — 0.03
  short of the floor being advertised. `ink-faint` is one step darker now
  (4.66:1 worst case) and the gate re-derives every quoted number, so a comment
  cannot outlive the palette it describes.
- The state-pair check distinguishes a state from a choice between categories by
  looking for an equality test in the ternary's condition. That is a heuristic.
  It is right for every ternary in this repository, including the nested hue
  chains, and it fails towards a false alarm rather than a missed defect — but it
  is the one judgement in the gate that a reader should not trust blindly.
- Lighthouse collects three runs per URL and `lhci assert` judges the median.
  One run made the timing budgets a coin toss on a shared runner, and a gate that
  reddens at random teaches people to re-run instead of read.
- The hero washes are still the only place axe may report unresolved contrast,
  and the browser gate still requires any unresolved node to share a section
  with `.glow-accent` or `.grid-veil`. A translucent layer anywhere else fails
  the build.
- The app chunk grew 2.4 kB because the card now uses `TierLadder`, which moved
  `Pricing` into the main chunk; CSS is 55.5 kB raw. Both are inside the 260 kB
  budget the CI enforces, and the two font files that left more than pay for it.
- The palette is carried **by value** in five places that cannot read the tokens:
  the first-paint shell and favicon in `index.html`, `theme-color`,
  `public/manifest.webmanifest`, and `scripts/make-icons.mjs`. Each says so in a
  comment. Changing a surface or accent token means changing all five, or the
  installed app and the first paint will disagree with the page.
- Role-named tokens make a dark theme a second `@theme` block rather than a
  rewrite. That is a possibility this decision creates, not a commitment: no
  dark block exists, no toggle exists, and nothing is gated on one.

Revisit if the light identity proves harder to read in the conditions the board
is actually used in — a phone in direct sun on a festival morning is the case
that would argue for a dark option, and the token layer is now shaped to allow
one.
