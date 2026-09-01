/**
 * Answer keys and monitor signals in the flow JSON are machine identifiers
 * ("no_or_gasping", "weak_or_silent_cough"). This file is the presentation
 * layer for them.
 *
 * A node's own `answer_labels` always wins. This lexicon is the fallback, and
 * `humanize()` is the last resort so an unknown key still renders as readable
 * text instead of a raw identifier.
 */

export const ANSWER_LABELS = {
  yes: { ar: 'نعم', en: 'Yes' },
  no: { ar: 'لا', en: 'No' },
  uncertain: { ar: 'ما أدري', en: 'Not sure' },
  unknown: { ar: 'ما أعرف', en: "I don't know" },

  no_or_gasping: { ar: 'لا — أو لهاث متقطع فقط', en: 'No — or only gasping' },
  not_breathing_normally: { ar: 'ما يتنفس بشكل طبيعي', en: 'Not breathing normally' },
  yes_but_unresponsive: { ar: 'يتنفس بس ما يستجيب', en: 'Breathing, but unresponsive' },
  yes_and_awake: { ar: 'يتنفس وواعي', en: 'Breathing and awake' },
  unresponsive_breathing: { ar: 'ما يستجيب بس يتنفس', en: 'Unresponsive but breathing' },
  severe_bleeding: { ar: 'يوجد نزيف شديد', en: 'There is severe bleeding' },
  seizure: { ar: 'عنده تشنج', en: 'Having a seizure' },

  adult: { ar: 'بالغ', en: 'Adult' },
  child: { ar: 'طفل فوق سنة', en: 'Child over 1 year' },
  infant: { ar: 'رضيع أقل من سنة', en: 'Infant under 1 year' },

  calling: { ar: 'أنا أتصل الآن', en: "I'm calling now" },
  someone_else_calling: { ar: 'شخص ثاني يتصل', en: 'Someone else is calling' },
  alone_no_phone: { ar: 'أنا لوحدي وماكو هاتف', en: "I'm alone with no phone" },

  object_out: { ar: 'خرج الجسم', en: 'The object came out' },
  still_choking: { ar: 'بعده يختنق', en: 'Still choking' },
  still_effective: { ar: 'بعده يكح بقوة', en: 'Still coughing strongly' },
  worse: { ar: 'صارت أسوأ', en: 'Getting worse' },
  unresponsive: { ar: 'فقد الاستجابة', en: 'Became unresponsive' },

  spurting: { ar: 'الدم يفور ويقفز', en: 'Spurting and pumping' },
  steady: { ar: 'يسيل بثبات', en: 'Flowing steadily' },
  soaking_through: { ar: 'ينفذ من خلال القماش', en: 'Soaking straight through' },
  slowing: { ar: 'بدأ يخف', en: 'Slowing down' },
  stopped_and_minor: { ar: 'توقف والجرح بسيط', en: 'Stopped, and the wound is minor' },
  limb: { ar: 'ذراع أو ساق', en: 'Arm or leg' },
  junctional_or_torso: { ar: 'الرقبة أو الجذع', en: 'Neck or torso' },
  amputation: { ar: 'جزء مقطوع من الجسم', en: 'A body part is severed' },

  electrical: { ar: 'كهربائي', en: 'Electrical' },
  chemical: { ar: 'كيميائي', en: 'Chemical' },
  burn: { ar: 'يوجد حروق', en: 'There are burns' },
  other_or_none: { ar: 'إصابات أخرى أو لا شيء', en: 'Other injuries or none' },

  swallowed: { ar: 'بلع المادة', en: 'Swallowed it' },
  inhaled: { ar: 'استنشق غاز أو أبخرة', en: 'Inhaled gas or fumes' },
  skin_or_eye: { ar: 'على الجلد أو بالعين', en: 'On the skin or in the eyes' },
};

export const SIGNAL_LABELS = {
  seizure_stops: { ar: 'توقفت التشنجات', en: 'The seizure has stopped' },
  duration_over_5_minutes: { ar: 'مرت أكثر من 5 دقائق', en: 'It has lasted more than 5 minutes' },
  another_seizure_without_recovery: {
    ar: 'صارت نوبة ثانية بدون إفاقة',
    en: 'Another seizure without recovery',
  },
  serious_injury: { ar: 'صارت إصابة خطيرة', en: 'A serious injury happened' },
  normal_breathing_returns: { ar: 'رجع يتنفس بشكل طبيعي', en: 'Normal breathing has returned' },
  emergency_services_take_over: { ar: 'وصل الإسعاف واستلم الحالة', en: 'Emergency services took over' },
  rescuer_exhausted: { ar: 'ما أقدر أكمل', en: "I can't continue" },
  breathing_stops_or_becomes_abnormal: {
    ar: 'توقف تنفسه أو صار غير طبيعي',
    en: 'Breathing stopped or became abnormal',
  },
  person_wakes_up: { ar: 'صحى واستعاد وعيه', en: 'They woke up' },
  weak_or_silent_cough: { ar: 'كحته صارت ضعيفة أو بلا صوت', en: 'Cough became weak or silent' },
  unable_to_speak_or_breathe: { ar: 'ما يقدر يحچي أو يتنفس', en: "Can't speak or breathe" },
  unresponsive: { ar: 'فقد الاستجابة', en: 'Became unresponsive' },
  unresponsive_but_breathing: { ar: 'ما يستجيب بس يتنفس', en: 'Unresponsive but breathing' },
  object_expelled: { ar: 'خرج الجسم', en: 'The object came out' },
  not_breathing_normally: { ar: 'ما يتنفس بشكل طبيعي', en: 'Not breathing normally' },
  not_improved_after_30_minutes: { ar: 'ما تحسن بعد 30 دقيقة', en: 'No better after 30 minutes' },
  confusion_or_unusual_behavior: { ar: 'صار مرتبك أو سلوكه غريب', en: 'Confused or behaving strangely' },
  fully_recovered: { ar: 'تعافى تمامًا', en: 'Fully recovered' },
  seizure: { ar: 'صار عنده تشنج', en: 'A seizure started' },
  'dressing soaked through': { ar: 'الضماد تشبع بالدم', en: 'The dressing is soaked through' },
  'shock signs appear': { ar: 'ظهرت علامات الصدمة', en: 'Signs of shock appeared' },
  'stops responding': { ar: 'ما عاد يستجيب', en: 'Stopped responding' },
};

export function humanize(key) {
  return String(key)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

export function answerLabel(answer, lang) {
  const own = answer.label?.[lang] || answer.label?.en || answer.label?.ar;
  if (own) return own;
  const lexicon = ANSWER_LABELS[answer.key];
  if (lexicon) return lexicon[lang] || lexicon.en || lexicon.ar;
  return humanize(answer.key);
}

export function signalLabel(signal, lang) {
  const lexicon = SIGNAL_LABELS[signal];
  if (lexicon) return lexicon[lang] || lexicon.en || lexicon.ar;
  return humanize(signal);
}
