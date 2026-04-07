import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'wouter';
import { ArrowLeft, LockKeyhole, LogOut, Mail, TrendingUp, Users, ClipboardList } from 'lucide-react';
import { listCollaboratorsProgress, type CollaboratorProgress } from '@/lib/collaboratorProgressApi';
import { authenticateCapitalHumano, clearCapitalHumanoAuth, isCapitalHumanoAuthenticated, isUsingDefaultCapitalHumanoCode } from '@/lib/capitalHumanoAuth';
import { Progress } from '@/components/ui/progress';

const statusMeta: Record<CollaboratorProgress['status'], { label: string; tone: string; chip: string }> = {
  'at-risk': { label: 'Sin comenzar', tone: 'text-amber-300', chip: 'rgba(251,191,36,0.14)' },
  'on-track': { label: 'En curso', tone: 'text-sky-300', chip: 'rgba(56,189,248,0.14)' },
  'completed': { label: 'Completado', tone: 'text-emerald-300', chip: 'rgba(16,185,129,0.14)' },
};

const getPendingResourcesCount = (collaborator: CollaboratorProgress): number => {
  return Math.max(collaborator.totalResourcesCount - collaborator.completedResourcesCount, 0);
};

const buildReminderMailto = (collaborator: CollaboratorProgress): string => {
  const pendingCount = getPendingResourcesCount(collaborator);
  const completed = collaborator.completedResourcesCount;
  const total = collaborator.totalResourcesCount;
  const collaboratorLabel = collaborator.collaboratorName || collaborator.collaboratorEmail;

  const subject = encodeURIComponent('Recordatorio de seguimiento - Plan de desarrollo UIX');
  const body = encodeURIComponent(
    `Hola ${collaboratorLabel},\n\n` +
    `Te compartimos un recordatorio de seguimiento de tu plan de desarrollo en Asistente UiX.\n\n` +
    `Avance actual: ${completed}/${total} recursos completados.\n` +
    `Pendientes: ${pendingCount} recurso(s).\n\n` +
    `Te invitamos a continuar con los cursos pendientes y registrar tu avance.\n\n` +
    `Gracias,\n` +
    `Capital Humano`
  );

  return `mailto:${collaborator.collaboratorEmail}?subject=${subject}&body=${body}`;
};

export default function CapitalHumano() {
  const [collaborators, setCollaborators] = useState<CollaboratorProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessCode, setAccessCode] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(() => isCapitalHumanoAuthenticated());

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
    const completed = collaborators.filter((item) => item.status === 'completed').length;
    const onTrack = collaborators.filter((item) => item.status === 'on-track').length;
    const atRisk = collaborators.filter((item) => item.status === 'at-risk').length;
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

              {isUsingDefaultCapitalHumanoCode() ? (
                <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-3.5 py-2.5 text-sm text-amber-100">
                  Protección básica activa. Configura <span className="font-semibold">VITE_CAPITAL_HUMANO_ACCESS_CODE</span> para usar un código propio.
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
                const meta = statusMeta[collaborator.status];
                const pendingResources = getPendingResourcesCount(collaborator);
                return (
                  <div key={collaborator.collaboratorEmail} className="rounded-2xl border border-white/8 bg-white/5 p-5 space-y-4">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold text-foreground">{collaborator.collaboratorName || collaborator.collaboratorEmail}</h2>
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                          <span>{collaborator.collaboratorEmail}</span>
                          {collaborator.profile ? <span>• {collaborator.profile}</span> : null}
                          <span>• Actualizado {new Date(collaborator.updatedAt).toLocaleDateString('es-MX')}</span>
                        </div>
                      </div>
                      <div className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${meta.tone}`} style={{ background: meta.chip }}>
                        {meta.label}
                      </div>
                    </div>

                    {pendingResources > 0 ? (
                      <div className="rounded-xl border border-amber-300/20 bg-amber-400/10 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <p className="text-sm text-amber-100">
                          Faltan {pendingResources} curso(s) por completar. Puedes enviar recordatorio al correo registrado.
                        </p>
                        <a
                          href={buildReminderMailto(collaborator)}
                          className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-foreground border border-white/15 bg-white/10 hover:border-primary/40 transition-colors"
                        >
                          <Mail className="w-4 h-4" />
                          <span>Enviar recordatorio</span>
                        </a>
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
                        <p className="text-xs text-muted-foreground">Último entregable</p>
                        {collaborator.deliverables.length ? (
                          <div className="mt-3 space-y-2">
                            <p className="text-sm font-medium text-foreground">{collaborator.deliverables[collaborator.deliverables.length - 1].title}</p>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{collaborator.deliverables[collaborator.deliverables.length - 1].summary}</p>
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
