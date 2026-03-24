import React from 'react';

export function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-4 py-3 glass-card rounded-2xl rounded-tl-sm border border-white/8 w-fit">
      <div className="w-2 h-2 rounded-full bg-primary typing-dot" />
      <div className="w-2 h-2 rounded-full bg-gradient-to-r from-primary to-secondary typing-dot" />
      <div className="w-2 h-2 rounded-full bg-secondary typing-dot" />
    </div>
  );
}
