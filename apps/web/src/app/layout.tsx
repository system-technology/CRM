import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { BannerConsentimientoCookies } from '../components/privacidad/banner-consentimiento-cookies';
import { PieDePaginaPrivacidad } from '../components/privacidad/pie-de-pagina-privacidad';
import { AvisoSinConexion } from '../components/comun/aviso-sin-conexion';

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
      <body className="flex min-h-screen flex-col">
        <AvisoSinConexion />
        <div className="flex-1">{children}</div>
        <PieDePaginaPrivacidad />
        <BannerConsentimientoCookies />
      </body>
    </html>
  );
}
