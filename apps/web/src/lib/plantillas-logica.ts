import { EnviarPlantilla } from '@viajapro/contracts';

/**
 * Reemplaza los marcadores {{1}}, {{2}}... en el cuerpo de una plantilla Meta HSM
 * con los valores provistos por el asesor.
 */
export function interpolarPlantilla(cuerpo: string, valores: string[]): string {
  let resultado = cuerpo;
  valores.forEach((val, idx) => {
    const marcador = new RegExp(`\\{\\{${idx + 1}\\}\\}`, 'g');
    resultado = resultado.replace(marcador, val || `{{${idx + 1}}}`);
  });
  return resultado;
}

export interface EstadoVentanaServicio {
  cerrada: boolean;
  esUrgente: boolean; // Menos de 2 horas (120 min) restantes
  minutosRestantes: number;
  horasRestantes: number;
  texto: string;
}

/**
 * Calcula con precisión el estado de la ventana de servicio de 24h de Meta.
 * Identifica si está cerrada o si es urgente (menos de 2 horas restantes, tiempo crítico para el asesor).
 */
export function calcularEstadoVentana(expiraEn: string | null): EstadoVentanaServicio {
  if (!expiraEn) {
    return {
      cerrada: true,
      esUrgente: false,
      minutosRestantes: 0,
      horasRestantes: 0,
      texto: 'Ventana cerrada',
    };
  }

  const difMs = new Date(expiraEn).getTime() - Date.now();
  if (difMs <= 0) {
    return {
      cerrada: true,
      esUrgente: false,
      minutosRestantes: 0,
      horasRestantes: 0,
      texto: 'Ventana cerrada',
    };
  }

  const totalMinutos = Math.floor(difMs / 60000);
  const horas = Math.floor(totalMinutos / 60);
  const minutos = totalMinutos % 60;
  const esUrgente = totalMinutos <= 120; // Menos de 2 horas

  const texto = horas > 0 ? `${horas} h ${minutos} min` : `${minutos} min`;

  return {
    cerrada: false,
    esUrgente,
    minutosRestantes: totalMinutos,
    horasRestantes: horas,
    texto,
  };
}

/**
 * Valida un intento de envío de plantilla con el contrato EnviarPlantilla.
 * Aplica el refinement Zod que exige que ningún valor {{i}} esté vacío o en blanco.
 */
export function validarEnvioPlantilla(envio: unknown) {
  return EnviarPlantilla.safeParse(envio);
}

/**
 * Generador de UUID v4 criptográfico estándar para claves de idempotencia (R5).
 */
export function generarClaveIdempotencia(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return '00000000-0000-4000-8000-' + Math.random().toString(16).slice(2, 14).padEnd(12, '0');
}
