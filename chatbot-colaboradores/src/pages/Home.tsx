import React, { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { WelcomeScreen } from '@/components/WelcomeScreen';
import { ChatScreen } from '@/components/ChatScreen';
import { ResultsScreen } from '@/components/ResultsScreen';
import { useChat } from '@/hooks/use-chat';

type AppPhase = 'welcome' | 'chat' | 'results';

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
    resetChat
  } = useChat();

  // Auto-navigate to results as soon as the AI sends the report
  useEffect(() => {
    if (isEvaluationComplete && phase === 'chat') {
      // Small delay so the user sees the final message stream complete
      const t = setTimeout(() => setPhase('results'), 1200);
      return () => clearTimeout(t);
    }
  }, [isEvaluationComplete, phase]);

  const handleStart = (id: number, profile: string, level: string) => {
    setConversationId(id);
    setSelectedProfile(profile);
    setSelectedLevel(level);
    setPhase('chat');
  };

  const handleViewResults = () => {
    setPhase('results');
  };

  const handleRestart = () => {
    resetChat();
    setSelectedProfile('');
    setSelectedLevel('');
    setPhase('welcome');
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
          <WelcomeScreen key="welcome" onStart={handleStart} />
        )}

        {phase === 'chat' && (
          <ChatScreen
            key="chat"
            messages={messages}
            isTyping={isTyping}
            onSendMessage={handleSendMessage}
            isEvaluationComplete={isEvaluationComplete}
            onViewResults={handleViewResults}
            profile={selectedProfile}
            level={selectedLevel}
          />
        )}

        {phase === 'results' && (
          <ResultsScreen
            key="results"
            messages={messages}
            onRestart={handleRestart}
            profile={selectedProfile}
            level={selectedLevel}
          />
        )}

      </AnimatePresence>
    </div>
  );
}
