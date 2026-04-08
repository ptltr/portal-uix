import { useState, useRef, useCallback, useEffect } from "react";
import { syncCollaboratorAssessment } from "@/lib/collaboratorProgressApi";
import { fetchSessionByEmail, hasSessionByEmail, saveSessionByEmail } from "@/lib/chatSessionApi";

export type MessageRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
}

type ContextualResponse = {
  text: string;
  followUpTriggered: boolean;
};

type OptionDefinition = {
  id: "A" | "B" | "C";
  label: string;
  keywords: string[];
  strengths?: string[];
  opportunities?: string[];
};

type StepDefinition = {
  question: string;
  options: OptionDefinition[];
};

type SignalState = {
  strengths: Record<string, number>;
  opportunities: Record<string, number>;
};

export interface PersistedChatState {
  conversationId: number | null;
  messages: ChatMessage[];
  isEvaluationComplete: boolean;
  employeeName: string;
  employeeEmail: string;
  currentStep: number;
  finalReport: string;
  followUpCount: number;
  isInFollowUp: boolean;
  signals: SignalState;
  updatedAt: number;
}

const CHAT_STORAGE_KEY = "uix-chat-session-v1";

const migrateLegacyReportContent = (report: string): string => {
  if (!report) return report;

  return report
    .replace(
      "Biblioteca de libros gratuitos en español",
      "Work Smarter, Not Harder: Time Management for Personal & Professional Productivity"
    )
    .replace(
      "Te permite acceder a lecturas de desarrollo personal y disciplina que fortalecen hábitos, foco y consistencia.",
      "Te da herramientas concretas para mejorar foco, planificación y ejecución, con impacto directo en resultados."
    )
    .replace(
      "El ingenioso hidalgo Don Quijote de la Mancha (Miguel de Cervantes)",
      "Work Smarter, Not Harder: Time Management for Personal & Professional Productivity"
    )
    .replace(
      "Es una lectura clave para fortalecer pensamiento crítico, perspectiva y disciplina intelectual aplicada al trabajo.",
      "Te da herramientas concretas para mejorar foco, planificación y ejecución, con impacto directo en resultados."
    )
    .replace(
      "Libro gratuito · Project Gutenberg",
      "Curso en Coursera · opción gratuita"
    )
    .replace(
      "https://www.gutenberg.org/browse/languages/es",
      "https://www.coursera.org/learn/work-smarter-not-harder"
    )
    .replace(
      "https://www.gutenberg.org/ebooks/2000",
      "https://www.coursera.org/learn/work-smarter-not-harder"
    )
    .replace(
      "Communicating with Confidence",
      "Improving Communication Skills"
    )
    .replace(
      "LinkedIn Learning · acceso gratuito por prueba",
      "Curso en Coursera · opción gratuita"
    )
    .replace(
      "https://www.linkedin.com/learning/communicating-with-confidence",
      "https://www.coursera.org/learn/wharton-communication-skills"
    )
    .replace(
      /Disponible internamente en UIX(?!\. Acércate con Capital Humano para más información\.)/g,
      "Disponible internamente en UIX. Acércate con Capital Humano para más información."
    );
};

const STEPS: StepDefinition[] = [
  {
    question: "Empecemos tranqui: en una semana pesada de trabajo, ¿qué fue lo más retador para ti?",
    options: [
      {
        id: "A",
        label: "Había mucha presión y me tocó priorizar rápido",
        keywords: ["presion", "presión", "urgente", "deadline", "rapido", "rápido", "ordenar", "priorizar"],
        strengths: ["resolucion_problemas", "orientacion_resultados", "adaptabilidad"],
      },
      {
        id: "B",
        label: "El reto estuvo más en la dinámica con el equipo o con personas",
        keywords: ["equipo", "personas", "conflicto", "jefe", "compañero", "colega", "relacion", "relación"],
        strengths: ["empatia", "comunicacion", "trabajo_equipo"],
      },
      {
        id: "C",
        label: "Fue un reto técnico o de aprender algo nuevo",
        keywords: ["tecnico", "técnico", "codigo", "código", "sistema", "aprender", "nuevo"],
        strengths: ["aprendizaje_continuo", "solucion_analitica"],
      },
    ],
  },
  {
    question: "En esa situación, ¿qué rol tomaste tú?",
    options: [
      {
        id: "A",
        label: "Tomé el liderazgo y marqué dirección",
        keywords: ["lidere", "lideré", "coordine", "coordiné", "dirigi", "dirigí", "responsable"],
        strengths: ["liderazgo", "asertividad"],
      },
      {
        id: "B",
        label: "Me enfoqué en ejecutar y sacar lo más importante",
        keywords: ["ejecute", "ejecuté", "implemente", "implementé", "resolvi", "resolví", "entregue", "entregué"],
        strengths: ["orientacion_resultados", "resolucion_problemas"],
      },
      {
        id: "C",
        label: "Apoyé al equipo y ayudé a llegar a acuerdos",
        keywords: ["apoye", "apoyé", "facilite", "facilité", "acompañe", "acompañé", "ayude", "ayudé"],
        strengths: ["trabajo_equipo", "escucha", "empatia"],
      },
    ],
  },
  {
    question: "Cuando se empezó a poner complicado, ¿qué hiciste primero?",
    options: [
      {
        id: "A",
        label: "Prioricé y armé un plan de acción",
        keywords: ["priorice", "prioricé", "plan", "orden", "pasos", "estrategia"],
        strengths: ["orientacion_resultados", "resolucion_problemas"],
      },
      {
        id: "B",
        label: "Pedí apoyo y alineé al equipo",
        keywords: ["pedi", "pedí", "apoyo", "alinear", "equipo", "ayuda", "consenso"],
        strengths: ["trabajo_equipo", "comunicacion", "escucha"],
      },
      {
        id: "C",
        label: "Fui probando alternativas hasta encontrar salida",
        keywords: ["probe", "probé", "iterar", "ajuste", "experimentar", "alternativa"],
        strengths: ["innovacion", "adaptabilidad", "aprendizaje_continuo"],
      },
    ],
  },
  {
    question: "En el lado humano: cuando alguien del equipo te cuestiona, ¿cómo lo sueles manejar?",
    options: [
      {
        id: "A",
        label: "Lo hablo directo, pero con respeto",
        keywords: ["converse", "conversé", "hable", "hablé", "directo", "respeto"],
        strengths: ["asertividad", "comunicacion"],
      },
      {
        id: "B",
        label: "Busco puntos en común para llegar a un acuerdo",
        keywords: ["acuerdo", "consenso", "punto medio", "mediar", "negociar"],
        strengths: ["empatia", "trabajo_equipo", "escucha"],
      },
      {
        id: "C",
        label: "Me cuesta hablarlo y lo voy dejando",
        keywords: ["evito", "postergar", "callo", "me cuesta", "incomodo", "incómodo"],
        opportunities: ["asertividad", "gestion_conflicto"],
      },
    ],
  },
  {
    question: "Cuando te dan feedback difícil, ¿cómo reaccionas normalmente?",
    options: [
      {
        id: "A",
        label: "Lo tomo, lo proceso y trato de aplicarlo",
        keywords: ["acepto", "aplico", "uso", "implemento", "cambio", "aprendi", "aprendí"],
        strengths: ["aprendizaje_continuo", "escucha"],
      },
      {
        id: "B",
        label: "Al inicio me pega, pero después ajusto",
        keywords: ["me pego", "me pegó", "me costo", "me costó", "despues", "después", "ajusto"],
        strengths: ["adaptabilidad"],
        opportunities: ["escucha"],
      },
      {
        id: "C",
        label: "Me pongo a la defensiva",
        keywords: ["defensiva", "justifico", "me cierro", "molesta", "molestia"],
        opportunities: ["escucha", "aprendizaje_continuo"],
      },
    ],
  },
  {
    question: "¿Sueles proponer mejoras aunque nadie te las pida?",
    options: [
      {
        id: "A",
        label: "Sí, y además se nota el impacto",
        keywords: ["propuse", "impacto", "mejore", "mejoré", "resultado", "iniciativa", "propuesta"],
        strengths: ["innovacion", "orientacion_resultados", "iniciativa"],
      },
      {
        id: "B",
        label: "Sí, pero más bien en cosas pequeñas",
        keywords: ["pequeno", "pequeño", "paso a paso", "incremental", "pequenas", "pequeñas"],
        strengths: ["iniciativa"],
      },
      {
        id: "C",
        label: "No mucho, me cuesta salir de lo que me asignan",
        keywords: ["me cuesta", "asignado", "esperar", "instruccion", "instrucción", "zona de confort"],
        opportunities: ["innovacion", "iniciativa"],
      },
    ],
  },
  {
    question: "Pensando en tu chamba, ¿qué tipo de logro te hace sentir más orgullo?",
    options: [
      {
        id: "A",
        label: "Uno donde el equipo creció gracias a mi aporte",
        keywords: ["equipo", "personas", "aporte", "crecio", "creció", "mentor"],
        strengths: ["liderazgo", "trabajo_equipo", "empatia"],
      },
      {
        id: "B",
        label: "Uno técnico o estratégico con resultado claro",
        keywords: ["tecnico", "técnico", "estrategico", "estratégico", "resultado", "objetivo"],
        strengths: ["solucion_analitica", "orientacion_resultados"],
      },
      {
        id: "C",
        label: "Uno de constancia personal y superación",
        keywords: ["constancia", "disciplina", "habito", "hábito", "superacion", "superación"],
        strengths: ["resiliencia", "aprendizaje_continuo"],
      },
    ],
  },
  {
    question: "Con toda honestidad, ¿qué sientes que hoy te está costando más mejorar?",
    options: [
      {
        id: "A",
        label: "Comunicar mejor y decir lo que pienso a tiempo",
        keywords: ["comunicar", "asertivo", "asertiva", "expresar", "decir", "hablar"],
        opportunities: ["comunicacion", "asertividad"],
      },
      {
        id: "B",
        label: "Ordenar prioridades y manejar mejor mi tiempo",
        keywords: ["tiempo", "prioridad", "foco", "organizacion", "organización", "plan"],
        opportunities: ["gestion_tiempo", "orientacion_resultados"],
      },
      {
        id: "C",
        label: "Delegar, pedir ayuda y confiar más en el equipo",
        keywords: ["delegar", "pedir ayuda", "confianza", "soltar", "equipo"],
        opportunities: ["liderazgo", "trabajo_equipo"],
      },
    ],
  },
  {
    question: "Para crecer en los próximos meses, ¿qué crees que más te ayudaría?",
    options: [
      {
        id: "A",
        label: "Tener mentoría y feedback frecuente",
        keywords: ["mentoria", "mentoría", "feedback", "acompanamiento", "acompañamiento"],
        strengths: ["aprendizaje_continuo"],
      },
      {
        id: "B",
        label: "Tomar un proyecto retador con más responsabilidad",
        keywords: ["proyecto", "desafiante", "responsabilidad", "reto", "liderar"],
        strengths: ["iniciativa", "liderazgo"],
      },
      {
        id: "C",
        label: "Formación técnica con práctica guiada",
        keywords: ["curso", "taller", "formacion", "formación", "tecnico", "técnico"],
        strengths: ["aprendizaje_continuo", "solucion_analitica"],
      },
    ],
  },
];

const STRENGTH_LABELS: Record<string, string> = {
  empatia: "Empatía y lectura del contexto humano",
  comunicacion: "Comunicación clara",
  escucha: "Escucha activa",
  asertividad: "Asertividad",
  trabajo_equipo: "Trabajo en equipo",
  liderazgo: "Liderazgo colaborativo",
  orientacion_resultados: "Orientación a resultados",
  resolucion_problemas: "Resolución de problemas",
  solucion_analitica: "Pensamiento analítico",
  adaptabilidad: "Adaptabilidad al cambio",
  innovacion: "Innovación",
  aprendizaje_continuo: "Aprendizaje continuo",
  iniciativa: "Iniciativa",
  resiliencia: "Resiliencia",
};

const OPPORTUNITY_LABELS: Record<string, string> = {
  asertividad: "Asertividad en conversaciones difíciles",
  gestion_conflicto: "Gestión de conflicto",
  escucha: "Recepción de feedback",
  aprendizaje_continuo: "Apertura al aprendizaje",
  innovacion: "Proactividad e innovación",
  iniciativa: "Toma de iniciativa",
  comunicacion: "Comunicación estratégica",
  gestion_tiempo: "Priorización y gestión del tiempo",
  orientacion_resultados: "Foco en resultados sostenidos",
  liderazgo: "Delegación y liderazgo",
  trabajo_equipo: "Colaboración y confianza en el equipo",
};

const STRENGTH_DESCRIPTIONS: Record<string, string> = {
  empatia: "Tienes una capacidad natural para leer el estado emocional de las personas y adaptar tu comunicación a lo que el momento requiere.",
  comunicacion: "Transmites tus ideas con claridad, ajustando el tono y el nivel de detalle según tu audiencia.",
  escucha: "Prestas atención genuina a lo que dicen los demás y esto genera confianza y apertura a tu alrededor.",
  asertividad: "Expresas tu punto de vista con seguridad sin herir a los demás, lo cual facilita conversaciones difíciles.",
  trabajo_equipo: "Colaboras de forma efectiva y contribuyes a crear un ambiente donde todos se sienten parte del resultado.",
  liderazgo: "Movilizas a las personas desde el ejemplo y la confianza, no solo desde la autoridad.",
  orientacion_resultados: "Mantienes el foco en los objetivos incluso bajo presión, y conviertes las intenciones en acciones concretas.",
  resolucion_problemas: "Ante los obstáculos no te paralizas: buscas alternativas con pragmatismo y creatividad.",
  solucion_analitica: "Descompones situaciones complejas en partes manejables y tomas decisiones con base en datos.",
  adaptabilidad: "Te ajustas con agilidad a los cambios sin perder efectividad, lo cual es clave en entornos dinámicos.",
  innovacion: "Propones ideas nuevas y cuestionas el statu quo de forma constructiva.",
  aprendizaje_continuo: "Tienes una mentalidad de crecimiento: buscas activamente mejorar y aprender de cada experiencia.",
  iniciativa: "No esperas que te digan qué hacer; identificas oportunidades y actúas antes de que alguien lo pida.",
  resiliencia: "Cuando algo no sale como esperabas, te recuperas con rapidez y extraes aprendizaje del tropiezo.",
};

const OPPORTUNITY_DESCRIPTIONS: Record<string, string> = {
  asertividad: "Te cuesta sostener tu postura en conversaciones difíciles o con personas de mayor jerarquía; desarrollar esta habilidad fortalecerá tu credibilidad.",
  gestion_conflicto: "Cuando surge una tensión en el equipo tiendes a evitarla en lugar de abordarla; aprender a gestionarla directamente te ahorrará energía y fricciones futuras.",
  escucha: "Recibir críticas o feedback puede ser difícil; trabajar la apertura a escuchar sin ponerse a la defensiva acelera el crecimiento personal.",
  aprendizaje_continuo: "Hay cierta resistencia a salir de la zona de confort o explorar formas nuevas de hacer las cosas; potenciar esa apertura tiene un impacto directo en tu desarrollo.",
  innovacion: "Te apoyás mucho en procesos establecidos; cultivar la curiosidad y el pensamiento lateral te permitirá aportar ideas que marquen la diferencia.",
  iniciativa: "Esperas directrices claras antes de actuar; construir el hábito de proponer y avanzar sin que te lo pidan elevará tu visibilidad y tu impacto.",
  comunicacion: "En situaciones de alta exposición o presión la comunicación pierde claridad o estructura; trabajar esto te dará más confianza e influencia.",
  gestion_tiempo: "Tienes dificultades para priorizar cuando todo parece urgente; aprender a distinguir lo importante de lo urgente libera energía para lo que realmente mueve el negocio.",
  orientacion_resultados: "El foco en el proceso a veces hace perder de vista el resultado final; fortalecer esta orientación te ayudará a cerrar ciclos con mayor consistencia.",
  liderazgo: "Te cuesta delegar o confiar en que el equipo puede ejecutar sin supervisión constante; desarrollar esto multiplica tu capacidad de impacto.",
  trabajo_equipo: "Hay una tendencia a trabajar en solitario o a desconfiar del ritmo ajeno; construir esa confianza colectiva hace que los proyectos fluyan mejor.",
};

interface ResourceData {
  label: string;
  tipo: string;
  why: string;
  url: string;
  category: "curso" | "video" | "taller";
}

const RESOURCE_BY_OPPORTUNITY: Record<string, ResourceData> = {
  asertividad: {
    label: "Improving Communication Skills",
    tipo: "Curso en Coursera · opción gratuita",
    why: "Te ayuda a estructurar conversaciones difíciles con más claridad, seguridad y empatía en contextos reales de trabajo.",
    url: "https://www.coursera.org/learn/wharton-communication-skills",
    category: "curso",
  },
  gestion_conflicto: {
    label: "Negotiation Skills",
    tipo: "Curso en Coursera · opción gratuita",
    why: "Fortalece tu capacidad de resolver desacuerdos con técnicas de negociación aplicables a equipo, cliente y stakeholders.",
    url: "https://www.coursera.org/learn/negotiation-skills",
    category: "curso",
  },
  escucha: {
    label: "How to speak so that people want to listen",
    tipo: "Video en YouTube (TED) · gratis",
    why: "Te da ideas prácticas para mejorar cómo escuchas y te comunicas, con ejemplos muy claros para el día a día.",
    url: "https://www.youtube.com/watch?v=eIho2S0ZahI",
    category: "video",
  },
  aprendizaje_continuo: {
    label: "Google Project Management Certificate",
    tipo: "Curso de Google en Coursera · opción gratuita",
    why: "Te ayuda a estructurar mejor tu aprendizaje, planificación y ejecución con una ruta guiada y práctica.",
    url: "https://www.coursera.org/professional-certificates/google-project-management",
    category: "curso",
  },
  innovacion: {
    label: "Creative Thinking: Techniques and Tools for Success",
    tipo: "Curso en Coursera · opción gratuita",
    why: "Te ofrece métodos concretos para generar ideas y aterrizarlas en propuestas de valor para proyectos reales.",
    url: "https://www.coursera.org/learn/creative-thinking-techniques-and-tools-for-success",
    category: "curso",
  },
  iniciativa: {
    label: "Fundamentals of Project Management",
    tipo: "Alison · curso gratuito",
    why: "Te ayuda a desarrollar hábitos de proactividad, responsabilidad personal y enfoque para avanzar con más autonomía en contextos profesionales.",
    url: "https://alison.com/course/fundamentals-of-project-management-revised-2017",
    category: "curso",
  },
  comunicacion: {
    label: "Taller interno de Comunicación Efectiva",
    tipo: "Taller UIX · gratuito",
    why: "Refuerza la claridad del mensaje, la escucha y la comunicación con equipo y stakeholders en contexto UIX.",
    url: "Disponible internamente en UIX. Acércate con Capital Humano para más información.",
    category: "taller",
  },
  gestion_tiempo: {
    label: "Taller interno de Administración del Tiempo",
    tipo: "Taller UIX · gratuito",
    why: "Te ayuda a priorizar con criterio y organizar tu semana con foco en resultados de alto impacto.",
    url: "Disponible internamente en UIX. Acércate con Capital Humano para más información.",
    category: "taller",
  },
  orientacion_resultados: {
    label: "Google Data Analytics Certificate",
    tipo: "Curso de Google en Coursera · opción gratuita",
    why: "Fortalece tu enfoque en resultados con análisis de datos aplicable al seguimiento de objetivos e impacto.",
    url: "https://www.coursera.org/professional-certificates/google-data-analytics",
    category: "curso",
  },
  liderazgo: {
    label: "Introduction to Management Analysis and Strategies",
    tipo: "Alison · curso gratuito",
    why: "Fortalece tu liderazgo práctico para delegar, coordinar mejor y acompañar al equipo con mayor claridad.",
    url: "https://alison.com/course/introduction-to-management-analysis-and-strategies",
    category: "curso",
  },
  trabajo_equipo: {
    label: "Taller interno de Trabajo en Equipo",
    tipo: "Taller UIX · gratuito",
    why: "Mejora la colaboración transversal, la coordinación entre roles y la confianza para avanzar como equipo.",
    url: "Disponible internamente en UIX. Acércate con Capital Humano para más información.",
    category: "taller",
  },
};

const randomFrom = (items: string[]): string => items[Math.floor(Math.random() * items.length)];

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const keywordMatches = (text: string, keyword: string): boolean => {
  const normalizedText = normalize(text);
  const normalizedKeyword = normalize(keyword);

  if (normalizedKeyword.includes(" ")) {
    return normalizedText.includes(normalizedKeyword);
  }

  const regex = new RegExp(`(^|\\s)${escapeRegExp(normalizedKeyword)}(\\s|$)`);
  return regex.test(normalizedText);
};

const isGreetingInput = (value: string): boolean => {
  const normalizedValue = normalize(value);
  const compact = normalizedValue.replace(/[!?.,;:]/g, "").trim();
  if (compact.length > 24) return false;

  return /^(hola|holi|buenas|buen dia|hello|hey|hi|que tal|que onda)$/.test(compact)
    || /^(hola|holi|buenas)\b/.test(compact);
};

const formatQuestionWithOptions = (name: string, stepIndex: number): string => {
  const step = STEPS[stepIndex];
  if (!step) return "";

  const intro = stepIndex === 0 ? `Hola ${name || "colaborador"} 👋 ` : "";
  return `${intro}${step.question}`;
};

const getTopKeys = (map: Record<string, number>, limit = 3): string[] =>
  Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key);

const fillUniqueKeys = (primary: string[], fallback: string[], min: number): string[] => {
  const result: string[] = [];

  for (const key of primary) {
    if (!result.includes(key)) {
      result.push(key);
    }
    if (result.length >= min) return result.slice(0, min);
  }

  for (const key of fallback) {
    if (!result.includes(key)) {
      result.push(key);
    }
    if (result.length >= min) return result.slice(0, min);
  }

  return result.slice(0, min);
};

const parseRecommendedResourceTitles = (report: string): string[] => {
  const matches = [...report.matchAll(/\*\*\d+\.\s([^\n*]+)\*\*/g)];
  return matches.map((match) => match[1].trim()).filter(Boolean);
};

const toResourceId = (resource: ResourceData): string => `${resource.label}|${resource.url}`;

const buildMixedResourceRecommendations = (opportunityKeys: string[], total = 5): ResourceData[] => {
  const selected: ResourceData[] = [];
  const usedIds = new Set<string>();
  const allResources = Object.values(RESOURCE_BY_OPPORTUNITY);

  const addResource = (resource?: ResourceData): boolean => {
    if (!resource) return false;
    const resourceId = toResourceId(resource);
    if (usedIds.has(resourceId)) return false;

    const workshopCount = selected.filter((item) => item.category === "taller").length;
    if (resource.category === "taller" && workshopCount >= 2) return false;

    selected.push(resource);
    usedIds.add(resourceId);
    return true;
  };

  for (const key of opportunityKeys) {
    addResource(RESOURCE_BY_OPPORTUNITY[key]);
  }

  const workshopHeavyOpportunities = ["comunicacion", "gestion_tiempo", "trabajo_equipo", "liderazgo"];
  const shouldIncludeWorkshop = opportunityKeys.some((key) => workshopHeavyOpportunities.includes(key));

  if (shouldIncludeWorkshop && !selected.some((item) => item.category === "taller")) {
    const workshopFromOpportunity = opportunityKeys
      .map((key) => RESOURCE_BY_OPPORTUNITY[key])
      .find((item) => item?.category === "taller");
    const fallbackWorkshop = allResources.find((item) => item.category === "taller");
    addResource(workshopFromOpportunity || fallbackWorkshop);
  }

  const requiredCategories: Array<ResourceData["category"]> = ["video", "curso"];
  for (const category of requiredCategories) {
    if (selected.length >= total) break;
    if (selected.some((item) => item.category === category)) continue;
    const candidate = allResources.find((item) => item.category === category && !usedIds.has(toResourceId(item)));
    addResource(candidate);
  }

  for (const item of allResources) {
    if (selected.length >= total) break;
    addResource(item);
  }

  return selected.slice(0, total);
};

export function useChat() {
  const hasHydratedRef = useRef(false);
  const lastSyncedAssessmentRef = useRef<string>("");
  const remoteSaveTimeoutRef = useRef<number | null>(null);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isEvaluationComplete, setIsEvaluationComplete] = useState(false);
  const [employeeName, setEmployeeName] = useState("");
  const [employeeEmail, setEmployeeEmail] = useState("");

  const [currentStep, setCurrentStep] = useState(0);
  const [finalReport, setFinalReport] = useState("");
  const [followUpCount, setFollowUpCount] = useState(0);
  const [isInFollowUp, setIsInFollowUp] = useState(false);
  const responseStyleRef = useRef<{ lastOpening: string; lastInsight: string }>({
    lastOpening: "",
    lastInsight: "",
  });

  const signalsRef = useRef<SignalState>({ strengths: {}, opportunities: {} });

  const applyPersistedState = useCallback((parsed: PersistedChatState) => {
    const parsedMessages = Array.isArray(parsed.messages) ? parsed.messages : [];
    const hasMeaningfulContent = parsedMessages.length > 0 || Boolean(parsed.finalReport);

    setConversationId(hasMeaningfulContent && typeof parsed.conversationId === "number" ? parsed.conversationId : null);
    setMessages(parsedMessages);
    setIsEvaluationComplete(hasMeaningfulContent && Boolean(parsed.isEvaluationComplete));
    setEmployeeName(parsed.employeeName || "");
    setEmployeeEmail(parsed.employeeEmail || "");
    setCurrentStep(hasMeaningfulContent && typeof parsed.currentStep === "number" ? parsed.currentStep : 0);
    setFinalReport(migrateLegacyReportContent(parsed.finalReport || ""));
    setFollowUpCount(hasMeaningfulContent && typeof parsed.followUpCount === "number" ? parsed.followUpCount : 0);
    setIsInFollowUp(hasMeaningfulContent && Boolean(parsed.isInFollowUp));

    if (parsed.signals?.strengths && parsed.signals?.opportunities) {
      signalsRef.current = {
        strengths: parsed.signals.strengths,
        opportunities: parsed.signals.opportunities,
      };
    } else {
      signalsRef.current = { strengths: {}, opportunities: {} };
    }
  }, []);

  const getPersistedSnapshot = useCallback((): PersistedChatState => {
    return {
      conversationId,
      messages,
      isEvaluationComplete,
      employeeName,
      employeeEmail,
      currentStep,
      finalReport,
      followUpCount,
      isInFollowUp,
      signals: signalsRef.current,
      updatedAt: Date.now(),
    };
  }, [conversationId, messages, isEvaluationComplete, employeeName, employeeEmail, currentStep, finalReport, followUpCount, isInFollowUp]);

  const hasSnapshotContent = useCallback((snapshot: PersistedChatState | null | undefined): boolean => {
    if (!snapshot) return false;

    return (
      snapshot.messages.length > 0
      || Boolean(snapshot.finalReport)
    );
  }, []);

  const readLocalSnapshotForEmail = useCallback((email: string): PersistedChatState | null => {
    try {
      const raw = localStorage.getItem(CHAT_STORAGE_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw) as PersistedChatState;
      if ((parsed.employeeEmail || "").trim().toLowerCase() !== email.trim().toLowerCase()) {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CHAT_STORAGE_KEY);
      if (!raw) {
        hasHydratedRef.current = true;
        return;
      }

      const parsed = JSON.parse(raw) as PersistedChatState;
      applyPersistedState(parsed);
    } catch {
      // Ignore malformed local data and continue with a fresh session.
    } finally {
      hasHydratedRef.current = true;
    }
  }, [applyPersistedState]);

  useEffect(() => {
    if (!hasHydratedRef.current || isTyping) return;

    const snapshot = getPersistedSnapshot();

    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Ignore storage write errors (quota/private mode).
    }
  }, [getPersistedSnapshot, isTyping]);

  useEffect(() => {
    if (!hasHydratedRef.current || isTyping || !employeeEmail.trim()) return;

    const hasContent = messages.length > 0 || Boolean(finalReport);
    if (!hasContent) return;

    if (remoteSaveTimeoutRef.current) {
      window.clearTimeout(remoteSaveTimeoutRef.current);
    }

    remoteSaveTimeoutRef.current = window.setTimeout(() => {
      const snapshot = getPersistedSnapshot();
      void saveSessionByEmail(employeeEmail, snapshot).catch(() => {
        // Ignore remote persistence errors to keep chat flow uninterrupted.
      });
    }, 400);

    return () => {
      if (remoteSaveTimeoutRef.current) {
        window.clearTimeout(remoteSaveTimeoutRef.current);
        remoteSaveTimeoutRef.current = null;
      }
    };
  }, [conversationId, currentStep, employeeEmail, finalReport, getPersistedSnapshot, isTyping, messages.length]);

  useEffect(() => {
    if (!hasHydratedRef.current || !employeeEmail.trim()) return;

    const snapshot = getPersistedSnapshot();
    if (!hasSnapshotContent(snapshot)) return;

    void saveSessionByEmail(employeeEmail, snapshot).catch(() => {
      // Ignore remote persistence errors to keep UX responsive.
    });
  }, [employeeEmail, getPersistedSnapshot, hasSnapshotContent]);

  useEffect(() => {
    if (!isEvaluationComplete || !employeeEmail.trim() || !finalReport.trim()) return;

    const syncKey = `${employeeEmail.trim().toLowerCase()}|${conversationId || "no-conversation"}`;
    if (lastSyncedAssessmentRef.current === syncKey) return;
    lastSyncedAssessmentRef.current = syncKey;

    const assignedResources = parseRecommendedResourceTitles(finalReport);
    void syncCollaboratorAssessment({
      collaboratorEmail: employeeEmail,
      collaboratorName: employeeName,
      profile: "",
      assessmentId: conversationId ? String(conversationId) : undefined,
      assignedResources,
    }).catch(() => {
      // Ignore sync errors here; user can retry from results screen.
    });
  }, [conversationId, employeeEmail, employeeName, finalReport, isEvaluationComplete]);

  const addSignal = (type: keyof SignalState, key: string, points = 1) => {
    const bucket = signalsRef.current[type];
    bucket[key] = (bucket[key] || 0) + points;
  };

  const detectSelectedOption = useCallback((input: string, stepIndex: number): OptionDefinition | null => {
    const step = STEPS[stepIndex];
    if (!step) return null;

    const normalized = normalize(input);
    const first = normalized.charAt(0).toUpperCase();

    const byLetter = step.options.find((opt) => opt.id === first);
    if (byLetter) return byLetter;

    const explicitOption = step.options.find((opt) => normalized.includes(`opcion ${opt.id.toLowerCase()}`) || normalized.includes(`opción ${opt.id.toLowerCase()}`));
    if (explicitOption) return explicitOption;

    let best: OptionDefinition | null = null;
    let bestScore = 0;
    let isTie = false;

    for (const option of step.options) {
      const score = option.keywords.reduce((sum, keyword) => {
        if (!keywordMatches(normalized, keyword)) return sum;
        return sum + (keyword.includes(" ") ? 2 : 1);
      }, 0);

      if (score > bestScore) {
        best = option;
        bestScore = score;
        isTie = false;
      } else if (score > 0 && score === bestScore) {
        isTie = true;
      }
    }

    if (isTie) return null;

    return bestScore > 0 ? best : null;
  }, []);

  const applyHeuristicSignals = (input: string) => {
    const text = normalize(input);

    if (text.includes("equipo") || text.includes("companero") || text.includes("companera")) {
      addSignal("strengths", "trabajo_equipo", 1);
      addSignal("strengths", "empatia", 1);
    }

    if (text.includes("prioriz") || text.includes("plan") || text.includes("objetivo")) {
      addSignal("strengths", "orientacion_resultados", 1);
    }

    if (text.includes("aprendi") || text.includes("aprendizaje") || text.includes("mejore")) {
      addSignal("strengths", "aprendizaje_continuo", 1);
    }

    if (text.includes("me cuesta") || text.includes("me cuesta reconocer") || text.includes("no se")) {
      addSignal("opportunities", "comunicacion", 1);
    }
  };

  const buildPersonalizedReport = useCallback((): string => {
    const topStrengths = getTopKeys(signalsRef.current.strengths, 4);
    const topOpportunities = getTopKeys(signalsRef.current.opportunities, 3);

    const fallbackStrengths = ["aprendizaje_continuo", "trabajo_equipo", "orientacion_resultados"];
    const fallbackOpportunities = ["comunicacion", "gestion_tiempo", "asertividad"];

    const resolvedStrengths = fillUniqueKeys(topStrengths, fallbackStrengths, 4);
    const resolvedOpportunities = fillUniqueKeys(topOpportunities, fallbackOpportunities, 3);

    const strengths = resolvedStrengths
      .map((key) => `- **${STRENGTH_LABELS[key] || key}**: ${STRENGTH_DESCRIPTIONS[key] || ""}`)
      .join("\n");

    const opportunities = resolvedOpportunities
      .map((key) => `- **${OPPORTUNITY_LABELS[key] || key}**: ${OPPORTUNITY_DESCRIPTIONS[key] || ""}`)
      .join("\n");

    const resources = buildMixedResourceRecommendations(resolvedOpportunities, 5)
      .map((res, index) => {
        return `**${index + 1}. ${res.label}**\n**Tipo:** ${res.tipo}\n**Por qué te va a servir:** ${res.why}\n**Recurso:** ${res.url}`;
      })
      .join("\n\n");

    const followUpEmailLine = employeeEmail
      ? `- **Correo de seguimiento:** ${employeeEmail}`
      : "- **Correo de seguimiento:** Pendiente de registro";

    return `---REPORTE_INICIO---
## Tu plan de crecimiento personalizado

### Tus fortalezas
${strengths}

### Lo que más puedes potenciar
${opportunities}

### Recursos recomendados
${resources}

### Cómo funciona tu seguimiento
- **Marca los recursos completados:** Cuando avances en tus cursos, videos o talleres, selecciónalos en la sección de seguimiento.
- **Sube tu entregable:** Registra un resumen corto de lo que aplicaste, qué cambió en tu trabajo y agrega evidencias si las tienes.
- **Elige un formato guiado:** Puedes registrar un mini caso aplicado, un resumen de aprendizaje o la explicación de una herramienta con campos estructurados.
- **Tu avance se actualiza:** Cada entregable ayuda a reflejar tu progreso y permite dar seguimiento a tu crecimiento.
- **Capital Humano puede ver este seguimiento:** Tu avance, recursos completados y entregables registrados estarán disponibles para acompañar tu desarrollo.

### Plan de seguimiento (30-60-90 días)
- **Día 30:** Completar al menos 2 recursos y registrar aprendizajes clave.
- **Día 60:** Completar los recursos restantes y aplicar 1 práctica en un proyecto real.
- **Día 90:** Compartir resultados, evidencias y próximos pasos de desarrollo.
${followUpEmailLine}

### Entregable de crecimiento
- **Formato sugerido:** 1 página o 5 diapositivas.
- **Debe incluir:**
  1. Recursos completados (curso/video/taller) y fecha.
  2. Qué cambió en tu forma de trabajar.
  3. Evidencia concreta (ejemplo de proyecto, feedback, métricas o resultados).
  4. Próximo objetivo de mejora para los siguientes 30 días.
---REPORTE_FIN---`;
  }, [employeeEmail]);

  const generateContextualResponse = useCallback((userInput: string, stepIndex: number): ContextualResponse => {
    const cleaned = userInput.trim();
    const normalized = normalize(cleaned);
    const step = STEPS[stepIndex];

    if (isGreetingInput(cleaned)) {
      return {
        text: "Hola. Si quieres retomar una conversación previa, vuelve al inicio y usa 'Retomar con correo' con el mismo email. Si prefieres, también podemos comenzar una nueva evaluación desde cero.",
        followUpTriggered: true,
      };
    }

    if (!step) {
      return { text: "Te leo 👀", followUpTriggered: false };
    }

    // Detect meta-comments: user is asking about the bot or the format, not answering the question
    const metaPatterns = [
      /no (veo|hay|tengo|encuentro|aparecen?|salen?|muestran?).*opcion/,
      /cuales? son las opciones/,
      /que opciones/,
      /no entend[ií]/,
      /no comprend[ií]/,
      /puedes? repetir/,
      /no me qued[oó] claro/,
      /no s[eé] qu[eé] contestar/,
      /^\?+$/,
    ];
    const isMetaComment = metaPatterns.some((p) => p.test(normalized));
    if (isMetaComment) {
      setIsInFollowUp(true);
      setFollowUpCount((prev) => prev + 1);
      const optionLabels = step.options.map((o) => `- "${o.label}"`).join("\n");
      return {
        text: `Claro, te doy un poco más de contexto. Aquí algunos ejemplos de cómo puede verse:\n\n${optionLabels}\n\nNo tienes que elegir uno al pie de la letra, cuéntamelo con tus palabras.`,
        followUpTriggered: true,
      };
    }

    const selectedOption = detectSelectedOption(cleaned, stepIndex);
    const hasStepKeywordMatch = step.options.some((option) =>
      option.keywords.some((keyword) => keywordMatches(cleaned, keyword))
    );

    if (!selectedOption && cleaned.length < 3) {
      setIsInFollowUp(true);
      setFollowUpCount((prev) => prev + 1);
      return {
        text: "Te sigo. Si quieres, cuéntamelo con un ejemplo corto y lo vamos aterrizando juntos.",
        followUpTriggered: true,
      };
    }

    const isSingleWord = cleaned.trim().split(/\s+/).length === 1;
    if (!selectedOption && !hasStepKeywordMatch && isSingleWord && cleaned.length <= 12) {
      setIsInFollowUp(true);
      setFollowUpCount((prev) => prev + 1);
      const optionLabels = step.options.map((o) => `- \"${o.label}\"`).join("\n");
      return {
        text: `Te leo, pero para esta pregunta necesito un poco más de contexto sobre tu respuesta. Puedes apoyarte en alguno de estos ejemplos:\n\n${optionLabels}\n\nRespóndeme con tus palabras y continuamos.`,
        followUpTriggered: true,
      };
    }

    const noRecuerdo = ["no recuerdo", "no se", "no sé", "ni idea"].some((token) => normalized.includes(token));
    if (noRecuerdo && followUpCount < 2) {
      setIsInFollowUp(true);
      setFollowUpCount((prev) => prev + 1);
      return {
        text: "Todo bien, no hace falta que sea perfecto. Pensemos en una situación reciente y la vamos armando paso a paso.",
        followUpTriggered: true,
      };
    }

    if (selectedOption?.strengths) {
      selectedOption.strengths.forEach((key) => addSignal("strengths", key, 2));
    }
    if (selectedOption?.opportunities) {
      selectedOption.opportunities.forEach((key) => addSignal("opportunities", key, 2));
    }

    applyHeuristicSignals(cleaned);

    const pickDifferent = (items: string[], previous: string): string => {
      const pool = items.filter((item) => item !== previous);
      if (pool.length > 0) return randomFrom(pool);
      return randomFrom(items);
    };

    // ── Step-aware insight: knows exactly what each question is about ──────────
    const detectStepSpecificInsight = (text: string, stepIdx: number): string | null => {
      // Step 0: situación intensa — qué fue lo más retador
      if (stepIdx === 0) {
        if (/(presion|presión|urgente|deadline|entregable|prioriz|tiempo)/.test(text))
          return "Gestionar presión y prioridades al mismo tiempo es de las situaciones más exigentes.";
        if (/(equipo|companero|compañero|conflicto|persona|jefe|relacion)/.test(text))
          return "Los retos que involucran personas siempre tienen más capas de las que parecen.";
        if (/(tecnico|técnico|aprender|nuevo|sistema|herramienta)/.test(text))
          return "Los retos técnicos o de aprendizaje son los que más te desarrollan, aunque en el momento sean agotadores.";
      }

      // Step 1: qué rol tomaste
      if (stepIdx === 1) {
        if (/(lider|lidere|lideré|coordin|dirigi|dirigí|responsable|frente)/.test(text))
          return "Tomar el frente en momentos complejos requiere claridad y temple. Lo registro.";
        if (/(ejecut|impleme|resolv|entregue|entregué|foco|concentr)/.test(text))
          return "Concentrarte en ejecutar y resolver lo esencial, sin perderte en el ruido, es más difícil de lo que parece.";
        if (/(apoy|facilit|acompañ|ayud|consenso|acuerdo)/.test(text))
          return "Apoyar y facilitar que los demás avancen es un rol que suele pasar desapercibido pero tiene un impacto real.";
      }

      // Step 2: qué hiciste primero cuando se complicó
      if (stepIdx === 2) {
        if (/(prioriz|plan|orden|pasos|estrategia)/.test(text))
          return "Poner orden antes de actuar cuando todo se está moviendo es una señal de madurez profesional.";
        if (/(pedi|pedí|apoyo|ayuda|alinear|consenso)/.test(text))
          return "Pedir apoyo y alinear en vez de querer resolverlo solo también es inteligencia. No todo el mundo lo hace.";
        if (/(probe|probé|altern|ajust|iterar|experiment)/.test(text))
          return "Quedarte buscando alternativas hasta encontrar salida requiere paciencia. Lo registro como fortaleza.";
      }

      // Step 3: cuando alguien te cuestiona
      if (stepIdx === 3) {
        if (/(abiert|abrirme|dialog|convers|acuerdo|negoci)/.test(text))
          return "Abrirte al diálogo en vez de cerrarte cuando hay tensión es una habilidad que no abunda.";
        if (/(directo|directa|hablé|hable|respeto|claro)/.test(text))
          return "Hablar directo con respeto es exactamente asertividad. No es fácil, pero marca la diferencia.";
        if (/(evito|postergo|callo|me cuesta|incómodo|incomodo|difícil|dificil)/.test(text))
          return "Reconocer que esas conversaciones se sienten incómodas es el primer paso para trabajarlo.";
      }

      // Step 4: feedback difícil
      if (stepIdx === 4) {
        if (/(acepto|aplico|uso|cambio|aprend|implement)/.test(text))
          return "Convertir el feedback en acción concreta, sin quedarse solo en la reflexión, es más raro de lo que parece.";
        if (/(al inicio|me pego|me pegó|me costo|me costó|después|despues|ajust)/.test(text))
          return "Que al inicio cueste y luego lo integres de todas formas es completamente válido. Lo que importa es el ajuste.";
        if (/(defensiv|justific|me cierro|molest|reacciono|reaccion)/.test(text))
          return "Reconocerlo con esa honestidad ya es el primer paso. Eso tiene solución una vez que lo identificas.";
      }

      // Step 5: ¿sueles proponer mejoras?
      if (stepIdx === 5) {
        if (/(en ocasion|a veces|de vez en cuando|depende|algunas veces|no siempre|aveces)/.test(text))
          return "Que sea selectivo tampoco está mal — lo interesante es crecer esa iniciativa a más áreas.";
        if (/(siempre|constantemente|seguido|frecuente|regular|habitual)/.test(text))
          return "Que sea algo constante en ti habla de una proactividad real, no solo esporádica.";
        if (/(no mucho|poco|rara vez|casi no|no tanto|me cuesta|espero)/.test(text))
          return "Reconocerlo con esa claridad ya dice algo. Hay espacio interesante para desarrollar la proactividad.";
      }

      // Step 6: logros — qué te hace más orgullo
      if (stepIdx === 6) {
        if (/(sin ayuda|solo\b|sola\b|por mi cuenta|independiente|formador|tutor|sin nadie)/.test(text))
          return "Hacer eso sin red de seguridad requiere confianza en ti mismo. Ese tipo de logro habla de autonomía real.";
        if (/(cliente|usuario|stakeholder|directivo|presentar|exponer)/.test(text))
          return "Exponerse ante un cliente o decisor tiene su propio nivel de presión. Que saliera bien dice bastante.";
        if (/(equipo|personas|juntos|grupo|mentor|crecer)/.test(text))
          return "Un logro donde el equipo creció contigo tiene más capas: requiere que el trabajo de todos haga clic.";
        if (/(resultado|objetivo|meta|numero|número|dato|metrica|métrica)/.test(text))
          return "Tener un logro concreto y medible que puedas nombrar es señal de orientación a resultados.";
        if (/(aprendi|aprendí|supere|superé|mejoré|mejore|constancia|persevera)/.test(text))
          return "Los logros de constancia personal son los más privados y a veces los más significativos.";
      }

      // Step 7: qué te está costando más mejorar
      if (stepIdx === 7) {
        if (/(comunicar|decir|hablar|expresar|asertiv|tiempo)/.test(text))
          return "Nombrar la comunicación como área de mejora requiere honestidad. Pocas personas llegan a verlo tan claro.";
        if (/(prioridad|organizacion|organización|foco|tiempo|agenda|plan)/.test(text))
          return "El manejo del tiempo y las prioridades es de las áreas más comunes y también más trabajables cuando hay consciencia.";
        if (/(delegar|confia|soltar|control|pedir ayuda|equipo)/.test(text))
          return "Soltar el control y confiar en el equipo es de los aprendizajes más difíciles para quien está acostumbrado a cargar con todo.";
      }

      // Step 8: qué más te ayudaría para crecer
      if (stepIdx === 8) {
        if (/(mentor|feedback|retroaliment|acompañ|guia|guía|retroalimentacion)/.test(text))
          return "Saber exactamente qué tipo de apoyo necesitas ya es en sí una señal de madurez. No todos lo identifican.";
        if (/(proyecto|reto|responsabilidad|desafio|desafío|haciendo|práctica|practica)/.test(text))
          return "El aprendizaje en acción con más responsabilidad encima es lo que más acelera el crecimiento en muchos perfiles.";
        if (/(curso|taller|formacion|formación|tecnico|técnico|estudiar|aprender|capacit)/.test(text))
          return "La formación estructurada con práctica real es de las rutas más efectivas para desarrollar competencias de fondo.";
      }

      return null;
    };

    // detectChallenge solo aplica en pasos 0-4 (situaciones pasadas), no en logros/crecimiento
    const detectChallenge = (text: string): string | null => {
      if (stepIndex > 4) return null;
      if (/(tiempo|deadline|urgente|carga|prioridad|entregable)/.test(text)) return "un reto de tiempo y prioridades";
      if (/(equipo|conflicto|jefe|companero|compañero)/.test(text)) return "un reto de dinámica con el equipo";
      if (/(tecnico|técnico|sistema|codigo|código|herramienta)/.test(text)) return "un reto técnico";
      return null;
    };

    const detectAction = (text: string): string | null => {
      if (/(prioriz|plan|organi|orden|administ|gestio|entregable)/.test(text)) return "ordenando y priorizando";
      if (/(abiert|abrirme|dialog|acuerdo|consenso|negoci)/.test(text)) return "abriendo el diálogo y buscando acuerdos";
      if (/(aline|coordina|coordine|coordiné|sincroniz)/.test(text)) return "coordinando y alineando al equipo";
      if (/(probe|probé|iter|ajust|aprend|investig)/.test(text)) return "probando alternativas y ajustando";
      if (/(deleg|pedi ayuda|pedí ayuda|apoy)/.test(text)) return "apoyándote en el equipo";
      return null;
    };

    const stepInsight = detectStepSpecificInsight(normalized, stepIndex);
    const challenge = detectChallenge(normalized);
    const action = detectAction(normalized);

    // Build the body: prefer step-specific insight, fall back to action/challenge combo
    let body: string;
    if (stepInsight) {
      body = stepInsight;
    } else if (challenge && action) {
      body = randomFrom([
        `Aunque había ${challenge}, lo fuiste resolviendo ${action}.`,
        `Frente a ${challenge}, tu reacción fue ${action}, y eso se nota.`,
      ]);
    } else if (challenge) {
      body = randomFrom([
        `El punto más exigente ahí fue ${challenge}.`,
        `Se nota que lo complejo de fondo era ${challenge}.`,
      ]);
    } else if (action) {
      body = randomFrom([
        `Tu forma de manejarlo, ${action}, habla bien de tu criterio.`,
        `En lo práctico, lo resolviste ${action}.`,
      ]);
    } else {
      // True fallback — step-labeled so it at least acknowledges the topic
      const stepTopics: Record<number, string[]> = {
        0: ["Con eso me queda más claro el tipo de presión que enfrentaste.", "Eso me ayuda a entender qué tan exigente fue el contexto."],
        1: ["Con eso entiendo mejor cómo te posicionas cuando la cosa se complica.", "Interesante, ya veo el rol que tomaste."],
        2: ["Con eso ya tengo una idea de cómo priorizas cuando hay caos.", "Queda claro tu estilo de respuesta ante la presión."],
        3: ["Con eso entiendo cómo manejas la tensión con otras personas.", "Ya veo qué tan cómodo te sientes con esas conversaciones."],
        4: ["Con eso entiendo tu relación con el feedback.", "Ya veo cómo procesas las críticas."],
        5: ["Con eso me queda claro tu nivel de proactividad.", "Ya veo cómo te mueves cuando no hay una instrucción explícita."],
        6: ["Con eso ya entiendo qué tipo de logros te generan más satisfacción.", "Interesante, eso me dice mucho de lo que valoras en tu trabajo."],
        7: ["Con eso tengo una idea muy clara hacia dónde puede ir tu crecimiento.", "Gracias por la honestidad, eso me ayuda mucho para armar el plan."],
        8: ["Con eso ya sé qué tipo de recursos van a servirte más.", "Perfecto, eso me ayuda a orientar las recomendaciones."],
      };
      const pool = stepTopics[stepIndex] ?? ["Con esto me ubico mejor para lo que sigue.", "Buena info, te sigo."];
      body = randomFrom(pool);
    }

    // Openings pool — vary by emotional tone detected
    const emotionDetected = /(estres|agobi|presion|presión|frustr|cansad|agotad)/.test(normalized);
    const positiveDetected = /(orgull|content|motivad|satisf|bien|genial|excelente|emocionad)/.test(normalized);
    const openings = emotionDetected
      ? ["Entiendo, gracias por abrirlo.", "Se nota que fue intenso.", "Lo escucho."]
      : positiveDetected
      ? ["Qué bueno escuchar eso.", "Se nota el orgullo.", "Genial."]
      : ["Va, gracias.", "Anotado.", "Claro.", "Perfecto.", "Buenísimo."];

    const opening = pickDifferent(openings, responseStyleRef.current.lastOpening);
    responseStyleRef.current.lastOpening = opening;
    responseStyleRef.current.lastInsight = body;

    // Cap at 2 parts max: opening + body
    const text = `${opening} ${body}`;
    return { text, followUpTriggered: false };
  }, [detectSelectedOption, followUpCount]);

  useEffect(() => {
    if (conversationId && employeeName && messages.length === 0) {
      const initialAssistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: formatQuestionWithOptions(employeeName, 0),
      };

      setMessages([initialAssistantMsg]);
      setCurrentStep(1);
    }
  }, [conversationId, employeeName, messages.length]);

  const sendMessage = useCallback(async (content: string, _currentConvId: number) => {
    if (!content.trim()) return;

    const userMsgId = Date.now().toString();
    const assistantMsgId = (Date.now() + 1).toString();

    const questionIndex = currentStep - 1;
    const { text: contextualResponse, followUpTriggered } = generateContextualResponse(content, questionIndex);

    let fullResponseContent = contextualResponse;
    let shouldCompleteAfterStream = false;

    if (!followUpTriggered) {
      setIsInFollowUp(false);
      setFollowUpCount(0);

      const isLastQuestion = questionIndex === STEPS.length - 1;

      if (isLastQuestion) {
        const reportText = buildPersonalizedReport();
        setFinalReport(reportText);
        shouldCompleteAfterStream = true;

        if (employeeEmail.trim()) {
          const assignedResources = parseRecommendedResourceTitles(reportText);
          void syncCollaboratorAssessment({
            collaboratorEmail: employeeEmail,
            collaboratorName: employeeName,
            profile: "",
            assessmentId: _currentConvId ? String(_currentConvId) : undefined,
            assignedResources,
          }).catch(() => {
            // Ignore sync errors in chat flow; Results screen can retry sync.
          });
        }

        fullResponseContent = `${contextualResponse}\n\n✨ Gracias por compartir. Ya armé tu plan personalizado. Haz clic en el botón de arriba para descargarlo.`;
      } else {
        const nextStep = questionIndex + 1;
        setCurrentStep((prev) => prev + 1);
        fullResponseContent = `${contextualResponse}\n\n${formatQuestionWithOptions(employeeName, nextStep)}`;
      }
    }

    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", content },
      { id: assistantMsgId, role: "assistant", content: "" },
    ]);

    setIsTyping(true);

    setTimeout(() => {
      let charIndex = 0;
      const streamInterval = setInterval(() => {
        if (charIndex < fullResponseContent.length) {
          const partialContent = fullResponseContent.slice(0, charIndex + 1);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? { ...msg, content: partialContent }
                : msg
            )
          );
          charIndex += 1;
        } else {
          clearInterval(streamInterval);
          setIsTyping(false);
          if (shouldCompleteAfterStream) {
            setIsEvaluationComplete(true);
          }
        }
      }, 18);
    }, 700);
  }, [buildPersonalizedReport, currentStep, employeeName, generateContextualResponse]);

  const resetChat = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setIsEvaluationComplete(false);
    setIsTyping(false);
    setFollowUpCount(0);
    setIsInFollowUp(false);
    setCurrentStep(0);
    setFinalReport("");
    setEmployeeName("");
    setEmployeeEmail("");
    signalsRef.current = { strengths: {}, opportunities: {} };
    try {
      localStorage.removeItem(CHAT_STORAGE_KEY);
    } catch {
      // Ignore storage cleanup errors.
    }
  }, []);

  const checkSessionForEmail = useCallback(async (email: string): Promise<boolean> => {
    return hasSessionByEmail(email);
  }, []);

  const loadSessionForEmail = useCallback(async (email: string): Promise<boolean> => {
    const normalizedEmail = email.trim().toLowerCase();

    const remoteSession = await fetchSessionByEmail(normalizedEmail);
    if (remoteSession && hasSnapshotContent(remoteSession)) {
      applyPersistedState({
        ...remoteSession,
        employeeEmail: normalizedEmail,
        employeeName: remoteSession.employeeName || employeeName,
        updatedAt: Date.now(),
      });
      return true;
    }

    const localSession = readLocalSnapshotForEmail(normalizedEmail);
    if (localSession && hasSnapshotContent(localSession)) {
      applyPersistedState({
        ...localSession,
        employeeEmail: normalizedEmail,
        employeeName: localSession.employeeName || employeeName,
        updatedAt: Date.now(),
      });
      return true;
    }

    return false;
  }, [applyPersistedState, employeeName, hasSnapshotContent, readLocalSnapshotForEmail]);

  return {
    conversationId,
    setConversationId,
    messages,
    isTyping,
    sendMessage,
    isEvaluationComplete,
    resetChat,
    employeeName,
    setEmployeeName,
    employeeEmail,
    setEmployeeEmail,
    finalReport,
    checkSessionForEmail,
    loadSessionForEmail,
  };
}
