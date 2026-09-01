/**
 * ROUTING ONLY — not medical content.
 *
 * These are the everyday words people actually type or say, mapped to a flow
 * id, so Phase 3 can pick a case without any AI. They decide *which verified
 * JSON flow to open*; they never contribute a single word of first-aid advice.
 *
 * Phase 4's classifier replaces this as the primary path. This list stays as
 * the offline fallback for when the API is unavailable (Phase 6).
 */
export const ROUTING_KEYWORDS = {
  severe_external_bleeding: {
    ar: [
      'نزيف', 'ينزف', 'دم', 'دمه', 'دمها', 'الدم', 'يقطر دم', 'ما يوقف الدم', 'جرح', 'انجرح',
      'مجروح', 'طعنة', 'انطعن', 'سكين', 'رصاصة', 'انضرب بطلق', 'قطع يده', 'قطع ايده', 'وريد',
    ],
    en: ['bleeding', 'blood', 'bleed', 'wound', 'cut', 'stabbed', 'gunshot', 'severed', 'hemorrhage', 'haemorrhage'],
  },
  choking: {
    ar: [
      'يختنق', 'اختناق', 'شرق', 'مشروق', 'علقت', 'علق', 'حلقه', 'حلگه', 'لقمة', 'اكل وعلق',
      'بلع لعبة', 'بلع شي', 'ما يكدر يتنفس من الاكل', 'ما يطلع صوت',
    ],
    en: ['choking', 'choke', 'stuck in his throat', 'stuck in her throat', 'swallowed a toy', 'airway blocked', 'heimlich'],
  },
  unresponsive_breathing: {
    ar: [
      'ما يرد', 'ما يستجيب', 'مغمى عليه', 'فاقد الوعي', 'ما يصحى', 'ما اكدر اصحيه', 'اغمي',
      'طاح وما يرد', 'يتنفس بس ما يرد', 'ما يفتح عيونه',
    ],
    en: ['unconscious', 'unresponsive', 'fainted', 'passed out', "won't wake up", 'not responding but breathing'],
  },
  cardiac_arrest_cpr: {
    ar: [
      'ما يتنفس', 'ماكو نفس', 'توقف قلبه', 'قلبه وقف', 'انعاش', 'لهاث', 'يلهث', 'صدره ما يتحرك',
      'ما دا يتنفس', 'نبضه وقف', 'سكتة قلبية',
    ],
    en: ['not breathing', 'no pulse', 'cardiac arrest', 'heart stopped', 'cpr', 'gasping', 'chest not moving'],
  },
  burns: {
    ar: [
      'حرق', 'حروق', 'انحرق', 'احترق', 'ماي حار', 'ماء حار', 'زيت حار', 'بخار', 'سلق', 'نار',
      'جلده احترق', 'فقاعات',
    ],
    en: ['burn', 'burned', 'burnt', 'scald', 'scalded', 'hot water', 'steam', 'fire', 'blister'],
  },
  electrical_shock: {
    ar: ['كهرباء', 'كهربائي', 'صعقة', 'انصعق', 'سلك', 'تماس', 'مس كهربائي', 'الكهرباء ضربته'],
    en: ['electric', 'electrical', 'electrocuted', 'shock from wire', 'socket', 'power line', 'live wire'],
  },
  seizure: {
    ar: ['تشنج', 'يتشنج', 'نوبة', 'صرع', 'يرتجف', 'يهتز', 'رجفة', 'تشنجات', 'جسمه تشنج'],
    en: ['seizure', 'fit', 'convulsion', 'convulsing', 'epilepsy', 'shaking uncontrollably', 'twitching'],
  },
  fracture_serious_injury: {
    ar: [
      'كسر', 'انكسر', 'مكسور', 'عظم', 'عظمه', 'طاح', 'سقط', 'وقع من', 'مفصل', 'التوى', 'خلع',
      'ايده ملتوية', 'رجله ملتوية', 'حادث سيارة',
    ],
    en: ['fracture', 'broken bone', 'broke his arm', 'broke her leg', 'fell', 'fall', 'dislocated', 'twisted'],
  },
  heat_illness: {
    ar: ['ضربة شمس', 'شمس', 'حر', 'حرارة عالية', 'جفاف', 'تعب من الحر', 'اجهاد حراري', 'دوخة من الحر'],
    en: ['heatstroke', 'heat stroke', 'heat exhaustion', 'overheated', 'sunstroke', 'dehydrated in the sun'],
  },
  poisoning: {
    ar: [
      'تسمم', 'سم', 'مسموم', 'بلع دواء', 'اخذ حبوب', 'جرعة زايدة', 'مواد تنظيف', 'كلور', 'مبيد',
      'غاز', 'شم غاز', 'اول اوكسيد', 'شرب مادة',
    ],
    en: ['poison', 'poisoning', 'overdose', 'swallowed pills', 'bleach', 'chemical', 'gas leak', 'carbon monoxide', 'fumes'],
  },
};
