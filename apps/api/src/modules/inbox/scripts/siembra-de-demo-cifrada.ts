/**
 * Escribe la bandeja de demostración cifrada (T-225) en la agencia demo. Separado del script para
 * poder ejercerlo en una e2e. Entra como `viajapro_app` con el tenant fijado (`set_config`), bajo
 * RLS: la misma vía que los adaptadores (R1, R2). Nada salta RLS.
 *
 * Idempotente:
 *   - la conversación se busca por su clave única (tenant, canal, contacto);
 *   - un mensaje se identifica por su `wamid`: si existe sin texto (el hilo que crea la semilla) se
 *     le pone el texto; si ya tiene texto, no se toca; si no existe, se crea;
 *   - la vista previa solo se escribe si la conversación no tiene una;
 *   - las notas solo se escriben si la conversación aún no tiene ninguna.
 */
import type { PrismaClient } from '@prisma/client';
import type { PuertoCifradoDeCampos } from '../../../shared/cifrado/puerto-de-cifrado.js';
import { armarLaDemoCifrada, PLAN_DE_LA_DEMO } from './demo-cifrada.js';

/** El canal de la semilla (`seed.ts`): la bandeja de la demo cuelga de él. */
export const PHONE_NUMBER_ID_DE_LA_DEMO = '100000000000001';
export const CORREO_DEL_DUENO_DE_LA_DEMO = 'dueno@agenciademo.test';

export class SiembraDeDemoCifradaError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'SiembraDeDemoCifradaError';
  }
}

export interface ResultadoDeLaSiembraDeDemo {
  readonly conversaciones: number;
  readonly mensajesEscritos: number;
  readonly notasEscritas: number;
}

export async function sembrarDemoCifrada(peticion: {
  readonly app: PrismaClient;
  readonly cifrado: PuertoCifradoDeCampos;
  readonly slugDeLaAgencia: string;
  readonly ahoraMs?: number;
}): Promise<ResultadoDeLaSiembraDeDemo> {
  const { app, cifrado, slugDeLaAgencia } = peticion;
  const ahoraMs = peticion.ahoraMs ?? Date.now();

  // `tenants` es global y de solo lectura para la aplicación.
  const tenant = await app.tenant.findUnique({
    where: { slug: slugDeLaAgencia },
    select: { id: true },
  });
  if (!tenant) {
    throw new SiembraDeDemoCifradaError(
      `No existe la agencia demo (slug "${slugDeLaAgencia}"). Corre pnpm db:seed.`,
    );
  }
  const tenantId = tenant.id;

  return app.$transaction(async (tx): Promise<ResultadoDeLaSiembraDeDemo> => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}::text, true)`;

    const canal = await tx.canal.findUnique({
      where: { tenantId_phoneNumberId: { tenantId, phoneNumberId: PHONE_NUMBER_ID_DE_LA_DEMO } },
      select: { id: true },
    });
    if (!canal) {
      throw new SiembraDeDemoCifradaError(
        'No existe el canal de la agencia demo. Corre pnpm db:seed.',
      );
    }
    const dueno = await tx.usuario.findUnique({
      where: { tenantId_correo: { tenantId, correo: CORREO_DEL_DUENO_DE_LA_DEMO } },
      select: { id: true },
    });
    if (!dueno) {
      throw new SiembraDeDemoCifradaError(
        'No existe el usuario dueño de la demo. Corre pnpm db:seed.',
      );
    }

    const contactos = await tx.contacto.findMany({
      where: { tenantId, telefonoE164: { in: PLAN_DE_LA_DEMO.map((c) => c.telefono) } },
      select: { id: true, telefonoE164: true },
    });
    const contactoDe = new Map(contactos.map((c) => [c.telefonoE164, c.id]));

    // Lo que ya existe, para que los ids del AAD sean los de las filas reales.
    const conversacionesExistentes = await tx.conversacion.findMany({
      where: { tenantId, canalId: canal.id, contactoId: { in: contactos.map((c) => c.id) } },
      select: { id: true, contactoId: true, ultimoMensajeTextoCifrado: true },
    });
    const telefonoDe = new Map(contactos.map((c) => [c.id, c.telefonoE164]));
    const idsDeConversacion = new Map<string, string>();
    const conVistaPrevia = new Set<string>();
    for (const c of conversacionesExistentes) {
      const telefono = telefonoDe.get(c.contactoId);
      if (!telefono) continue;
      idsDeConversacion.set(telefono, c.id);
      if (c.ultimoMensajeTextoCifrado !== null) conVistaPrevia.add(c.id);
    }

    const wamids = PLAN_DE_LA_DEMO.flatMap((c) => c.mensajes.map((m) => m.wamid));
    const mensajesExistentes = await tx.mensaje.findMany({
      where: { tenantId, wamid: { in: wamids } },
      select: { id: true, wamid: true, textoCifrado: true },
    });
    const idsDeMensaje = new Map<string, string>();
    const conTexto = new Set<string>();
    for (const m of mensajesExistentes) {
      if (m.wamid === null) continue;
      idsDeMensaje.set(m.wamid, m.id);
      if (m.textoCifrado !== null) conTexto.add(m.id);
    }

    const armadas = armarLaDemoCifrada({
      cifrado,
      tenantId,
      ahoraMs,
      existentes: { conversaciones: idsDeConversacion, mensajes: idsDeMensaje },
    });

    let mensajesEscritos = 0;
    let notasEscritas = 0;
    for (const c of armadas) {
      const contactoId = contactoDe.get(c.telefono);
      if (!contactoId) {
        throw new SiembraDeDemoCifradaError(
          'Falta un contacto de la semilla de la agencia demo. Corre pnpm db:seed.',
        );
      }

      if (!c.existente) {
        await tx.conversacion.create({
          data: {
            id: c.id,
            tenantId,
            canalId: canal.id,
            contactoId,
            estado: 'ABIERTA',
            ultimoMensajeClienteEn: c.ultimoMensajeClienteEn,
            ultimoMensajeEn: c.ultimoMensajeEn,
            ultimoMensajeDireccion: c.ultimoMensajeDireccion,
            mensajesSinLeer: c.mensajesSinLeer,
            primeraRespuestaEn: c.primeraRespuestaEn,
            etiquetas: [...c.etiquetas],
            ...c.vistaPrevia,
          },
        });
      } else if (!conVistaPrevia.has(c.id)) {
        await tx.conversacion.update({ where: { id: c.id }, data: c.vistaPrevia });
      }

      for (const m of c.mensajes) {
        if (m.existente) {
          if (conTexto.has(m.id)) continue;
          await tx.mensaje.update({ where: { id: m.id }, data: m.texto });
        } else {
          await tx.mensaje.create({
            data: {
              id: m.id,
              tenantId,
              conversacionId: c.id,
              direccion: m.direccion,
              tipo: 'TEXTO',
              estado: m.estado,
              wamid: m.wamid,
              // Un ENTRANTE no puede tener autor (CHECK): lo escribe el viajero.
              ...(m.direccion === 'SALIENTE' ? { autorId: dueno.id } : {}),
              ocurridoEn: m.ocurridoEn,
              ...m.texto,
            },
          });
        }
        mensajesEscritos += 1;
      }

      if (c.notas.length > 0) {
        const yaTiene = await tx.notaInterna.count({
          where: { tenantId, conversacionId: c.id, eliminadaEn: null },
        });
        if (yaTiene === 0) {
          for (const n of c.notas) {
            await tx.notaInterna.create({
              data: {
                id: n.id,
                tenantId,
                contactoId,
                conversacionId: c.id,
                autorId: dueno.id,
                escritaEn: n.escritaEn,
                ...n.texto,
              },
            });
            notasEscritas += 1;
          }
        }
      }
    }

    return { conversaciones: armadas.length, mensajesEscritos, notasEscritas };
  });
}
