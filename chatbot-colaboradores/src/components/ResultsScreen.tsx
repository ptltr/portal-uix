import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, CheckCircle2, Sparkles, ExternalLink, Download } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage } from '@/hooks/use-chat';
import { generatePDF } from '@/lib/generatePDF';

interface ResultsScreenProps {
  messages: ChatMessage[];
  onRestart: () => void;
  profile: string;
  level: string;
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

export function ResultsScreen({ messages, onRestart, profile }: ResultsScreenProps) {
  const content = extractReportContent(messages);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownload = async () => {
    setIsGenerating(true);
    try {
      const date = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
      generatePDF(content, profile, date);
    } finally {
      setIsGenerating(false);
    }
  };

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

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="flex flex-col sm:flex-row gap-3 justify-center pb-6"
        >
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
