/**
 * Lo que el MODO DEMO hace con las etiquetas sobre las conversaciones (T-326): poner, quitar,
 * renombrar o recolorear en todas y borrar de todas. Mismos topes y errores tipados que la API.
 * Vive aparte de `mock-inbox.ts` para que el catálogo (`mock-etiquetas.ts`) no importe a
 * `mock-inbox` (que lo importa a él).
 */

import {
  MAX_ETIQUETAS_POR_CONVERSACION,
  type ColorDeEtiqueta,
  type ConversacionResumen,
  type Etiqueta,
} from '@viajapro/contracts';
import { MOCK_CONVERSACIONES, MOCK_DETALLES, obtenerConversacionDetalleMock } from './mock-inbox';
import {
  ErrorDeEtiquetaMock,
  actualizarEtiquetaMock,
  borrarEtiquetaDelCatalogoMock,
  etiquetaMockPorId,
  listarEtiquetasMock,
} from './mock-etiquetas';
import { conEtiqueta } from './etiquetas-logica';

const ESPERA_SIMULADA_MS = 120;

async function esperar(): Promise<void> {
  if (ESPERA_SIMULADA_MS > 0 && process.env['VITEST'] !== 'true') {
    await new Promise((r) => setTimeout(r, ESPERA_SIMULADA_MS));
  } else {
    await Promise.resolve();
  }
}

function resumenOFalla(conversacionId: string): ConversacionResumen {
  const r = MOCK_CONVERSACIONES.find((c) => c.id === conversacionId);
  if (!r) {
    throw new ErrorDeEtiquetaMock('CONVERSACION_NO_ENCONTRADA', 'La conversación no existe.');
  }
  return r;
}

/** Deja la conversación (resumen y detalle, si ya se abrió) con estas etiquetas. */
function fijarEtiquetas(resumen: ConversacionResumen, etiquetas: ConversacionResumen['etiquetas']) {
  resumen.etiquetas = etiquetas;
  const detalle = MOCK_DETALLES.get(resumen.id);
  if (detalle) detalle.etiquetas = etiquetas.map((e) => ({ ...e }));
}

export async function ponerEtiquetaMock(
  conversacionId: string,
  etiquetaId: string,
): Promise<ConversacionResumen> {
  await esperar();
  const resumen = resumenOFalla(conversacionId);
  const etiqueta = etiquetaMockPorId(etiquetaId);
  if (!etiqueta) throw new ErrorDeEtiquetaMock('ETIQUETA_NO_ENCONTRADA', 'La etiqueta no existe.');
  const yaPuesta = resumen.etiquetas.some((e) => e.id === etiquetaId);
  if (!yaPuesta && resumen.etiquetas.length >= MAX_ETIQUETAS_POR_CONVERSACION) {
    throw new ErrorDeEtiquetaMock(
      'TOPE_DE_ETIQUETAS_DE_LA_CONVERSACION',
      'La conversación alcanzó el máximo de etiquetas.',
    );
  }
  fijarEtiquetas(
    resumen,
    conEtiqueta(
      resumen.etiquetas,
      { id: etiqueta.id, nombre: etiqueta.nombre, color: etiqueta.color },
      true,
      listarEtiquetasMock(),
    ),
  );
  await obtenerConversacionDetalleMock(conversacionId, 0);
  return resumen;
}

export async function quitarEtiquetaMock(
  conversacionId: string,
  etiquetaId: string,
): Promise<ConversacionResumen> {
  await esperar();
  const resumen = resumenOFalla(conversacionId);
  // Idempotente, como la API: si no estaba puesta, responde igual. Si la etiqueta ya no existe en la
  // agencia tampoco falla: quitarla de la conversación es lo que se pedía.
  fijarEtiquetas(
    resumen,
    resumen.etiquetas.filter((e) => e.id !== etiquetaId),
  );
  return resumen;
}

/** Renombrar o recolorear conserva las asignaciones (van por id) y se ve en todas las filas. */
export async function actualizarEtiquetaEnConversacionesMock(
  id: string,
  cambios: {
    nombre?: string | undefined;
    color?: ColorDeEtiqueta | undefined;
    orden?: number | undefined;
  },
): Promise<Etiqueta> {
  await esperar();
  const actualizada = actualizarEtiquetaMock(id, cambios);
  for (const c of MOCK_CONVERSACIONES) {
    if (c.etiquetas.some((e) => e.id === id)) {
      fijarEtiquetas(
        c,
        c.etiquetas.map((e) =>
          e.id === id ? { id, nombre: actualizada.nombre, color: actualizada.color } : e,
        ),
      );
    }
  }
  return actualizada;
}

/** Borrar la etiqueta se lleva sus asignaciones. */
export async function borrarEtiquetaDeLaAgenciaMock(id: string): Promise<void> {
  await esperar();
  borrarEtiquetaDelCatalogoMock(id);
  for (const c of MOCK_CONVERSACIONES) {
    if (c.etiquetas.some((e) => e.id === id)) {
      fijarEtiquetas(
        c,
        c.etiquetas.filter((e) => e.id !== id),
      );
    }
  }
}
