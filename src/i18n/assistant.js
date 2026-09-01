/**
 * SANAD's own voice.
 *
 * IMPORTANT: nothing in this file is medical. It is the connective tissue that
 * makes the app feel like someone is with you — greeting, acknowledgement,
 * what-happens-next — wrapped around the verified instructions, which come
 * only from the JSON flows. If a line here ever tells the user to *do*
 * something to a casualty, it is a bug.
 */
export const ASSISTANT = {
  presence: {
    ar: 'أنا وياك خطوة بخطوة.',
    en: "I'm with you, step by step.",
  },
  thinking: {
    ar: 'لحظة… أقرأ وصفك',
    en: 'One moment… reading what you wrote',
  },
  understood: {
    ar: 'فهمت عليك.',
    en: 'Got it.',
  },
  willGuide: {
    ar: 'راح أمشي وياك خطوة خطوة، ما راح أنطيك كل شي مرة وحدة.',
    en: "I'll take you one step at a time — not everything at once.",
  },
  needOneThing: {
    ar: 'محتاج أعرف شي واحد قبل ما نبدأ.',
    en: 'I need one detail before we start.',
  },
  couldNotTell: {
    ar: 'ما قدرت أحدد الحالة من هذا الوصف. اختارها من القائمة وأنا أكمل وياك.',
    en: "I couldn't tell which case this is. Pick it from the list and I'll take it from there.",
  },
  firstStep: {
    ar: 'خلينا نبدأ. سوّي هاي الخطوة الحين وأنا أنطيك اللي بعدها.',
    en: "Let's begin. Do this now and I'll give you the next one.",
  },
  answerFromWhatYouSee: {
    ar: 'جاوب حسب اللي تشوفه هسه.',
    en: 'Answer from what you can see right now.',
  },
  stayWithThem: {
    ar: 'ابقَ وياه. إذا تغير شي، اضغط عليه من تحت.',
    en: 'Stay with them. If anything changes, tap it below.',
  },
  resume: {
    ar: 'كنا بنص حالة.',
    en: 'We were in the middle of something.',
  },
  stillHere: {
    ar: 'أنا وياك.',
    en: "I'm still here.",
  },
};
