import { jsPDF } from "jspdf";

interface Competency {
  name: string;
  description: string;
}

interface Recommendation {
  name: string;
  type: string;
  why: string;
  url: string;
}

interface ParsedReport {
  fortalezas: Competency[];
  desarrollar: Competency[];
  recommendations: Recommendation[];
}

const DEFAULT_STRENGTHS: Competency[] = [
  {
    name: "Compromiso con tu desarrollo",
    description: "Mantienes seguimiento activo de tu ruta de aprendizaje y continuidad en tu proceso.",
  },
  {
    name: "Persistencia",
    description: "Sostienes el avance y registras evidencia para fortalecer tu crecimiento profesional.",
  },
  {
    name: "Orientación a resultados",
    description: "Buscas aplicar lo aprendido en acciones concretas dentro de tu trabajo.",
  },
];

const DEFAULT_OPPORTUNITIES: Competency[] = [
  {
    name: "Comunicación estratégica",
    description: "Aterrizar mejor aprendizajes y resultados para compartirlos con claridad.",
  },
  {
    name: "Priorización y foco",
    description: "Definir bloques semanales para cerrar recursos pendientes con consistencia.",
  },
  {
    name: "Aplicación práctica",
    description: "Traducir aprendizajes en acciones medibles que impacten tus proyectos.",
  },
];

const PDF_FALLBACK_RECOMMENDATIONS: Recommendation[] = [
  {
    name: "Improving Communication Skills",
    type: "Curso en Coursera · opción gratuita",
    why: "Refuerza comunicación clara, escucha y conversaciones difíciles con enfoque práctico.",
    url: "https://www.coursera.org/learn/wharton-communication-skills",
  },
  {
    name: "Work Smarter, Not Harder: Time Management",
    type: "Curso en Coursera · opción gratuita",
    why: "Ayuda a priorizar mejor y sostener foco en semanas con alta carga de trabajo.",
    url: "https://www.coursera.org/learn/work-smarter-not-harder",
  },
  {
    name: "How to speak so that people want to listen",
    type: "Video en YouTube (TED) · gratis",
    why: "Aporta técnicas concretas para comunicarte mejor en contextos profesionales.",
    url: "https://www.youtube.com/watch?v=eIho2S0ZahI",
  },
  {
    name: "Fundamentals of Project Management",
    type: "Alison · curso gratuito",
    why: "Fortalece planificación y seguimiento orientado a resultados medibles.",
    url: "https://alison.com/course/fundamentals-of-project-management-revised-2017",
  },
  {
    name: "Introduction to Management Analysis and Strategies",
    type: "Alison · curso gratuito",
    why: "Fortalece liderazgo, organización y seguimiento para ejecutar mejor planes de desarrollo.",
    url: "https://alison.com/course/introduction-to-management-analysis-and-strategies",
  },
];

const INTERNAL_WORKSHOP_URL = "https://ptltr.github.io/portal-uix/#talleres-uix";

const PDF_INTERNAL_WORKSHOP_RECOMMENDATIONS: Recommendation[] = [
  {
    name: "Taller interno UIX: Comunicación efectiva y conversaciones difíciles",
    type: "Taller UIX · interno",
    why: "Te ayuda a estructurar conversaciones difíciles con claridad, empatía y acuerdos concretos.",
    url: INTERNAL_WORKSHOP_URL,
  },
  {
    name: "Taller interno UIX: Priorización y gestión del tiempo",
    type: "Taller UIX · interno",
    why: "Refuerza priorización, foco y seguimiento para sostener avances en semanas de alta carga.",
    url: INTERNAL_WORKSHOP_URL,
  },
];

const normalizeTitle = (value: string): string => {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
};

const getInternalWorkshopBenefitByTitle = (title: string): string => {
  const normalized = normalizeTitle(title);

  if (normalized.includes("comunicacion")) {
    return "Te ayudará a comunicar ideas con mayor claridad, mejorar conversaciones difíciles y alinear mejor expectativas con tu equipo.";
  }

  if (normalized.includes("trabajo en equipo")) {
    return "Te ayudará a fortalecer colaboración, coordinación entre roles y confianza para avanzar en objetivos compartidos.";
  }

  if (normalized.includes("tiempo") || normalized.includes("administracion")) {
    return "Te ayudará a priorizar mejor, organizar tu carga de trabajo y sostener foco en tareas de mayor impacto.";
  }

  if (normalized.includes("liderazgo") || normalized.includes("management")) {
    return "Te ayudará a reforzar liderazgo práctico, delegación y seguimiento de resultados con mayor claridad.";
  }

  return "Te ayudará a reforzar tus áreas de oportunidad con herramientas prácticas aplicables en tu rol.";
};

const EXTERNAL_RECOMMENDATION_BY_TITLE: Record<string, Recommendation> = {
  [normalizeTitle("Improving Communication Skills")]: {
    name: "Improving Communication Skills",
    type: "Curso en Coursera · opción gratuita",
    why: "Refuerza comunicación clara, escucha y conversaciones difíciles con enfoque práctico.",
    url: "https://www.coursera.org/learn/wharton-communication-skills",
  },
  [normalizeTitle("Work Smarter, Not Harder: Time Management")]: {
    name: "Work Smarter, Not Harder: Time Management",
    type: "Curso en Coursera · opción gratuita",
    why: "Ayuda a priorizar mejor y sostener foco en semanas con alta carga de trabajo.",
    url: "https://www.coursera.org/learn/work-smarter-not-harder",
  },
  [normalizeTitle("How to speak so that people want to listen")]: {
    name: "How to speak so that people want to listen",
    type: "Video en YouTube (TED) · gratis",
    why: "Aporta técnicas concretas para comunicarte mejor en contextos profesionales.",
    url: "https://www.youtube.com/watch?v=eIho2S0ZahI",
  },
  [normalizeTitle("Negotiation Skills")]: {
    name: "Negotiation Skills",
    type: "Curso en Coursera · opción gratuita",
    why: "Fortalece negociación y manejo de desacuerdos con stakeholders y equipo.",
    url: "https://www.coursera.org/learn/negotiation-skills",
  },
  [normalizeTitle("Creative Thinking: Techniques and Tools for Success")]: {
    name: "Creative Thinking: Techniques and Tools for Success",
    type: "Curso en Coursera · opción gratuita",
    why: "Ofrece métodos concretos para generar ideas y convertirlas en acciones de valor.",
    url: "https://www.coursera.org/learn/creative-thinking-techniques-and-tools-for-success",
  },
  [normalizeTitle("Fundamentals of Project Management")]: {
    name: "Fundamentals of Project Management",
    type: "Alison · curso gratuito",
    why: "Fortalece planificación y seguimiento orientado a resultados medibles.",
    url: "https://alison.com/course/fundamentals-of-project-management-revised-2017",
  },
  [normalizeTitle("Google Project Management Certificate")]: {
    name: "Google Project Management Certificate",
    type: "Curso de Google en Coursera · opción gratuita",
    why: "Te ayuda a estructurar mejor aprendizaje, planificación y ejecución.",
    url: "https://www.coursera.org/professional-certificates/google-project-management",
  },
  [normalizeTitle("Google Data Analytics Certificate")]: {
    name: "Google Data Analytics Certificate",
    type: "Curso de Google en Coursera · opción gratuita",
    why: "Fortalece decisiones orientadas a resultados con uso práctico de datos.",
    url: "https://www.coursera.org/professional-certificates/google-data-analytics",
  },
  [normalizeTitle("Introduction to Management Analysis and Strategies")]: {
    name: "Introduction to Management Analysis and Strategies",
    type: "Alison · curso gratuito",
    why: "Refuerza liderazgo y coordinación para ejecutar planes de desarrollo.",
    url: "https://alison.com/course/introduction-to-management-analysis-and-strategies",
  },
  [normalizeTitle("Teamwork Skills: Communicating Effectively in Groups")]: {
    name: "Teamwork Skills: Communicating Effectively in Groups",
    type: "Curso en Coursera · opción gratuita",
    why: "Impulsa colaboración efectiva y comunicación en grupos de trabajo.",
    url: "https://www.coursera.org/learn/teamwork-skills-effective-communication",
  },
};

function sanitizeRecommendations(items: Recommendation[]): Recommendation[] {
  return items.map((item, index) => {
    const titleKey = normalizeTitle(item.name || "");
    const mapped = EXTERNAL_RECOMMENDATION_BY_TITLE[titleKey];
    const urlRaw = String(item.url || "").trim();
    const looksInternal = /internamente|capital humano/i.test(urlRaw);
    const isInternalWorkshop = /taller\s+interno/i.test(item.name || "");
    const hasExternalUrl = /^https?:\/\//i.test(urlRaw);

    if (isInternalWorkshop) {
      return {
        name: item.name || "Taller interno UIX",
        type: item.type || "Taller UIX · gratuito",
        why: item.why || getInternalWorkshopBenefitByTitle(item.name || ""),
        url: INTERNAL_WORKSHOP_URL,
      };
    }

    if (mapped) {
      return {
        name: item.name || mapped.name,
        type: item.type || mapped.type,
        why: item.why || mapped.why,
        url: mapped.url,
      };
    }

    if (hasExternalUrl) {
      // Keep direct links and normalize known resources to canonical URLs.
      if (mapped) {
        return {
          name: item.name || mapped.name,
          type: item.type || mapped.type,
          why: item.why || mapped.why,
          url: mapped.url,
        };
      }
      return item;
    }

    if (looksInternal || !urlRaw) {
      const fallback = PDF_FALLBACK_RECOMMENDATIONS[index % PDF_FALLBACK_RECOMMENDATIONS.length];
      const searchUrl = item.name
        ? `https://www.google.com/search?q=${encodeURIComponent(item.name)}`
        : fallback.url;

      return {
        name: item.name || fallback.name,
        type: item.type || fallback.type,
        why: item.why || fallback.why,
        url: searchUrl,
      };
    }

    return item;
  });
}

function ensureFiveRecommendations(items: Recommendation[]): Recommendation[] {
  const seen = new Set<string>();
  const merged: Recommendation[] = [];

  const add = (item: Recommendation) => {
    const key = `${item.name}|${item.url}`.trim();
    if (!item.name.trim() || seen.has(key)) return;
    seen.add(key);
    merged.push(item);
  };

  // Always include internal workshops in final PDF recommendations.
  for (const item of PDF_INTERNAL_WORKSHOP_RECOMMENDATIONS) add(item);
  for (const item of items) add(item);
  for (const item of PDF_FALLBACK_RECOMMENDATIONS) {
    if (merged.length >= 5) break;
    add(item);
  }

  return merged.slice(0, 5);
}

// jsPDF standard fonts don't support emoji — strip them out
function stripEmoji(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/[•●]/g, "-")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanMarkdown(text: string): string {
  return stripEmoji(text)
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/^[-–]\s*/gm, "")
    .trim();
}

function parseCompetencies(block: string): Competency[] {
  const items: Competency[] = [];
  const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const m = line.match(/(?:[•\-]\s*)?\*\*([^*]+)\*\*[:\s]+(.+)/);
    if (m) {
      items.push({
        name: cleanMarkdown(m[1]),
        description: cleanMarkdown(m[2]),
      });
    } else {
      const plainMatch = line.match(/(?:[•\-]\s*)?([^:]+):\s+(.+)/);
      if (plainMatch) {
        items.push({
          name: cleanMarkdown(plainMatch[1]),
          description: cleanMarkdown(plainMatch[2]),
        });
      }
    }
  }
  return items;
}

function parseReport(content: string): ParsedReport {
  const fortalezasMatch = content.match(/(?:✨\s*)?(Tus fortalezas|Fortalezas clave|Fortalezas)\s*([\s\S]*?)(?=###|---)/i);
  const fortalezas = fortalezasMatch ? parseCompetencies(fortalezasMatch[2]) : [];

  const desarrollarMatch = content.match(/(?:🌱\s*)?(Lo que más puedes potenciar|Lo que puedes potenciar|Areas de oportunidad|Áreas de oportunidad)\s*([\s\S]*?)(?=###|---)/i);
  const desarrollar = desarrollarMatch ? parseCompetencies(desarrollarMatch[2]) : [];

  // Recommendations: match only the numbered blocks
  const recommendations: Recommendation[] = [];
  const recRegex = /\*\*\d+\.\s([^\n*]+)\*\*([\s\S]*?)(?=\*\*\d+\.|---(?!-))/g;
  let recMatch;
  while ((recMatch = recRegex.exec(content)) !== null && recommendations.length < 5) {
    const block = recMatch[0];
    const nameMatch = block.match(/\*\*\d+\.\s([^\n*]+)\*\*/);
    const typeMatch = block.match(/\*\*Tipo[^:]*:\*\*\s*([^\n]+)/i);
    const whyMatch = block.match(/\*\*Por qué[^:]*:\*\*\s*([^\n]+)/i);
    const urlMatch = block.match(/\*\*Recurso[^:]*:\*\*\s*([^\n]+)/i);
    const rawUrl = urlMatch ? urlMatch[1].replace(/[*[\]()]/g, "").trim() : "";

    recommendations.push({
      name: nameMatch ? cleanMarkdown(nameMatch[1]) : `Recurso ${recommendations.length + 1}`,
      type: typeMatch ? cleanMarkdown(typeMatch[1]) : "",
      why: whyMatch ? cleanMarkdown(whyMatch[1]) : "",
      url: rawUrl,
    });
  }

  return {
    fortalezas: fortalezas.length ? fortalezas : DEFAULT_STRENGTHS,
    desarrollar: desarrollar.length ? desarrollar : DEFAULT_OPPORTUNITIES,
    recommendations,
  };
}

export function generatePDF(content: string, profile: string, date: string) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const parsed = parseReport(content);
  parsed.recommendations = ensureFiveRecommendations(sanitizeRecommendations(parsed.recommendations));

  const W = 210;
  const margin = 18;
  const contentW = W - margin * 2;
  let y = 0;

  // ── HEADER ────────────────────────────────────────────────────
  doc.setFillColor(13, 2, 32);
  doc.rect(0, 0, W, 44, "F");
  doc.setFillColor(74, 222, 128);
  doc.rect(0, 42, W, 2, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.text("UIX", margin, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(180, 160, 220);
  doc.text("Asistente UiX", margin, 26);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text("Plan de Crecimiento Personal", W - margin, 18, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(180, 160, 220);
  doc.text(date, W - margin, 26, { align: "right" });

  y = 52;

  // ── PROFILE BADGE ─────────────────────────────────────────────
  doc.setFillColor(30, 12, 60);
  doc.roundedRect(margin, y, contentW, 11, 3, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(180, 140, 240);
  doc.text(stripEmoji(profile), margin + 5, y + 7.5);
  y += 17;

  // ── COMPETENCY COLUMNS ────────────────────────────────────────
  const colW = (contentW - 5) / 2;
  const colRightX = margin + colW + 5;

  function renderCompetencyCol(
    title: string,
    items: Competency[],
    x: number,
    startY: number,
    accentRgb: [number, number, number],
    bgRgb: [number, number, number]
  ): number {
    // Header
    doc.setFillColor(...accentRgb);
    doc.roundedRect(x, startY, colW, 8, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text(title, x + 3, startY + 5.5);

    let innerY = startY + 11;

    if (items.length === 0) {
      doc.setFillColor(...bgRgb);
      doc.roundedRect(x, innerY, colW, 10, 2, 2, "F");
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7.5);
      doc.setTextColor(120, 100, 150);
      doc.text("Sin datos suficientes.", x + 3, innerY + 6);
      return innerY + 14;
    }

    for (const item of items) {
      doc.setFontSize(8);
      const nameLines = doc.splitTextToSize(`- ${item.name}`, colW - 6);
      doc.setFontSize(7);
      const descLines = item.description
        ? doc.splitTextToSize(item.description, colW - 6)
        : [];
      const blockH = nameLines.length * 4.5 + descLines.length * 3.8 + 7;

      doc.setFillColor(...bgRgb);
      doc.roundedRect(x, innerY, colW, blockH, 2, 2, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...accentRgb);
      doc.text(nameLines, x + 3, innerY + 4.5);

      if (descLines.length > 0) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(55, 35, 85);
        doc.text(descLines, x + 3, innerY + 4.5 + nameLines.length * 4.5);
      }

      innerY += blockH + 3;
    }
    return innerY;
  }

  const safeFortalezas = parsed.fortalezas.filter((item) => Boolean((item.name || "").trim()));
  const safeDesarrollar = parsed.desarrollar.filter((item) => Boolean((item.name || "").trim()));

  const leftBottom = renderCompetencyCol(
    "Tus fortalezas", safeFortalezas.length ? safeFortalezas : DEFAULT_STRENGTHS,
    margin, y, [123, 63, 217], [245, 240, 255]
  );
  const rightBottom = renderCompetencyCol(
    "Lo que puedes potenciar", safeDesarrollar.length ? safeDesarrollar : DEFAULT_OPPORTUNITIES,
    colRightX, y, [22, 163, 74], [240, 255, 248]
  );

  y = Math.max(leftBottom, rightBottom) + 8;

  // ── DIVIDER ───────────────────────────────────────────────────
  doc.setDrawColor(210, 200, 235);
  doc.setLineWidth(0.3);
  doc.line(margin, y - 4, W - margin, y - 4);

  // ── RESOURCES SECTION ─────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(13, 2, 32);
  doc.text("Tus 5 recursos de desarrollo", margin, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(80, 60, 110);
  const introText = "Seleccionados especialmente para ti, para potenciar tu crecimiento en UIX.";
  const introLines = doc.splitTextToSize(introText, contentW);
  doc.text(introLines, margin, y);
  y += introLines.length * 4.5 + 5;

  // ── RECOMMENDATION CARDS ─────────────────────────────────────
  const cardColors: Array<{ bg: [number, number, number]; accent: [number, number, number] }> = [
    { bg: [245, 240, 255], accent: [123, 63, 217] },
    { bg: [240, 255, 248], accent: [22, 163, 74] },
    { bg: [245, 240, 255], accent: [123, 63, 217] },
  ];

  for (let i = 0; i < parsed.recommendations.length; i++) {
    const rec = parsed.recommendations[i];
    const col = cardColors[i % cardColors.length];

    doc.setFontSize(8);
    const whyLines = doc.splitTextToSize(rec.why || "—", contentW - 18);
    const urlRaw = rec.url || "";
    const isInternal =
      urlRaw.toLowerCase().includes("internamente") ||
      (!urlRaw.startsWith("http") && urlRaw !== "");
    const urlDisplay = isInternal
      ? "Disponible internamente en UIX. Consulta con el Área de Capital Humano para más información."
      : urlRaw.length > 60
      ? urlRaw.slice(0, 57) + "..."
      : urlRaw;
    const cardH = 8 + whyLines.length * 4.5 + (rec.type ? 6 : 0) + (urlDisplay ? 7 : 0) + 8;

    // Page break if needed
    if (y + cardH > 278) {
      doc.addPage();
      y = 18;
    }

    // Card bg
    doc.setFillColor(...col.bg);
    doc.roundedRect(margin, y, contentW, cardH, 3, 3, "F");
    // Left bar
    doc.setFillColor(...col.accent);
    doc.roundedRect(margin, y, 3, cardH, 1.5, 1.5, "F");

    const cx = margin + 8;

    // Number circle
    doc.setFillColor(...col.accent);
    doc.circle(cx, y + 5.5, 3.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text(String(i + 1), cx, y + 7, { align: "center" });

    // Resource name
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(20, 5, 50);
    const recName = rec.name || `Recurso ${i + 1}`;
    const nameLines = doc.splitTextToSize(recName, contentW - 20);
    doc.text(nameLines, cx + 6, y + 7);

    let innerY = y + 7 + nameLines.length * 5;

    // Type
    if (rec.type) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...col.accent);
      doc.text(rec.type, cx + 6, innerY);
      innerY += 5.5;
    }

    // Why
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(50, 30, 80);
    doc.text(whyLines, cx + 6, innerY);
    innerY += whyLines.length * 4.5 + 2;

    // URL
    if (urlDisplay) {
      if (isInternal) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7.5);
        doc.setTextColor(100, 70, 150);
        doc.text(urlDisplay, cx + 6, innerY);
      } else if (urlRaw.startsWith("http")) {
        doc.setFontSize(7.5);
        doc.setTextColor(...col.accent);
        doc.textWithLink(urlDisplay, cx + 6, innerY, { url: urlRaw });
      }
    }

    y += cardH + 5;
  }

  // ── FOOTER ───────────────────────────────────────────────────
  const footerY = 288;
  if (y < footerY - 4) {
    doc.setFillColor(13, 2, 32);
    doc.rect(0, footerY - 4, W, 13, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(150, 130, 200);
    doc.text("UIX · Plan de Desarrollo Profesional · Confidencial", margin, footerY + 3);
    doc.text(date, W - margin, footerY + 3, { align: "right" });
  }

  doc.save(`UIX_Plan_Desarrollo_${date.replace(/\s/g, "_")}.pdf`);
}
