import { useCallback, useEffect, useRef, useState } from "react";
import { getCollaboratorProgress, syncCollaboratorAssessment } from "@/lib/collaboratorProgressApi";
import { fetchSessionByEmail, hasSessionByEmail, saveSessionByEmail } from "@/lib/chatSessionApi";
import { getCatalogCompetencies, getCatalogResources } from "@/lib/catalogApi";
import type { CatalogQuestion } from "@/lib/catalogApi";

export type MessageRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
}

type OptionId = "A" | "B" | "C";
type ProfileKey = "ux-ui" | "product" | "customer-success";
type Classification = "solid" | "functional-strong" | "functional-developing" | "opportunity" | "priority" | "emergent";

type QuestionDefinition = {
  prompt: string;
  options: Record<OptionId, string>;
};

type ActionRecommendation = {
  title: string;
  description: string;
};

type ResourceRecommendation = {
  title: string;
  type: string;
  why: string;
  url: string;
};

type CompetencyDefinition = {
  key: string;
  label: string;
  strengthDescription: string;
  opportunityDescription: string;
  actions: ActionRecommendation[];
  questions: {
    q1: QuestionDefinition;
    q2: QuestionDefinition;
  };
};

type AssessmentEntry = {
  competencyKey: string;
  q1?: OptionId;
  q2?: OptionId;
  classification?: Classification;
  isPriority?: boolean;
};

type AssessmentFlow = {
  profileKey: ProfileKey;
  profileLabel: string;
  competencyOrder: string[];
  competencyIndex: number;
  pendingQuestion: "q1" | "q2";
  assessments: Record<string, AssessmentEntry>;
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
  trainerName: string;
  currentStep: number;
  finalReport: string;
  followUpCount: number;
  isInFollowUp: boolean;
  signals: SignalState;
  updatedAt: number;
  selectedProfile?: string;
  assessmentFlow?: AssessmentFlow | null;
}

type PartialPersistedChatState = Partial<PersistedChatState> & {
  report?: string;
  profile?: string;
};

const CHAT_STORAGE_KEY = "uix-chat-session-v1";

const BASE_COMPETENCIES = [
  "comunicacion-efectiva",
  "empatia",
  "trabajo-en-equipo",
  "solucion-de-problemas",
  "autogestion",
] as const;

const PROFILE_COMPETENCIES: Record<ProfileKey, string[]> = {
  "ux-ui": ["aprendizaje-continuo", "proactividad"],
  product: ["asertividad", "toma-de-decisiones", "orientacion-a-resultados", "negociacion"],
  "customer-success": ["orientacion-al-servicio", "manejo-de-conflictos", "negociacion", "mentalidad-de-negocio"],
};

const COMPETENCIES: Record<string, CompetencyDefinition> = {
  "comunicacion-efectiva": {
    key: "comunicacion-efectiva",
    label: "Comunicación efectiva",
    strengthDescription: "Sueles expresar ideas, acuerdos y necesidades con claridad, incluso cuando el contexto exige precisión.",
    opportunityDescription: "Todavía hay espacio para estructurar mejor tus mensajes y hacer más explícitos acuerdos, expectativas o necesidades.",
    actions: [
      {
        title: "Minuta de acuerdos en 3 líneas",
        description: "Al cerrar una reunión o conversación clave, resume por escrito objetivo, acuerdo y siguiente paso en un mensaje breve.",
      },
      {
        title: "Pausa antes de responder",
        description: "Antes de responder en conversaciones tensas, toma 10 segundos para ordenar idea central, contexto y petición concreta.",
      },
    ],
    questions: {
      q1: {
        prompt: "Cuando necesitas explicar una idea importante o alinear expectativas, ¿qué suele pasar?",
        options: {
          A: "Me cuesta ordenar el mensaje y a veces la otra persona no termina de entender lo que necesito decir.",
          B: "Logro explicarme, aunque en algunas conversaciones importantes siento que podría ser más claro o más directo.",
          C: "Suelo comunicarme con claridad y normalmente logro que los acuerdos queden entendidos.",
        },
      },
      q2: {
        prompt: "Cuando una conversación requiere mayor claridad, ¿cómo reaccionas normalmente?",
        options: {
          A: "Improviso y me doy cuenta después de que faltó orden o precisión.",
          B: "Hago el esfuerzo por ordenar ideas, aunque no siempre cierro acuerdos concretos.",
          C: "Sintetizo, confirmo entendimiento y dejo claros los siguientes pasos.",
        },
      },
    },
  },
  empatia: {
    key: "empatia",
    label: "Empatía",
    strengthDescription: "Sueles considerar el contexto de la otra persona y ajustar tu forma de relacionarte para construir confianza.",
    opportunityDescription: "Conviene fortalecer tu lectura del contexto ajeno para responder con mayor sensibilidad y menos suposición.",
    actions: [
      {
        title: "Pregunta de contexto antes de proponer",
        description: "Antes de ofrecer una solución, pregunta qué está viendo o sintiendo la otra persona y qué necesita de ti.",
      },
      {
        title: "Escucha sin interrumpir dos minutos",
        description: "En una conversación relevante, deja hablar a la otra persona sin interrumpir y luego parafrasea lo entendido.",
      },
    ],
    questions: {
      q1: {
        prompt: "Cuando alguien del equipo o un cliente reacciona distinto a lo que esperabas, ¿cómo lo interpretas normalmente?",
        options: {
          A: "Me cuesta leer qué le pasa y suelo enfocarme primero en mi propia urgencia o punto de vista.",
          B: "Intento entender su contexto, aunque no siempre logro leer bien lo que necesita o siente.",
          C: "Suelo captar bien el contexto de la otra persona y adapto mi forma de responder.",
        },
      },
      q2: {
        prompt: "Cuando alguien piensa distinto a ti, ¿qué haces con más frecuencia?",
        options: {
          A: "Defiendo mi postura rápido y me cuesta detenerme a explorar la perspectiva ajena.",
          B: "Escucho su punto, aunque a veces me gana la prisa o la necesidad de convencer.",
          C: "Exploro su contexto antes de responder para construir una salida que haga sentido para ambos.",
        },
      },
    },
  },
  "trabajo-en-equipo": {
    key: "trabajo-en-equipo",
    label: "Trabajo en equipo y colaboración",
    strengthDescription: "Tiendes a colaborar con apertura, buscar alineación y construir resultados compartidos con otras personas.",
    opportunityDescription: "Hay una oportunidad para involucrar mejor a otras personas, compartir contexto y apoyarte más en la colaboración.",
    actions: [
      {
        title: "Check-in de colaboración semanal",
        description: "Agenda un espacio breve a la semana para revisar bloqueos, apoyos requeridos y próximos pasos con tu equipo.",
      },
      {
        title: "Pedir apoyo con contexto",
        description: "Cuando necesites ayuda, explica objetivo, avance y bloqueo para facilitar una colaboración más efectiva.",
      },
    ],
    questions: {
      q1: {
        prompt: "Cuando trabajas en algo que depende de varias personas, ¿cómo suele ser tu forma de avanzar?",
        options: {
          A: "Prefiero resolverlo por mi cuenta y me cuesta coordinar o pedir apoyo a tiempo.",
          B: "Colaboro cuando hace falta, aunque a veces la coordinación se vuelve reactiva.",
          C: "Suelo coordinarme bien, compartir contexto y avanzar con otras personas sin perder ritmo.",
        },
      },
      q2: {
        prompt: "Si el trabajo se empieza a trabar por falta de coordinación, ¿qué haces normalmente?",
        options: {
          A: "Sigo avanzando solo o espero a que alguien más lo destrabe.",
          B: "Busco recoordinar, aunque no siempre lo hago con suficiente anticipación.",
          C: "Tomo la iniciativa para alinear expectativas, responsables y tiempos de forma clara.",
        },
      },
    },
  },
  "solucion-de-problemas": {
    key: "solucion-de-problemas",
    label: "Solución de problemas",
    strengthDescription: "Tienes capacidad para analizar situaciones, identificar rutas de salida y avanzar con criterio ante obstáculos.",
    opportunityDescription: "Conviene fortalecer la forma en que analizas problemas y conviertes bloqueos en decisiones accionables.",
    actions: [
      {
        title: "Problema-causa-próximo paso",
        description: "Cuando aparezca un bloqueo, escríbelo en tres columnas: qué pasa, por qué pasa y cuál será el siguiente paso concreto.",
      },
      {
        title: "Dos alternativas antes de escalar",
        description: "Antes de pedir ayuda, formula al menos dos rutas posibles con sus riesgos y ventajas para decidir con más criterio.",
      },
    ],
    questions: {
      q1: {
        prompt: "Cuando aparece un problema inesperado en tu trabajo, ¿qué suele pasar primero?",
        options: {
          A: "Me cuesta ordenar la situación y definir por dónde empezar.",
          B: "Logro avanzar, aunque a veces me toma más tiempo del necesario encontrar una ruta clara.",
          C: "Suelo descomponer el problema, priorizar y moverme rápido hacia una solución viable.",
        },
      },
      q2: {
        prompt: "Cuando el problema no tiene una solución obvia, ¿qué haces con más frecuencia?",
        options: {
          A: "Me quedo atascado o dependo mucho de que alguien más marque la ruta.",
          B: "Exploro opciones, aunque me cuesta comparar escenarios o decidir con seguridad.",
          C: "Analizo alternativas, valoro implicaciones y tomo una decisión con criterio práctico.",
        },
      },
    },
  },
  autogestion: {
    key: "autogestion",
    label: "Autogestión y responsabilidad",
    strengthDescription: "Tiendes a organizarte, hacer seguimiento y sostener compromisos con un buen nivel de responsabilidad.",
    opportunityDescription: "Hay una oportunidad clara para fortalecer priorización, seguimiento y consistencia en tus compromisos diarios.",
    actions: [
      {
        title: "Top 3 del día",
        description: "Define cada mañana las tres prioridades que sí o sí deben avanzar y revisa al cierre qué quedó resuelto y qué no.",
      },
      {
        title: "Bloque de foco sin interrupciones",
        description: "Reserva al menos 30 minutos al día para trabajo profundo en la tarea de mayor impacto.",
      },
    ],
    questions: {
      q1: {
        prompt: "Cuando tienes varias prioridades al mismo tiempo, ¿cómo suele ser tu manejo del trabajo?",
        options: {
          A: "Me cuesta ordenar y sostener el foco; a veces reacciono a la urgencia del momento.",
          B: "Generalmente logro avanzar, aunque en semanas pesadas mi organización se resiente.",
          C: "Suelo priorizar bien, dar seguimiento y cumplir con lo importante de forma consistente.",
        },
      },
      q2: {
        prompt: "Cuando una semana se complica más de lo esperado, ¿qué pasa con tu seguimiento?",
        options: {
          A: "Pierdo visibilidad, postergo o dejo de dar seguimiento a cosas importantes.",
          B: "Hago ajustes y saco lo esencial, aunque con cierta inestabilidad.",
          C: "Repriorizo rápido, ajusto el plan y mantengo visibilidad sobre compromisos y avances.",
        },
      },
    },
  },
  "aprendizaje-continuo": {
    key: "aprendizaje-continuo",
    label: "Aprendizaje continuo",
    strengthDescription: "Sueles buscar nuevas formas de mejorar y convertir experiencias, feedback o práctica en aprendizaje real.",
    opportunityDescription: "Conviene reforzar hábitos de aprendizaje y apertura al feedback para sostener tu desarrollo en el tiempo.",
    actions: [
      {
        title: "Bitácora de aprendizaje semanal",
        description: "Cierra la semana anotando qué aprendiste, dónde lo aplicaste y qué quieres probar distinto la siguiente semana.",
      },
      {
        title: "Feedback accionable quincenal",
        description: "Pide a una persona una observación concreta sobre tu trabajo y conviértela en una acción de prueba para la siguiente quincena.",
      },
    ],
    questions: {
      q1: {
        prompt: "En tu trabajo, ¿qué tan presente está el hábito de aprender y ajustar a partir de nuevas experiencias o feedback?",
        options: {
          A: "No es algo constante; me cuesta sostener ese hábito o salir de lo conocido.",
          B: "Sí aparece, aunque de manera irregular o más reactiva que intencional.",
          C: "Es un hábito bastante presente; busco aprender y ajustar de forma continua.",
        },
      },
      q2: {
        prompt: "Cuando recibes feedback o detectas algo por mejorar, ¿qué haces normalmente?",
        options: {
          A: "Me cuesta transformarlo en un cambio concreto o sostenerlo en el tiempo.",
          B: "Intento aplicarlo, aunque me falta consistencia para volverlo hábito.",
          C: "Lo convierto en acciones concretas y le doy seguimiento para que sí cambie mi práctica.",
        },
      },
    },
  },
  proactividad: {
    key: "proactividad",
    label: "Proactividad",
    strengthDescription: "Tiendes a anticiparte, proponer mejoras y avanzar sin depender siempre de una instrucción explícita.",
    opportunityDescription: "Hay espacio para fortalecer la iniciativa personal y pasar de reaccionar a anticiparte con mayor frecuencia.",
    actions: [
      {
        title: "Una mejora por semana",
        description: "Detecta cada semana una fricción pequeña en tu trabajo y propón una mejora concreta con bajo costo de implementación.",
      },
      {
        title: "Siguiente paso visible",
        description: "Antes de cerrar una tarea, define el siguiente paso que tú puedes activar sin esperar a que alguien lo pida.",
      },
    ],
    questions: {
      q1: {
        prompt: "Cuando identificas una mejora o una oportunidad en tu trabajo, ¿qué suele pasar?",
        options: {
          A: "Normalmente espero a que alguien más la pida o la priorice.",
          B: "A veces la propongo o la muevo, aunque no siempre de forma consistente.",
          C: "Suelo anticiparme, proponer mejoras y tomar acción con autonomía.",
        },
      },
      q2: {
        prompt: "Si ves una oportunidad clara para mejorar algo, ¿cómo actúas?",
        options: {
          A: "La dejo pasar con frecuencia porque no sé si me toca o si conviene moverla.",
          B: "La tomo en algunos casos, pero todavía me falta consistencia para sostener esa iniciativa.",
          C: "La aterrizo, la comunico y doy seguimiento para convertirla en algo real.",
        },
      },
    },
  },
  asertividad: {
    key: "asertividad",
    label: "Asertividad",
    strengthDescription: "Sueles expresar tus ideas, límites o desacuerdos de forma clara y respetuosa, incluso en conversaciones delicadas.",
    opportunityDescription: "Conviene fortalecer tu capacidad para decir lo que piensas con claridad sin postergar conversaciones importantes.",
    actions: [
      {
        title: "Mensaje difícil con estructura",
        description: "Antes de una conversación incómoda, prepara tres puntos: hecho, impacto y petición concreta.",
      },
      {
        title: "Decirlo a tiempo",
        description: "Cuando detectes una incomodidad o desacuerdo, aborda el tema en menos de 24 horas con respeto y claridad.",
      },
    ],
    questions: {
      q1: {
        prompt: "Cuando necesitas expresar un desacuerdo o marcar un límite, ¿qué suele pasar?",
        options: {
          A: "Me cuesta decirlo a tiempo o con claridad; a veces lo pospongo demasiado.",
          B: "Lo hago en algunas ocasiones, aunque no siempre con la firmeza o claridad que me gustaría.",
          C: "Suelo expresarlo de forma clara, respetuosa y en el momento adecuado.",
        },
      },
      q2: {
        prompt: "Cuando la conversación puede ser incómoda, ¿cómo reaccionas normalmente?",
        options: {
          A: "Evito la conversación o la doy de forma poco clara.",
          B: "La tengo, aunque a veces me cuesta sostenerla con firmeza.",
          C: "La abordo con claridad, respeto y foco en el objetivo.",
        },
      },
    },
  },
  "toma-de-decisiones": {
    key: "toma-de-decisiones",
    label: "Toma de decisiones",
    strengthDescription: "Sueles evaluar escenarios y avanzar con criterio, sin quedarte inmóvil ante la ambigüedad.",
    opportunityDescription: "Hay oportunidad para ganar más claridad y seguridad al decidir, especialmente cuando no existe una respuesta perfecta.",
    actions: [
      {
        title: "Decidir con criterio visible",
        description: "Cuando tengas que elegir entre opciones, escribe criterios, riesgos y razón final para hacer más sólida tu decisión.",
      },
      {
        title: "Fecha límite para decidir",
        description: "Pon una hora o día tope para decisiones no críticas y evita extender indefinidamente el análisis.",
      },
    ],
    questions: {
      q1: {
        prompt: "Cuando necesitas decidir entre varias opciones con información incompleta, ¿qué suele pasar?",
        options: {
          A: "Me cuesta decidir y tiendo a prolongar demasiado el análisis o a depender de otra persona.",
          B: "Logro decidir, aunque a veces con dudas o después de invertir más tiempo del necesario.",
          C: "Suelo evaluar con criterio y tomar decisiones razonables sin paralizarme.",
        },
      },
      q2: {
        prompt: "Cuando ninguna opción es perfecta, ¿cómo avanzas normalmente?",
        options: {
          A: "Me trabo o espero a tener mucha más certeza antes de moverme.",
          B: "Avanzo, aunque me cuesta sostener la seguridad en la decisión tomada.",
          C: "Defino criterios, comparo escenarios y tomo una decisión suficientemente sólida para avanzar.",
        },
      },
    },
  },
  "orientacion-a-resultados": {
    key: "orientacion-a-resultados",
    label: "Orientación a resultados",
    strengthDescription: "Mantienes foco en el objetivo final y conviertes prioridades en avances visibles y medibles.",
    opportunityDescription: "Conviene reforzar el foco en objetivos concretos para no perder tracción entre tareas, análisis o conversaciones.",
    actions: [
      {
        title: "Definir criterio de éxito",
        description: "Antes de empezar una tarea relevante, deja por escrito cómo sabrás que quedó bien resuelta.",
      },
      {
        title: "Cierre semanal por impacto",
        description: "Al final de la semana, revisa qué actividades generaron más avance real y cuáles solo ocuparon tiempo.",
      },
    ],
    questions: {
      q1: {
        prompt: "Cuando trabajas en algo importante, ¿qué tan fácil te resulta mantenerte enfocado en el resultado final?",
        options: {
          A: "Con frecuencia me pierdo entre tareas, detalles o urgencias y me cuesta sostener foco en el objetivo.",
          B: "Generalmente mantengo el foco, aunque en momentos de presión puedo dispersarme.",
          C: "Suelo mantener claridad sobre el objetivo y orientar mis decisiones a lograrlo.",
        },
      },
      q2: {
        prompt: "Cuando hay presión o muchas cosas al mismo tiempo, ¿qué pasa con ese foco?",
        options: {
          A: "Se diluye con facilidad y me cuesta distinguir qué mueve realmente el resultado.",
          B: "Lo recupero, aunque a veces tarde o con ayuda de otras personas.",
          C: "Lo sostengo bastante bien y repriorizo sin perder de vista el objetivo central.",
        },
      },
    },
  },
  negociacion: {
    key: "negociacion",
    label: "Negociación",
    strengthDescription: "Tiendes a encontrar puntos de acuerdo y a mover conversaciones complejas hacia soluciones viables.",
    opportunityDescription: "Hay oportunidad para fortalecer tu capacidad de balancear intereses y llegar a acuerdos más claros y sostenibles.",
    actions: [
      {
        title: "Intereses antes que posiciones",
        description: "En una conversación de negociación, identifica primero qué necesita realmente cada parte antes de defender una solución.",
      },
      {
        title: "Dos concesiones posibles",
        description: "Antes de negociar, define qué puedes ceder y qué no para entrar con más claridad a la conversación.",
      },
    ],
    questions: {
      q1: {
        prompt: "Cuando hay intereses distintos o prioridades encontradas, ¿cómo suele ser tu manejo de la conversación?",
        options: {
          A: "Me cuesta encontrar un punto medio y suelo ceder demasiado o quedarme atorado.",
          B: "Logro avanzar, aunque a veces me falta más estructura para negociar mejor.",
          C: "Suelo explorar intereses y llegar a acuerdos razonables para las partes involucradas.",
        },
      },
      q2: {
        prompt: "Cuando una negociación se pone tensa, ¿qué haces normalmente?",
        options: {
          A: "Me cuesta sostener la conversación y pierdo claridad sobre lo negociable.",
          B: "La sostengo, aunque no siempre con una estrategia clara.",
          C: "Mantengo foco, identifico intereses y conduzco la conversación hacia un acuerdo viable.",
        },
      },
    },
  },
  "orientacion-al-servicio": {
    key: "orientacion-al-servicio",
    label: "Orientación al servicio",
    strengthDescription: "Tiendes a anticipar necesidades y a generar una experiencia de acompañamiento clara, útil y confiable.",
    opportunityDescription: "Conviene reforzar tu capacidad para traducir necesidades del cliente o usuario en respuestas más consistentes y oportunas.",
    actions: [
      {
        title: "Confirmar necesidad real",
        description: "Antes de responder una solicitud, valida qué problema busca resolver realmente la otra persona.",
      },
      {
        title: "Seguimiento después de resolver",
        description: "Tras atender una necesidad importante, vuelve a contactar para verificar si la solución sí funcionó.",
      },
    ],
    questions: {
      q1: {
        prompt: "Cuando acompañas a una persona usuaria o cliente, ¿qué tan presente está el foco en entender y resolver su necesidad real?",
        options: {
          A: "A veces respondo desde la urgencia y no siempre profundizo en lo que realmente necesita.",
          B: "Generalmente lo considero, aunque no siempre de forma anticipada o consistente.",
          C: "Suelo entender bien la necesidad y actuar con foco en una experiencia útil y clara.",
        },
      },
      q2: {
        prompt: "Si la necesidad cambia o la persona sigue inconforme, ¿cómo reaccionas normalmente?",
        options: {
          A: "Me cuesta reencuadrar la situación y responder con flexibilidad.",
          B: "Busco ajustar la respuesta, aunque a veces me gana la urgencia.",
          C: "Reviso contexto, aclaro expectativas y adapto la respuesta para realmente ayudar.",
        },
      },
    },
  },
  "manejo-de-conflictos": {
    key: "manejo-de-conflictos",
    label: "Manejo de conflictos",
    strengthDescription: "Tienes capacidad para abordar tensiones con calma, claridad y foco en la resolución.",
    opportunityDescription: "Hay oportunidad para dejar de evitar conflictos y aprender a tratarlos de manera más directa y constructiva.",
    actions: [
      {
        title: "Nombrar la tensión sin dramatizar",
        description: "Cuando detectes una fricción, nómbrala desde el hecho y su impacto, sin interpretar intenciones.",
      },
      {
        title: "Buscar acuerdo mínimo",
        description: "En una conversación difícil, define cuál es el acuerdo mínimo viable para poder seguir avanzando.",
      },
    ],
    questions: {
      q1: {
        prompt: "Cuando surge una tensión o desacuerdo con otra persona, ¿cómo suele ser tu manejo?",
        options: {
          A: "Me cuesta abordarlo; tiendo a evitarlo o dejar que pase demasiado tiempo.",
          B: "Lo atiendo en algunos casos, aunque todavía me cuesta sostener estas conversaciones con comodidad.",
          C: "Suelo abordarlo de forma directa y respetuosa para resolverlo sin alargarlo más de la cuenta.",
        },
      },
      q2: {
        prompt: "Cuando el conflicto ya está presente, ¿cómo reaccionas normalmente?",
        options: {
          A: "Me cierro, lo pateo o me cuesta sostener la claridad en la conversación.",
          B: "Intento resolverlo, aunque todavía me pesa emocionalmente más de lo que quisiera.",
          C: "Mantengo calma, pongo foco en los hechos y conduzco la conversación hacia una salida concreta.",
        },
      },
    },
  },
  "mentalidad-de-negocio": {
    key: "mentalidad-de-negocio",
    label: "Mentalidad de negocio",
    strengthDescription: "Sueles conectar tu trabajo con objetivos, impacto y decisiones que importan para el negocio.",
    opportunityDescription: "Conviene fortalecer la lectura de impacto para conectar mejor tus acciones con objetivos, prioridades y valor para el negocio.",
    actions: [
      {
        title: "Traducir tarea a impacto",
        description: "Antes de una actividad importante, responde por escrito cómo impacta en cliente, equipo o resultado del negocio.",
      },
      {
        title: "Hablar en lenguaje de impacto",
        description: "Al presentar avances, explica no solo qué hiciste, sino qué riesgo redujiste, qué oportunidad abriste o qué valor generaste.",
      },
    ],
    questions: {
      q1: {
        prompt: "Cuando tomas decisiones en tu rol, ¿qué tan presente está el impacto en cliente, operación o negocio?",
        options: {
          A: "No siempre lo tengo visible; suelo enfocarme más en la tarea inmediata.",
          B: "Lo considero en varias ocasiones, aunque todavía no es un criterio constante.",
          C: "Suelo conectar mi trabajo con impacto, prioridades y valor para el negocio.",
        },
      },
      q2: {
        prompt: "Cuando presentas avances o propones algo, ¿cómo lo sueles enmarcar?",
        options: {
          A: "Me enfoco más en la actividad realizada que en el impacto o la prioridad de negocio.",
          B: "Intento conectar con impacto, aunque todavía de forma poco consistente.",
          C: "Suelo explicar claramente el valor, el riesgo o la oportunidad que mi propuesta mueve.",
        },
      },
    },
  },
};

const normalizeIncomingMessages = (value: unknown): ChatMessage[] => {
  const parseJsonIfString = (input: unknown): unknown => {
    if (typeof input !== "string") return input;
    const trimmed = input.trim();
    if (!trimmed) return input;

    try {
      return JSON.parse(trimmed);
    } catch {
      return input;
    }
  };

  const parsed = parseJsonIfString(value);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Record<string, unknown>;
      const rawRole = String(item.role || "assistant").toLowerCase();
      const role: MessageRole = rawRole === "user" || rawRole === "assistant" || rawRole === "system"
        ? rawRole
        : "assistant";
      const content = String(item.content || "").trim();
      if (!content) return null;

      return {
        id: String(item.id || `restored-msg-${Date.now()}-${index}`),
        role,
        content,
      };
    })
    .filter((msg): msg is ChatMessage => Boolean(msg));
};

const migrateLegacyReportContent = (report: string): string => report || "";

const normalizeEmail = (value: string): string => value.trim().toLowerCase();

const normalizePersonName = (value: string): string => (
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
);

const namesLikelyReferToSamePerson = (expected: string, actual: string): boolean => {
  const normalizedExpected = normalizePersonName(expected);
  const normalizedActual = normalizePersonName(actual);
  if (!normalizedExpected || !normalizedActual) return true;

  const expectedTokens = normalizedExpected.split(" ").filter((token) => token.length >= 3);
  const actualTokens = normalizedActual.split(" ").filter((token) => token.length >= 3);
  if (!expectedTokens.length || !actualTokens.length) return true;

  return expectedTokens.some((token) => actualTokens.some((candidate) => token === candidate || token.includes(candidate) || candidate.includes(token)));
};

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const normalizeTitleKey = (value: string): string => normalize(value).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

// ─── Catalog integration ─────────────────────────────────────────────────────

const CATALOG_ID_TO_LEGACY_KEY: Record<string, string> = {
  communication: "comunicacion-efectiva",
  empathy: "empatia",
  collaboration: "trabajo-en-equipo",
  problem_solving: "solucion-de-problemas",
  self_management: "autogestion",
  learning: "aprendizaje-continuo",
  proactivity: "proactividad",
  proactivit: "proactividad",
  assertiveness: "asertividad",
  decision_making: "toma-de-decisiones",
  results_orientation: "orientacion-a-resultados",
  negotiation: "negociacion",
  service_orientation: "orientacion-al-servicio",
  conflict_management: "manejo-de-conflictos",
  business_mindset: "mentalidad-de-negocio",
};

const LEGACY_KEY_TO_CATALOG_ID: Record<string, string> = Object.fromEntries(
  Object.entries(CATALOG_ID_TO_LEGACY_KEY)
    .filter(([, v], i, arr) => arr.findIndex(([, v2]) => v2 === v) === i)
    .map(([k, v]) => [v, k]),
);

const toRoleId = (profile: string): string => {
  const n = normalize(profile);
  if (n.includes("product")) return "product_designer";
  if (n.includes("customer success") || n.includes("customer-success") || n === "cs") return "customer_success";
  return "ux_ui";
};

/**
 * Classify a free-text response against keyword patterns from the catalog.
 * Returns the option level whose keywords best match the response.
 */
const classifyByKeywords = (text: string, question: CatalogQuestion): OptionId => {
  const normalizedText = normalize(text);
  const parseKws = (raw: string) =>
    String(raw || "").split(",").map((p) => normalize(p.trim())).filter(Boolean);

  const pA = parseKws(question.patterns_A);
  const pB = parseKws(question.patterns_B);
  const pC = parseKws(question.patterns_C);

  const countMatches = (patterns: string[]) =>
    patterns.reduce((acc, kw) => acc + (kw && normalizedText.includes(kw) ? 1 : 0), 0);

  const sA = countMatches(pA);
  const sB = countMatches(pB);
  const sC = countMatches(pC);

  if (sA === 0 && sB === 0 && sC === 0) {
    const fb = String(question.fallback_level || "B").toUpperCase();
    return (["A", "B", "C"].includes(fb) ? fb : "B") as OptionId;
  }

  if (sC >= sB && sC >= sA) return "C";
  if (sB >= sA) return "B";
  return "A";
};

/** Format an open-ended catalog question (scenario + question text). */
const formatOpenQuestion = (
  name: string,
  question: CatalogQuestion,
  isFirst: boolean,
): string => {
  const intro = isFirst
    ? `Hola ${name || "colaborador"}. Tendremos una conversación guiada. No hay respuestas correctas o incorrectas — responde con tus propias palabras describiendo cómo actúas normalmente.\n\n`
    : "";
  const scenario = String(question.scenario || "").trim();
  const q = String(question.question || "").trim();
  return `${intro}${scenario ? `**Situación:** ${scenario}\n\n` : ""}**${q}**`;
};

/** Fetch catalog resources for each opportunity competency and patch the report. */
const fetchAndApplyCatalogResources = async (
  flow: AssessmentFlow,
  report: string,
): Promise<string | null> => {
  try {
    const entries = flow.competencyOrder
      .map((key) => flow.assessments[key])
      .filter((e): e is AssessmentEntry => Boolean(e?.classification));

    const opportunityEntries = entries.filter(
      (e) => e.classification !== "solid" && e.classification !== "functional-strong",
    );

    if (!opportunityEntries.length) return null;

    const fetchedResources: ResourceRecommendation[] = [];
    const seen = new Set<string>();

    const add = (r: ResourceRecommendation) => {
      if (!r.title || seen.has(r.title) || !r.url) return;
      seen.add(r.title);
      fetchedResources.push(r);
    };

    WORKSHOP_RESOURCES.forEach(add);

    for (const entry of opportunityEntries) {
      if (fetchedResources.length >= 5) break;
      const catalogId = LEGACY_KEY_TO_CATALOG_ID[entry.competencyKey];
      if (!catalogId) continue;

      try {
        const rows = await getCatalogResources(catalogId, "oportunidad");
        for (const row of rows) {
          if (fetchedResources.length >= 5) break;
          const link = String(row.resource_link ?? row.link ?? row.url ?? "").trim();
          const title = String(row.resource_title ?? row.title ?? row.nombre ?? "").trim();
          if (!link || !title) continue;
          add({
            title,
            type: String(row.resource_type ?? row.type ?? row.tipo ?? "Curso recomendado").trim(),
            why: String(row.resource_description ?? row.description ?? row.descripcion ?? "Te ayudará a desarrollar esta competencia.").trim(),
            url: link,
          });
        }
      } catch {
        // Skip this competency's resources silently
      }
    }

    const hasNewResources = fetchedResources.some(
      (r) => !WORKSHOP_RESOURCES.some((w) => w.title === r.title),
    );
    if (!hasNewResources) return null;

    const resourceLines = buildResourceBlock(fetchedResources);
    const pattern = /###\s+(Recursos recomendados|Tus 5 recursos de desarrollo|Recursos de desarrollo)[\s\S]*?(?=\n###\s|\n---REPORTE_FIN---|$)/i;
    if (pattern.test(report)) {
      return report.replace(pattern, `### Recursos recomendados\n${resourceLines}`);
    }
    return null;
  } catch {
    return null;
  }
};

const FOLLOW_UP_LEADS = [
  "Con base en lo que respondiste, quiero profundizar un poco:",
  "Gracias, para entenderlo mejor te hago una pregunta breve adicional:",
  "Perfecto, avancemos con una pregunta de seguimiento:",
  "Bien, para aterrizar mejor tu respuesta, va una más:",
  "Buen punto. Sigamos con una pregunta complementaria:",
];

const pickFollowUpLead = (): string => {
  return FOLLOW_UP_LEADS[Math.floor(Math.random() * FOLLOW_UP_LEADS.length)];
};

const INTERNAL_WORKSHOP_URL = "https://ptltr.github.io/portal-uix/#talleres-uix";

const WORKSHOP_RESOURCES: ResourceRecommendation[] = [
  {
    title: "Taller interno UIX: Comunicación efectiva y conversaciones difíciles",
    type: "Taller UIX · interno",
    why: "Te ayuda a estructurar conversaciones difíciles con claridad, empatía y acuerdos concretos.",
    url: INTERNAL_WORKSHOP_URL,
  },
  {
    title: "Taller interno UIX: Priorización y gestión del tiempo",
    type: "Taller UIX · interno",
    why: "Refuerza priorización, foco y seguimiento para sostener avances en semanas de alta carga.",
    url: INTERNAL_WORKSHOP_URL,
  },
];

const EXTERNAL_RESOURCES_BY_COMPETENCY: Record<string, ResourceRecommendation[]> = {
  "comunicacion-efectiva": [
    {
      title: "Improving Communication Skills",
      type: "Curso en Coursera · opción gratuita",
      why: "Fortalece tu comunicación verbal y escrita para conversaciones de trabajo más claras.",
      url: "https://www.coursera.org/learn/wharton-communication-skills",
    },
  ],
  asertividad: [
    {
      title: "Negotiation Skills",
      type: "Curso en Coursera · opción gratuita",
      why: "Te ayuda a expresar límites, expectativas y acuerdos con más claridad y firmeza.",
      url: "https://www.coursera.org/learn/negotiation-skills",
    },
  ],
  autogestion: [
    {
      title: "Work Smarter, Not Harder: Time Management",
      type: "Curso en Coursera · opción gratuita",
      why: "Mejora priorización, enfoque y consistencia en tu ejecución diaria.",
      url: "https://www.coursera.org/learn/work-smarter-not-harder",
    },
  ],
  "orientacion-a-resultados": [
    {
      title: "Work Smarter, Not Harder: Time Management",
      type: "Curso en Coursera · opción gratuita",
      why: "Te ayuda a mantener el foco en objetivos y no solo en tareas sueltas.",
      url: "https://www.coursera.org/learn/work-smarter-not-harder",
    },
  ],
  negociacion: [
    {
      title: "Negotiation Skills",
      type: "Curso en Coursera · opción gratuita",
      why: "Refuerza técnicas de negociación para llegar a acuerdos viables entre intereses distintos.",
      url: "https://www.coursera.org/learn/negotiation-skills",
    },
  ],
  "manejo-de-conflictos": [
    {
      title: "Negotiation Skills",
      type: "Curso en Coursera · opción gratuita",
      why: "Te da herramientas para manejar tensiones y conducir conversaciones complejas.",
      url: "https://www.coursera.org/learn/negotiation-skills",
    },
  ],
  "trabajo-en-equipo": [
    {
      title: "Teamwork Skills: Communicating Effectively in Groups",
      type: "Curso en Coursera · opción gratuita",
      why: "Mejora coordinación, acuerdos y colaboración en equipos multidisciplinarios.",
      url: "https://www.coursera.org/learn/teamwork-skills-effective-communication",
    },
  ],
  proactividad: [
    {
      title: "Creative Thinking: Techniques and Tools for Success",
      type: "Curso en Coursera · opción gratuita",
      why: "Ayuda a convertir ideas en propuestas accionables con mayor iniciativa.",
      url: "https://www.coursera.org/learn/creative-thinking-techniques-and-tools-for-success",
    },
  ],
  "aprendizaje-continuo": [
    {
      title: "Google Project Management Certificate",
      type: "Curso de Google en Coursera · opción gratuita",
      why: "Te brinda estructura para aprender, planear y ejecutar con mayor consistencia.",
      url: "https://www.coursera.org/professional-certificates/google-project-management",
    },
  ],
  empatia: [
    {
      title: "Teamwork Skills: Communicating Effectively in Groups",
      type: "Curso en Coursera · opción gratuita",
      why: "Refuerza escucha, coordinación y sensibilidad para colaborar mejor con otras personas.",
      url: "https://www.coursera.org/learn/teamwork-skills-effective-communication",
    },
  ],
  "solucion-de-problemas": [
    {
      title: "Creative Thinking: Techniques and Tools for Success",
      type: "Curso en Coursera · opción gratuita",
      why: "Te da métodos prácticos para analizar situaciones complejas y proponer alternativas accionables.",
      url: "https://www.coursera.org/learn/creative-thinking-techniques-and-tools-for-success",
    },
  ],
  "toma-de-decisiones": [
    {
      title: "Google Data Analytics Certificate",
      type: "Curso de Google en Coursera · opción gratuita",
      why: "Fortalece criterio para decidir con información y evidencia, no solo intuición.",
      url: "https://www.coursera.org/professional-certificates/google-data-analytics",
    },
  ],
  "orientacion-al-servicio": [
    {
      title: "Teamwork Skills: Communicating Effectively in Groups",
      type: "Curso en Coursera · opción gratuita",
      why: "Mejora comunicación con personas usuarias y colaboración para resolver necesidades con más claridad.",
      url: "https://www.coursera.org/learn/teamwork-skills-effective-communication",
    },
  ],
  "mentalidad-de-negocio": [
    {
      title: "Introduction to Management Analysis and Strategies",
      type: "Alison · curso gratuito",
      why: "Refuerza pensamiento estratégico para conectar decisiones diarias con impacto de negocio.",
      url: "https://alison.com/course/introduction-to-management-analysis-and-strategies",
    },
  ],
};

const STRENGTH_RESOURCE_TITLE_EXCLUSIONS: Record<string, string[]> = {
  "comunicacion-efectiva": [
    "Improving Communication Skills",
    "How to speak so that people want to listen",
    "Taller interno UIX: Comunicación efectiva y conversaciones difíciles",
  ],
  asertividad: ["Negotiation Skills"],
  autogestion: [
    "Work Smarter, Not Harder: Time Management",
    "Taller interno UIX: Priorización y gestión del tiempo",
  ],
  "trabajo-en-equipo": ["Teamwork Skills: Communicating Effectively in Groups"],
  negociacion: ["Negotiation Skills"],
  proactividad: ["Creative Thinking: Techniques and Tools for Success"],
  "aprendizaje-continuo": ["Google Project Management Certificate"],
  "mentalidad-de-negocio": ["Introduction to Management Analysis and Strategies"],
};

const getExcludedResourceTitlesForStrengths = (strengthKeys: string[]): Set<string> => {
  const excluded = new Set<string>();

  for (const key of strengthKeys) {
    (STRENGTH_RESOURCE_TITLE_EXCLUSIONS[key] || []).forEach((title) => excluded.add(title));
    (EXTERNAL_RESOURCES_BY_COMPETENCY[key] || []).forEach((resource) => excluded.add(resource.title));
  }

  return excluded;
};

const FALLBACK_EXTERNAL_RESOURCES: ResourceRecommendation[] = [
  {
    title: "How to speak so that people want to listen",
    type: "Video en YouTube (TED) · gratis",
    why: "Aporta técnicas concretas para comunicar ideas con claridad e impacto.",
    url: "https://www.youtube.com/watch?v=eIho2S0ZahI",
  },
  {
    title: "Fundamentals of Project Management",
    type: "Alison · curso gratuito",
    why: "Refuerza organización y seguimiento para sostener resultados en el tiempo.",
    url: "https://alison.com/course/fundamentals-of-project-management-revised-2017",
  },
  {
    title: "Introduction to Management Analysis and Strategies",
    type: "Alison · curso gratuito",
    why: "Fortalece liderazgo práctico y coordinación de planes de trabajo.",
    url: "https://alison.com/course/introduction-to-management-analysis-and-strategies",
  },
];

const buildResourceBlock = (resources: ResourceRecommendation[]): string => {
  return resources.slice(0, 5).map((resource, index) => (
    // Internal workshops must show contact text only, without links.
    (() => {
      const isInternalWorkshop = /taller\s+interno/i.test(resource.title || "");
      const resourceValue = isInternalWorkshop
        ? "Acércate con Capital Humano para más información."
        : resource.url;

      return `**${index + 1}. ${resource.title}**\n` +
        `- **Tipo:** ${resource.type}\n` +
        `- **Por qué te va a servir:** ${resource.why}\n` +
        `- **Recurso:** ${resourceValue}`;
    })()
  )).join("\n\n");
};

const buildRecommendedResources = (opportunityKeys: string[], strengthKeys: string[] = []): ResourceRecommendation[] => {
  const chosen: ResourceRecommendation[] = [];
  const seen = new Set<string>();
  const excludedTitles = getExcludedResourceTitlesForStrengths(strengthKeys);

  const add = (resource?: ResourceRecommendation) => {
    if (!resource || seen.has(resource.title) || excludedTitles.has(resource.title)) return;
    seen.add(resource.title);
    chosen.push(resource);
  };

  // Always keep workshops visible among recommendations.
  WORKSHOP_RESOURCES.forEach((resource) => add(resource));

  for (const key of opportunityKeys) {
    const candidates = EXTERNAL_RESOURCES_BY_COMPETENCY[key] || [];
    candidates.forEach((resource) => add(resource));
    if (chosen.length >= 5) break;
  }

  if (chosen.length < 5) {
    for (const key of Object.keys(EXTERNAL_RESOURCES_BY_COMPETENCY)) {
      if (opportunityKeys.includes(key) || strengthKeys.includes(key)) continue;
      const candidates = EXTERNAL_RESOURCES_BY_COMPETENCY[key] || [];
      candidates.forEach((resource) => add(resource));
      if (chosen.length >= 5) break;
    }
  }

  for (const fallback of FALLBACK_EXTERNAL_RESOURCES) {
    if (chosen.length >= 5) break;
    add(fallback);
  }

  return chosen.slice(0, 5);
};

const extractSection = (report: string, headings: string[]): string => {
  for (const heading of headings) {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`###\\s+${escaped}\\s*([\\s\\S]*?)(?=\\n###\\s|\\n---REPORTE_FIN---|$)`, "i");
    const match = report.match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
};

const parseCompetencyKeysFromSection = (sectionContent: string): string[] => {
  if (!sectionContent.trim()) return [];

  const keys = new Set<string>();
  const labels = Object.values(COMPETENCIES).map((item) => ({ key: item.key, normalizedLabel: normalize(item.label) }));
  const matches = [...sectionContent.matchAll(/\*\*([^*]+)\*\*/g)].map((match) => String(match[1] || "").trim());
  const normalizedSection = normalize(sectionContent);

  const containsNormalizedLabel = (label: string): boolean => {
    if (!label) return false;
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|\\W)${escapedLabel}(\\W|$)`, "i");
    return pattern.test(normalizedSection);
  };

  for (const label of matches) {
    const normalizedLabel = normalize(label);
    if (!normalizedLabel) continue;

    const resolved = labels.find((item) => normalizedLabel === item.normalizedLabel
      || normalizedLabel.includes(item.normalizedLabel)
      || item.normalizedLabel.includes(normalizedLabel));

    if (resolved) keys.add(resolved.key);
  }

  // Some report variants list competencies without markdown bold formatting.
  for (const item of labels) {
    if (containsNormalizedLabel(item.normalizedLabel)) {
      keys.add(item.key);
    }
  }

  return [...keys];
};

const rebuildReportResourcesByCompetencies = (report: string): string => {
  if (!report.trim()) return report;

  const strengthsSection = extractSection(report, ["Fortalezas", "Tus fortalezas"]);
  const opportunitiesSection = extractSection(report, ["Áreas de oportunidad", "Areas de oportunidad", "Lo que más puedes potenciar", "Lo que puedes potenciar"]);

  const strengthKeys = parseCompetencyKeysFromSection(strengthsSection);
  const opportunityKeys = parseCompetencyKeysFromSection(opportunitiesSection).filter((key) => !strengthKeys.includes(key));

  if (!opportunityKeys.length && !strengthKeys.length) return report;

  const recommendations = buildRecommendedResources(opportunityKeys, strengthKeys);
  const replacementBlock = `### Recursos recomendados\n${buildResourceBlock(recommendations)}`;
  const resourcesSectionPattern = /###\s+(Recursos recomendados|Tus 5 recursos de desarrollo|Recursos de desarrollo)[\s\S]*?(?=\n###\s|\n---REPORTE_FIN---|$)/i;

  if (resourcesSectionPattern.test(report)) {
    return report.replace(resourcesSectionPattern, replacementBlock);
  }

  return `${report.trim()}\n\n${replacementBlock}`;
};

const toProfileKey = (profile: string): ProfileKey => {
  const normalized = normalize(profile);

  if (normalized.includes("product")) return "product";
  if (normalized.includes("customer success") || normalized.includes("customer-success") || normalized === "cs") {
    return "customer-success";
  }
  return "ux-ui";
};

const parseRecommendedResourceTitles = (report: string): string[] => {
  const matches = [...report.matchAll(/\*\*\d+\.\s([^\n*]+)\*\*/g)];
  return matches.map((match) => match[1].trim()).filter(Boolean);
};

const findCanonicalResourceByTitle = (title: string): ResourceRecommendation | null => {
  const titleKey = normalizeTitleKey(title);
  if (!titleKey) return null;

  const allResources = [
    ...Object.values(EXTERNAL_RESOURCES_BY_COMPETENCY).flat(),
    ...FALLBACK_EXTERNAL_RESOURCES,
  ];

  for (const resource of allResources) {
    const candidateKey = normalizeTitleKey(resource.title);
    if (!candidateKey) continue;
    if (titleKey === candidateKey || titleKey.includes(candidateKey) || candidateKey.includes(titleKey)) {
      return resource;
    }
  }

  return null;
};

const classifyAssessment = (q1: OptionId, q2?: OptionId): Classification => {
  if (q1 === "C") return "solid";
  if (q1 === "B") {
    if (q2 === "A") return "opportunity";
    if (q2 === "C") return "functional-strong";
    return "functional-developing";
  }
  if (q2 === "A") return "priority";
  if (q2 === "C") return "emergent";
  return "opportunity";
};

const buildAssessmentPriority = (q1: OptionId, q2?: OptionId): boolean => q1 === "A" || q2 === "A";

const getCompetencyOrder = (profileKey: ProfileKey): string[] => {
  return [...BASE_COMPETENCIES, ...PROFILE_COMPETENCIES[profileKey]];
};

const createAssessmentFlow = (profileLabel: string, customCompetencyOrder?: string[]): AssessmentFlow => {
  const profileKey = toProfileKey(profileLabel);
  return {
    profileKey,
    profileLabel,
    competencyOrder: customCompetencyOrder || getCompetencyOrder(profileKey),
    competencyIndex: 0,
    pendingQuestion: "q1",
    assessments: {},
  };
};

const isValidAssessmentFlow = (value: unknown): value is AssessmentFlow => {
  if (!value || typeof value !== "object") return false;
  const flow = value as Partial<AssessmentFlow>;
  return Array.isArray(flow.competencyOrder)
    && typeof flow.competencyIndex === "number"
    && (flow.pendingQuestion === "q1" || flow.pendingQuestion === "q2")
    && typeof flow.profileLabel === "string"
    && typeof flow.assessments === "object";
};

const getCurrentCompetency = (flow: AssessmentFlow | null): CompetencyDefinition | null => {
  if (!flow) return null;
  const key = flow.competencyOrder[flow.competencyIndex];
  return key ? COMPETENCIES[key] || null : null;
};

const getCurrentQuestion = (flow: AssessmentFlow | null): QuestionDefinition | null => {
  const competency = getCurrentCompetency(flow);
  if (!competency || !flow) return null;
  return flow.pendingQuestion === "q2" ? competency.questions.q2 : competency.questions.q1;
};

const rebuildAssessmentFlowFromSnapshot = (args: {
  selectedProfile?: string;
  assessmentFlow?: AssessmentFlow | null;
  messages?: ChatMessage[];
}): AssessmentFlow | null => {
  if (isValidAssessmentFlow(args.assessmentFlow)) {
    return args.assessmentFlow;
  }

  const profile = String(args.selectedProfile || "").trim();
  if (!profile) return null;

  let flow = createAssessmentFlow(profile);
  const orderedMessages = normalizeIncomingMessages(args.messages || []);
  const userMessages = orderedMessages.filter((msg) => msg.role === "user");

  for (const message of userMessages) {
    const selectedOption = detectSelectedOption(message.content || "");
    if (!selectedOption) continue;

    const advanced = advanceAssessmentFlow(flow, selectedOption);
    flow = advanced.flow;
    if (advanced.isComplete) break;
  }

  return flow;
};

const isCompletedAssessmentFlow = (flow: AssessmentFlow | null): boolean => {
  if (!flow) return false;
  return flow.competencyOrder.every((key) => Boolean(flow.assessments[key]?.classification));
};

const detectSelectedOption = (input: string): OptionId | null => {
  const normalized = normalize(input);
  const compact = normalized.replace(/[\s.,;:!?()\-_/]/g, "");

  if (compact === "a") return "A";
  if (compact === "b") return "B";
  if (compact === "c") return "C";
  if (normalized.includes("opcion a") || normalized.includes("opcion: a") || normalized.includes("opcion-a")) return "A";
  if (normalized.includes("opcion b") || normalized.includes("opcion: b") || normalized.includes("opcion-b")) return "B";
  if (normalized.includes("opcion c") || normalized.includes("opcion: c") || normalized.includes("opcion-c")) return "C";

  return null;
};

const formatQuestionWithOptions = (name: string, flow: AssessmentFlow | null, includeIntro = false): string => {
  const competency = getCurrentCompetency(flow);
  const question = getCurrentQuestion(flow);
  if (!competency || !question || !flow) return "";

  const intro = includeIntro
    ? `Hola ${name || "colaborador"}. Tendremos una conversación guiada, breve y concreta.\n\n`
    : "";

  const followUpLead = flow.pendingQuestion === "q2"
    ? `${pickFollowUpLead()}\n\n`
    : "";

  return `${intro}${followUpLead}${question.prompt}\n\n- **A)** ${question.options.A}\n- **B)** ${question.options.B}\n- **C)** ${question.options.C}`;
};

const buildAssistantPromptForInvalidAnswer = (flow: AssessmentFlow | null): string => {
  const question = getCurrentQuestion(flow);
  if (!question) return "Para continuar necesito una respuesta cerrada. Elige A, B o C.";

  return `Para seguir con esta conversación guiada, elige solo una opción: **A**, **B** o **C**.\n\n- **A)** ${question.options.A}\n- **B)** ${question.options.B}\n- **C)** ${question.options.C}`;
};

const classificationWeight: Record<Classification, number> = {
  priority: 0,
  opportunity: 1,
  emergent: 2,
  "functional-developing": 3,
  "functional-strong": 4,
  solid: 5,
};

const buildStrengthNarrative = (classification: Classification, competency: CompetencyDefinition): string => {
  if (classification === "solid") return competency.strengthDescription;
  return `Ya muestras una base consistente en esta competencia. ${competency.strengthDescription}`;
};

const buildOpportunityNarrative = (classification: Classification, competency: CompetencyDefinition): string => {
  if (classification === "priority") {
    return `${competency.opportunityDescription} Conviene darle atención prioritaria porque hoy puede limitar tu impacto o tu claridad al colaborar.`;
  }
  if (classification === "emergent") {
    return `Ya hay señales positivas en esta competencia, pero todavía necesita práctica deliberada para volverse consistente. ${competency.opportunityDescription}`;
  }
  if (classification === "functional-developing") {
    return `Hay una base funcional, aunque todavía no siempre se sostiene con la misma claridad o consistencia. ${competency.opportunityDescription}`;
  }
  return competency.opportunityDescription;
};

const buildRecoveredReportFromProgress = (args: {
  email: string;
  name: string;
  assignedResources: string[];
  completionPercentage: number;
  deliverables: Array<{ title: string; summary: string; submittedAt: string }>;
}): string => {
  const recoveredResources = (args.assignedResources || []).slice(0, 5).map((title) => ({
    ...(findCanonicalResourceByTitle(title) || {
      title,
      type: "Curso recomendado",
      why: "Te ayudará a reforzar hábitos prácticos de desarrollo en tu rol.",
      url: `https://www.google.com/search?q=${encodeURIComponent(title)}`,
    }),
    title,
    type: /taller\s+interno/i.test(title)
      ? "Taller UIX · interno"
      : (findCanonicalResourceByTitle(title)?.type || "Curso recomendado"),
    why: /taller\s+interno/i.test(title)
      ? "Te ayudará a reforzar tus áreas de oportunidad con acciones prácticas aplicables a tu rol."
      : (findCanonicalResourceByTitle(title)?.why || "Te ayudará a reforzar hábitos prácticos de desarrollo en tu rol."),
    url: /taller\s+interno/i.test(title)
      ? "Acércate con Capital Humano para más información."
      : (findCanonicalResourceByTitle(title)?.url || `https://www.google.com/search?q=${encodeURIComponent(title)}`),
  }));

  const resources = recoveredResources.length
    ? recoveredResources
    : [...WORKSHOP_RESOURCES, ...FALLBACK_EXTERNAL_RESOURCES].slice(0, 5);

  const actionLines = [
    "- **Recuperar tu foco semanal**: Define una prioridad central por semana y revísala al cierre.",
    "- **Registrar aprendizajes aplicados**: Anota qué cambió en tu trabajo después de cada avance.",
    "- **Compartir acuerdos con claridad**: Resume por escrito decisiones y siguientes pasos después de reuniones clave.",
  ].join("\n");

  const latestDeliverable = args.deliverables.length ? args.deliverables[args.deliverables.length - 1] : null;
  const latestDeliverableText = latestDeliverable
    ? `Último entregable registrado: ${latestDeliverable.title || "Sin título"}. ${latestDeliverable.summary || "Sin resumen."}`
    : "Aún no hay entregables registrados.";

  return `---REPORTE_INICIO---
## Tu resumen de desarrollo (recuperado)

### Fortalezas
- **Seguimiento de tu desarrollo**: Ya existe evidencia de continuidad en tu proceso y eso habla de compromiso con tu crecimiento.
- **Persistencia**: Has mantenido avances registrados, lo cual es una buena base para seguir construyendo hábitos de desarrollo.

### Áreas de oportunidad
- **Consistencia en la práctica**: Conviene sostener pequeños hábitos de desarrollo para que tu avance sea más visible y continuo.
- **Aplicación en el trabajo diario**: Llevar cada aprendizaje a acciones concretas en tu rol hará que el progreso se note más rápido.

### Recursos recomendados
${buildResourceBlock(resources)}

### Acciones prácticas recomendadas
${actionLines}

### Estado recuperado
- **Correo de seguimiento:** ${args.email}
- **Colaborador:** ${args.name || "Colaborador"}
- **Avance registrado:** ${args.completionPercentage}%
- **Seguimiento previo:** ${latestDeliverableText}
---REPORTE_FIN---`;
};

const buildPersonalizedReport = (args: {
  flow: AssessmentFlow;
  employeeEmail: string;
}): string => {
  const entries = args.flow.competencyOrder
    .map((key) => args.flow.assessments[key])
    .filter((entry): entry is AssessmentEntry => Boolean(entry?.classification));

  const strengths = entries
    .filter((entry) => entry.classification === "solid" || entry.classification === "functional-strong")
    .sort((left, right) => classificationWeight[right.classification!] - classificationWeight[left.classification!])
    .slice(0, 4);

  const opportunities = entries
    .filter((entry) => entry.classification !== "solid" && entry.classification !== "functional-strong")
    .sort((left, right) => classificationWeight[left.classification!] - classificationWeight[right.classification!])
    .slice(0, 4);

  const fallbackStrengths = entries
    .filter((entry) => !strengths.some((current) => current.competencyKey === entry.competencyKey))
    .sort((left, right) => classificationWeight[right.classification!] - classificationWeight[left.classification!])
    .slice(0, Math.max(0, 3 - strengths.length));

  const resolvedStrengths = [...strengths, ...fallbackStrengths].slice(0, 4);
  const resolvedOpportunities = opportunities.length
    ? opportunities
    : entries
        .filter((entry) => !resolvedStrengths.some((current) => current.competencyKey === entry.competencyKey))
        .sort((left, right) => classificationWeight[left.classification!] - classificationWeight[right.classification!])
        .slice(0, 3);

  const strengthLines = resolvedStrengths.map((entry) => {
    const competency = COMPETENCIES[entry.competencyKey];
    return `- **${competency.label}**: ${buildStrengthNarrative(entry.classification!, competency)}`;
  }).join("\n");

  const opportunityLines = resolvedOpportunities.map((entry) => {
    const competency = COMPETENCIES[entry.competencyKey];
    return `- **${competency.label}**: ${buildOpportunityNarrative(entry.classification!, competency)}`;
  }).join("\n");

  const selectedActions: ActionRecommendation[] = [];
  const usedTitles = new Set<string>();
  const addAction = (action?: ActionRecommendation) => {
    if (!action || usedTitles.has(action.title)) return;
    usedTitles.add(action.title);
    selectedActions.push(action);
  };

  for (const entry of resolvedOpportunities) {
    const competency = COMPETENCIES[entry.competencyKey];
    competency.actions.forEach((action) => addAction(action));
    if (selectedActions.length >= 5) break;
  }

  if (selectedActions.length < 5) {
    for (const entry of resolvedStrengths) {
      const competency = COMPETENCIES[entry.competencyKey];
      competency.actions.forEach((action) => addAction(action));
      if (selectedActions.length >= 5) break;
    }
  }

  const actionLines = selectedActions.slice(0, 5).map((action, index) => {
    return `- **${action.title}**: ${action.description}`;
  }).join("\n");

  const resourceRecommendations = buildRecommendedResources(
    resolvedOpportunities.map((entry) => entry.competencyKey),
    resolvedStrengths.map((entry) => entry.competencyKey),
  );
  const resourceLines = buildResourceBlock(resourceRecommendations);

  const followUpEmailLine = args.employeeEmail
    ? `- **Correo de seguimiento:** ${args.employeeEmail}`
    : "- **Correo de seguimiento:** Pendiente de registro";

  const report = `---REPORTE_INICIO---
## Tu resumen de desarrollo profesional

### Fortalezas
${strengthLines || "- **Base de desarrollo**: Ya cuentas con señales positivas para seguir fortaleciendo tu práctica profesional."}

### Áreas de oportunidad
${opportunityLines || "- **Profundizar en tu práctica**: Tu siguiente paso está en volver más consistentes las fortalezas que ya muestras."}

### Recursos recomendados
${resourceLines}

### Acciones prácticas recomendadas
${actionLines || "- **Sostener una práctica breve**: Define un hábito concreto por semana y dale seguimiento diario."}

### Seguimiento
${followUpEmailLine}
---REPORTE_FIN---`;

  return rebuildReportResourcesByCompetencies(report);
};

const advanceAssessmentFlow = (flow: AssessmentFlow, answer: OptionId, forceSkipQ2 = false) => {
  const competencyKey = flow.competencyOrder[flow.competencyIndex];
  const currentEntry: AssessmentEntry = flow.assessments[competencyKey] || { competencyKey };

  if (flow.pendingQuestion === "q1") {
    const updatedEntry: AssessmentEntry = { ...currentEntry, q1: answer };

    if (answer === "C" || forceSkipQ2) {
      updatedEntry.classification = "solid";
      updatedEntry.isPriority = false;
      const nextIndex = flow.competencyIndex + 1;
      const isComplete = nextIndex >= flow.competencyOrder.length;
      return {
        flow: {
          ...flow,
          competencyIndex: isComplete ? flow.competencyIndex : nextIndex,
          pendingQuestion: "q1" as const,
          assessments: { ...flow.assessments, [competencyKey]: updatedEntry },
        },
        competencyCompleted: COMPETENCIES[competencyKey],
        isComplete,
      };
    }

    return {
      flow: {
        ...flow,
        pendingQuestion: "q2" as const,
        assessments: { ...flow.assessments, [competencyKey]: updatedEntry },
      },
      competencyCompleted: null,
      isComplete: false,
    };
  }

  const q1 = currentEntry.q1 || "B";
  const classification = classifyAssessment(q1, answer);
  const updatedEntry: AssessmentEntry = {
    ...currentEntry,
    q1,
    q2: answer,
    classification,
    isPriority: buildAssessmentPriority(q1, answer),
  };
  const nextIndex = flow.competencyIndex + 1;
  const isComplete = nextIndex >= flow.competencyOrder.length;

  return {
    flow: {
      ...flow,
      competencyIndex: isComplete ? flow.competencyIndex : nextIndex,
      pendingQuestion: "q1" as const,
      assessments: { ...flow.assessments, [competencyKey]: updatedEntry },
    },
    competencyCompleted: COMPETENCIES[competencyKey],
    isComplete,
  };
};

const buildTransitionMessage = (): string => {
  const variants = [
    "Gracias, lo tomo en cuenta.",
    "Perfecto, seguimos.",
    "Excelente, avancemos.",
    "Muy bien, continuamos.",
    "Anotado, pasemos a la siguiente.",
  ];
  return variants[Math.floor(Math.random() * variants.length)];
};

export function useChat() {
  const hasHydratedRef = useRef(false);
  const lastSyncedAssessmentRef = useRef("");
  const remoteSaveTimeoutRef = useRef<number | null>(null);
  const lastRemoteSaveAlertAtRef = useRef(0);

  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isEvaluationComplete, setIsEvaluationComplete] = useState(false);
  const [employeeName, setEmployeeName] = useState("");
  const [employeeEmail, setEmployeeEmail] = useState("");
  const [trainerName, setTrainerName] = useState("");
  const [currentStep, setCurrentStep] = useState(0);
  const [finalReport, setFinalReport] = useState("");
  const [followUpCount, setFollowUpCount] = useState(0);
  const [isInFollowUp, setIsInFollowUp] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState("");
  const [assessmentFlow, setAssessmentFlow] = useState<AssessmentFlow | null>(null);

  const signalsRef = useRef<SignalState>({ strengths: {}, opportunities: {} });
  const catalogQuestionsRef = useRef<Record<string, CatalogQuestion>>({});
  const catalogLoadedRef = useRef(false);

  const clearRuntimeState = useCallback(() => {
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
    setTrainerName("");
    setSelectedProfile("");
    setAssessmentFlow(null);
    signalsRef.current = { strengths: {}, opportunities: {} };
  }, []);

  const applyPersistedState = useCallback((parsed: PersistedChatState) => {
    const parsedMessages = normalizeIncomingMessages(parsed.messages);
    const normalizedReport = migrateLegacyReportContent(parsed.finalReport || "");
    const hasStoredReport = Boolean(normalizedReport.trim());
    const rebuiltFlow = rebuildAssessmentFlowFromSnapshot({
      selectedProfile: parsed.selectedProfile,
      assessmentFlow: parsed.assessmentFlow,
      messages: parsedMessages,
    });
    const flowIsComplete = isCompletedAssessmentFlow(rebuiltFlow);
    // Only regenerate from flow when there is no stored report.
    const regeneratedReport = !hasStoredReport && flowIsComplete
      ? buildPersonalizedReport({
          flow: rebuiltFlow!,
          employeeEmail: parsed.employeeEmail || "",
        })
      : normalizedReport;
    const refreshedReport = rebuildReportResourcesByCompetencies(regeneratedReport);
    const hasReport = Boolean(refreshedReport.trim());
    const hasMeaningfulContent = parsedMessages.length > 0 || hasReport || Boolean(rebuiltFlow);
    const hydratedMessages = parsedMessages.length
      ? parsedMessages
      : hasReport
        ? [{
            id: `assistant-restored-${Date.now()}`,
            role: "assistant" as const,
            content: "Recuperamos tu reporte guardado. Usa Ver avance para retomar tu seguimiento.",
          }]
        : [];

    const hydratedConversationId = hasMeaningfulContent
      ? (typeof parsed.conversationId === "number" ? parsed.conversationId : Date.now())
      : null;
    setConversationId(hydratedConversationId);
    setMessages(hydratedMessages);
    setIsEvaluationComplete(hasMeaningfulContent && (Boolean(parsed.isEvaluationComplete) || hasReport || flowIsComplete));
    setEmployeeName(parsed.employeeName || "");
    setEmployeeEmail(parsed.employeeEmail || "");
    setTrainerName(parsed.trainerName || "");
    setCurrentStep(hasMeaningfulContent && typeof parsed.currentStep === "number" ? parsed.currentStep : 0);
    setFinalReport(refreshedReport);
    setFollowUpCount(hasMeaningfulContent && typeof parsed.followUpCount === "number" ? parsed.followUpCount : 0);
    setIsInFollowUp(hasMeaningfulContent && Boolean(parsed.isInFollowUp));
    setSelectedProfile(parsed.selectedProfile || "");
    setAssessmentFlow(rebuiltFlow);

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
      trainerName,
      currentStep,
      finalReport,
      followUpCount,
      isInFollowUp,
      signals: signalsRef.current,
      updatedAt: Date.now(),
      selectedProfile,
      assessmentFlow,
    };
  }, [assessmentFlow, conversationId, currentStep, employeeEmail, employeeName, finalReport, followUpCount, isEvaluationComplete, isInFollowUp, messages, selectedProfile, trainerName]);

  const hasSnapshotContent = useCallback((snapshot: PersistedChatState | null | undefined): boolean => {
    if (!snapshot) return false;
    const parsedMessages = normalizeIncomingMessages(snapshot.messages);
    const normalizedReport = snapshot.finalReport || "";
    const hasCompatibleFlow = Boolean(
      rebuildAssessmentFlowFromSnapshot({
        selectedProfile: snapshot.selectedProfile,
        assessmentFlow: snapshot.assessmentFlow,
        messages: parsedMessages,
      })
    );
    const hasConversationMeta = typeof snapshot.conversationId === "number" && Boolean(String(snapshot.selectedProfile || "").trim());
    return parsedMessages.length > 0 || Boolean(normalizedReport) || hasCompatibleFlow || hasConversationMeta;
  }, []);

  const isResumeUsableSnapshot = useCallback((snapshot: PersistedChatState | null | undefined): boolean => {
    if (!snapshot) return false;
    const parsedMessages = normalizeIncomingMessages(snapshot.messages);
    const hasAnyMessageContent = parsedMessages.some((msg) => String(msg?.content || "").trim().length > 0);
    const hasReport = Boolean(String(snapshot.finalReport || "").trim());
    const hasCompatibleFlow = Boolean(
      rebuildAssessmentFlowFromSnapshot({
        selectedProfile: snapshot.selectedProfile,
        assessmentFlow: snapshot.assessmentFlow,
        messages: parsedMessages,
      })
    );
    const hasConversationMeta = typeof snapshot.conversationId === "number" && Boolean(String(snapshot.selectedProfile || "").trim());
    return hasReport || hasCompatibleFlow || hasAnyMessageContent || hasConversationMeta;
  }, []);

  const getSnapshotResumeRank = useCallback((snapshot: PersistedChatState | null | undefined) => {
    if (!snapshot) {
      return { userMessagesCount: -1, hasReport: 0, updatedAt: 0 };
    }

    const userMessagesCount = normalizeIncomingMessages(snapshot.messages)
      .filter((msg) => msg.role === "user" && String(msg.content || "").trim().length > 0)
      .length;

    return {
      userMessagesCount,
      hasReport: snapshot.finalReport ? 1 : 0,
      updatedAt: typeof snapshot.updatedAt === "number" ? snapshot.updatedAt : 0,
    };
  }, []);

  const pickPreferredSnapshot = useCallback((first: PersistedChatState | null, second: PersistedChatState | null): PersistedChatState | null => {
    const a = getSnapshotResumeRank(first);
    const b = getSnapshotResumeRank(second);

    if (a.userMessagesCount !== b.userMessagesCount) return a.userMessagesCount > b.userMessagesCount ? first : second;
    if (a.hasReport !== b.hasReport) return a.hasReport > b.hasReport ? first : second;
    if (a.updatedAt !== b.updatedAt) return a.updatedAt >= b.updatedAt ? first : second;
    return first || second;
  }, [getSnapshotResumeRank]);

  const readLocalSnapshotForEmail = useCallback((email: string): PersistedChatState | null => {
    try {
      const raw = localStorage.getItem(CHAT_STORAGE_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw) as PartialPersistedChatState;
      const storedEmail = String(parsed.employeeEmail || "").trim().toLowerCase();
      if (storedEmail !== email.trim().toLowerCase()) return null;

      return {
        conversationId: typeof parsed.conversationId === "number" ? parsed.conversationId : null,
        messages: normalizeIncomingMessages(parsed.messages),
        isEvaluationComplete: Boolean(parsed.isEvaluationComplete),
        employeeName: String(parsed.employeeName || ""),
        employeeEmail: storedEmail,
        trainerName: String(parsed.trainerName || ""),
        currentStep: typeof parsed.currentStep === "number" ? parsed.currentStep : 0,
        finalReport: String(parsed.finalReport || parsed.report || ""),
        followUpCount: typeof parsed.followUpCount === "number" ? parsed.followUpCount : 0,
        isInFollowUp: Boolean(parsed.isInFollowUp),
        signals: parsed.signals?.strengths && parsed.signals?.opportunities ? parsed.signals : { strengths: {}, opportunities: {} },
        updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
        selectedProfile: String(parsed.selectedProfile || parsed.profile || ""),
        assessmentFlow: isValidAssessmentFlow(parsed.assessmentFlow) ? parsed.assessmentFlow : null,
      };
    } catch {
      return null;
    }
  }, []);

  const hasLocalSessionForEmail = useCallback((email: string): boolean => {
    const localSnapshot = readLocalSnapshotForEmail(email);
    return isResumeUsableSnapshot(localSnapshot);
  }, [isResumeUsableSnapshot, readLocalSnapshotForEmail]);

  const readLatestLocalSnapshot = useCallback((): PersistedChatState | null => {
    try {
      const raw = localStorage.getItem(CHAT_STORAGE_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw) as PartialPersistedChatState;
      const normalized: PersistedChatState = {
        conversationId: typeof parsed.conversationId === "number" ? parsed.conversationId : null,
        messages: normalizeIncomingMessages(parsed.messages),
        isEvaluationComplete: Boolean(parsed.isEvaluationComplete),
        employeeName: String(parsed.employeeName || ""),
        employeeEmail: String(parsed.employeeEmail || "").trim().toLowerCase(),
        trainerName: String(parsed.trainerName || ""),
        currentStep: typeof parsed.currentStep === "number" ? parsed.currentStep : 0,
        finalReport: String(parsed.finalReport || parsed.report || ""),
        followUpCount: typeof parsed.followUpCount === "number" ? parsed.followUpCount : 0,
        isInFollowUp: Boolean(parsed.isInFollowUp),
        signals: parsed.signals?.strengths && parsed.signals?.opportunities ? parsed.signals : { strengths: {}, opportunities: {} },
        updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
        selectedProfile: String(parsed.selectedProfile || parsed.profile || ""),
        assessmentFlow: isValidAssessmentFlow(parsed.assessmentFlow) ? parsed.assessmentFlow : null,
      };

      return isResumeUsableSnapshot(normalized) ? normalized : null;
    } catch {
      return null;
    }
  }, [isResumeUsableSnapshot]);

  const forceResumeLatestLocalSession = useCallback((emailFilter?: string): boolean => {
    const snapshot = readLatestLocalSnapshot();
    if (!snapshot) return false;
    // If an email filter is provided, only resume if the snapshot belongs to that email.
    if (emailFilter) {
      const snapshotEmail = String(snapshot.employeeEmail || "").trim().toLowerCase();
      const targetEmail = emailFilter.trim().toLowerCase();
      if (snapshotEmail !== targetEmail) return false;
    }
    applyPersistedState({ ...snapshot, updatedAt: Date.now() });
    return true;
  }, [applyPersistedState, readLatestLocalSnapshot]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CHAT_STORAGE_KEY);
      if (!raw) {
        hasHydratedRef.current = true;
        return;
      }

      const parsed = JSON.parse(raw) as PersistedChatState;
      const hasFinalReport = Boolean(String(parsed.finalReport || "").trim());
      const hasCompatibleFlow = isValidAssessmentFlow(parsed.assessmentFlow);

      if (hasFinalReport || hasCompatibleFlow) {
        applyPersistedState(parsed);
      } else {
        // Drop legacy in-progress sessions from the previous open-ended flow.
        localStorage.removeItem(CHAT_STORAGE_KEY);
      }
    } catch {
      // Ignore malformed local data.
    } finally {
      hasHydratedRef.current = true;
    }
  }, [applyPersistedState]);

  useEffect(() => {
    if (!hasHydratedRef.current || isTyping) return;
    const snapshot = getPersistedSnapshot();
    if (!hasSnapshotContent(snapshot)) return;

    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Ignore storage write errors.
    }
  }, [getPersistedSnapshot, hasSnapshotContent, isTyping]);

  useEffect(() => {
    if (!hasHydratedRef.current || !employeeEmail.trim()) return;
    const hasContent = messages.length > 0 || Boolean(finalReport);
    if (!hasContent) return;

    if (remoteSaveTimeoutRef.current) {
      window.clearTimeout(remoteSaveTimeoutRef.current);
    }

    remoteSaveTimeoutRef.current = window.setTimeout(() => {
      const snapshot = getPersistedSnapshot();
      saveSessionByEmail(employeeEmail, snapshot).catch(() => {
        const now = Date.now();
        if (now - lastRemoteSaveAlertAtRef.current > 30_000) {
          lastRemoteSaveAlertAtRef.current = now;
          window.alert("No se pudo guardar tu avance en la nube en este momento. Tu progreso permanece en este navegador y reintentaremos automáticamente.");
        }
      });
    }, 400);

    return () => {
      if (remoteSaveTimeoutRef.current) {
        window.clearTimeout(remoteSaveTimeoutRef.current);
        remoteSaveTimeoutRef.current = null;
      }
    };
  }, [employeeEmail, finalReport, getPersistedSnapshot, messages.length]);

  useEffect(() => {
    if (!hasHydratedRef.current || !employeeEmail.trim()) return;
    const snapshot = getPersistedSnapshot();
    if (!hasSnapshotContent(snapshot)) return;

    void saveSessionByEmail(employeeEmail, snapshot).catch(() => {
      // Ignore remote persistence errors.
    });
  }, [employeeEmail, getPersistedSnapshot, hasSnapshotContent]);

  useEffect(() => {
    if (!isEvaluationComplete || !employeeEmail.trim() || !finalReport.trim()) return;

    const syncKey = `${employeeEmail.trim().toLowerCase()}|${conversationId || "no-conversation"}|${selectedProfile}`;
    if (lastSyncedAssessmentRef.current === syncKey) return;
    lastSyncedAssessmentRef.current = syncKey;

    const assignedResources = parseRecommendedResourceTitles(finalReport);
    void syncCollaboratorAssessment({
      collaboratorEmail: employeeEmail,
      collaboratorName: employeeName,
      trainerName,
      profile: selectedProfile,
      assessmentId: conversationId ? String(conversationId) : undefined,
      assignedResources,
    }).catch(() => {
      // Ignore sync errors here.
    });
  }, [conversationId, employeeEmail, employeeName, finalReport, isEvaluationComplete, selectedProfile, trainerName]);

  useEffect(() => {
    if (!conversationId || !employeeName || messages.length > 0 || !assessmentFlow) return;

    const firstKey = assessmentFlow.competencyOrder[0];
    const catalogQuestion = catalogLoadedRef.current ? catalogQuestionsRef.current[firstKey] : null;
    const content = catalogQuestion
      ? formatOpenQuestion(employeeName, catalogQuestion, true)
      : formatQuestionWithOptions(employeeName, assessmentFlow, true);

    const initialAssistantMsg: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      content,
    };

    setMessages([initialAssistantMsg]);
    setCurrentStep(1);
  }, [assessmentFlow, conversationId, employeeName, messages.length]);

  const sendMessage = useCallback(async (content: string, currentConversationId: number) => {
    if (!content.trim() || !assessmentFlow) return;

    const userMsgId = Date.now().toString();
    const assistantMsgId = (Date.now() + 1).toString();

    // Determine whether we are in catalog (open-ended) or legacy (A/B/C) mode
    const currentCompetencyKey = assessmentFlow.competencyOrder[assessmentFlow.competencyIndex];
    const catalogQuestion = catalogLoadedRef.current
      ? catalogQuestionsRef.current[currentCompetencyKey] ?? null
      : null;

    const selectedOption = catalogQuestion
      ? classifyByKeywords(content, catalogQuestion)
      : detectSelectedOption(content);

    let fullResponseContent = "";
    let shouldCompleteAfterStream = false;
    let nextReport = "";

    if (!selectedOption) {
      // Legacy mode: user did not type A, B, or C
      setIsInFollowUp(true);
      setFollowUpCount((prev) => prev + 1);
      fullResponseContent = buildAssistantPromptForInvalidAnswer(assessmentFlow);
    } else {
      setIsInFollowUp(false);
      setFollowUpCount(0);

      const advanced = advanceAssessmentFlow(assessmentFlow, selectedOption, catalogQuestion !== null);
      setAssessmentFlow(advanced.flow);

      if (advanced.isComplete) {
        nextReport = buildPersonalizedReport({ flow: advanced.flow, employeeEmail });
        setFinalReport(nextReport);
        setCurrentStep(advanced.flow.competencyOrder.length * 2);
        shouldCompleteAfterStream = true;
        fullResponseContent = `${buildTransitionMessage()}\n\nGracias por completar esta conversación guiada. Ya preparé tu resumen de desarrollo. Puedes ver tu progreso desde **Ver avance** y ver tu plan de desarrollo en **Descargar PDF**.`;

        // Asynchronously enhance report with real resources from catalog
        if (catalogLoadedRef.current) {
          void fetchAndApplyCatalogResources(advanced.flow, nextReport).then((updatedReport) => {
            if (updatedReport) setFinalReport(updatedReport);
          });
        }
      } else {
        const nextKey = advanced.flow.competencyOrder[advanced.flow.competencyIndex];
        const nextCatalogQuestion = catalogLoadedRef.current
          ? catalogQuestionsRef.current[nextKey] ?? null
          : null;

        const empathyResponse = catalogQuestion?.empathy_response?.trim() || buildTransitionMessage();

        if (nextCatalogQuestion) {
          fullResponseContent = `${empathyResponse}\n\n${formatOpenQuestion(employeeName, nextCatalogQuestion, false)}`;
        } else {
          fullResponseContent = `${buildTransitionMessage()}\n\n${formatQuestionWithOptions(employeeName, advanced.flow, false)}`;
        }

        setCurrentStep((prev) => prev + 1);
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
          setMessages((prev) => prev.map((msg) => msg.id === assistantMsgId ? { ...msg, content: partialContent } : msg));
          charIndex += 1;
          return;
        }

        clearInterval(streamInterval);
        setIsTyping(false);

        if (shouldCompleteAfterStream) {
          setIsEvaluationComplete(true);
          if (employeeEmail.trim()) {
            const assignedResources = parseRecommendedResourceTitles(nextReport);
            void syncCollaboratorAssessment({
              collaboratorEmail: employeeEmail,
              collaboratorName: employeeName,
              trainerName,
              profile: selectedProfile,
              assessmentId: currentConversationId ? String(currentConversationId) : undefined,
              assignedResources,
            }).catch(() => {
              // Ignore sync errors.
            });
          }
        }
      }, 18);
    }, 400);
  }, [assessmentFlow, employeeEmail, employeeName, selectedProfile, trainerName]);

  const startNewEvaluation = useCallback(async (profile = "") => {
    clearRuntimeState();
    if (!profile.trim()) return;

    setSelectedProfile(profile);

    // Try to load questions from the catalog AS for this role
    try {
      const roleId = toRoleId(profile);
      const catalogRows = await getCatalogCompetencies(roleId);

      if (Array.isArray(catalogRows) && catalogRows.length > 0) {
        const questionsMap: Record<string, CatalogQuestion> = {};
        const competencyOrder: string[] = [];

        for (const row of catalogRows) {
          const catalogId = String(row.competency_id || "").trim();
          const legacyKey = CATALOG_ID_TO_LEGACY_KEY[catalogId];
          if (!legacyKey || questionsMap[legacyKey]) continue; // take first row per competency
          questionsMap[legacyKey] = row;
          competencyOrder.push(legacyKey);
        }

        if (competencyOrder.length > 0) {
          catalogQuestionsRef.current = questionsMap;
          catalogLoadedRef.current = true;
          setAssessmentFlow(createAssessmentFlow(profile, competencyOrder));
          return;
        }
      }
    } catch {
      // Fall through to hardcoded flow
    }

    // Fallback: use hardcoded competency order
    catalogLoadedRef.current = false;
    catalogQuestionsRef.current = {};
    setAssessmentFlow(createAssessmentFlow(profile));
  }, [clearRuntimeState]);

  const resetChat = useCallback(() => {
    clearRuntimeState();
    try {
      localStorage.removeItem(CHAT_STORAGE_KEY);
    } catch {
      // Ignore cleanup errors.
    }
  }, [clearRuntimeState]);

  const checkSessionForEmail = useCallback(async (email: string): Promise<boolean> => {
    const hasLocal = hasLocalSessionForEmail(email);
    if (hasLocal) return true;

    const hasRemoteSession = await hasSessionByEmail(email);
    if (hasRemoteSession) return true;

    try {
      const normalizedEmail = normalizeEmail(email);
      if (!normalizedEmail) return false;

      const progress = await getCollaboratorProgress(normalizedEmail);
      return (
        (progress.assignedResources?.length || 0) > 0
        || (progress.deliverables?.length || 0) > 0
        || (progress.completionPercentage || 0) > 0
        || Boolean(progress.collaboratorName?.trim())
        || Boolean(progress.latestAssessmentId?.trim())
      );
    } catch {
      return false;
    }
  }, [hasLocalSessionForEmail]);

  const loadSessionForEmail = useCallback(async (email: string, expectedName?: string): Promise<boolean> => {
    const normalizedEmail = normalizeEmail(email);

    // Always clear any previously hydrated state (e.g. from another email in localStorage)
    // before loading the session for this specific email. This prevents cross-email contamination.
    clearRuntimeState();

    const [remoteSession, localSession, progressResult] = await Promise.all([
      fetchSessionByEmail(normalizedEmail),
      Promise.resolve(readLocalSnapshotForEmail(normalizedEmail)),
      getCollaboratorProgress(normalizedEmail).catch(() => null),
    ]);

    const validRemote = remoteSession && isResumeUsableSnapshot(remoteSession) ? remoteSession : null;
    const validLocal = localSession && isResumeUsableSnapshot(localSession) ? localSession : null;
    const hasRecoverableProgress = Boolean(
      progressResult && (
        (progressResult.assignedResources?.length || 0) > 0
        || (progressResult.deliverables?.length || 0) > 0
        || (progressResult.completionPercentage || 0) > 0
        || Boolean(progressResult.collaboratorName?.trim())
        || Boolean(progressResult.latestAssessmentId?.trim())
      )
    );

    const selected = pickPreferredSnapshot(validRemote, validLocal);
    const selectedHasReport = Boolean(String(selected?.finalReport || "").trim());
    const selectedIsComplete = Boolean(selected?.isEvaluationComplete) || selectedHasReport;
    const selectedUserMessagesCount = normalizeIncomingMessages(selected?.messages || [])
      .filter((msg) => msg.role === "user" && String(msg.content || "").trim().length > 0)
      .length;
    const selectedReportResourceKeys = new Set(
      parseRecommendedResourceTitles(String(selected?.finalReport || ""))
        .map((title) => normalizeTitleKey(title))
        .filter(Boolean)
    );
    const progressResourceKeys = new Set(
      (progressResult?.assignedResources || [])
        .map((title) => normalizeTitleKey(String(title || "")))
        .filter(Boolean)
    );
    const resourceOverlapCount = [...selectedReportResourceKeys]
      .filter((key) => progressResourceKeys.has(key))
      .length;
    const snapshotLikelyContaminated = Boolean(
      selected
      && selectedHasReport
      && selectedUserMessagesCount === 0
      && progressResourceKeys.size > 0
      && selectedReportResourceKeys.size > 0
      && resourceOverlapCount === 0
    );
    const selectedNameMismatch = Boolean(
      selected
      && String(expectedName || "").trim()
      && String(selected.employeeName || "").trim()
      && !namesLikelyReferToSamePerson(String(expectedName), String(selected.employeeName))
    );
    const progressNameMismatch = Boolean(
      progressResult
      && String(expectedName || "").trim()
      && String(progressResult.collaboratorName || "").trim()
      && !namesLikelyReferToSamePerson(String(expectedName), String(progressResult.collaboratorName))
    );

    if (!progressNameMismatch && hasRecoverableProgress && (!selected || !selectedIsComplete || snapshotLikelyContaminated || selectedNameMismatch)) {
      const progress = progressResult!;
      const report = buildRecoveredReportFromProgress({
        email: normalizedEmail,
        name: progress.collaboratorName || employeeName || "",
        assignedResources: progress.assignedResources || [],
        completionPercentage: progress.completionPercentage || 0,
        deliverables: (progress.deliverables || []).map((item) => ({
          title: item.title || "",
          summary: item.summary || "",
          submittedAt: item.submittedAt || "",
        })),
      });

      applyPersistedState({
        conversationId: Date.now(),
        messages: [{
          id: `assistant-recovered-${Date.now()}`,
          role: "assistant",
          content: "Recuperamos tu avance anterior. Puedes continuar desde Ver avance.",
        }],
        isEvaluationComplete: true,
        employeeName: progress.collaboratorName || employeeName || "",
        employeeEmail: normalizedEmail,
        trainerName: progress.trainerName || "",
        currentStep: 0,
        finalReport: report,
        followUpCount: 0,
        isInFollowUp: false,
        signals: { strengths: {}, opportunities: {} },
        updatedAt: Date.now(),
        selectedProfile: progress.profile || selectedProfile,
        assessmentFlow: null,
      });
      return true;
    }

    if (selected && isResumeUsableSnapshot(selected)) {
      if (selectedNameMismatch) {
        return false;
      }
      applyPersistedState({
        ...selected,
        employeeEmail: String(selected.employeeEmail || normalizedEmail).trim().toLowerCase(),
        employeeName: selected.employeeName || employeeName,
        updatedAt: Date.now(),
      });
      return true;
    }

    return false;
  }, [applyPersistedState, clearRuntimeState, employeeName, isResumeUsableSnapshot, pickPreferredSnapshot, readLocalSnapshotForEmail, selectedProfile]);

  const recoverSessionFromProgress = useCallback(async (email: string, fallbackName?: string): Promise<boolean> => {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return false;

    try {
      const progress = await getCollaboratorProgress(normalizedEmail);
      const hasAnyProgress =
        (progress.assignedResources?.length || 0) > 0
        || (progress.deliverables?.length || 0) > 0
        || (progress.completionPercentage || 0) > 0
        || Boolean(progress.collaboratorName?.trim())
        || Boolean(progress.latestAssessmentId?.trim());
      if (!hasAnyProgress) return false;

      const report = buildRecoveredReportFromProgress({
        email: normalizedEmail,
        name: progress.collaboratorName || fallbackName || "",
        assignedResources: progress.assignedResources || [],
        completionPercentage: progress.completionPercentage || 0,
        deliverables: (progress.deliverables || []).map((item) => ({
          title: item.title || "",
          summary: item.summary || "",
          submittedAt: item.submittedAt || "",
        })),
      });

      applyPersistedState({
        conversationId: Date.now(),
        messages: [{
          id: `assistant-recovered-${Date.now()}`,
          role: "assistant",
          content: "Recuperamos tu avance anterior. Puedes continuar desde Ver avance.",
        }],
        isEvaluationComplete: true,
        employeeName: progress.collaboratorName || fallbackName || "",
        employeeEmail: normalizedEmail,
        trainerName: progress.trainerName || "",
        currentStep: 0,
        finalReport: report,
        followUpCount: 0,
        isInFollowUp: false,
        signals: { strengths: {}, opportunities: {} },
        updatedAt: Date.now(),
        selectedProfile: progress.profile || "",
        assessmentFlow: null,
      });

      return true;
    } catch {
      return false;
    }
  }, [applyPersistedState]);

  return {
    conversationId,
    setConversationId,
    messages,
    isTyping,
    sendMessage,
    isEvaluationComplete,
    startNewEvaluation,
    resetChat,
    employeeName,
    setEmployeeName,
    employeeEmail,
    setEmployeeEmail,
    trainerName,
    setTrainerName,
    finalReport,
    checkSessionForEmail,
    loadSessionForEmail,
    forceResumeLatestLocalSession,
    recoverSessionFromProgress,
  };
}
