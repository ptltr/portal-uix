import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'wouter';
import { ArrowLeft, LockKeyhole, LogOut, Mail, TrendingUp, Users, ClipboardList } from 'lucide-react';
import { getReminderBackendBaseUrl, isReminderBackendConfigured, listCollaboratorsProgress, sendProgressReminder, setReminderBackendBaseUrl, type CollaboratorProgress } from '@/lib/collaboratorProgressApi';
import { authenticateCapitalHumano, clearCapitalHumanoAuth, isCapitalHumanoAuthenticated } from '@/lib/capitalHumanoAuth';
import { Progress } from '@/components/ui/progress';

const statusMeta: Record<CollaboratorProgress['status'], { label: string; tone: string; chip: string }> = {
  'at-risk': { label: 'Sin comenzar', tone: 'text-amber-300', chip: 'rgba(251,191,36,0.14)' },
  'on-track': { label: 'En curso', tone: 'text-sky-300', chip: 'rgba(56,189,248,0.14)' },
  'completed': { label: 'Completado', tone: 'text-emerald-300', chip: 'rgba(16,185,129,0.14)' },
};

const getPendingResourcesCount = (collaborator: CollaboratorProgress): number => {
  const total = Math.max(collaborator.totalResourcesCount, collaborator.assignedResources.length, 1);
  const completed = Math.min(collaborator.completedResourcesCount, total);
  return Math.max(total - completed, 0);
};

const getDisplayStatus = (collaborator: CollaboratorProgress): CollaboratorProgress['status'] => {
  const total = Math.max(collaborator.totalResourcesCount, collaborator.assignedResources.length, 1);
  const completed = Math.min(collaborator.completedResourcesCount, total);

  if (completed >= total) return 'completed';
  if (completed > 0) return 'on-track';
  return 'at-risk';
};

const getDateTimestamp = (value: string): number => {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const normalizeText = (value: string): string => {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
};

const formatDate = (value: string): string => {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return 'Sin fecha';
  return new Date(parsed).toLocaleDateString('es-MX');
};

const formatDateTime = (value: string): string => {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return 'Sin fecha';
  return new Date(parsed).toLocaleString('es-MX', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
};

const isDeliverableRelatedToAssignedResources = (collaborator: CollaboratorProgress, deliverable: CollaboratorProgress['deliverables'][number]): boolean => {
  if (!collaborator.assignedResources.length) return false;

  const assigned = collaborator.assignedResources
    .map((resource) => normalizeText(resource))
    .filter(Boolean);

  if (!assigned.length) return false;

  const completed = (deliverable.completedResources || [])
    .map((resource) => normalizeText(resource))
    .filter(Boolean);

  if (completed.some((resource) => assigned.includes(resource))) return true;

  const searchableText = normalizeText([
    deliverable.title,
    deliverable.summary,
    ...(deliverable.templateResponses || []).flatMap((response) => [response.prompt, response.response]),
    ...completed,
  ].join(' '));

  return assigned.some((resource) => resource.length >= 4 && searchableText.includes(resource));
};

const getDeliverableCourseName = (
  collaborator: CollaboratorProgress,
  deliverable: CollaboratorProgress['deliverables'][number],
): string | null => {
  const assignedResources = collaborator.assignedResources.filter(Boolean);
  if (!assignedResources.length) return null;

  const assignedByNormalized = new Map(
    assignedResources.map((resource) => [normalizeText(resource), resource]),
  );

  const selectedCourse = (deliverable.completedResources || [])
    .map((resource) => normalizeText(resource))
    .map((normalized) => assignedByNormalized.get(normalized) || null)
    .find((resource): resource is string => Boolean(resource));

  if (selectedCourse) {
    return selectedCourse;
  }

  return null;
};

const getLatestDeliverable = (collaborator: CollaboratorProgress, onlyRelated: boolean) => {
  const source = onlyRelated
    ? collaborator.deliverables.filter((deliverable) => isDeliverableRelatedToAssignedResources(collaborator, deliverable))
    : collaborator.deliverables;

  if (!source.length) return null;

  return source.reduce((latest, current) => {
    return getDateTimestamp(current.submittedAt) >= getDateTimestamp(latest.submittedAt) ? current : latest;
  });
};

export default function CapitalHumano() {
  const [collaborators, setCollaborators] = useState<CollaboratorProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessCode, setAccessCode] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(() => isCapitalHumanoAuthenticated());
  const [sendingReminderByEmail, setSendingReminderByEmail] = useState<Record<string, boolean>>({});
  const [reminderFeedbackByEmail, setReminderFeedbackByEmail] = useState<Record<string, string>>({});
  const [reminderApiUrlInput, setReminderApiUrlInput] = useState(() => getReminderBackendBaseUrl());
  const [reminderConfigFeedback, setReminderConfigFeedback] = useState<string | null>(null);
  const autoReminderEnabled = isReminderBackendConfigured();

  useEffect(() => {
    if (!isAuthorized) {
      setLoading(false);
      return;
    }

    let mounted = true;

    const load = async () => {
      try {
        const result = await listCollaboratorsProgress();
        if (!mounted) return;
        setCollaborators(result);
      } catch {
        if (!mounted) return;
        setError('No fue posible cargar el avance de colaboradores.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, [isAuthorized]);

  const summary = useMemo(() => {
    const total = collaborators.length;
    const completed = collaborators.filter((item) => getDisplayStatus(item) === 'completed').length;
    const onTrack = collaborators.filter((item) => getDisplayStatus(item) === 'on-track').length;
    const atRisk = collaborators.filter((item) => getDisplayStatus(item) === 'at-risk').length;
    const pendingFollowUp = collaborators.filter((item) => getPendingResourcesCount(item) > 0).length;
    return { total, completed, onTrack, atRisk, pendingFollowUp };
  }, [collaborators]);

  const handleLogin = () => {
    const success = authenticateCapitalHumano(accessCode);
    if (!success) {
      setAuthError('Código de acceso incorrecto.');
      return;
    }

    setAuthError(null);
    setIsAuthorized(true);
    setLoading(true);
    setAccessCode('');
  };

  const handleLogout = () => {
    clearCapitalHumanoAuth();
    setIsAuthorized(false);
    setCollaborators([]);
  };

  const handleSendReminder = async (collaborator: CollaboratorProgress) => {
    const email = collaborator.collaboratorEmail;
    const pendingCoursesCount = getPendingResourcesCount(collaborator);
    if (pendingCoursesCount <= 0) return;

    if (!autoReminderEnabled) {
      setReminderFeedbackByEmail((prev) => ({
        ...prev,
        [email]: 'Configura la URL del backend para envío automático de recordatorios.',
      }));
      return;
    }

    setReminderFeedbackByEmail((prev) => ({ ...prev, [email]: '' }));
    setSendingReminderByEmail((prev) => ({ ...prev, [email]: true }));

    try {
      await sendProgressReminder({
        collaboratorEmail: email,
        collaboratorName: collaborator.collaboratorName,
        pendingCoursesCount,
        completedResourcesCount: collaborator.completedResourcesCount,
        totalResourcesCount: collaborator.totalResourcesCount,
      });
      setReminderFeedbackByEmail((prev) => ({ ...prev, [email]: 'Recordatorio enviado correctamente.' }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido al enviar recordatorio.';
      setReminderFeedbackByEmail((prev) => ({
        ...prev,
        [email]: `No fue posible enviar automáticamente. ${message}`,
      }));
    } finally {
      setSendingReminderByEmail((prev) => ({ ...prev, [email]: false }));
    }
  };

  const handleSaveReminderApiUrl = () => {
    const trimmed = reminderApiUrlInput.trim();
    if (!trimmed) {
      setReminderConfigFeedback('Ingresa una URL válida del backend para habilitar el envío automático.');
      return;
    }

    setReminderBackendBaseUrl(trimmed);
    setReminderApiUrlInput(getReminderBackendBaseUrl());
    setReminderConfigFeedback('URL de backend guardada. Ya puedes enviar recordatorios automáticos.');
  };

  if (!isAuthorized) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="relative min-h-screen py-10 px-4 sm:px-6 overflow-hidden"
      >
        <div className="orb-purple absolute w-[500px] h-[500px] -top-32 -left-32 rounded-full pointer-events-none" />
        <div className="orb-green absolute w-[400px] h-[400px] -bottom-20 -right-20 rounded-full pointer-events-none" />

        <div className="relative z-10 max-w-md mx-auto pt-14">
          <div className="glass-card rounded-3xl border border-white/8 p-8 space-y-6">
            <div className="text-center space-y-3">
              <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                <LockKeyhole className="w-6 h-6 text-secondary" />
              </div>
              <h1 className="text-2xl font-display font-bold text-foreground">Acceso Capital Humano</h1>
              <p className="text-sm text-muted-foreground">
                Ingresa el código de acceso para consultar el avance consolidado de colaboradores.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Código de acceso</label>
                <input
                  type="password"
                  value={accessCode}
                  onChange={(event) => setAccessCode(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') handleLogin();
                  }}
                  placeholder="Ingresa el código"
                  className="w-full rounded-xl border border-white/10 bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>

              {authError ? (
                <div className="rounded-xl border border-rose-400/25 bg-rose-400/10 px-3.5 py-2.5 text-sm text-rose-200">
                  {authError}
                </div>
              ) : null}

              <button
                onClick={handleLogin}
                disabled={!accessCode.trim()}
                className="w-full rounded-xl py-3 font-semibold text-white btn-brand disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Entrar al panel
              </button>

              <Link href="/" className="inline-flex w-full items-center justify-center gap-2 px-4 py-2.5 rounded-xl glass-card border border-white/10 text-sm font-medium text-foreground hover:border-primary/40 transition-colors">
                <ArrowLeft className="w-4 h-4" />
                <span>Volver al inicio</span>
              </Link>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative min-h-screen py-10 px-4 sm:px-6 overflow-hidden"
    >
      <div className="orb-purple absolute w-[500px] h-[500px] -top-32 -left-32 rounded-full pointer-events-none" />
      <div className="orb-green absolute w-[400px] h-[400px] -bottom-20 -right-20 rounded-full pointer-events-none" />

      <div className="relative z-10 max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass-card text-xs font-medium text-muted-foreground border border-white/10 mb-4">
              <Users className="w-3.5 h-3.5 text-secondary" />
              <span>Panel Capital Humano</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground">Seguimiento de colaboradores</h1>
            <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
              Visualiza el avance, los entregables registrados y el estatus de cumplimiento de los recursos asignados por Asistente UiX.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl glass-card border border-white/10 text-sm font-medium text-foreground hover:border-primary/40 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Cerrar sesión</span>
            </button>
            <Link href="/" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl glass-card border border-white/10 text-sm font-medium text-foreground hover:border-primary/40 transition-colors">
              <ArrowLeft className="w-4 h-4" />
              <span>Volver</span>
            </Link>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-5">
          {[
            { label: 'Colaboradores', value: summary.total, icon: Users },
            { label: 'Completados', value: summary.completed, icon: TrendingUp },
            { label: 'En curso', value: summary.onTrack, icon: ClipboardList },
            { label: 'Sin comenzar', value: summary.atRisk, icon: Mail },
            { label: 'Requieren seguimiento', value: summary.pendingFollowUp, icon: Mail },
          ].map((item) => (
            <div key={item.label} className="glass-card rounded-2xl border border-white/8 p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{item.label}</p>
                <item.icon className="w-4 h-4 text-secondary" />
              </div>
              <p className="mt-3 text-3xl font-display font-semibold text-foreground">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="glass-card rounded-2xl border border-white/8 p-4 md:p-5 space-y-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold text-foreground">Configuración de recordatorios automáticos</h2>
            <p className="text-xs text-muted-foreground">
              Este ajuste solo afecta al envío automático de correos y no cambia el historial guardado en la misma liga de GitHub Pages.
            </p>
          </div>
          <div className="flex flex-col md:flex-row gap-2">
            <input
              type="url"
              value={reminderApiUrlInput}
              onChange={(event) => setReminderApiUrlInput(event.target.value)}
              placeholder="https://tu-backend-recordatorios.com"
              className="w-full rounded-xl border border-white/10 bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <button
              onClick={handleSaveReminderApiUrl}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-foreground border border-white/15 bg-white/10 hover:border-primary/40 transition-colors"
            >
              Guardar URL
            </button>
          </div>
          <p className="text-xs text-foreground/80">
            Estado: {autoReminderEnabled ? 'Automático activo' : 'Automático inactivo'}
          </p>
          {reminderConfigFeedback ? (
            <p className="text-xs text-foreground/80">{reminderConfigFeedback}</p>
          ) : null}
        </div>

        <div className="glass-card rounded-3xl border border-white/8 p-4 md:p-6">
          {loading ? (
            <div className="py-12 text-center text-muted-foreground text-sm">Cargando avance de colaboradores...</div>
          ) : error ? (
            <div className="py-12 text-center text-rose-300 text-sm">{error}</div>
          ) : collaborators.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">Aún no hay colaboradores sincronizados en el panel.</div>
          ) : (
            <div className="space-y-4">
              {collaborators.map((collaborator) => {
                const meta = statusMeta[getDisplayStatus(collaborator)];
                const pendingResources = getPendingResourcesCount(collaborator);
                const latestRelatedDeliverable = getLatestDeliverable(collaborator, true);
                const latestDeliverable = getLatestDeliverable(collaborator, false);
                const latestDeliverableCourseName = latestDeliverable
                  ? getDeliverableCourseName(collaborator, latestDeliverable)
                  : null;
                const latestDeliverableUpdatedAt = latestDeliverable
                  ? (getDateTimestamp(latestDeliverable.submittedAt) > 0
                    ? latestDeliverable.submittedAt
                    : collaborator.updatedAt)
                  : '';
                const latestDeliverableUpdatedAtLabel = latestDeliverable
                  ? formatDateTime(latestDeliverableUpdatedAt)
                  : 'Sin entregables';
                const isSendingReminder = Boolean(sendingReminderByEmail[collaborator.collaboratorEmail]);
                const reminderFeedback = reminderFeedbackByEmail[collaborator.collaboratorEmail];
                return (
                  <div key={collaborator.collaboratorEmail} className="rounded-2xl border border-white/8 bg-white/5 p-5 space-y-4">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold text-foreground">{collaborator.collaboratorName || collaborator.collaboratorEmail}</h2>
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                          <span>{collaborator.collaboratorEmail}</span>
                          {collaborator.profile ? <span>• {collaborator.profile}</span> : null}
                          <span>
                            • Actualizado {latestRelatedDeliverable
                              ? formatDate(latestRelatedDeliverable.submittedAt)
                              : 'Sin actividad en cursos asignados'}
                          </span>
                        </div>
                      </div>
                      <div className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${meta.tone}`} style={{ background: meta.chip }}>
                        {meta.label}
                      </div>
                    </div>

                    {pendingResources > 0 ? (
                      <div className="rounded-xl border border-amber-300/20 bg-amber-400/10 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="space-y-2">
                          <p className="text-sm text-amber-100">
                            Faltan {pendingResources} curso(s) por completar. Puedes enviar recordatorio al correo registrado.
                          </p>
                          {reminderFeedback ? (
                            <p className="text-xs text-foreground/80">{reminderFeedback}</p>
                          ) : null}
                        </div>
                        <div className="flex flex-col sm:items-end gap-2">
                          <button
                            onClick={() => void handleSendReminder(collaborator)}
                            disabled={isSendingReminder}
                            className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-foreground border border-white/15 bg-white/10 hover:border-primary/40 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            <Mail className="w-4 h-4" />
                            <span>
                              {isSendingReminder
                                ? 'Enviando...'
                                : autoReminderEnabled
                                  ? 'Enviar recordatorio'
                                  : 'Configurar envío automático'}
                            </span>
                          </button>
                        </div>
                      </div>
                    ) : null}

                    <div>
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Progreso</span>
                        <span className="font-semibold text-foreground">{collaborator.completionPercentage}%</span>
                      </div>
                      <Progress value={collaborator.completionPercentage} className="h-3 bg-white/10" />
                    </div>

                    <div className="grid gap-3 md:grid-cols-[1fr,1fr,0.8fr]">
                      <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                        <p className="text-xs text-muted-foreground">Recursos asignados</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {collaborator.assignedResources.length ? collaborator.assignedResources.map((resource) => (
                            <span key={resource} className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-foreground/85 bg-white/5">{resource}</span>
                          )) : <span className="text-sm text-muted-foreground">Sin recursos sincronizados.</span>}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs text-muted-foreground">Último entregable</p>
                          {latestDeliverable ? (
                            <span className="text-[11px] font-semibold text-foreground/90 rounded-full border border-white/15 bg-white/10 px-2 py-0.5">
                              {latestDeliverableUpdatedAtLabel}
                            </span>
                          ) : null}
                        </div>
                        {latestDeliverable ? (
                          <div className="mt-3 space-y-2">
                            <p className="text-sm font-medium text-foreground">{latestDeliverable.title}</p>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{latestDeliverable.summary}</p>
                            <p className="text-xs text-muted-foreground">
                              Curso: {latestDeliverableCourseName || 'No identificado'}
                            </p>
                            <div className="mt-3 pt-2 border-t border-white/10">
                              <p className="text-sm font-medium text-foreground">Fecha de actualización: {latestDeliverableUpdatedAtLabel}</p>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-3 text-sm text-muted-foreground">Aún sin entregables registrados.</p>
                        )}
                      </div>

                      <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                        <p className="text-xs text-muted-foreground">Métricas rápidas</p>
                        <div className="mt-3 space-y-2 text-sm text-foreground">
                          <p>{collaborator.completedResourcesCount}/{collaborator.totalResourcesCount} recursos completados</p>
                          <p>{collaborator.deliverables.length} entregable(s) registrados</p>
                          <p>Última actualización de entregable: {latestDeliverableUpdatedAtLabel}</p>
                          {collaborator.latestAssessmentId ? <p>Evaluación {collaborator.latestAssessmentId}</p> : null}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
