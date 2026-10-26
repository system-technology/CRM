import { redirect } from 'next/navigation';

/**
 * Ruta provisional previa (0c.23) redirigida permanentemente a la ruta canónica
 * fijada por el ADR-0011: /ingresar (0c.29).
 */
export default function IniciarSesionPage() {
  redirect('/ingresar');
}
