/**
 * Cliente de las etiquetas de conversación (T-326, HU-inbox-1).
 *
 * - Modo real: `/api/v1/etiquetas` y `/api/v1/conversaciones/:id/etiquetas/:etiquetaId`, validados
 *   con los esquemas de `@viajapro/contracts` (R3). Los errores llegan como `InboxErrorApi` con el
 *   código tipado de la API (`ETIQUETA_DUPLICADA`, `TOPE_DE_…`).
 * - Modo demo: el catálogo en memoria de `mock-etiquetas.ts`, con los mismos errores. La fuente se
 *   decide con `estaUsandoApiRealInbox()`, la misma de la bandeja: nunca se mezclan (una etiqueta
 *   real no puede colgarse de una conversación de demo ni al revés).
 *
 * R10: el nombre de una etiqueta es texto libre de la agencia. Nada de aquí lo escribe en un log.
 */

import {
  CrearEtiquetaCuerpo as EsquemaCrearEtiquetaCuerpo,
  ActualizarEtiquetaCuerpo as EsquemaActualizarEtiquetaCuerpo,
  ConversacionResumen as EsquemaConversacionResumen,
  Etiqueta as EsquemaEtiqueta,
  ListaDeEtiquetas as EsquemaListaDeEtiquetas,
  type ActualizarEtiquetaCuerpo,
  type ConversacionResumen,
  type CrearEtiquetaCuerpo,
  type Etiqueta,
} from '@viajapro/contracts';
import { InboxErrorApi, estaUsandoApiRealInbox, pedirInbox } from './inbox-api';
import { ErrorDeEtiquetaMock, crearEtiquetaMock, listarEtiquetasMock } from './mock-etiquetas';
import {
  actualizarEtiquetaEnConversacionesMock,
  borrarEtiquetaDeLaAgenciaMock,
  ponerEtiquetaMock,
  quitarEtiquetaMock,
} from './mock-etiquetas-conversaciones';

/** El mock lanza `ErrorDeEtiquetaMock`; la pantalla solo conoce `InboxErrorApi`. */
async function comoErrorDeApi<T>(operacion: () => Promise<T> | T): Promise<T> {
  try {
    return await operacion();
  } catch (e) {
    if (e instanceof ErrorDeEtiquetaMock) throw new InboxErrorApi(e.code, e.message);
    throw e;
  }
}

export const etiquetasApi = {
  /** GET /api/v1/etiquetas — cualquier usuario de la agencia. */
  listar: async (): Promise<Etiqueta[]> => {
    if (!estaUsandoApiRealInbox()) {
      await new Promise((r) => setTimeout(r, process.env['VITEST'] === 'true' ? 0 : 120));
      return listarEtiquetasMock();
    }
    const bruto = await pedirInbox<unknown>('/api/v1/etiquetas');
    return EsquemaListaDeEtiquetas.parse(bruto).datos;
  },

  /** POST /api/v1/etiquetas — `etiquetas.administrar`. */
  crear: async (entrada: {
    nombre: string;
    color: CrearEtiquetaCuerpo['color'];
  }): Promise<Etiqueta> => {
    if (!estaUsandoApiRealInbox()) {
      return comoErrorDeApi(() => crearEtiquetaMock(entrada));
    }
    const cuerpo = EsquemaCrearEtiquetaCuerpo.parse(entrada);
    const bruto = await pedirInbox<unknown>('/api/v1/etiquetas', {
      method: 'POST',
      body: JSON.stringify(cuerpo),
    });
    return EsquemaEtiqueta.parse(bruto);
  },

  /** PATCH /api/v1/etiquetas/:id — renombrar, recolorear u ordenar. */
  actualizar: async (id: string, cambios: ActualizarEtiquetaCuerpo): Promise<Etiqueta> => {
    if (!estaUsandoApiRealInbox()) {
      return comoErrorDeApi(() => actualizarEtiquetaEnConversacionesMock(id, cambios));
    }
    const cuerpo = EsquemaActualizarEtiquetaCuerpo.parse(cambios);
    const bruto = await pedirInbox<unknown>(`/api/v1/etiquetas/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(cuerpo),
    });
    return EsquemaEtiqueta.parse(bruto);
  },

  /** DELETE /api/v1/etiquetas/:id — se lleva sus asignaciones. No se puede deshacer. */
  borrar: async (id: string): Promise<void> => {
    if (!estaUsandoApiRealInbox()) {
      await comoErrorDeApi(() => borrarEtiquetaDeLaAgenciaMock(id));
      return;
    }
    await pedirInbox<unknown>(`/api/v1/etiquetas/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  /** PUT /api/v1/conversaciones/:id/etiquetas/:etiquetaId — `bandeja.operar`, idempotente. */
  ponerEnConversacion: async (
    conversacionId: string,
    etiquetaId: string,
  ): Promise<ConversacionResumen> => {
    if (!estaUsandoApiRealInbox()) {
      return comoErrorDeApi(() => ponerEtiquetaMock(conversacionId, etiquetaId));
    }
    const bruto = await pedirInbox<unknown>(
      `/api/v1/conversaciones/${encodeURIComponent(conversacionId)}/etiquetas/${encodeURIComponent(etiquetaId)}`,
      { method: 'PUT' },
    );
    return EsquemaConversacionResumen.parse(bruto);
  },

  /** DELETE /api/v1/conversaciones/:id/etiquetas/:etiquetaId — idempotente. */
  quitarDeConversacion: async (
    conversacionId: string,
    etiquetaId: string,
  ): Promise<ConversacionResumen> => {
    if (!estaUsandoApiRealInbox()) {
      return comoErrorDeApi(() => quitarEtiquetaMock(conversacionId, etiquetaId));
    }
    const bruto = await pedirInbox<unknown>(
      `/api/v1/conversaciones/${encodeURIComponent(conversacionId)}/etiquetas/${encodeURIComponent(etiquetaId)}`,
      { method: 'DELETE' },
    );
    return EsquemaConversacionResumen.parse(bruto);
  },
};
