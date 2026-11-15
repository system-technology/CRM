import { redirect } from 'next/navigation';
import { destinoIngresoDesdeAlias } from '../../lib/redirigir-a-ingreso';

/**
 * Alias habitual (/login), redirigido a la ruta canónica fijada por el ADR-0011:
 * /ingresar (0c.29). Conserva la consulta (H-4, T-174).
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(destinoIngresoDesdeAlias(await searchParams));
}
