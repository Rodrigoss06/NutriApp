import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import { QueryProvider } from '@/features/query/query-provider';
import './globals.css';

// Inter autoalojada por next/font: sin pedidos a Google en ejecución. El subconjunto latin trae tildes, ñ, ¿ y ¡.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'NutriCoach', template: '%s · NutriCoach' },
  description: 'Plataforma para nutricionistas y entrenadores.',
};

export const viewport: Viewport = {
  themeColor: '#0f766e',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es-PE" className={inter.variable}>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
