import React from 'react';

/**
 * Schematic diagrams for the handful of steps where a picture is faster to read
 * than a sentence — hand placement, body position, where to strike.
 *
 * Rules for anything added here:
 *   - it may only depict what the step's own text already says;
 *   - it never introduces a technique, a number, or an order of its own;
 *   - a step with no drawing simply renders without one.
 *
 * One vocabulary across every drawing: circle = head, rounded rectangle = body
 * or hand, straight line = limb. Body parts are drawn in the muted ink colour;
 * whatever the rescuer must DO is red, including the direction arrow, so the
 * action is the first thing the eye lands on.
 */

const BODY = 'var(--c-muted)';
const ACT = 'var(--c-danger)';
const W = 2.5;
const AW = 3.2;

const Frame = ({ children, label }) => (
  <svg
    viewBox="0 0 120 80"
    role="img"
    aria-label={label}
    className="h-auto w-full max-w-[260px]"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
);

/** Arrow pointing straight down, used for "press". */
const DownArrow = ({ x, y1, y2 }) => (
  <path d={`M${x} ${y1}V${y2}m-4 -5l4 5l4 -5`} stroke={ACT} strokeWidth={W} />
);

/** Head, torso, arms — the figure seen from above, lying on its back. */
const SupineFigure = () => (
  <>
    <circle cx="60" cy="13" r="7" stroke={BODY} strokeWidth={W} />
    <rect x="44" y="23" width="32" height="44" rx="13" stroke={BODY} strokeWidth={W} />
    <path d="M44 32 30 46M76 32l14 14" stroke={BODY} strokeWidth={W} />
  </>
);

/** Heel of one hand, other hand on top, centre of the chest. */
const Compressions = () => (
  <Frame label="Both hands stacked on the centre of the chest">
    <SupineFigure />
    <path d="M60 26v10" stroke={BODY} strokeWidth="1.5" strokeDasharray="3 3" />
    <rect x="50" y="37" width="20" height="11" rx="5" stroke={ACT} strokeWidth={AW} />
    <rect x="54" y="29" width="12" height="9" rx="4" stroke={ACT} strokeWidth={AW} />
    <DownArrow x={100} y1={30} y2={48} />
  </Frame>
);

/** Two fingers on an infant's breastbone, just below the nipple line. */
const InfantCompressions = () => (
  <Frame label="Two fingers on the centre of an infant's chest">
    <circle cx="60" cy="15" r="6" stroke={BODY} strokeWidth={W} />
    <rect x="48" y="24" width="24" height="36" rx="11" stroke={BODY} strokeWidth={W} />
    <path d="M48 34h24" stroke={BODY} strokeWidth="1.5" strokeDasharray="3 3" />
    <path d="M57 38v11M63 38v11" stroke={ACT} strokeWidth={AW} />
    <DownArrow x={96} y1={32} y2={48} />
  </Frame>
);

/** Hand on the forehead, two fingers under the chin, head tilted back. */
const OpenAirway = () => (
  <Frame label="One hand on the forehead, two fingers lifting the chin">
    <circle cx="56" cy="38" r="15" stroke={BODY} strokeWidth={W} />
    <path d="M34 62c2-8 6-14 12-18" stroke={BODY} strokeWidth={W} />
    <rect x="42" y="12" width="22" height="10" rx="5" stroke={ACT} strokeWidth={AW} />
    <path d="M72 48h8M72 54h6" stroke={ACT} strokeWidth={AW} />
    <path d="M84 34a16 16 0 0 1-4 12m4-12-5 2m5-2 2 5" stroke={ACT} strokeWidth={W} />
  </Frame>
);

/** Leaning forward, struck between the shoulder blades. */
const BackBlows = () => (
  <Frame label="Leaning forward, struck between the shoulder blades">
    <circle cx="40" cy="22" r="9" stroke={BODY} strokeWidth={W} />
    <path d="M46 30c-4 6-6 14-6 26M46 30c8 3 13 9 15 17" stroke={BODY} strokeWidth={W} />
    <path d="M32 64h22" stroke={BODY} strokeWidth={W} />
    <rect x="74" y="26" width="20" height="11" rx="5" stroke={ACT} strokeWidth={AW} />
    <path d="M72 32H60m0 0 5-4m-5 4 5 4" stroke={ACT} strokeWidth={W} />
  </Frame>
);

/** Fist above the navel, pulled inward and upward. */
const AbdominalThrusts = () => (
  <Frame label="Fist above the navel, pulled inward and upward">
    <circle cx="60" cy="16" r="9" stroke={BODY} strokeWidth={W} />
    <path d="M60 25v24M60 49l-9 18M60 49l9 18M40 34h40" stroke={BODY} strokeWidth={W} />
    <circle cx="60" cy="40" r="7" stroke={ACT} strokeWidth={AW} />
    <path d="M60 56v-8m-4 4 4-4 4 4" stroke={ACT} strokeWidth={W} />
  </Frame>
);

/** Face-down along the forearm, head lower than the chest. */
const InfantBackBlows = () => (
  <Frame label="Infant face-down along the forearm, head lower than the body">
    <path d="M96 30 26 54" stroke={BODY} strokeWidth="4" opacity="0.35" />
    <circle cx="34" cy="52" r="7" stroke={BODY} strokeWidth={W} />
    <rect
      x="44"
      y="34"
      width="34"
      height="16"
      rx="8"
      transform="rotate(-19 61 42)"
      stroke={BODY}
      strokeWidth={W}
    />
    <rect x="58" y="12" width="19" height="10" rx="5" stroke={ACT} strokeWidth={AW} />
    <path d="M67 30v-6m-4 2 4-2 4 2" stroke={ACT} strokeWidth={W} transform="rotate(180 67 27)" />
  </Frame>
);

/** On the side, upper knee bent forward, airway kept open. */
const RecoveryPosition = () => (
  <Frame label="On the side with the upper knee bent forward">
    <path d="M12 66h96" stroke={BODY} strokeWidth="1.5" opacity="0.4" />
    <circle cx="28" cy="36" r="10" stroke={ACT} strokeWidth={AW} />
    <rect x="38" y="30" width="34" height="20" rx="10" stroke={BODY} strokeWidth={W} />
    <path d="M46 30c4-8 12-10 18-4" stroke={BODY} strokeWidth={W} />
    <path d="M72 44h10l6 14" stroke={ACT} strokeWidth={AW} />
    <path d="M72 36h16" stroke={BODY} strokeWidth={W} />
  </Frame>
);

/** Hand pressing hard, directly on the wound. */
const DirectPressure = () => (
  <Frame label="Pressing hard directly on the wound">
    <rect x="12" y="46" width="96" height="18" rx="9" stroke={BODY} strokeWidth={W} />
    <path d="M55 51l10 8M65 51l-10 8" stroke={ACT} strokeWidth="2" opacity="0.8" />
    <rect x="48" y="22" width="24" height="12" rx="6" stroke={ACT} strokeWidth={AW} />
    <DownArrow x={60} y1={36} y2={44} />
  </Frame>
);

/** Band above the wound, tightened with the windlass. Never on a joint. */
const Tourniquet = () => (
  <Frame label="Tourniquet on the limb above the wound">
    <rect x="12" y="42" width="96" height="18" rx="9" stroke={BODY} strokeWidth={W} />
    <path d="M83 47l8 8M91 47l-8 8" stroke={BODY} strokeWidth="2" opacity="0.7" />
    <rect x="40" y="36" width="12" height="30" rx="4" stroke={ACT} strokeWidth={AW} />
    <circle cx="46" cy="26" r="7" stroke={ACT} strokeWidth={AW} />
    <path d="M46 36v-3" stroke={ACT} strokeWidth={W} />
    <path d="M56 20a10 10 0 0 1 8 6m-8-6 1 5m-1-5 5-1" stroke={ACT} strokeWidth={W} />
    <path d="M60 68h20m-20 0 5-4m-5 4 5 4" stroke={BODY} strokeWidth="1.8" opacity="0.7" />
  </Frame>
);

/** Cool running water over the burn, for twenty minutes. */
const CoolWater = () => (
  <Frame label="Cool running water over the burn">
    <path d="M28 12h22v10" stroke={BODY} strokeWidth={W} />
    <path d="M44 26v12M50 24v16M56 26v12" stroke={ACT} strokeWidth={AW} />
    <rect x="26" y="48" width="70" height="16" rx="8" stroke={BODY} strokeWidth={W} />
    <path d="M62 30a8 8 0 0 1 8-8" stroke={ACT} strokeWidth={W} opacity="0.6" />
  </Frame>
);

/** Something soft under the head; hard objects moved out of the way. */
const CushionHead = () => (
  <Frame label="Something soft under the head, hard objects moved away">
    <path d="M12 64h96" stroke={BODY} strokeWidth="1.5" opacity="0.4" />
    <circle cx="36" cy="38" r="10" stroke={BODY} strokeWidth={W} />
    <rect x="48" y="34" width="34" height="18" rx="9" stroke={BODY} strokeWidth={W} />
    <path d="M24 50c0-9 7-13 14-11" stroke={ACT} strokeWidth="4" />
    <rect x="92" y="18" width="12" height="12" rx="3" stroke={BODY} strokeWidth="2" opacity="0.6" />
    <path d="M78 18h10m0 0-4-4m4 4-4 4" stroke={ACT} strokeWidth={W} />
  </Frame>
);

/** Lying flat with the legs raised above the heart. */
const LegsRaised = () => (
  <Frame label="Lying down with the legs raised">
    <path d="M8 64h104" stroke={BODY} strokeWidth="1.5" opacity="0.4" />
    <circle cx="22" cy="52" r="9" stroke={BODY} strokeWidth={W} />
    <rect x="33" y="44" width="36" height="18" rx="9" stroke={BODY} strokeWidth={W} />
    <path d="M69 52l26-18" stroke={ACT} strokeWidth={AW} />
    <path d="M95 34v-8m-4 4 4-4 4 4" stroke={ACT} strokeWidth={W} />
    <path d="M88 44v18" stroke={BODY} strokeWidth="2" opacity="0.5" />
  </Frame>
);

const ART = {
  compressions: Compressions,
  infantCompressions: InfantCompressions,
  openAirway: OpenAirway,
  backBlows: BackBlows,
  abdominalThrusts: AbdominalThrusts,
  infantBackBlows: InfantBackBlows,
  recoveryPosition: RecoveryPosition,
  directPressure: DirectPressure,
  tourniquet: Tourniquet,
  coolWater: CoolWater,
  cushionHead: CushionHead,
  legsRaised: LegsRaised,
};

export function StepArt({ art }) {
  const Component = ART[art];
  if (!Component) return null;
  return (
    <div className="flex justify-center rounded-2xl bg-card p-5 shadow-card">
      <Component />
    </div>
  );
}

export const ART_KEYS = Object.keys(ART);
