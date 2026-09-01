/**
 * Region-configured emergency numbers.
 *
 * Deliberately conservative: the ONLY number shipped is Erbil's 122, because
 * it is the only one published by a government source (KRG) in the flow data.
 * Every other region resolves to null until it is verified with the Iraqi
 * Ministry of Health — the UI then asks the user to set their own local number
 * rather than dialling something we cannot stand behind.
 */

export const REGIONS = [
  {
    id: 'erbil',
    label: { ar: 'أربيل', en: 'Erbil' },
    number: '122',
    verified: true,
    source: {
      title: "KRG — Erbil's emergency line 122",
      url: 'https://gov.krd/dmi-en/activities/news-and-press-releases/2023/january/erbil-s-emergency-line-122-fast-and-free-help-to-all/',
    },
  },
  { id: 'baghdad', label: { ar: 'بغداد', en: 'Baghdad' }, number: null, verified: false },
  { id: 'basra', label: { ar: 'البصرة', en: 'Basra' }, number: null, verified: false },
  { id: 'sulaymaniyah', label: { ar: 'السليمانية', en: 'Sulaymaniyah' }, number: null, verified: false },
  { id: 'duhok', label: { ar: 'دهوك', en: 'Duhok' }, number: null, verified: false },
  { id: 'other', label: { ar: 'منطقة أخرى', en: 'Other region' }, number: null, verified: false },
];

export const DEFAULT_REGION_ID = 'erbil';

export const getRegion = (regionId) =>
  REGIONS.find((region) => region.id === regionId) || REGIONS[REGIONS.length - 1];
