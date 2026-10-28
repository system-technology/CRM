import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

// Sin renderizado dinamico las paginas se prerenderizan y no reciben el nonce de la CSP (T-069).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'ViajaPro',
  description: 'CRM para agencias de turismo. Convierte conversaciones en viajes reales.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CO" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
