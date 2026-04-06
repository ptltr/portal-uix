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

export default function Home() {
  const [phase, setPhase] = useState<AppPhase>('welcome');
  const [selectedProfile, setSelectedProfile] = useState<string>('');
  const [selectedLevel, setSelectedLevel] = useState<string>('');

  const {
    conversationId,
    setConversationId,
    messages,
    isTyping,
    sendMessage,
    isEvaluationComplete,
    resetChat,
    employeeName,
    employeeEmail,
    setEmployeeName,
    setEmployeeEmail,
    finalReport,
  } = useChat();

  const hasSavedSession = messages.length > 0 || Boolean(conversationId) || Boolean(finalReport);

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
    if (phase !== 'welcome' && !conversationId && messages.length === 0) {
      setPhase('welcome');
    }
  }, [phase, conversationId, messages.length]);

  const handleStart = (id: number, profile: string, level: string, userName: string, userEmail: string) => {
    setConversationId(id);
    setSelectedProfile(profile);
    setSelectedLevel(level);
    setEmployeeName(userName);
    setEmployeeEmail(userEmail);
    setPhase('chat');
  };

  const handleViewResults = () => {
    setPhase('results');
  };

  const handleBackToChat = () => {
    setPhase('chat');
  };

  const handleBackToStart = () => {
    setPhase('welcome');
  };

  const handleResumeSession = () => {
    setPhase('chat');
  };

  const handleRestart = () => {
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
            finalReport={finalReport}
            assessmentId={conversationId ? String(conversationId) : undefined}
          />
        )}

      </AnimatePresence>
    </div>
  );
}
