import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, ArrowRight, User, Download, ArrowLeft } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { ChatMessage } from '@/hooks/use-chat';
import { generatePDF } from '@/lib/generatePDF';
import { TypingIndicator } from './TypingIndicator';

interface ChatScreenProps {
  messages: ChatMessage[];
  isTyping: boolean;
  onSendMessage: (content: string) => void;
  isEvaluationComplete: boolean;
  onViewResults: () => void;
  onBackToStart: () => void;
  profile: string;
  level: string;
  finalReport: string;
}

export function ChatScreen({
  messages,
  isTyping,
  onSendMessage,
  isEvaluationComplete,
  onViewResults,
  onBackToStart,
  profile,
  level,
  finalReport,
}: ChatScreenProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleDownloadPDF = () => {
    if (finalReport) {
      const today = new Date().toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      generatePDF(finalReport, profile, today);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  const handleSend = () => {
    if (input.trim() && !isTyping) {
      onSendMessage(input.trim());
      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col h-screen max-h-screen bg-background"
    >
      {/* Ambient orbs */}
      <div className="orb-purple fixed w-96 h-96 -top-20 -left-20 rounded-full pointer-events-none" />
      <div className="orb-green fixed w-72 h-72 -bottom-10 -right-10 rounded-full pointer-events-none" />

      {/* Header */}
      <header className="relative z-20 glass-card border-b border-white/8 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* UIX Logo */}
          <img
            src={`${import.meta.env.BASE_URL}images/uix-logo.png`}
            alt="UIX"
            className="w-8 h-8 object-contain"
          />
          <div className="w-px h-6 bg-white/10" />
          {/* AI Avatar */}
          <div className="w-9 h-9 rounded-xl overflow-hidden flex-shrink-0"
            style={{ background: 'var(--gradient-brand)', padding: '1.5px' }}>
            <div className="w-full h-full rounded-xl overflow-hidden bg-card">
              <img src={`${import.meta.env.BASE_URL}images/avatar-ai.png`} alt="AI" className="w-full h-full object-cover" />
            </div>
          </div>
          <div>
            <h2 className="font-display font-semibold text-sm text-foreground">Asistente UiX</h2>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
              <span className="text-xs text-muted-foreground">En línea</span>
              {profile && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: 'rgba(123,63,217,0.15)', color: 'hsl(267 75% 70%)' }}>
                  {profile}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onBackToStart}
            className="flex items-center gap-2 px-3 py-2 rounded-xl glass-card border border-white/10 text-sm font-semibold text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver al inicio</span>
          </button>

          {isEvaluationComplete && (
            <>
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={onViewResults}
                className="flex items-center gap-2 px-4 py-2 rounded-xl glass-card border border-white/10 text-sm font-semibold text-foreground"
              >
                <ArrowRight className="w-4 h-4" />
                <span>Ver avance</span>
              </motion.button>

              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={handleDownloadPDF}
                className="flex items-center gap-2 px-4 py-2 rounded-xl btn-brand text-sm font-semibold text-white"
              >
                <Download className="w-4 h-4" />
                <span>Descargar PDF</span>
              </motion.button>
            </>
          )}
        </div>
      </header>

      {/* Messages Area */}
      <div className="relative z-10 flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-3xl mx-auto space-y-5">

          {/* Empty state */}
          {messages.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-16 space-y-4"
            >
              <div className="w-16 h-16 mx-auto rounded-2xl overflow-hidden"
                style={{ background: 'var(--gradient-brand)', padding: '2px' }}>
                <div className="w-full h-full rounded-2xl overflow-hidden bg-card">
                  <img src={`${import.meta.env.BASE_URL}images/avatar-ai.png`} alt="AI" className="w-full h-full object-cover" />
                </div>
              </div>
              <h3 className="text-xl font-display font-semibold text-foreground">
                Conversación guiada de desarrollo
              </h3>
              <p className="text-muted-foreground max-w-md mx-auto text-sm leading-relaxed">
                Responde cada pregunta con A, B o C. El asistente irá recorriendo competencias clave según tu perfil y al final te entregará un resumen práctico.
              </p>
            </motion.div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.25 }}
                  className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}
                >
                  <div className={cn('flex max-w-[85%] md:max-w-[75%] gap-2.5', isUser ? 'flex-row-reverse' : 'flex-row')}>

                    {/* Avatar */}
                    <div className="flex-shrink-0 mt-auto">
                      {isUser ? (
                        <div className="w-7 h-7 rounded-full flex items-center justify-center"
                          style={{ background: 'rgba(123,63,217,0.2)', border: '1px solid rgba(123,63,217,0.4)' }}>
                          <User className="w-4 h-4 text-primary" />
                        </div>
                      ) : (
                        <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0"
                          style={{ background: 'var(--gradient-brand)', padding: '1.5px' }}>
                          <div className="w-full h-full rounded-full overflow-hidden bg-card">
                            <img src={`${import.meta.env.BASE_URL}images/avatar-ai.png`} alt="AI" className="w-full h-full object-cover" />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Bubble */}
                    <div className={cn(
                      'px-4 py-3 text-sm leading-relaxed',
                      isUser
                        ? 'rounded-2xl rounded-br-sm text-white'
                        : 'glass-card rounded-2xl rounded-bl-sm text-foreground border border-white/8'
                    )}
                      style={isUser ? { background: 'var(--gradient-brand)', boxShadow: '0 0 20px rgba(123,63,217,0.3)' } : {}}
                    >
                      {isUser ? (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      ) : (
                        <div className="prose prose-sm max-w-none prose-invert
                          prose-p:leading-relaxed prose-p:my-1
                          prose-strong:text-foreground prose-strong:font-semibold
                          prose-li:text-foreground prose-ul:my-2 prose-ol:my-2
                          prose-headings:font-display prose-headings:text-foreground">
                          <ReactMarkdown>{msg.content || '...'}</ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {isTyping && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start pl-9"
            >
              <TypingIndicator />
            </motion.div>
          )}

          <div ref={messagesEndRef} className="h-2" />
        </div>
      </div>

      {/* Input Area */}
      <div className="relative z-20 glass-card border-t border-white/8 p-4 md:p-5">
        <div className="max-w-3xl mx-auto">
          <div className="relative glass-card rounded-2xl border border-white/10 focus-within:border-primary/50 transition-colors duration-200"
            style={{ boxShadow: 'none' }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe tu respuesta aquí..."
              className="w-full max-h-32 bg-transparent border-none resize-none py-3.5 pl-4 pr-14 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0 rounded-2xl text-sm"
              rows={1}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isTyping}
              className="absolute right-2 bottom-2 p-2.5 rounded-xl text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200"
              style={{ background: input.trim() && !isTyping ? 'var(--gradient-brand)' : 'rgba(255,255,255,0.1)' }}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-center mt-2 text-xs text-muted-foreground">
            <kbd className="font-mono bg-muted px-1.5 py-0.5 rounded border border-white/10 text-xs">Enter</kbd> para enviar
            · <kbd className="font-mono bg-muted px-1.5 py-0.5 rounded border border-white/10 text-xs">Shift + Enter</kbd> para salto de línea
          </p>
        </div>
      </div>
    </motion.div>
  );
}
