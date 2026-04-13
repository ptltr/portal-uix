import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, CheckCircle2, Sparkles, ExternalLink, Download, Upload, TrendingUp, Mail, CalendarClock, ArrowLeft } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage } from '@/hooks/use-chat';
import { generatePDF } from '@/lib/generatePDF';
import { getCollaboratorProgress, syncCollaboratorAssessment, uploadDeliverable, type CollaboratorProgress, type DeliverableType } from '@/lib/collaboratorProgressApi';
import { Progress } from '@/components/ui/progress';

interface ResultsScreenProps {
  messages: ChatMessage[];
  onRestart: () => void;
  onBackToChat: () => void;
  profile: string;
  level: string;
  employeeName: string;
  employeeEmail: string;
  trainerName: string;
  finalReport: string;
  assessmentId?: string;
}

function extractReportContent(messages: ChatMessage[]): string {
  for (const msg of [...messages].reverse()) {
    if (msg.role === 'assistant' && msg.content.includes('---REPORTE_INICIO---')) {
      const start = msg.content.indexOf('---REPORTE_INICIO---') + '---REPORTE_INICIO---'.length;
      const end = msg.content.includes('---REPORTE_FIN---')
        ? msg.content.indexOf('---REPORTE_FIN---')
        : msg.content.length;
      return msg.content.slice(start, end).trim();
    }
  }
  return 'No se encontraron resultados.';
}

function normalizeReportContent(content: string): string {
  if (!content) return 'No se encontraron resultados.';
  return content
    .replace('---REPORTE_INICIO---', '')
    .replace('---REPORTE_FIN---', '')
    .replace(/Recuperado desde tu seguimiento previo en Capital Humano\.?/gi, 'Recuperado de tu avance anterior.')
    .replace(/Recuperamos tu seguimiento desde Capital Humano\.?/gi, 'Recuperamos tu avance anterior.')
    .replace(/Capital Humano puede ver este seguimiento/gi, 'El Área de Capital Humano puede ver este avance')
    .replace(/Acércate con Capital Humano para más información\.?/gi, 'Consulta con el Área de Capital Humano para más información.')
    .replace(/Recuperado desde tu seguimiento previo para que puedas retomar tu plan sin perder contexto\.?/gi, 'Te ayudará a reforzar tus áreas de oportunidad con acciones prácticas aplicables a tu rol.')
    .trim();
}

const parseRecommendedResourceTitles = (content: string): string[] => {
  const matches = [...content.matchAll(/\*\*\d+\.\s([^\n*]+)\*\*/g)];
  return matches.map((match) => match[1].trim());
};

const EXTERNAL_RESOURCE_FALLBACK = [
  {
    title: 'Improving Communication Skills',
    type: 'Curso en Coursera · opción gratuita',
    why: 'Mejora la claridad para conversaciones profesionales y coordinación con equipo.',
    url: 'https://www.coursera.org/learn/wharton-communication-skills',
  },
  {
    title: 'Work Smarter, Not Harder: Time Management',
    type: 'Curso en Coursera · opción gratuita',
    why: 'Ayuda a priorizar mejor y sostener foco durante semanas de alta carga.',
    url: 'https://www.coursera.org/learn/work-smarter-not-harder',
  },
  {
    title: 'How to speak so that people want to listen',
    type: 'Video en YouTube (TED) · gratis',
    why: 'Brinda técnicas prácticas de comunicación aplicables al trabajo diario.',
    url: 'https://www.youtube.com/watch?v=eIho2S0ZahI',
  },
  {
    title: 'Fundamentals of Project Management',
    type: 'Alison · curso gratuito',
    why: 'Refuerza organización, seguimiento y ejecución orientada a resultados.',
    url: 'https://alison.com/course/fundamentals-of-project-management-revised-2017',
  },
  {
    title: 'Introduction to Management Analysis and Strategies',
    type: 'Alison · curso gratuito',
    why: 'Fortalece liderazgo práctico y coordinación de planes de desarrollo.',
    url: 'https://alison.com/course/introduction-to-management-analysis-and-strategies',
  },
] as const;

const normalizeTitle = (value: string): string => {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
};

const getInternalWorkshopBenefitByTitle = (title: string): string => {
  const normalized = normalizeTitle(title);

  if (normalized.includes('comunicacion')) {
    return 'Te ayudará a comunicar ideas con mayor claridad, mejorar conversaciones difíciles y alinear mejor expectativas con tu equipo.';
  }

  if (normalized.includes('trabajo en equipo')) {
    return 'Te ayudará a fortalecer colaboración, coordinación entre roles y confianza para avanzar en objetivos compartidos.';
  }

  if (normalized.includes('tiempo') || normalized.includes('administracion')) {
    return 'Te ayudará a priorizar mejor, organizar tu carga de trabajo y sostener foco en tareas de mayor impacto.';
  }

  if (normalized.includes('liderazgo') || normalized.includes('management')) {
    return 'Te ayudará a reforzar liderazgo práctico, delegación y seguimiento de resultados con mayor claridad.';
  }

  return 'Te ayudará a reforzar tus áreas de oportunidad con herramientas prácticas aplicables en tu rol.';
};

const EXTERNAL_RESOURCE_BY_TITLE: Record<string, { type: string; why: string; url: string }> = {
  [normalizeTitle('Improving Communication Skills')]: {
    type: 'Curso en Coursera · opción gratuita',
    why: 'Fortalece tu comunicación verbal y escrita para conversaciones de trabajo más claras.',
    url: 'https://www.coursera.org/learn/wharton-communication-skills',
  },
  [normalizeTitle('Work Smarter, Not Harder: Time Management')]: {
    type: 'Curso en Coursera · opción gratuita',
    why: 'Ayuda a priorizar mejor y sostener foco durante semanas con alta carga.',
    url: 'https://www.coursera.org/learn/work-smarter-not-harder',
  },
  [normalizeTitle('How to speak so that people want to listen')]: {
    type: 'Video en YouTube (TED) · gratis',
    why: 'Brinda técnicas prácticas de comunicación aplicables al trabajo diario.',
    url: 'https://www.youtube.com/watch?v=eIho2S0ZahI',
  },
  [normalizeTitle('Negotiation Skills')]: {
    type: 'Curso en Coursera · opción gratuita',
    why: 'Te ayuda a resolver desacuerdos y negociar mejor con equipo y stakeholders.',
    url: 'https://www.coursera.org/learn/negotiation-skills',
  },
  [normalizeTitle('Creative Thinking: Techniques and Tools for Success')]: {
    type: 'Curso en Coursera · opción gratuita',
    why: 'Aporta técnicas concretas para generar ideas y transformarlas en acciones.',
    url: 'https://www.coursera.org/learn/creative-thinking-techniques-and-tools-for-success',
  },
  [normalizeTitle('Fundamentals of Project Management')]: {
    type: 'Alison · curso gratuito',
    why: 'Refuerza organización, seguimiento y ejecución orientada a resultados.',
    url: 'https://alison.com/course/fundamentals-of-project-management-revised-2017',
  },
  [normalizeTitle('Google Project Management Certificate')]: {
    type: 'Curso de Google en Coursera · opción gratuita',
    why: 'Te ayuda a estructurar mejor planificación y ejecución de proyectos.',
    url: 'https://www.coursera.org/professional-certificates/google-project-management',
  },
  [normalizeTitle('Google Data Analytics Certificate')]: {
    type: 'Curso de Google en Coursera · opción gratuita',
    why: 'Fortalece análisis y toma de decisiones con base en datos.',
    url: 'https://www.coursera.org/professional-certificates/google-data-analytics',
  },
  [normalizeTitle('Introduction to Management Analysis and Strategies')]: {
    type: 'Alison · curso gratuito',
    why: 'Fortalece liderazgo práctico y coordinación de planes de desarrollo.',
    url: 'https://alison.com/course/introduction-to-management-analysis-and-strategies',
  },
  [normalizeTitle('Teamwork Skills: Communicating Effectively in Groups')]: {
    type: 'Curso en Coursera · opción gratuita',
    why: 'Refuerza colaboración y comunicación efectiva en equipos multidisciplinarios.',
    url: 'https://www.coursera.org/learn/teamwork-skills-effective-communication',
  },
};

const getExternalResourceMetaByTitle = (title: string, index: number) => {
  const isInternalWorkshop = /taller\s+interno/i.test(title);
  if (isInternalWorkshop) {
    return {
      title,
      type: 'Taller UIX · gratuito',
      why: getInternalWorkshopBenefitByTitle(title),
      url: 'Disponible internamente en UIX. Acércate con Capital Humano para más información.',
    };
  }

  const known = EXTERNAL_RESOURCE_BY_TITLE[normalizeTitle(title)];
  if (known) return { title, ...known };

  const fallback = EXTERNAL_RESOURCE_FALLBACK[index % EXTERNAL_RESOURCE_FALLBACK.length];
  return {
    title,
    type: fallback.type,
    why: fallback.why,
    url: `https://www.google.com/search?q=${encodeURIComponent(title)}`,
  };
};

const buildResourceSectionFromAssigned = (assignedResources: string[]): string => {
  const source = assignedResources.slice(0, 5);

  const resolved = source.length
    ? source.map((title, index) => getExternalResourceMetaByTitle(title, index))
    : EXTERNAL_RESOURCE_FALLBACK;

  return resolved.slice(0, 5).map((item, index) => (
    `**${index + 1}. ${item.title}**\n` +
    `- **Tipo:** ${item.type}\n` +
    `- **Por qué te va a servir:** ${item.why}\n` +
    `- **Recurso:** ${item.url}`
  )).join('\n\n');
};

const mergeAssignedResourcesIntoReport = (reportContent: string, assignedResources: string[]): string => {
  if (!reportContent) return reportContent;

  const current = parseRecommendedResourceTitles(reportContent);
  const hasInternalLinks = /Disponible internamente en UIX|Acércate con Capital Humano/i.test(reportContent);
  const shouldReplaceResources = assignedResources.length > 0 || current.length < 5 || hasInternalLinks;
  if (!shouldReplaceResources) return reportContent;

  const replacementBlock = `### Recursos recomendados\n${buildResourceSectionFromAssigned(assignedResources)}`;
  const resourcesSectionPattern = /###\s+(Recursos recomendados|Tus 5 recursos de desarrollo|Recursos de desarrollo)[\s\S]*?(?=\n###\s|\n---REPORTE_FIN---|$)/i;

  if (resourcesSectionPattern.test(reportContent)) {
    return reportContent.replace(resourcesSectionPattern, replacementBlock);
  }

  return `${reportContent}\n\n${replacementBlock}`;
};

const ensureCompetencySections = (reportContent: string): string => {
  if (!reportContent) return reportContent;

  const hasStrengths = /###\s+Tus fortalezas/i.test(reportContent);
  const hasOpportunities = /###\s+Lo que más puedes potenciar/i.test(reportContent);
  if (hasStrengths && hasOpportunities) return reportContent;

  const defaultSections = [
    '### Tus fortalezas',
    '- **Compromiso con tu desarrollo:** Mantienes seguimiento activo de tu ruta de aprendizaje.',
    '- **Persistencia:** Ya cuentas con evidencias de avance en tu plan.',
    '- **Orientación a resultados:** Das seguimiento a lo aprendido con foco en aplicación.',
    '',
    '### Lo que más puedes potenciar',
    '- **Comunicación estratégica:** Compartir de forma más clara aprendizajes y resultados.',
    '- **Priorización y foco:** Definir bloques semanales para cerrar recursos pendientes.',
    '- **Aplicación práctica:** Traducir aprendizajes en acciones concretas y medibles.',
  ].join('\n');

  const insertionPoint = reportContent.search(/###\s+Recursos recomendados/i);
  if (insertionPoint >= 0) {
    return `${reportContent.slice(0, insertionPoint).trim()}\n\n${defaultSections}\n\n${reportContent.slice(insertionPoint).trim()}`;
  }

  return `${reportContent.trim()}\n\n${defaultSections}`;
};

const statusMeta: Record<CollaboratorProgress['status'], { label: string; tone: string }> = {
  'at-risk': { label: 'En riesgo', tone: 'text-amber-300' },
  'on-track': { label: 'En curso', tone: 'text-sky-300' },
  'completed': { label: 'Completado', tone: 'text-emerald-300' },
};

const deliverableTemplates: Record<DeliverableType, { label: string; prompts: string[] }> = {
  'mini-case': {
    label: 'Mini caso aplicado',
    prompts: [
      '¿Qué situación o reto abordaste?',
      '¿Qué hiciste diferente gracias al recurso?',
      '¿Qué resultado o aprendizaje obtuviste?'
    ]
  },
  'learning-summary': {
    label: 'Resumen de aprendizaje',
    prompts: [
      '¿Qué conceptos clave viste?',
      '¿Cómo los aplicarás en tu trabajo?',
      '¿Qué siguiente acción te comprometiste a hacer?'
    ]
  },
  'tool-explainer': {
    label: 'Explicación de herramienta',
    prompts: [
      '¿Qué herramienta o método elegiste?',
      '¿Cómo se utiliza en un caso real de tu rol?',
      '¿Qué beneficio concreto aporta al equipo o proyecto?'
    ]
  },
  'custom': {
    label: 'Formato libre',
    prompts: [
      'Punto clave 1',
      'Punto clave 2',
      'Punto clave 3'
    ]
  }
};

const deliverableTypeLabels: Record<DeliverableType, string> = {
  'mini-case': 'Mini caso aplicado',
  'learning-summary': 'Resumen de aprendizaje',
  'tool-explainer': 'Explicación de herramienta',
  'custom': 'Formato libre'
};

const normalizePromptText = (value: string): string => {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const getVisibleDeliverableSummary = (deliverable: CollaboratorProgress['deliverables'][number]): string => {
  const summary = (deliverable.summary || '').trim();
  if (!summary) return '';
  if (!deliverable.templateResponses?.length) return summary;

  const promptPrefixes = deliverable.templateResponses
    .map((item) => normalizePromptText(item.prompt || ''))
    .filter(Boolean);

  if (!promptPrefixes.length) return summary;

  const filteredLines = summary
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      const normalizedLine = normalizePromptText(line.replace(/^[-*•]\s*/, ''));
      return !promptPrefixes.some((prompt) => normalizedLine.includes(prompt));
    });

  return filteredLines.join('\n').trim();
};

export function ResultsScreen({ messages, onRestart, onBackToChat, profile, employeeName, employeeEmail, trainerName, finalReport, assessmentId }: ResultsScreenProps) {
  const rawContent = normalizeReportContent(finalReport || extractReportContent(messages));
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmittingDeliverable, setIsSubmittingDeliverable] = useState(false);
  const [progress, setProgress] = useState<CollaboratorProgress | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [deliverableTitle, setDeliverableTitle] = useState('');
  const [deliverableSummary, setDeliverableSummary] = useState('');
  const [deliverableType, setDeliverableType] = useState<DeliverableType>('mini-case');
  const [templateResponses, setTemplateResponses] = useState<string[]>(['', '', '']);
  const [evidenceUrls, setEvidenceUrls] = useState('');
  const [selectedResources, setSelectedResources] = useState<string[]>([]);
  const resourcesFromProgress = progress?.assignedResources || [];

  const content = useMemo(
    () => ensureCompetencySections(mergeAssignedResourcesIntoReport(rawContent, resourcesFromProgress)),
    [rawContent, resourcesFromProgress]
  );

  const recommendedResources = useMemo(() => {
    if (resourcesFromProgress.length > 0) return resourcesFromProgress;
    return parseRecommendedResourceTitles(content);
  }, [content, resourcesFromProgress]);
  const derivedProgress = useMemo(() => {
    const deliverables = progress?.deliverables || [];
    const maxCompletedFromDeliverables = deliverables.reduce((max, deliverable) => {
      const completed = deliverable.completedResources?.length || 0;
      return Math.max(max, completed);
    }, 0);

    const total = Math.max(progress?.totalResourcesCount || 0, recommendedResources.length || 0, 1);
    const completed = Math.min(
      total,
      Math.max(progress?.completedResourcesCount || 0, maxCompletedFromDeliverables),
    );
    const percentage = Math.min(100, Math.round((completed / total) * 100));

    return { completed, total, percentage };
  }, [progress, recommendedResources]);

  useEffect(() => {
    let isMounted = true;

    const loadProgress = async () => {
      if (!employeeEmail) return;

      try {
        const existing = await getCollaboratorProgress(employeeEmail);
        const existingResources = existing.assignedResources || [];
        const hasExistingResources = existingResources.length > 0;
        const sameResourceSet = hasExistingResources
          && existingResources.length === recommendedResources.length
          && existingResources.every((resource, index) => resource === recommendedResources[index]);

        const shouldSync = !hasExistingResources || !sameResourceSet;

        if (!shouldSync) {
          if (!isMounted) return;
          setProgress(existing);
          setSelectedResources(existing.deliverables.at(-1)?.completedResources || []);
          return;
        }

        await syncCollaboratorAssessment({
          collaboratorEmail: employeeEmail,
          collaboratorName: employeeName,
          trainerName,
          profile,
          assessmentId,
          assignedResources: recommendedResources,
        });

        const refreshed = await getCollaboratorProgress(employeeEmail);
        if (!isMounted) return;
        setProgress(refreshed);
        setSelectedResources(refreshed.deliverables.at(-1)?.completedResources || []);
      } catch (error) {
        if (!isMounted) return;
        setProgressError('No fue posible cargar el avance del colaborador.');
      }
    };

    void loadProgress();
    return () => {
      isMounted = false;
    };
  }, [assessmentId, employeeEmail, employeeName, trainerName, profile, recommendedResources]);

  const handleDownload = async () => {
    setIsGenerating(true);
    try {
      const date = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
      generatePDF(content, profile, date);
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleCompletedResource = (resource: string) => {
    setSelectedResources((prev) =>
      prev.includes(resource) ? prev.filter((item) => item !== resource) : [...prev, resource]
    );
  };

  const handleSubmitDeliverable = async () => {
    const hasTemplateContent = templateResponses.some((item) => item.trim().length > 0);
    if (!employeeEmail || !deliverableTitle.trim() || (!deliverableSummary.trim() && !hasTemplateContent)) return;

    setIsSubmittingDeliverable(true);
    setProgressError(null);
    try {
      const prompts = deliverableTemplates[deliverableType].prompts;
      const normalizedTemplateResponses = templateResponses
        .map((response, index) => ({ prompt: prompts[index], response: response.trim() }))
        .filter((item) => item.response.length > 0);

      const composedSummary = deliverableSummary.trim();

      await uploadDeliverable({
        collaboratorEmail: employeeEmail,
        collaboratorName: employeeName,
        trainerName,
        assessmentId,
        title: deliverableTitle.trim(),
        summary: composedSummary,
        deliverableType,
        templateResponses: normalizedTemplateResponses,
        evidenceUrls: evidenceUrls
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean),
        completedResources: selectedResources,
      });

      const updated = await getCollaboratorProgress(employeeEmail);
      setProgress(updated);
      setDeliverableTitle('');
      setDeliverableSummary('');
      setDeliverableType('mini-case');
      setTemplateResponses(['', '', '']);
      setEvidenceUrls('');
    } catch (error) {
      setProgressError('No fue posible registrar el entregable. Intenta nuevamente.');
    } finally {
      setIsSubmittingDeliverable(false);
    }
  };

  const canSubmitDeliverable = Boolean(
    employeeEmail
    && deliverableTitle.trim()
    && (deliverableSummary.trim() || templateResponses.some((item) => item.trim()))
  );
  const latestDeliverableDate = progress?.deliverables?.length
    ? progress.deliverables.reduce((latest, current) => {
        const latestTime = Date.parse(latest.submittedAt || '');
        const currentTime = Date.parse(current.submittedAt || '');
        return currentTime >= latestTime ? current : latest;
      }).submittedAt
    : '';
  const currentStatus = derivedProgress.percentage >= 100
    ? statusMeta.completed
    : derivedProgress.percentage > 0
      ? statusMeta['on-track']
      : statusMeta['at-risk'];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative min-h-screen py-12 px-4 sm:px-6 overflow-hidden"
    >
      {/* Ambient orbs */}
      <div className="orb-purple absolute w-[500px] h-[500px] -top-32 -left-32 rounded-full pointer-events-none" />
      <div className="orb-green absolute w-[400px] h-[400px] -bottom-20 -right-20 rounded-full pointer-events-none" />

      <div className="relative z-10 max-w-3xl mx-auto space-y-8">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex items-center justify-between"
        >
          <img
            src={`${import.meta.env.BASE_URL}images/uix-logo.png`}
            alt="UIX"
            className="w-10 h-10 object-contain"
          />
          <button
            onClick={onBackToChat}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl glass-card border border-white/10 text-sm font-medium text-foreground hover:border-primary/40 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Regresar</span>
          </button>
        </motion.div>

        {/* Title section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-center space-y-4"
        >
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-2"
            style={{ background: 'linear-gradient(135deg, rgba(123,63,217,0.2), rgba(74,222,128,0.2))', border: '1px solid rgba(74,222,128,0.3)' }}>
            <CheckCircle2 className="w-7 h-7 text-secondary" />
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-bold">
            Tu <span className="gradient-text">Plan de Desarrollo</span>
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto text-sm leading-relaxed">
            Basado en tus respuestas, identificamos tus áreas clave de crecimiento y seleccionamos recursos específicos para ti.
          </p>
        </motion.div>

        {/* Results Content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="glass-card rounded-3xl p-6 md:p-10 border border-white/8"
          style={{ boxShadow: '0 0 60px rgba(123,63,217,0.1)' }}
        >
          {/* Badge */}
          <div className="flex flex-wrap gap-2 mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
              style={{ background: 'rgba(123,63,217,0.15)', color: 'hsl(267 75% 70%)', border: '1px solid rgba(123,63,217,0.25)' }}>
              <Sparkles className="w-3.5 h-3.5" />
              <span>Análisis Personalizado · UIX</span>
            </div>
            {profile && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
                style={{ background: 'rgba(74,222,128,0.1)', color: 'hsl(142 70% 60%)', border: '1px solid rgba(74,222,128,0.25)' }}>
                <span>{profile}</span>
              </div>
            )}
          </div>

          <div className="prose prose-sm md:prose-base max-w-none prose-invert
            prose-headings:font-display prose-headings:text-foreground
            prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg
            prose-p:text-muted-foreground prose-p:leading-relaxed
            prose-li:text-foreground prose-li:leading-relaxed
            prose-strong:text-foreground prose-strong:font-semibold
            prose-ul:my-3 prose-ol:my-3
            [&_h3]:gradient-text [&_hr]:border-white/10
            [&_ul>li::marker]:text-secondary [&_ol>li::marker]:text-primary
            [&_blockquote]:border-primary/40 [&_blockquote]:bg-primary/5 [&_blockquote]:rounded-xl [&_blockquote]:px-4
          ">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium no-underline hover:underline"
                    style={{ color: 'hsl(142 70% 60%)' }}
                  >
                    {children}
                    <ExternalLink className="inline w-3 h-3 flex-shrink-0 opacity-70" />
                  </a>
                ),
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.42 }}
          className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]"
        >
          <section className="glass-card rounded-3xl p-6 border border-white/8 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium"
                  style={{ background: 'rgba(74,222,128,0.12)', color: 'hsl(142 70% 60%)', border: '1px solid rgba(74,222,128,0.2)' }}>
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Avance del colaborador</span>
                </div>
                <h2 className="mt-3 text-xl font-display font-semibold text-foreground">Seguimiento de crecimiento</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Da seguimiento a recursos completados y entregables registrados para {employeeName || 'este colaborador'}.
                </p>
              </div>
              <div className={`text-sm font-semibold ${currentStatus.tone}`}>{currentStatus.label}</div>
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                <p className="text-xs text-muted-foreground">Correo</p>
                <div className="mt-2 flex items-center gap-2 text-sm text-foreground break-all">
                  <Mail className="w-4 h-4 text-secondary" />
                  <span>{employeeEmail || 'No registrado'}</span>
                </div>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                <p className="text-xs text-muted-foreground">Recursos completados</p>
                <p className="mt-2 text-2xl font-display font-semibold text-foreground">
                  {derivedProgress.completed}/{derivedProgress.total}
                </p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                <p className="text-xs text-muted-foreground">Última actualización</p>
                <div className="mt-2 flex items-center gap-2 text-sm text-foreground">
                  <CalendarClock className="w-4 h-4 text-primary" />
                  <span>{latestDeliverableDate ? new Date(latestDeliverableDate).toLocaleDateString('es-MX') : progress ? new Date(progress.updatedAt).toLocaleDateString('es-MX') : 'Pendiente'}</span>
                </div>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progreso general</span>
                <span className="font-semibold text-foreground">{derivedProgress.percentage}%</span>
              </div>
              <Progress value={derivedProgress.percentage} className="h-3 bg-white/10" />
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Entregables registrados</h3>
              {progress?.deliverables.length ? (
                <div className="space-y-3">
                  {progress.deliverables.slice().reverse().map((deliverable) => (
                    <div key={deliverable.id} className="rounded-2xl border border-white/8 bg-white/5 p-4 space-y-2">
                      {(() => {
                        const visibleSummary = getVisibleDeliverableSummary(deliverable);
                        return (
                          <>
                      <div className="flex items-center justify-between gap-4">
                        <div className="space-y-1">
                          <p className="font-medium text-foreground">{deliverable.title}</p>
                          {deliverable.deliverableType ? (
                            <span className="inline-flex rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-foreground/85 bg-white/5">
                              {deliverableTypeLabels[deliverable.deliverableType as DeliverableType] || 'Entregable'}
                            </span>
                          ) : null}
                        </div>
                        <span className="text-xs text-muted-foreground">{new Date(deliverable.submittedAt).toLocaleDateString('es-MX')}</span>
                      </div>
                      {visibleSummary ? (
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{visibleSummary}</p>
                      ) : null}
                      {deliverable.templateResponses?.length ? (
                        <div className="space-y-1 text-xs text-muted-foreground">
                          {deliverable.templateResponses.map((item, idx) => (
                            <p key={`${deliverable.id}-template-${idx}`}>
                              <span className="text-foreground/80 font-medium">{item.prompt}</span>: {item.response}
                            </p>
                          ))}
                        </div>
                      ) : null}
                      {deliverable.completedResources?.length ? (
                        <div className="flex flex-wrap gap-2">
                          {deliverable.completedResources.map((resource) => (
                            <span key={resource} className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-foreground/85 bg-white/5">
                              {resource}
                            </span>
                          ))}
                        </div>
                      ) : null}
                          </>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-muted-foreground">
                  Aún no hay entregables registrados para este colaborador.
                </div>
              )}
            </div>
          </section>

          <section className="glass-card rounded-3xl p-6 border border-white/8 space-y-5">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium"
                style={{ background: 'rgba(123,63,217,0.12)', color: 'hsl(267 75% 70%)', border: '1px solid rgba(123,63,217,0.2)' }}>
                <Upload className="w-3.5 h-3.5" />
                <span>Subir entregable</span>
              </div>
              <h2 className="mt-3 text-xl font-display font-semibold text-foreground">Registrar evidencia de crecimiento</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Documenta qué recursos completó el colaborador y cuál fue el cambio observado en su trabajo.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Título del entregable</label>
                <input
                  value={deliverableTitle}
                  onChange={(event) => setDeliverableTitle(event.target.value)}
                  placeholder="Ej. Aplicación de feedback en proyecto Q2"
                  className="w-full rounded-xl border border-white/10 bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Tipo de entregable</label>
                <select
                  value={deliverableType}
                  onChange={(event) => {
                    const nextType = event.target.value as DeliverableType;
                    setDeliverableType(nextType);
                    setTemplateResponses(['', '', '']);
                  }}
                  className="w-full rounded-xl border border-white/10 bg-transparent px-3.5 py-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {Object.entries(deliverableTemplates).map(([key, template]) => (
                    <option key={key} value={key} className="text-black">
                      {template.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Resumen del avance</label>
                <textarea
                  value={deliverableSummary}
                  onChange={(event) => setDeliverableSummary(event.target.value)}
                  placeholder="Describe qué cambió, qué aplicó y qué evidencia existe."
                  rows={5}
                  className="w-full rounded-xl border border-white/10 bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary resize-none"
                />
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-medium text-foreground">Guía de evidencia ({deliverableTemplates[deliverableType].label})</label>
                {deliverableTemplates[deliverableType].prompts.map((prompt, index) => (
                  <div key={`${deliverableType}-${index}`}>
                    <label className="block text-xs text-muted-foreground mb-1.5">{prompt}</label>
                    <textarea
                      value={templateResponses[index] || ''}
                      onChange={(event) => {
                        setTemplateResponses((prev) => {
                          const next = [...prev];
                          next[index] = event.target.value;
                          return next;
                        });
                      }}
                      rows={2}
                      placeholder="Escribe una respuesta breve y concreta"
                      className="w-full rounded-xl border border-white/10 bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary resize-none"
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Recursos completados</label>
                <div className="space-y-2">
                  {recommendedResources.map((resource) => {
                    const checked = selectedResources.includes(resource);
                    return (
                      <label key={resource} className="flex items-start gap-3 rounded-xl border border-white/8 bg-white/5 px-3 py-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCompletedResource(resource)}
                          className="mt-1 h-4 w-4 rounded border-white/20 bg-transparent text-primary"
                        />
                        <span className="text-sm text-foreground/90">{resource}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Links de evidencia</label>
                <textarea
                  value={evidenceUrls}
                  onChange={(event) => setEvidenceUrls(event.target.value)}
                  placeholder="Pega un link por línea: Figma, Notion, Drive, dashboard, feedback, etc."
                  rows={3}
                  className="w-full rounded-xl border border-white/10 bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary resize-none"
                />
              </div>

              {progressError ? (
                <div className="rounded-xl border border-rose-400/25 bg-rose-400/10 px-3.5 py-2.5 text-sm text-rose-200">
                  {progressError}
                </div>
              ) : null}

              <button
                onClick={handleSubmitDeliverable}
                disabled={!canSubmitDeliverable || isSubmittingDeliverable}
                className="w-full flex items-center justify-center gap-2 rounded-xl py-3 font-semibold text-white btn-brand disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Upload className="w-4 h-4" />
                <span>{isSubmittingDeliverable ? 'Registrando entregable...' : 'Guardar entregable'}</span>
              </button>
            </div>
          </section>
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="flex flex-col sm:flex-row gap-3 justify-center pb-6"
        >
          <button
            onClick={onBackToChat}
            className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl glass-card border border-white/10 text-muted-foreground font-medium text-sm hover:border-primary/50 hover:text-foreground transition-all duration-200"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver a la conversación</span>
          </button>

          <button
            onClick={handleDownload}
            disabled={isGenerating}
            className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-sm text-white btn-brand disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200"
          >
            <Download className="w-4 h-4" />
            <span>{isGenerating ? 'Generando PDF...' : 'Descargar mi plan en PDF'}</span>
          </button>

          <button
            onClick={onRestart}
            className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl glass-card border border-white/10 text-muted-foreground font-medium text-sm hover:border-primary/50 hover:text-foreground transition-all duration-200"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Nueva evaluación</span>
          </button>
        </motion.div>

      </div>
    </motion.div>
  );
}
