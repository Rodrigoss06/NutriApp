import type { ReactNode } from 'react';

/** Un texto de consentimiento: párrafos y negritas (**…**). Se arma con React, nunca con HTML del servidor. */
export function ConsentText({ markdown }: { markdown: string }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      {markdown
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .map((paragraph, index) => (
          <p key={`${String(index)}-${paragraph.slice(0, 12)}`}>{withBold(paragraph)}</p>
        ))}
    </div>
  );
}

function withBold(text: string): ReactNode[] {
  return text
    .split(/\*\*(.+?)\*\*/g)
    .map((part, index) =>
      index % 2 === 1 ? <strong key={`${String(index)}-b`}>{part}</strong> : part,
    );
}
