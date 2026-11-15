import { redirect } from 'next/navigation';
import { destinoIngresoDesdeAlias } from '../../lib/redirigir-a-ingreso';

/**
 * Ruta provisional previa (0c.23) redirigida a la ruta canónica fijada por el ADR-0011:
 * /ingresar (0c.29). Conserva la consulta (H-4, T-174).
 */
export default async function IniciarSesionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(destinoIngresoDesdeAlias(await searchParams));
}
