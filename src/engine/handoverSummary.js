import { groupByKey } from './sharedContext.js';

/**
 * "What to tell the ambulance."
 *
 * Dispatchers ask the same things every time: what happened, to whom, how long
 * ago, what you have already done. The engine has recorded all of it — the
 * case, the trail of nodes entered, the timestamps written by `sets`. This
 * turns that record into a few lines the caller can read out.
 *
 * It reports only facts the session actually observed. It never advises.
 */

const minutesSince = (isoOrMs) => {
  if (!isoOrMs) return null;
  const then = typeof isoOrMs === 'number' ? isoOrMs : Date.parse(isoOrMs);
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.round((Date.now() - then) / 60000));
};

/**
 * State variables worth reading out, with how to phrase them. Anything not
 * listed is left out rather than guessed at.
 */
const REPORTABLE = [
  {
    match: (vars) => vars.tourniquet_applied === true,
    line: (vars) => {
      const mins = minutesSince(vars.tourniquet_applied_at);
      return {
        ar: mins == null ? 'وضعنا عاصبة' : `وضعنا عاصبة قبل ${mins} دقيقة`,
        en: mins == null ? 'A tourniquet is on' : `Tourniquet applied ${mins} min ago`,
      };
    },
  },
  {
    match: (vars) => vars.pressure_maintained === true,
    line: () => ({ ar: 'نضغط على الجرح', en: 'Direct pressure is on the wound' }),
  },
  {
    match: (vars) => vars.wound_packed === true,
    line: () => ({ ar: 'حشينا الجرح', en: 'The wound is packed' }),
  },
  {
    match: (vars) => vars.cpr_started === true,
    line: () => ({ ar: 'بدأنا الإنعاش', en: 'CPR is in progress' }),
  },
  {
    match: (vars) => vars.aed_attached === true,
    line: () => ({ ar: 'جهاز AED موصول', en: 'An AED is attached' }),
  },
  {
    match: (vars) => vars.recovery_position_done === true,
    line: () => ({ ar: 'وضعناه بوضعية الإفاقة', en: 'They are in the recovery position' }),
  },
  {
    match: (vars) => vars.cooling_started === true,
    line: () => ({ ar: 'نبرّد الحرق بالماء', en: 'The burn is being cooled with water' }),
  },
  {
    match: (vars) => vars.power_isolated === true,
    line: () => ({ ar: 'فصلنا الكهرباء', en: 'The power has been switched off' }),
  },
  {
    match: (vars) => vars.packaging_saved === true,
    line: () => ({ ar: 'عدنا عبوة المادة', en: 'We have the container of the substance' }),
  },
  {
    match: (vars) => vars.severed_part_secured === true,
    line: () => ({ ar: 'الجزء المقطوع محفوظ معنا', en: 'The severed part is kept with us' }),
  },
  {
    match: (vars) => vars.timer_started === true,
    line: () => ({ ar: 'نحسب مدة النوبة', en: 'We are timing the seizure' }),
  },
];

export function buildHandover({ session, registry, flow, startedAt }) {
  if (!session || !flow) return null;

  const vars = session.vars?.[flow.id] || {};
  const elapsed = minutesSince(startedAt || session.startedAt);
  const age = session.shared?.ageGroup;
  const ageLabel = age ? groupByKey('ageGroup')?.label?.[age] : null;

  // Which flows this session has been through, in order, without duplicates.
  const flowsSeen = [];
  for (const step of session.trail || []) {
    if (!flowsSeen.includes(step.flowId)) flowsSeen.push(step.flowId);
  }

  const done = [];
  for (const flowId of flowsSeen) {
    const flowVars = session.vars?.[flowId] || {};
    for (const item of REPORTABLE) {
      if (!item.match(flowVars)) continue;
      const line = item.line(flowVars);
      if (!done.some((existing) => existing.en === line.en)) done.push(line);
    }
  }

  const alsoSeen = flowsSeen
    .filter((flowId) => flowId !== flow.id)
    .map((flowId) => registry.get(flowId))
    .filter(Boolean)
    .map((other) => other.name);

  return {
    caseName: flow.name,
    ageLabel,
    elapsedMinutes: elapsed,
    done,
    alsoSeen,
    stepCount: (session.trail || []).length,
  };
}

/** One block of text the caller can read out or paste into a message. */
export function handoverText(handover, lang = 'ar') {
  if (!handover) return '';
  const pick = (pair) => (pair ? pair[lang] || pair.en || pair.ar : '');
  const lines = [];

  if (lang === 'ar') {
    lines.push(`الحالة: ${pick(handover.caseName)}`);
    if (handover.ageLabel) lines.push(`المصاب: ${handover.ageLabel.ar}`);
    if (handover.elapsedMinutes != null) lines.push(`من: ${handover.elapsedMinutes} دقيقة`);
    if (handover.done.length) lines.push(`سوينا: ${handover.done.map((line) => line.ar).join('، ')}`);
  } else {
    lines.push(`Case: ${pick(handover.caseName)}`);
    if (handover.ageLabel) lines.push(`Casualty: ${handover.ageLabel.en}`);
    if (handover.elapsedMinutes != null) lines.push(`Started: ${handover.elapsedMinutes} min ago`);
    if (handover.done.length) lines.push(`Done: ${handover.done.map((line) => line.en).join(', ')}`);
  }
  return lines.join('\n');
}
