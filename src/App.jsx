import React, { useEffect, useState } from 'react';
import { AppProvider, useApp } from './app/AppContext.jsx';
import { useEmergencySession } from './app/useEmergencySession.js';
import { saveSession, clearSession, loadSession } from './app/sessionStore.js';
import { HomeScreen } from './screens/HomeScreen.jsx';
import { ManualSelectScreen } from './screens/ManualSelectScreen.jsx';
import { EmergencyScreen } from './screens/EmergencyScreen.jsx';
import { DiagnosticsScreen } from './screens/DiagnosticsScreen.jsx';
import { SettingsSheet } from './components/SettingsSheet.jsx';
import { MicSheet } from './components/MicSheet.jsx';

function Shell() {
  const { registry, swapping } = useApp();
  const [screen, setScreen] = useState('home');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [micOpen, setMicOpen] = useState(false);
  const [spokenText, setSpokenText] = useState('');
  const [resumable, setResumable] = useState(() => loadSession(registry));
  const { view, start, resume, exit, choose, confirm, cancel, back, restart, undoAssumption } =
    useEmergencySession(registry);

  // Every step is written down, so a lock screen or a reload cannot lose it.
  useEffect(() => {
    if (view?.session) saveSession(view.session);
  }, [view?.session]);

  const home = () => {
    exit();
    clearSession();
    setResumable(null);
    setScreen('home');
  };

  const startCase = (flowId) => {
    start(flowId);
    setResumable(null);
    setScreen('emergency');
  };

  const resumeCase = () => {
    if (!resumable) return;
    resume(resumable.session);
    setResumable(null);
    setScreen('emergency');
  };

  const discardResume = () => {
    clearSession();
    setResumable(null);
  };

  let body;
  if (screen === 'emergency' && view) {
    body = (
      <EmergencyScreen
        view={view}
        actions={{ choose, confirm, cancel, back, restart, home, undoAssumption }}
        onSettings={() => setSettingsOpen(true)}
      />
    );
  } else if (screen === 'manual') {
    body = <ManualSelectScreen onStart={startCase} onHome={home} />;
  } else if (screen === 'diagnostics') {
    body = <DiagnosticsScreen onHome={home} />;
  } else {
    body = (
      <HomeScreen
        onStart={startCase}
        onManual={() => setScreen('manual')}
        onSettings={() => setSettingsOpen(true)}
        onMic={() => setMicOpen(true)}
        spokenText={spokenText}
        resumable={resumable}
        onResume={resumeCase}
        onDiscardResume={discardResume}
      />
    );
  }

  return (
    <div className={`lang-swap-root min-h-full ${swapping ? 'lang-swapping' : ''}`}>
      {body}
      {settingsOpen ? (
        <SettingsSheet
          onClose={() => setSettingsOpen(false)}
          onDiagnostics={() => {
            setSettingsOpen(false);
            setScreen('diagnostics');
          }}
        />
      ) : null}
      {micOpen ? (
        <MicSheet
          onClose={() => setMicOpen(false)}
          onUse={(transcript) => {
            setMicOpen(false);
            setSpokenText(transcript);
          }}
        />
      ) : null}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
