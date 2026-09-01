/**
 * Short display names for the selection grid only.
 *
 * The JSON `name_ar` / `name_en` stay the source of truth and are what you see
 * inside Emergency Mode; a few of them are long clinical titles that make the
 * grid hard to scan under stress. Anything not listed here falls back to the
 * full name, so adding a flow file still needs no code change.
 */
export const SHORT_LABELS = {
  severe_external_bleeding: { ar: 'نزيف شديد', en: 'Severe Bleeding' },
  choking: { ar: 'اختناق', en: 'Choking' },
  unresponsive_breathing: { ar: 'غير مستجيب ويتنفس', en: 'Unresponsive but Breathing' },
  cardiac_arrest_cpr: { ar: 'إنعاش قلبي / لا يتنفس', en: 'CPR / Not Breathing' },
  burns: { ar: 'حروق', en: 'Burns' },
  electrical_shock: { ar: 'صعقة كهربائية', en: 'Electrical Shock' },
  seizure: { ar: 'تشنج / صرع', en: 'Seizure' },
  fracture_serious_injury: { ar: 'كسر / إصابة خطيرة', en: 'Fracture / Serious Injury' },
  heat_illness: { ar: 'ضربة شمس', en: 'Heatstroke' },
  poisoning: { ar: 'تسمم', en: 'Poisoning' },
};

export const shortName = (flow) => SHORT_LABELS[flow.id] || flow.name;
