import type { Metadata } from 'next';
import { MarcoDeTrabajo } from '../../components/comun/marco-de-trabajo';

/**
 * Grupo `(app)`: pantallas privadas con marco (ADR-0032). La sesión la exige `GuardaSesion` en el
 * layout raíz, que deniega por defecto: este grupo no decide quién entra, solo pinta el marco.
 */
/**
 * Sin título de `metadata` aquí: el del layout raíz es fijo («ViajaPro») y, con dos `<title>`, el
 * navegador usa el primero. El título de cada pantalla lo pinta `MarcoDeTrabajo` desde la tabla.
 */
export const metadata: Metadata = { title: null };

export default function LayoutDeLaAplicacion({ children }: { children: React.ReactNode }) {
  return <MarcoDeTrabajo>{children}</MarcoDeTrabajo>;
}
