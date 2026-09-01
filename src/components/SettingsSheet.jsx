import React, { useEffect, useState } from 'react';
import { useApp } from '../app/AppContext.jsx';
import { REGIONS, getRegion } from '../config/regions.js';
import { Modal, Chip, SettingLabel } from './ui.jsx';
import { hasNaturalVoice, listVoices, onVoicesReady, speak, stopSpeaking, ttsSupported } from '../voice/speech.js';

/**
 * Everything configurable lives here, so no screen has to carry settings
 * chrome: language, text size, read-aloud, and the region that decides which
 * emergency number the call button dials.
 */
export function SettingsSheet({ onClose, onDiagnostics }) {
  const {
    lang,
    setLang,
    themeChoice,
    setTheme,
    textScale,
    setTextScale,
    readAloud,
    setReadAloud,
    regionId,
    setRegionId,
    customNumber,
    setCustomNumber,
    voiceUris,
    setVoiceUri,
    registry,
  } = useApp();
  const [draft, setDraft] = useState(customNumber || '');
  const region = getRegion(regionId);
  const needsNumber = !region.number;

  // Browsers populate their voice list asynchronously, so a menu built on first
  // render is empty on most machines.
  const [voices, setVoices] = useState(() => listVoices(lang));
  const [natural, setNatural] = useState(() => hasNaturalVoice(lang));
  useEffect(
    () =>
      onVoicesReady(() => {
        setVoices(listVoices(lang));
        setNatural(hasNaturalVoice(lang));
      }),
    [lang],
  );
  useEffect(() => () => stopSpeaking(), []);

  const sample =
    lang === 'ar'
      ? 'اضغط بقوة على مكان النزف ولا ترفع يدك.'
      : 'Press hard on the wound and do not lift your hand.';

  return (
    <Modal onClose={onClose} align="top">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <SettingLabel ar="اللغة" en="LANGUAGE" />
          <div className="flex gap-2">
            <Chip active={lang === 'ar'} onClick={() => setLang('ar')}>
              العربية
            </Chip>
            <Chip active={lang === 'en'} onClick={() => setLang('en')}>
              English
            </Chip>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <SettingLabel ar="المظهر" en="APPEARANCE" />
          <div className="flex gap-2">
            <Chip active={themeChoice === 'light'} onClick={() => setTheme('light')}>
              فاتح · Light
            </Chip>
            <Chip active={themeChoice === 'dark'} onClick={() => setTheme('dark')}>
              داكن · Dark
            </Chip>
            <Chip active={themeChoice === 'auto'} onClick={() => setTheme('auto')}>
              تلقائي · Auto
            </Chip>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <SettingLabel ar="حجم النص" en="TEXT SIZE" />
          <div className="flex gap-2">
            <Chip active={textScale === 'normal'} onClick={() => setTextScale('normal')}>
              عادي · Normal
            </Chip>
            <Chip active={textScale === 'large'} onClick={() => setTextScale('large')}>
              كبير · Large
            </Chip>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <SettingLabel ar="القراءة الصوتية" en="READ ALOUD" />
          <div className="flex gap-2">
            <Chip active={readAloud} onClick={() => setReadAloud(true)}>
              تشغيل · On
            </Chip>
            <Chip active={!readAloud} onClick={() => setReadAloud(false)}>
              إيقاف · Off
            </Chip>
          </div>
        </div>

        {readAloud && ttsSupported() ? (
          <div className="flex flex-col gap-2">
            <SettingLabel ar="الصوت" en="VOICE" />
            <div className="flex gap-2">
              <select
                value={voiceUris[lang] || ''}
                onChange={(event) => setVoiceUri(lang, event.target.value)}
                className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-card px-3 text-base text-ink"
              >
                <option value="">
                  {lang === 'ar' ? 'أفضل صوت متاح' : 'Best available voice'}
                </option>
                {voices.map((voice) => (
                  <option key={voice.voiceURI} value={voice.voiceURI}>
                    {voice.name} ({voice.lang})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  stopSpeaking();
                  speak(sample, { lang });
                }}
                className="h-12 shrink-0 rounded-xl bg-brand px-4 text-[15px] font-medium text-on-brand"
              >
                {lang === 'ar' ? 'جرّب' : 'Test'}
              </button>
            </div>
            <p className="text-xs leading-relaxed text-muted-3">
              {!voices.length
                ? lang === 'ar'
                  ? 'لا توجد أصوات عربية مثبّتة على هذا الجهاز.'
                  : 'This device has no voices installed for this language.'
                : natural
                  ? lang === 'ar'
                    ? 'الأصوات المكتوب بجانبها Natural أو Online أفضل بكثير. الخطوات المسجّلة مسبقًا لا تتأثر بهذا الخيار.'
                    : 'Voices marked Natural or Online sound far better. Steps with pre-recorded audio are unaffected.'
                  : lang === 'ar'
                    ? 'كل الأصوات هنا قديمة وآلية. افتح سند في متصفح Microsoft Edge — يعطيك أصواتًا عراقية طبيعية (Online Natural) بدون أي تثبيت.'
                    : 'Every voice here is a legacy robotic one. Open SANAD in Microsoft Edge — it offers natural Iraqi voices (Online Natural) with nothing to install.'}
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <SettingLabel ar="منطقة الطوارئ" en="EMERGENCY REGION" />
          <select
            value={regionId}
            onChange={(event) => setRegionId(event.target.value)}
            className="h-12 w-full rounded-xl border border-line bg-card px-3 text-base text-ink"
          >
            {REGIONS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label.ar} · {item.label.en}
                {item.number ? ` (${item.number})` : ' — غير محدد'}
              </option>
            ))}
          </select>
          {needsNumber ? (
            <div className="flex gap-2">
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={() => setCustomNumber(draft.replace(/[^\d+#*]/g, '').trim())}
                inputMode="tel"
                dir="ltr"
                placeholder="122"
                className="font-latin h-12 min-w-0 flex-1 rounded-xl border border-line bg-card px-3 text-lg text-ink"
              />
              <button
                type="button"
                onClick={() => setCustomNumber(draft.replace(/[^\d+#*]/g, '').trim())}
                className="h-12 rounded-xl bg-brand px-4 text-[15px] font-medium text-on-brand"
              >
                حفظ · Save
              </button>
            </div>
          ) : null}
          <p className="text-xs leading-relaxed text-muted-3">
            {region.verified
              ? `${region.source?.title || ''}`
              : 'لا يوجد رقم موثّق لهذه المنطقة — اكتب رقم الإسعاف المحلي. No verified number for this region.'}
          </p>
        </div>

        <div className="flex items-center justify-between border-t border-line pt-4">
          <button
            type="button"
            onClick={onDiagnostics}
            className="font-latin text-xs tracking-[0.1em] text-muted-3 hover:text-brand"
          >
            FLOW DIAGNOSTICS · {registry.issues.length}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-sub px-4 py-2 text-[15px] font-medium text-brand hover:bg-sub-hover"
          >
            تم · Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
