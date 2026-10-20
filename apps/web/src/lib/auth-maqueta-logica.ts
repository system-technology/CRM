import { z } from 'zod';

/**
 * Esquema local mínimo para la maqueta de inicio de sesión (0c.23).
 *
 * TODO: sustituir por el contrato de identity cuando exista (ADR-0011).
 * La API real de autenticación no existe hoy; no se crean tokens ni sesiones reales.
 */
export const EsquemaIniciarSesionLocal = z.object({
  correo: z
    .string()
    .trim()
    .min(1, 'El correo electrónico es obligatorio')
    .email('Ingresa un correo electrónico válido'),
  contrasena: z
    .string()
    .min(1, 'La contraseña es obligatoria')
    .min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

export type IniciarSesionLocal = z.infer<typeof EsquemaIniciarSesionLocal>;

export interface ResultadoSimulacionAuth {
  exito: boolean;
  mensaje?: string;
}

/**
 * Evalúa si el interruptor de la maqueta de autenticación está encendido.
 * Por defecto está apagado: apagado = redirige a /bandeja.
 */
export function estaAuthMaquetaHabilitada(envValue?: string): boolean {
  return envValue === 'true' || envValue === '1';
}

/**
 * Valida localmente el formulario antes de simular el envío.
 */
export function validarCredencialesLocales(datos: unknown): {
  valido: boolean;
  errores?: Record<string, string>;
  datos?: IniciarSesionLocal;
} {
  const resultado = EsquemaIniciarSesionLocal.safeParse(datos);
  if (!resultado.success) {
    const errores: Record<string, string> = {};
    for (const issue of resultado.error.issues) {
      const campo = issue.path[0]?.toString() || 'general';
      if (!errores[campo]) {
        errores[campo] = issue.message;
      }
    }
    return { valido: false, errores };
  }
  return { valido: true, datos: resultado.data };
}

/**
 * Simulación de verificación de credenciales para la maqueta.
 * Permite probar estados de carga y error sin backend ni persistencia.
 */
export async function simularInicioSesion(
  credenciales: IniciarSesionLocal,
  demoraMs = 600,
): Promise<ResultadoSimulacionAuth> {
  if (demoraMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, demoraMs));
  }

  // Casos simulados de error para pruebas de UI y manuales
  if (
    credenciales.correo.toLowerCase().includes('error@') ||
    credenciales.contrasena === 'incorrecta' ||
    credenciales.contrasena === 'error123'
  ) {
    return {
      exito: false,
      mensaje:
        'Credenciales no reconocidas. Verifica tu correo y contraseña o contacta al administrador de tu agencia.',
    };
  }

  return { exito: true };
}
