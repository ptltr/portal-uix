'use client';

import { useState, useRef, useEffect } from 'react';
import { Message, Role } from '@/types/index';

interface ChatbotProps {
  onConversationComplete: (messages: Message[]) => void;
  loading: boolean;
  employeeName: string;
  employeeRole: Role;
}

export function Chatbot({ onConversationComplete, loading, employeeName, employeeRole }: ChatbotProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [conversationPhase, setConversationPhase] = useState(0);

  // System prompts for different conversation phases - More in-depth questions
  const systemPrompts = [
    `¡Hola ${employeeName}! Soy xia, tu asistente de desarrollo en UiX. Voy a ayudarte a identificar tus fortalezas y áreas de mejora como ${employeeRole.specialty || employeeRole.department}.\n\nPara empezar, me gustaría que me cuentes sobre una situación reciente en la que te sentiste realmente orgulloso de tu trabajo. ¿Qué sucedió exactamente y qué rol desempeñaste tú en ese éxito?`,
    '¡Qué interesante! Ahora cuéntame sobre un proyecto o tarea que hayas completado recientemente. ¿Cómo abordaste los desafíos que se presentaron? ¿Qué estrategias utilizaste para resolver los problemas que surgieron?',
    'Excelente. Ahora hablemos de colaboración. Describe una situación en la que tuviste que trabajar en equipo para lograr un objetivo. ¿Cómo contribuiste al equipo? ¿Qué aprendiste de esa experiencia sobre tu forma de trabajar con otros?',
    'Muy bien. Ahora piensa en una ocasión en la que recibiste feedback constructivo (ya sea de un compañero, líder o cliente). ¿Qué aspectos destacaron como positivos y qué áreas te sugirieron mejorar? ¿Cómo has aplicado ese feedback desde entonces?',
    'Gracias por compartir eso. Ahora, cuéntame sobre un desafío técnico o conceptual que hayas enfrentado últimamente. ¿Cómo lo abordaste inicialmente? ¿Qué recursos o estrategias utilizaste para superarlo? ¿Qué aprendiste en el proceso?',
    'Perfecto. Para cerrar, imagina que tienes la oportunidad de mentorizar a alguien que está empezando en tu mismo rol. ¿Qué consejos le darías sobre las habilidades más importantes para tener éxito? ¿Qué le dirías que debería practicar o desarrollar prioritariamente?',
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initialize with first system message
  useEffect(() => {
    if (messages.length === 0) {
      const initialMessage: Message = {
        id: '0',
        role: 'assistant',
        content: systemPrompts[0],
        timestamp: new Date(),
      };
      setMessages([initialMessage]);
    }
  }, []);

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Simulate AI response delay
    setTimeout(() => {
      if (conversationPhase < systemPrompts.length - 1) {
        const nextPhase = conversationPhase + 1;
        setConversationPhase(nextPhase);

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: systemPrompts[nextPhase],
          timestamp: new Date(),
        };

        setMessages(prev => [...prev, assistantMessage]);
      } else {
        // Conversation complete
        onConversationComplete([...messages, userMessage]);
      }
      setIsLoading(false);
    }, 1000);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full max-h-screen bg-gradient-to-br from-[#1A0033] to-[#0F001A]">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-[#6A0DAD]/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#39FF95] to-[#6A0DAD] flex items-center justify-center">
            <span className="text-white font-bold text-lg">X</span>
          </div>
          <div>
            <h3 className="text-white font-semibold">xia - Asistente UiX</h3>
            <p className="text-gray-400 text-sm">UiX</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] p-3 rounded-lg ${
                message.role === 'user'
                  ? 'bg-[#39FF95] text-[#1A0033] ml-12'
                  : 'bg-[#250048] text-white mr-12 border border-[#6A0DAD]/30'
              }`}
            >
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-[#250048] text-white p-3 rounded-lg mr-12 border border-[#6A0DAD]/30">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-[#39FF95] rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-[#39FF95] rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-[#39FF95] rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
                <span className="text-sm text-gray-400">xia está pensando...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 p-4 border-t border-[#6A0DAD]/20">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Escribe tu respuesta aquí..."
            className="flex-1 p-3 bg-[#250048] border border-[#6A0DAD]/30 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-[#39FF95] focus:ring-1 focus:ring-[#39FF95] resize-none"
            rows={1}
            disabled={isLoading || loading}
          />
          <button
            onClick={handleSendMessage}
            disabled={!input.trim() || isLoading || loading}
            className="px-4 py-3 bg-[#39FF95] text-[#1A0033] rounded-lg font-semibold hover:bg-[#2dd97f] disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            Enviar
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2 text-center">
          Presiona Enter para enviar • Pregunta {conversationPhase + 1} de {systemPrompts.length}
        </p>
      </div>
    </div>
  );
}