import React, { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { WelcomeScreen } from '@/components/WelcomeScreen';
import { ChatScreen } from '@/components/ChatScreen';
import { ResultsScreen } from '@/components/ResultsScreen';
import { useChat } from '@/hooks/use-chat';

type AppPhase = 'welcome' | 'chat' | 'results';

const HOME_UI_STORAGE_KEY = 'uix-chat-home-ui-v1';

interface PersistedHomeUIState {
  phase: AppPhase;
  selectedProfile: string;
  selectedLevel: string;
}

interface ReminderResumeHint {
  resume: boolean;
  email: string;
  name: string;
}

const buildFallbackNameFromEmail = (email: string): string => {
  const local = (email.split('@')[0] || '').trim();
  if (!local) return 'Colaborador';

  const normalized = local
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return 'Colaborador';

  return normalized
    .split(' ')
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ');
};

const getReminderResumeHint = (): ReminderResumeHint => {
  if (typeof window === 'undefined') {
    return { resume: false, email: '', name: '' };
  }

  const params = new URLSearchParams(window.location.search);
  const resume = params.get('resume') === '1';
  const email = (params.get('email') || '').trim();
  const name = (params.get('name') || '').trim();

  return { resume, email, name };
};

export default function Home() {
  const reminderResumeHint = getReminderResumeHint();
  const [phase, setPhase] = useState<AppPhase>('welcome');
  const [selectedProfile, setSelectedProfile] = useState<string>('');
  const [selectedLevel, setSelectedLevel] = useState<string>('');
  const [isStartingConversation, setIsStartingConversation] = useState(false);

  const {
    conversationId,
    setConversationId,
    messages,
    isTyping,
    sendMessage,
    isEvaluationComplete,
    startNewEvaluation,
    resetChat,
    employeeName,
    employeeEmail,
    setEmployeeName,
    setEmployeeEmail,
    trainerName,
    setTrainerName,
    finalReport,
    checkSessionForEmail,
    loadSessionForEmail,
    forceResumeLatestLocalSession,
    recoverSessionFromProgress,
  } = useChat();

  const hasSavedSession = messages.length > 0 || Boolean(finalReport);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HOME_UI_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as PersistedHomeUIState;
      if (parsed.phase === 'chat' || parsed.phase === 'results' || parsed.phase === 'welcome') {
        setPhase(parsed.phase);
      }
      setSelectedProfile(parsed.selectedProfile || '');
      setSelectedLevel(parsed.selectedLevel || '');
    } catch {
      // Ignore malformed local data and continue with defaults.
    }
  }, []);

  useEffect(() => {
    const snapshot: PersistedHomeUIState = {
      phase,
      selectedProfile,
      selectedLevel,
    };

    try {
      localStorage.setItem(HOME_UI_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Ignore storage write errors (quota/private mode).
    }
  }, [phase, selectedProfile, selectedLevel]);

  useEffect(() => {
    if (!isStartingConversation && phase !== 'welcome' && !conversationId && messages.length === 0 && !finalReport) {
      setPhase('welcome');
    }
  }, [isStartingConversation, phase, conversationId, messages.length, finalReport]);

  useEffect(() => {
    if (isStartingConversation && phase === 'chat' && Boolean(conversationId)) {
      setIsStartingConversation(false);
    }
  }, [isStartingConversation, phase, conversationId]);

  const handleStart = (id: number, profile: string, level: string, userName: string, userEmail: string, userTrainerName: string) => {
    // Start a fresh runtime flow but preserve saved history in case the click was accidental.
    setIsStartingConversation(true);
    startNewEvaluation(profile);
    setConversationId(id);
    setSelectedProfile(profile);
    setSelectedLevel(level);
    setEmployeeName(userName);
    setEmployeeEmail(userEmail);
    setTrainerName(userTrainerName);
    setPhase('chat');
  };

  const handleViewResults = () => {
    setPhase('results');
  };

  const handleBackToChat = () => {
    setPhase('chat');
  };

  const handleBackToStart = () => {
    setIsStartingConversation(false);
    setPhase('welcome');
  };

  const handleResumeSession = async (payload?: { userName: string; userEmail: string; profile: string; trainerName: string; source: 'local' | 'reminder' | 'remote' }) => {
    if (payload) {
      const resolvedEmail = (payload.userEmail || employeeEmail).trim();
      const resolvedName = (payload.userName || employeeName).trim() || buildFallbackNameFromEmail(resolvedEmail);
      const resolvedTrainerName = (payload.trainerName || trainerName).trim();

      setEmployeeName(resolvedName);
      setEmployeeEmail(resolvedEmail);
      setTrainerName(resolvedTrainerName);
      if (payload.profile) {
        setSelectedProfile(payload.profile);
      }

      let restored = false;
      if (resolvedEmail) {
        restored = await loadSessionForEmail(resolvedEmail);
      }

      if (!restored) {
        const recoveredFromLocal = forceResumeLatestLocalSession();
        if (recoveredFromLocal) {
          setPhase('chat');
          return true;
        }

        const recoveredFromProgress = await recoverSessionFromProgress(resolvedEmail, resolvedName);
        if (recoveredFromProgress) {
          setPhase('chat');
          return true;
        }
        return false;
      }

      setPhase('chat');
      return true;
    }

    const hasExistingContent = messages.length > 0 || Boolean(finalReport);
    if (!hasExistingContent) {
      return false;
    }

    setPhase('chat');
    return true;
  };

  const handleRestart = () => {
    setIsStartingConversation(false);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('resume');
      url.searchParams.delete('email');
      url.searchParams.delete('name');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }

    resetChat();
    setSelectedProfile('');
    setSelectedLevel('');
    setPhase('welcome');
    try {
      localStorage.removeItem(HOME_UI_STORAGE_KEY);
    } catch {
      // Ignore storage cleanup errors.
    }
  };

  const handleSendMessage = (content: string) => {
    if (conversationId) {
      sendMessage(content, conversationId);
    }
  };

  return (
    <div className="font-sans antialiased text-foreground bg-background min-h-screen overflow-hidden">
      <AnimatePresence mode="wait">

        {phase === 'welcome' && (
          <WelcomeScreen
            key="welcome"
            onStart={handleStart}
            hasSavedSession={hasSavedSession}
            onResumeSession={handleResumeSession}
            onStartFresh={handleRestart}
            checkSessionByEmail={checkSessionForEmail}
            initialUserName={reminderResumeHint.name}
            initialUserEmail={reminderResumeHint.email}
            resumeFromReminderLink={reminderResumeHint.resume}
          />
        )}

        {phase === 'chat' && (
          <ChatScreen
            key="chat"
            messages={messages}
            isTyping={isTyping}
            onSendMessage={handleSendMessage}
            isEvaluationComplete={isEvaluationComplete}
            onViewResults={handleViewResults}
            onBackToStart={handleBackToStart}
            profile={selectedProfile}
            level={selectedLevel}
            finalReport={finalReport}
          />
        )}

        {phase === 'results' && (
          <ResultsScreen
            key="results"
            messages={messages}
            onRestart={handleRestart}
            onBackToChat={handleBackToChat}
            profile={selectedProfile}
            level={selectedLevel}
            employeeName={employeeName}
            employeeEmail={employeeEmail}
            trainerName={trainerName}
            finalReport={finalReport}
            assessmentId={conversationId ? String(conversationId) : undefined}
          />
        )}

      </AnimatePresence>
    </div>
  );
}
