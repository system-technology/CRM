import { MarcoDeTrabajo } from '../../components/comun/marco-de-trabajo';

/**
 * Grupo `(app)`: pantallas privadas con marco (ADR-0032). La sesión la exige `GuardaSesion` en el
 * layout raíz, que deniega por defecto: este grupo no decide quién entra, solo pinta el marco.
 */
export default function LayoutDeLaAplicacion({ children }: { children: React.ReactNode }) {
  return <MarcoDeTrabajo>{children}</MarcoDeTrabajo>;
}
