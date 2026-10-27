/**
 * El camino de alta del canal de PRUEBA de Meta, separado del script para poder ejercerlo en una
 * e2e. Reutiliza exactamente el camino del ADR-0008 (el mismo que ejercen las e2e del inbox):
 *
 *   1. Con `viajapro_app` y el tenant fijado (`set_config`), bajo RLS: la cuenta de WhatsApp y el
 *      canal, que son la verdad.
 *   2. Con `viajapro_altas` y el tenant fijado: `registrar_enrutamiento`, la única vía de
 *      escritura del directorio global. La clave es `HMAC(pimienta, 'pn:' || phone_number_id)`.
 *
 * No hay SQL que salte RLS ni rol que lo salte (R2). No se llama a la red de Meta, y nada de lo
 * que entra aquí —identificadores, pimienta— se escribe en ningún mensaje.
 */
import type { PrismaClient } from '@prisma/client';
import { claveDeEnrutamiento } from '../domain/clave-de-enrutamiento.js';

/** Número de prueba que Meta asigna a la cuenta de prueba (docs/10-onboarding/03). */
export const NUMERO_E164_DE_PRUEBA = '+15556389264';
export const NOMBRE_DE_LA_CUENTA_DE_PRUEBA = 'WABA de prueba de Meta';
export const NOMBRE_DEL_CANAL_DE_PRUEBA = 'Número de prueba de Meta';

export class RegistroDeCanalDePruebaError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'RegistroDeCanalDePruebaError';
  }
}

export interface PeticionDeRegistro {
  readonly app: PrismaClient;
  readonly altas: PrismaClient;
  readonly slugDeLaAgencia: string;
  readonly wabaId: string;
  readonly phoneNumberId: string;
  readonly pimienta: string;
  readonly pimientaVersion: number;
}

export interface ResultadoDelRegistro {
  /** El valor de `META_TENANT_ID_PRUEBA`: solo esta agencia envía con el token de prueba. */
  readonly tenantId: string;
  readonly tenantNombre: string;
  readonly canalId: string;
  readonly cuentaId: string;
}

export async function registrarCanalDePrueba(
  peticion: PeticionDeRegistro,
): Promise<ResultadoDelRegistro> {
  const { app, altas, slugDeLaAgencia, wabaId, phoneNumberId } = peticion;
  if (!peticion.pimienta) {
    throw new RegistroDeCanalDePruebaError(
      'Falta WHATSAPP_DIRECTORY_PEPPER: sin ella no se puede escribir el directorio.',
    );
  }
  if (!Number.isInteger(peticion.pimientaVersion) || peticion.pimientaVersion < 1) {
    throw new RegistroDeCanalDePruebaError(
      'WHATSAPP_DIRECTORY_PEPPER_VERSION debe ser un entero positivo.',
    );
  }

  // `tenants` es global y de solo lectura para la aplicación.
  const tenant = await app.tenant.findUnique({
    where: { slug: slugDeLaAgencia },
    select: { id: true, nombre: true },
  });
  if (!tenant) {
    throw new RegistroDeCanalDePruebaError(
      `No existe la agencia demo (slug "${slugDeLaAgencia}"). Corre pnpm db:seed.`,
    );
  }

  // Paso 1: la verdad, bajo RLS. Idempotente: se reutiliza lo que ya exista.
  const { canalId, cuentaId } = await app.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenant.id}::text, true)`;

    let cuenta = await tx.cuentaWhatsapp.findUnique({
      where: { tenantId_wabaId: { tenantId: tenant.id, wabaId } },
    });
    if (cuenta && (cuenta.estado !== 'ACTIVO' || cuenta.eliminadoEn !== null)) {
      throw new RegistroDeCanalDePruebaError(
        'La cuenta de prueba ya existe en la agencia demo pero no está ACTIVA. No se reactiva: ' +
          'el directorio solo admite restringir. Bórrala a mano o usa otra cuenta de prueba.',
      );
    }
    cuenta ??= await tx.cuentaWhatsapp.create({
      data: {
        tenantId: tenant.id,
        wabaId,
        nombre: NOMBRE_DE_LA_CUENTA_DE_PRUEBA,
        estado: 'ACTIVO',
      },
    });

    let canal = await tx.canal.findUnique({
      where: { tenantId_phoneNumberId: { tenantId: tenant.id, phoneNumberId } },
    });
    if (canal && (canal.estado !== 'ACTIVO' || canal.eliminadoEn !== null)) {
      throw new RegistroDeCanalDePruebaError(
        'El canal de prueba ya existe en la agencia demo pero no está ACTIVO. No se reactiva: ' +
          'el directorio solo admite restringir. Bórralo a mano o usa otro número de prueba.',
      );
    }
    if (canal && canal.cuentaId !== cuenta.id) {
      throw new RegistroDeCanalDePruebaError(
        'El número de prueba ya está en la agencia demo bajo otra cuenta de WhatsApp.',
      );
    }
    canal ??= await tx.canal.create({
      data: {
        tenantId: tenant.id,
        cuentaId: cuenta.id,
        phoneNumberId,
        numeroE164: NUMERO_E164_DE_PRUEBA,
        nombreVisible: NOMBRE_DEL_CANAL_DE_PRUEBA,
        estado: 'ACTIVO',
      },
    });
    return { canalId: canal.id, cuentaId: cuenta.id };
  });

  // Paso 2: el directorio, por la única vía de escritura. Si el número ya está en OTRA agencia
  // la función lo rechaza (42501) y se traduce; el canal del paso 1 queda en la demo, inerte.
  const clave = claveDeEnrutamiento(peticion.pimienta, 'pn', phoneNumberId);
  try {
    await altas.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenant.id}::text, true)`;
      await tx.$executeRaw`
        SELECT public.registrar_enrutamiento(
          ${clave}::bytea,
          ${peticion.pimientaVersion}::smallint,
          ${tenant.id}::uuid,
          ${canalId}::uuid,
          ${cuentaId}::uuid,
          'ACTIVO'::public.estado_enrutamiento,
          NULL::uuid,
          ${'alta del canal de prueba (script de desarrollo)'}::text
        )`;
    });
  } catch (error) {
    const texto = error instanceof Error ? error.message : '';
    if (texto.includes('pertenece a otro tenant')) {
      throw new RegistroDeCanalDePruebaError(
        'Negado: el número de prueba ya está asociado a OTRA agencia en el directorio. ' +
          'No se repunta. (Quedó, inerte, el canal en la agencia demo; no enruta nada.)',
      );
    }
    throw error;
  }

  return { tenantId: tenant.id, tenantNombre: tenant.nombre, canalId, cuentaId };
}
