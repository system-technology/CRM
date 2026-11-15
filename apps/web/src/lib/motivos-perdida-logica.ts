import { MotivoPerdida, type MotivoDePerdida } from '@viajapro/contracts';
import { NOMBRES_MOTIVOS_PERDIDA } from './pipeline-logica';

/**
 * Lista por defecto (modo mock): las 7 claves sembradas en cada agencia (T-229). Solo OTRO exige
 * nota. Los ids son de relleno: en modo mock nunca llegan a una API.
 */
export function motivosDePerdidaMock(): MotivoDePerdida[] {
  return (Object.keys(NOMBRES_MOTIVOS_PERDIDA) as MotivoPerdida[]).map((clave, i) => ({
    id: `00000000-0029-4000-8000-${String(i + 1).padStart(12, '0')}`,
    clave,
    etiqueta: NOMBRES_MOTIVOS_PERDIDA[clave],
    orden: i,
    activo: true,
    exigeNota: clave === 'OTRO',
  }));
}

/** Enum de compatibilidad: la `clave` si es una de las siete conocidas; si no, OTRO. */
export function enumDeMotivo(motivo: Pick<MotivoDePerdida, 'clave'>): MotivoPerdida {
  const r = MotivoPerdida.safeParse(motivo.clave);
  return r.success ? r.data : 'OTRO';
}

/**
 * La nota es obligatoria si el motivo la exige o si el enum derivado es OTRO (el contrato
 * `MoverOportunidad` rechaza «OTRO» sin explicación, también para un motivo propio).
 */
export function motivoExigeNota(motivo: Pick<MotivoDePerdida, 'clave' | 'exigeNota'>): boolean {
  return motivo.exigeNota || enumDeMotivo(motivo) === 'OTRO';
}
