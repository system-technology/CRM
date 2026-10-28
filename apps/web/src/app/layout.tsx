import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { headers } from 'next/headers';
import './globals.css';
import { BannerConsentimientoCookies } from '../components/privacidad/banner-consentimiento-cookies';
import { PieDePaginaPrivacidad } from '../components/privacidad/pie-de-pagina-privacidad';
import { AvisoSinConexion } from '../components/comun/aviso-sin-conexion';
import { SCRIPT_ANTI_FOUC } from '../lib/tema-y-densidad';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

// Sin renderizado dinamico las paginas se prerenderizan y no reciben el nonce de la CSP (T-069).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'ViajaPro',
  description: 'CRM para agencias de turismo. Convierte conversaciones en viajes reales.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let nonce: string | undefined = undefined;
  try {
    const h = await headers();
    nonce = h.get('x-nonce') ?? undefined;
  } catch {
    // Entorno sin contexto de petición
  }

  return (
    <html lang="es-CO" className={inter.variable} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: SCRIPT_ANTI_FOUC }} />
      </head>
      <body className="flex min-h-screen flex-col">
        <AvisoSinConexion />
        <div className="flex-1">{children}</div>
        <PieDePaginaPrivacidad />
        <BannerConsentimientoCookies />
      </body>
    </html>
  );
}
