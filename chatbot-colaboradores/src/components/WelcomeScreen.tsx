import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Sparkles, ChevronRight } from 'lucide-react';
import { Link } from 'wouter';
import { cn } from '@/lib/utils';
import { useMutation } from '@tanstack/react-query';

interface ResumeSessionPayload {
  userName: string;
  userEmail: string;
  profile: string;
  source: 'local' | 'reminder' | 'remote';
}

interface WelcomeScreenProps {
  onStart: (conversationId: number, profile: string, level: string, userName: string, userEmail: string) => void;
  hasSavedSession?: boolean;
  onResumeSession?: (payload?: ResumeSessionPayload) => Promise<boolean> | boolean;
  onStartFresh?: () => void;
  checkSessionByEmail?: (email: string) => Promise<boolean>;
  initialUserName?: string;
  initialUserEmail?: string;
  resumeFromReminderLink?: boolean;
}

const CHAT_STORAGE_KEY = 'uix-chat-session-v1';

const normalizeEmail = (value: string): string => value.trim().toLowerCase();

const UXUI_SUB_PROFILES = [
  { id: 'writer', label: 'Writer', icon: '✍️', desc: 'Redacción UX, microcopy y contenido de producto' },
  { id: 'ux', label: 'UX Designer', icon: '🔍', desc: 'Investigación de usuarios y arquitectura de información' },
  { id: 'ui', label: 'UI Designer', icon: '🎨', desc: 'Interfaces visuales y sistemas de diseño' },
  { id: 'ux-ui', label: 'UX/UI Designer', icon: '✦', desc: 'Experiencia de usuario e interfaces visuales' },
];

const PROFILES = [
  {
    id: 'ux-ui-group',
    label: 'UX/UI Designer',
    icon: '🎨',
    desc: 'Diseño de interfaces y experiencias de usuario',
    hasSubProfiles: true,
  },
  { id: 'product', label: 'Product Designer', icon: '🧩', desc: 'Diseño estratégico de productos digitales', hasSubProfiles: false },
  { id: 'service', label: 'Service Designer', icon: '🗺️', desc: 'Diseño de servicios y visión sistémica', hasSubProfiles: false },
  { id: 'cs', label: 'Customer Success', icon: '🚀', desc: 'Gestión de clientes y estrategia de diseño', hasSubProfiles: false },
];

function CheckIcon() {
  return (
    <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
      style={{ background: 'var(--gradient-brand)' }}>
      <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3">
        <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function WelcomeScreen({
  onStart,
  hasSavedSession = false,
  onResumeSession,
  onStartFresh,
  checkSessionByEmail,
  initialUserName = '',
  initialUserEmail = '',
  resumeFromReminderLink = false,
}: WelcomeScreenProps) {
  const [step, setStep] = useState<'intro' | 'profile'>(resumeFromReminderLink ? 'profile' : 'intro');
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<string>('');
  const [userName, setUserName] = useState<string>(initialUserName);
  const [userEmail, setUserEmail] = useState<string>(initialUserEmail);
  const [hasSavedSessionForEmail, setHasSavedSessionForEmail] = useState(false);
  const [hasRemoteSessionForEmail, setHasRemoteSessionForEmail] = useState(false);
  const [isCheckingRemoteSession, setIsCheckingRemoteSession] = useState(false);
  const [resumeError, setResumeError] = useState('');
  const [ignoreReminderResume, setIgnoreReminderResume] = useState(false);

  const isValidEmail = (value: string) => /\S+@\S+\.\S+/.test(value.trim());

  const createConversation = useMutation({
    mutationFn: async ({ profile }: { profile: string }) => {
      // Mock response for development - simulate API delay
      await new Promise(resolve => setTimeout(resolve, 500));
      return {
        id: Date.now(), // Mock conversation ID
        title: `Evaluación ${profile} — ${new Date().toLocaleDateString('es-MX')}`,
        profile,
        level: 'Auto',
      };
    },
    onSuccess: (data) => {
      onStart(data.id, selectedProfile, 'Auto', userName.trim(), userEmail.trim());
    },
  });

  const handleProfileClick = (profile: typeof PROFILES[0]) => {
    if (profile.hasSubProfiles) {
      // Toggle the sub-profile expansion
      setExpandedGroup(prev => prev === profile.id ? null : profile.id);
      // Deselect if collapsing
      if (expandedGroup === profile.id) setSelectedProfile('');
    } else {
      setExpandedGroup(null);
      setSelectedProfile(profile.label);
    }
  };

  const handleSubProfileClick = (subLabel: string) => {
    setSelectedProfile(subLabel);
  };

  const canStart = selectedProfile !== '' && userName.trim().length > 0 && isValidEmail(userEmail);
  const hasReminderResumeCandidate = !ignoreReminderResume
    && resumeFromReminderLink
    && Boolean(normalizeEmail(initialUserEmail))
    && normalizeEmail(initialUserEmail) === normalizeEmail(userEmail);
  const hasAnyResumeCandidate = hasSavedSessionForEmail || hasRemoteSessionForEmail || hasSavedSession;
  const canAttemptResume = isValidEmail(userEmail) && !isCheckingRemoteSession;
  const showResumeOptionsInProfile = isValidEmail(userEmail);

  useEffect(() => {
    const email = normalizeEmail(userEmail);
    if (!email) {
      setHasSavedSessionForEmail(false);
      return;
    }

    try {
      const raw = localStorage.getItem(CHAT_STORAGE_KEY);
      if (!raw) {
        setHasSavedSessionForEmail(false);
        return;
      }

      const parsed = JSON.parse(raw) as {
        employeeEmail?: string;
        conversationId?: number | null;
        finalReport?: string;
        messages?: Array<unknown>;
      };

      const storedEmail = normalizeEmail(parsed.employeeEmail || '');
      const hasContent = Boolean(parsed.finalReport)
        || (Array.isArray(parsed.messages) && parsed.messages.length > 0);

      setHasSavedSessionForEmail(storedEmail === email && hasContent);
    } catch {
      setHasSavedSessionForEmail(false);
    }
  }, [userEmail]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!checkSessionByEmail || !isValidEmail(userEmail)) {
        setHasRemoteSessionForEmail(false);
        setIsCheckingRemoteSession(false);
        return;
      }

      setIsCheckingRemoteSession(true);
      const exists = await checkSessionByEmail(userEmail);

      if (!cancelled) {
        setHasRemoteSessionForEmail(exists);
        setIsCheckingRemoteSession(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [checkSessionByEmail, userEmail]);

  const handleStart = () => {
    if (!canStart) return;
    createConversation.mutate({ profile: selectedProfile });
  };

  const handleStartFresh = (nextStep: 'intro' | 'profile' = 'profile', preserveInputs = false) => {
    onStartFresh?.();
    setIgnoreReminderResume(true);
    setSelectedProfile('');
    if (!preserveInputs) {
      setUserName('');
      setUserEmail('');
    }
    setExpandedGroup(null);
    setHasSavedSessionForEmail(false);
    setHasRemoteSessionForEmail(false);
    setResumeError('');
    setStep(nextStep);
  };

  const handleResume = async (payload?: ResumeSessionPayload) => {
    setResumeError('');
    const result = await onResumeSession?.(payload);
    if (result === false) {
      setResumeError('No pudimos cargar el historial para este correo. Verifica que uses el mismo correo del registro.');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative min-h-screen flex flex-col items-center justify-center p-6 overflow-hidden"
    >
      {/* Ambient orbs */}
      <div className="orb-purple absolute w-[600px] h-[600px] -top-40 -left-40 rounded-full pointer-events-none" />
      <div className="orb-green absolute w-[500px] h-[500px] -bottom-20 -right-20 rounded-full pointer-events-none" />

      <div className="relative z-10 w-full max-w-xl">
        {/* Logo + Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center mb-8 text-center"
        >
          <div className="w-full flex justify-end mb-4">
            <Link href="/capital-humano" className="inline-flex items-center gap-2 px-3 py-2 rounded-xl glass-card border border-white/10 text-xs font-medium text-foreground hover:border-primary/40 transition-colors">
              <span>Vista Capital Humano</span>
            </Link>
          </div>
          <img
            src={`${import.meta.env.BASE_URL}images/uix-logo.png`}
            alt="UIX"
            className="w-16 h-16 object-contain mb-4"
          />
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass-card text-xs font-medium text-muted-foreground border border-white/10 mb-4">
            <Sparkles className="w-3.5 h-3.5 text-secondary" />
            <span>Asistente UiX</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-display font-bold leading-tight">
            Descubre tu{' '}
            <span className="gradient-text">potencial</span>
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed mt-3 max-w-sm">
            Identifica tus áreas de oportunidad en habilidades blandas y recibe recomendaciones personalizadas para tu crecimiento en UIX.
          </p>
        </motion.div>

        <AnimatePresence mode="wait">

          {step === 'intro' && (
            <motion.div
              key="intro"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <div className="grid grid-cols-3 gap-3 mb-2">
                {[
                  { label: '6-8 preguntas', icon: '💬' },
                  { label: '~5 minutos', icon: '⏱️' },
                  { label: '5 recursos', icon: '📚' },
                ].map(item => (
                  <div key={item.label} className="glass-card rounded-2xl p-3 text-center border border-white/8">
                    <div className="text-xl mb-1">{item.icon}</div>
                    <p className="text-xs text-muted-foreground font-medium">{item.label}</p>
                  </div>
                ))}
              </div>

              {hasSavedSession ? (
                <div className="space-y-3">
                  <button
                    onClick={() => {
                      setResumeError('');
                      setStep('profile');
                    }}
                    className="w-full group flex items-center justify-center gap-2.5 py-4 rounded-2xl font-semibold text-white btn-brand"
                  >
                    <span>Retomar con correo</span>
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-200" />
                  </button>

                  <button
                    onClick={() => {
                      handleStartFresh('profile');
                    }}
                    className="w-full group flex items-center justify-center gap-2.5 py-4 rounded-2xl font-semibold text-foreground glass-card border border-white/12 hover:border-white/25 transition-all duration-200"
                  >
                    <span>Iniciar nueva evaluación</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setStep('profile')}
                  className="w-full group flex items-center justify-center gap-2.5 py-4 rounded-2xl font-semibold text-white btn-brand"
                >
                  <span>Comenzar evaluación</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-200" />
                </button>
              )}
            </motion.div>
          )}

          {step === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-5"
            >
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">¿Cuál es tu nombre?</label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Escribe tu nombre"
                  className="w-full rounded-xl border border-white/10 bg-transparent px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Correo para seguimiento</label>
                <input
                  type="email"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  placeholder="nombre@uix.com"
                  className="w-full rounded-xl border border-white/10 bg-transparent px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
                {userEmail.trim().length > 0 && !isValidEmail(userEmail) && (
                  <p className="mt-1 text-xs text-rose-300">Ingresa un correo válido para habilitar el inicio.</p>
                )}
              </div>

              {showResumeOptionsInProfile && (
                <div className="space-y-2 rounded-2xl border border-secondary/25 bg-secondary/10 p-3.5">
                  <p className="text-xs text-secondary font-medium">
                    {isCheckingRemoteSession
                      ? 'Verificando historial para este correo...'
                      : hasAnyResumeCandidate
                      ? hasSavedSessionForEmail
                        ? 'Detectamos una conversación guardada para este correo.'
                        : hasRemoteSessionForEmail
                          ? 'Detectamos una conversación guardada para este correo en el servidor.'
                          : hasSavedSession
                            ? 'Detectamos una conversación guardada en este navegador.'
                            : 'Detectamos una conversación guardada para este correo.'
                      : hasReminderResumeCandidate
                        ? 'Llegaste desde un recordatorio. Ingresa el mismo correo para buscar tu historial guardado.'
                        : 'Puedes retomar si ya existe historial para este correo.'}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      onClick={() => {
                        if (!canAttemptResume) return;
                        void handleResume({
                          userName: userName.trim(),
                          userEmail: userEmail.trim(),
                          profile: selectedProfile || 'UX/UI Designer',
                          source: hasRemoteSessionForEmail
                              ? 'remote'
                              : hasSavedSession && !hasSavedSessionForEmail
                                ? 'reminder'
                              : 'local',
                        });
                      }}
                      disabled={!canAttemptResume}
                      className="w-full rounded-xl py-2.5 text-sm font-semibold text-foreground glass-card border border-white/12 hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {hasAnyResumeCandidate ? 'Retomar conversación' : 'Intentar retomar conversación'}
                    </button>
                    <button
                      onClick={() => {
                        handleStartFresh('profile', false);
                        if (resumeFromReminderLink && typeof window !== 'undefined') {
                          window.location.assign(import.meta.env.BASE_URL || '/');
                        }
                      }}
                      className="w-full rounded-xl py-2.5 text-sm font-semibold text-white btn-brand"
                    >
                      Empezar nueva
                    </button>
                  </div>
                  {resumeError && (
                    <p className="text-xs text-rose-300">{resumeError}</p>
                  )}
                </div>
              )}

              <p className="text-sm font-semibold text-foreground">
                ¿Cuál es tu perfil?{' '}
                <span className="text-muted-foreground font-normal">(selecciona uno)</span>
              </p>

              <div className="flex flex-col gap-2">
                {PROFILES.map(profile => {
                  const isExpanded = expandedGroup === profile.id;
                  const isSelected = !profile.hasSubProfiles && selectedProfile === profile.label;

                  return (
                    <div key={profile.id}>
                      {/* Main profile button */}
                      <button
                        onClick={() => handleProfileClick(profile)}
                        className={cn(
                          'w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl border text-left transition-all duration-200',
                          isSelected
                            ? 'border-primary/60 bg-primary/10'
                            : isExpanded
                              ? 'border-primary/40 bg-primary/5'
                              : 'glass-card border-white/8 hover:border-white/20'
                        )}
                        style={(isSelected || isExpanded) ? { boxShadow: '0 0 20px rgba(123,63,217,0.2)' } : {}}
                      >
                        <span className="text-2xl flex-shrink-0">{profile.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            'text-sm font-semibold',
                            isSelected || isExpanded ? 'text-foreground' : 'text-foreground/80'
                          )}>
                            {profile.label}
                          </p>
                          <p className="text-xs text-muted-foreground">{profile.desc}</p>
                        </div>
                        <div className="flex-shrink-0">
                          {isSelected ? (
                            <CheckIcon />
                          ) : profile.hasSubProfiles ? (
                            <ChevronRight className={cn(
                              'w-4 h-4 text-muted-foreground transition-transform duration-200',
                              isExpanded && 'rotate-90'
                            )} />
                          ) : null}
                        </div>
                      </button>

                      {/* Sub-profiles — only for UX/UI group */}
                      <AnimatePresence>
                        {profile.hasSubProfiles && isExpanded && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="pl-4 pt-2 flex flex-col gap-1.5">
                              {UXUI_SUB_PROFILES.map(sub => {
                                const isSubSelected = selectedProfile === sub.label;
                                return (
                                  <button
                                    key={sub.id}
                                    onClick={() => handleSubProfileClick(sub.label)}
                                    className={cn(
                                      'flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all duration-200',
                                      isSubSelected
                                        ? 'border-secondary/50 bg-secondary/10'
                                        : 'glass-card border-white/8 hover:border-white/20'
                                    )}
                                    style={isSubSelected ? { boxShadow: '0 0 15px rgba(74,222,128,0.15)' } : {}}
                                  >
                                    <span className="text-lg flex-shrink-0">{sub.icon}</span>
                                    <div className="flex-1 min-w-0">
                                      <p className={cn(
                                        'text-sm font-semibold',
                                        isSubSelected ? 'text-foreground' : 'text-foreground/80'
                                      )}>
                                        {sub.label}
                                      </p>
                                      <p className="text-xs text-muted-foreground">{sub.desc}</p>
                                    </div>
                                    {isSubSelected && <CheckIcon />}
                                  </button>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>

              {/* CTA */}
              <button
                onClick={handleStart}
                disabled={!canStart || createConversation.isPending}
                className={cn(
                  'w-full group flex items-center justify-center gap-2.5 py-4 rounded-2xl font-semibold text-white btn-brand transition-all duration-200',
                  (!canStart || createConversation.isPending) && 'opacity-40 cursor-not-allowed hover:transform-none'
                )}
              >
                <span>{createConversation.isPending ? 'Preparando tu evaluación...' : 'Iniciar mi evaluación'}</span>
                {!createConversation.isPending && (
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-200" />
                )}
              </button>

              <button
                onClick={() => setStep('intro')}
                className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
              >
                ← Volver
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </motion.div>
  );
}
