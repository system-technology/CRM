/**
 * Lógica pura de validación y cálculo para el módulo de Configuración de Agencia.
 *
 * Cero dependencias de UI, testeable 100% en Vitest.
 */

import type { ConfiguracionWaba, EtapaConfigurada, MiembroEquipo } from './mock-configuracion';

/**
 * Valida los parámetros del SLA de primera respuesta.
 *
 * Invariante:
 * - El tiempo máximo debe ser mayor a 0 y menor o igual a 1440 minutos (24 horas).
 * - La alerta preventiva debe ser mayor a 0 y estrictamente menor al tiempo máximo.
 */
export function validarSla(
  tiempoMaximoMin: number,
  alertaPreventivaMin: number,
): { valido: boolean; error?: string } {
  if (isNaN(tiempoMaximoMin) || tiempoMaximoMin <= 0) {
    return { valido: false, error: 'El tiempo máximo debe ser mayor a 0 minutos' };
  }
  if (tiempoMaximoMin > 1440) {
    return { valido: false, error: 'El tiempo máximo no puede superar las 24 horas (1440 min)' };
  }
  if (isNaN(alertaPreventivaMin) || alertaPreventivaMin <= 0) {
    return { valido: false, error: 'La alerta preventiva debe ser mayor a 0 minutos' };
  }
  if (alertaPreventivaMin >= tiempoMaximoMin) {
    return {
      valido: false,
      error: 'La alerta preventiva debe ser menor al tiempo máximo de respuesta',
    };
  }
  return { valido: true };
}

/**
 * Valida la regla de invariante de gobierno:
 * Debe existir siempre al menos un usuario activo con rol DUENO en la agencia.
 */
export function validarReglaDuenoActivo(miembros: MiembroEquipo[]): {
  valido: boolean;
  cantidadDuenos: number;
  error?: string;
} {
  const duenosActivos = miembros.filter((m) => m.rol === 'DUENO' && m.estado === 'ACTIVO');
  if (duenosActivos.length === 0) {
    return {
      valido: false,
      cantidadDuenos: 0,
      error: 'Invariante de seguridad: Debe existir al menos un usuario activo con rol DUEÑO',
    };
  }
  return { valido: true, cantidadDuenos: duenosActivos.length };
}

/**
 * Evalúa el estado integral de salud de la conexión de WhatsApp Cloud API.
 */
export function verificarSaludConexion(waba: ConfiguracionWaba): {
  estado: 'OPTIMO' | 'ATENCION' | 'CRITICO';
  mensaje: string;
} {
  if (waba.estado === 'DESCONECTADO' || !waba.webhookActivo) {
    return {
      estado: 'CRITICO',
      mensaje: 'Canal desconectado o webhook inactivo. Los mensajes entrantes no se recibirán.',
    };
  }
  if (waba.calidad === 'RED' || waba.estado === 'DEGRADADO') {
    return {
      estado: 'ATENCION',
      mensaje: 'Calidad de número degradada por Meta. Riesgo de bloqueo temporal en envíos HSM.',
    };
  }
  if (waba.calidad === 'YELLOW') {
    return {
      estado: 'ATENCION',
      mensaje: 'Calidad de número en advertencia. Monitoree las tasas de bloqueo por spam.',
    };
  }
  return {
    estado: 'OPTIMO',
    mensaje: 'Conexión con Meta Cloud API saludable y webhook operativo.',
  };
}

/**
 * Valida el formato de NIT colombiano (con o sin puntos, con guion y dígito de verificación).
 */
export function validarFormatoNit(nit: string): boolean {
  const limpio = nit.trim();
  // Formato con puntos y guion: 901.482.910-3
  const formatoConPuntos = /^\d{3}\.\d{3}\.\d{3}-\d$/;
  // Formato sin puntos pero con guion: 901482910-3
  const formatoSinPuntos = /^\d{9}-\d$/;
  // Formato solo números 9 o 10 dígitos
  const formatoPlano = /^\d{9,10}$/;

  return (
    formatoConPuntos.test(limpio) || formatoSinPuntos.test(limpio) || formatoPlano.test(limpio)
  );
}

/**
 * Calcula el promedio de avance/probabilidad configurado en las etapas del pipeline comercial.
 */
export function calcularProbabilidadPromedio(etapas: EtapaConfigurada[]): number {
  if (etapas.length === 0) return 0;
  const suma = etapas.reduce((acc, e) => acc + e.probabilidad, 0);
  return Math.round(suma / etapas.length);
}
