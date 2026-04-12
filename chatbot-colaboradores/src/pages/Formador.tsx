import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'wouter';
import { ArrowLeft, LockKeyhole, LogOut, Search, TrendingUp, Users } from 'lucide-react';
import { listCollaboratorsProgress, type CollaboratorProgress } from '@/lib/collaboratorProgressApi';
import { authenticateFormador, clearFormadorAuth, isFormadorAuthenticated } from '@/lib/formadorAuth';
import { Progress } from '@/components/ui/progress';

const normalizeText = (value: string): string => {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
};

const statusMeta: Record<CollaboratorProgress['status'], { label: string; tone: string; chip: string }> = {
  'at-risk': { label: 'Sin comenzar', tone: 'text-amber-300', chip: 'rgba(251,191,36,0.14)' },
  'on-track': { label: 'En curso', tone: 'text-sky-300', chip: 'rgba(56,189,248,0.14)' },
  'completed': { label: 'Completado', tone: 'text-emerald-300', chip: 'rgba(16,185,129,0.14)' },
};

const getDisplayStatus = (collaborator: CollaboratorProgress): CollaboratorProgress['status'] => {
  const total = Math.max(collaborator.totalResourcesCount, collaborator.assignedResources.length, 1);
  const completed = Math.min(collaborator.completedResourcesCount, total);

  if (completed >= total) return 'completed';
  if (completed > 0) return 'on-track';
  return 'at-risk';
};

const getPendingResourcesCount = (collaborator: CollaboratorProgress): number => {
  const total = Math.max(collaborator.totalResourcesCount, collaborator.assignedResources.length, 1);
  const completed = Math.min(collaborator.completedResourcesCount, total);
  return Math.max(total - completed, 0);
};

const formatDate = (value: string): string => {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return 'Sin fecha';
  return new Date(parsed).toLocaleDateString('es-MX');
};

export default function Formador() {
  const [isAuthorized, setIsAuthorized] = useState(() => isFormadorAuthenticated());
  const [accessCode, setAccessCode] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  const [trainerInput, setTrainerInput] = useState('');
  const [trainerFilter, setTrainerFilter] = useState('');

  const [collaborators, setCollaborators] = useState<CollaboratorProgress[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthorized) {
      setLoading(false);
      return;
    }

    let mounted = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await listCollaboratorsProgress();
        if (!mounted) return;
        setCollaborators(result);
      } catch {
        if (!mounted) return;
        setError('No fue posible cargar los planes del equipo.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [isAuthorized]);

  const filteredCollaborators = useMemo(() => {
    const filter = normalizeText(trainerFilter);
    if (!filter) return [];

    return collaborators.filter((item) => normalizeText(item.trainerName || '').includes(filter));
  }, [collaborators, trainerFilter]);

  const summary = useMemo(() => {
    const total = filteredCollaborators.length;
    const completed = filteredCollaborators.filter((item) => getDisplayStatus(item) === 'completed').length;
    const onTrack = filteredCollaborators.filter((item) => getDisplayStatus(item) === 'on-track').length;
    const pendingFollowUp = filteredCollaborators.filter((item) => getPendingResourcesCount(item) > 0).length;
    return { total, completed, onTrack, pendingFollowUp };
  }, [filteredCollaborators]);

  const handleLogin = () => {
    const success = authenticateFormador(accessCode);
    if (!success) {
      setAuthError('Código de acceso incorrecto.');
      return;
    }

    setAccessCode('');
    setAuthError(null);
    setIsAuthorized(true);
  };

  const handleLogout = () => {
    clearFormadorAuth();
    setIsAuthorized(false);
    setTrainerFilter('');
    setTrainerInput('');
    setCollaborators([]);
  };

  const applyFilter = () => {
    setTrainerFilter(trainerInput.trim());
  };

  if (!isAuthorized) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative min-h-screen py-10 px-4 sm:px-6 overflow-hidden">
        <div className="orb-purple absolute w-[500px] h-[500px] -top-32 -left-32 rounded-full pointer-events-none" />
        <div className="orb-green absolute w-[400px] h-[400px] -bottom-20 -right-20 rounded-full pointer-events-none" />

        <div className="relative z-10 max-w-md mx-auto pt-14">
          <div className="glass-card rounded-3xl border border-white/8 p-8 space-y-6">
            <div className="text-center space-y-3">
              <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                <LockKeyhole className="w-6 h-6 text-secondary" />
              </div>
              <h1 className="text-2xl font-display font-bold text-foreground">Acceso Formador</h1>
              <p className="text-sm text-muted-foreground">
                Ingresa el código para consultar los planes asignados a tu equipo.
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
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleLogin();
                    }
                  }}
                  className="w-full rounded-xl border border-white/12 bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  placeholder="Ingresa el código"
                />
              </div>

              {authError && <p className="text-sm text-rose-300">{authError}</p>}

              <button
                type="button"
                onClick={handleLogin}
                className="w-full rounded-xl py-2.5 text-sm font-semibold text-white btn-brand"
              >
                Entrar
              </button>

              <Link href="/" className="w-full inline-flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-foreground glass-card border border-white/12 hover:border-primary/40 transition-colors">
                <ArrowLeft className="w-4 h-4" />
                Regresar al asistente
              </Link>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative min-h-screen py-10 px-4 sm:px-6 overflow-hidden">
      <div className="orb-purple absolute w-[520px] h-[520px] -top-36 -left-36 rounded-full pointer-events-none" />
      <div className="orb-green absolute w-[430px] h-[430px] -bottom-24 -right-20 rounded-full pointer-events-none" />

      <div className="relative z-10 max-w-6xl mx-auto space-y-6">
        <header className="glass-card rounded-3xl border border-white/8 p-5 md:p-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-secondary/80">Vista de Formador</p>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">Planes de desarrollo de tu equipo</h1>
            <p className="text-sm text-muted-foreground mt-1">Filtra por nombre de formador para ver únicamente sus colaboradores.</p>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/" className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-foreground glass-card border border-white/12 hover:border-primary/40 transition-colors">
              <ArrowLeft className="w-4 h-4" />
              Inicio
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-rose-200 glass-card border border-rose-400/35 hover:border-rose-300/70 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Salir
            </button>
          </div>
        </header>

        <section className="glass-card rounded-3xl border border-white/8 p-5 md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-foreground mb-1.5">Nombre del formador</label>
              <input
                type="text"
                value={trainerInput}
                onChange={(event) => setTrainerInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    applyFilter();
                  }
                }}
                placeholder="Ej. Ana Pérez"
                className="w-full rounded-xl border border-white/12 bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>
            <button
              type="button"
              onClick={applyFilter}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white btn-brand"
            >
              <Search className="w-4 h-4" />
              Ver equipo
            </button>
          </div>

          {trainerFilter && (
            <p className="mt-3 text-xs text-muted-foreground">
              Mostrando resultados para formador: <span className="text-foreground font-medium">{trainerFilter}</span>
            </p>
          )}
        </section>

        {trainerFilter && (
          <section className="grid gap-3 md:grid-cols-4">
            <div className="glass-card rounded-2xl border border-white/10 p-4">
              <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">Colaboradores</p>
              <p className="mt-2 text-2xl font-display font-semibold text-foreground">{summary.total}</p>
              <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-secondary">
                <Users className="w-3.5 h-3.5" />
                Equipo total
              </div>
            </div>

            <div className="glass-card rounded-2xl border border-white/10 p-4">
              <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">Completados</p>
              <p className="mt-2 text-2xl font-display font-semibold text-foreground">{summary.completed}</p>
              <p className="mt-3 text-xs text-emerald-300">Planes cerrados</p>
            </div>

            <div className="glass-card rounded-2xl border border-white/10 p-4">
              <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">En curso</p>
              <p className="mt-2 text-2xl font-display font-semibold text-foreground">{summary.onTrack}</p>
              <p className="mt-3 text-xs text-sky-300">Con avance activo</p>
            </div>

            <div className="glass-card rounded-2xl border border-white/10 p-4">
              <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">Pendientes</p>
              <p className="mt-2 text-2xl font-display font-semibold text-foreground">{summary.pendingFollowUp}</p>
              <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-amber-300">
                <TrendingUp className="w-3.5 h-3.5" />
                Requieren seguimiento
              </div>
            </div>
          </section>
        )}

        <section className="space-y-3">
          {!trainerFilter && (
            <div className="glass-card rounded-2xl border border-white/10 p-6 text-center text-sm text-muted-foreground">
              Escribe el nombre del formador y presiona Ver equipo para cargar sus planes.
            </div>
          )}

          {trainerFilter && loading && (
            <div className="glass-card rounded-2xl border border-white/10 p-6 text-sm text-muted-foreground">Cargando planes de desarrollo...</div>
          )}

          {trainerFilter && error && (
            <div className="glass-card rounded-2xl border border-rose-400/35 p-6 text-sm text-rose-200">{error}</div>
          )}

          {trainerFilter && !loading && !error && filteredCollaborators.length === 0 && (
            <div className="glass-card rounded-2xl border border-white/10 p-6 text-sm text-muted-foreground">
              No encontramos colaboradores para ese formador. Verifica que el nombre coincida con el capturado en la evaluación.
            </div>
          )}

          {trainerFilter && !loading && !error && filteredCollaborators.map((collaborator) => {
            const statusKey = getDisplayStatus(collaborator);
            const status = statusMeta[statusKey];
            const total = Math.max(collaborator.totalResourcesCount, collaborator.assignedResources.length, 1);
            const completed = Math.min(collaborator.completedResourcesCount, total);
            const pending = Math.max(total - completed, 0);

            return (
              <article key={collaborator.collaboratorEmail} className="glass-card rounded-2xl border border-white/10 p-5 space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">{collaborator.collaboratorName || collaborator.collaboratorEmail}</h2>
                    <p className="text-sm text-muted-foreground">{collaborator.collaboratorEmail}</p>
                    <p className="text-xs text-muted-foreground mt-1">Formador: <span className="text-foreground/90">{collaborator.trainerName || 'Sin registro'}</span></p>
                  </div>

                  <div className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium" style={{ backgroundColor: status.chip }}>
                    <span className={status.tone}>{status.label}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Avance</span>
                    <span className="text-foreground font-medium">{collaborator.completionPercentage}%</span>
                  </div>
                  <Progress value={collaborator.completionPercentage} className="h-3 bg-white/10" />
                </div>

                <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-4">
                  <p>Total recursos: <span className="text-foreground">{total}</span></p>
                  <p>Completados: <span className="text-foreground">{completed}</span></p>
                  <p>Pendientes: <span className="text-foreground">{pending}</span></p>
                  <p>Actualizado: <span className="text-foreground">{formatDate(collaborator.updatedAt)}</span></p>
                </div>

                <div className="text-xs text-muted-foreground">
                  <p>Entregables: <span className="text-foreground">{collaborator.deliverables.length}</span></p>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </motion.div>
  );
}
