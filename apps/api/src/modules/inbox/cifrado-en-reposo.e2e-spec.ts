/**
 * Criterio C2 del roadmap y concreción 7 del ADR-0015: **cero PII en claro**, comprobado leyendo
 * la base cruda con `$queryRaw`.
 *
 * Se escribe por los caminos reales (el webhook por `BandejaPrisma`, la nota por el puerto de
 * `crm`, las preferencias por `EscrituraCrmPrisma`) y después se leen las columnas tal como están
 * en disco, con el rol propietario. Afirma:
 *   · las cinco columnas en claro ya no existen;
 *   · lo guardado en las cinco columnas cifradas no contiene el texto sembrado, ni un fragmento
 *     reconocible (el número de pasaporte), ni en UTF-8 ni en la vista previa recortada;
 *   · las cuatro columnas de cada valor están presentes, con nonce de 12 bytes, etiqueta de 16 y
 *     versión >= 1;
 *   · el criptograma abre con la agencia y la fila dueñas, y NO abre con la otra agencia (AAD).
 */
import 'reflect-metadata';

import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cifradoDePrueba } from '../../shared/cifrado/cifrado-de-prueba.js';
import {
  CampoCifradoIlegibleError,
  COLUMNAS_CIFRADAS,
  type ColumnaCifrada,
} from '../../shared/cifrado/puerto-de-cifrado.js';
import type { PrismaService } from '../../shared/prisma/prisma.service.js';
import type { ClienteTenant } from '../../shared/prisma/prisma.service.js';
import { PrismaWebhookService } from '../../shared/prisma/prisma-webhook.service.js';
import { ContextoTenant } from '../../shared/tenant/contexto-tenant.js';
import { EscrituraCrmPrisma } from '../crm/infrastructure/escritura-crm.prisma.js';
import {
  ContactosDeCrm,
  NotasDeConversacionDeCrm,
} from '../crm/infrastructure/puertos-de-crm.prisma.js';
import { BandejaPrisma } from './infrastructure/bandeja.prisma.js';

const idDeTenant = (): string => `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const TENANT_A = idDeTenant();
const TENANT_B = idDeTenant();
const PASAPORTE = `AB${randomBytes(3).toString('hex').toUpperCase()}`;
const TEXTO = `Mi pasaporte es ${PASAPORTE} y mi hijo nació el 2019-03-04`;
const ARCHIVO = `pasaporte_${PASAPORTE}.jpg`;
const NOTA = `Viaja con el pasaporte ${PASAPORTE}; el menor es celíaco`;
const PREFERENCIAS = `Alérgica a la penicilina ${PASAPORTE}`;

const cifrado = cifradoDePrueba();
let admin: PrismaClient;
let adminPg: Client;
let prismaWebhook: PrismaWebhookService;
let canalA = '';

interface FilaCruda {
  id: string;
  cifrado: Buffer | null;
  nonce: Buffer | null;
  tag: Buffer | null;
  version: number | null;
}

/** Las cuatro columnas de `<prefijo>` de la tabla, para la agencia A, tal como están en disco. */
async function crudas(tabla: string, prefijo: string): Promise<FilaCruda[]> {
  // Identificadores fijos de esta prueba (nunca entrada externa): `$queryRawUnsafe` solo por el
  // nombre de la tabla y de las columnas, que `$queryRaw` no admite como parámetros.
  return admin.$queryRawUnsafe<FilaCruda[]>(
    `SELECT id::text AS id, ${prefijo}_cifrado AS cifrado, ${prefijo}_nonce AS nonce,
            ${prefijo}_tag AS tag, ${prefijo}_clave_version::int AS version
       FROM ${tabla}
      WHERE tenant_id = $1::uuid AND ${prefijo}_cifrado IS NOT NULL`,
    TENANT_A,
  );
}

function sinTextoLegible(f: FilaCruda, columna: ColumnaCifrada, claro: string): void {
  expect(f.cifrado, columna).not.toBeNull();
  expect(f.nonce?.length, `${columna}: nonce`).toBe(12);
  expect(f.tag?.length, `${columna}: etiqueta`).toBe(16);
  expect(f.version ?? 0, `${columna}: versión`).toBeGreaterThanOrEqual(1);
  const bytes = f.cifrado ?? Buffer.alloc(0);
  for (const fragmento of [claro, PASAPORTE, 'pasaporte', 'penicilina', 'celíaco']) {
    expect(
      bytes.includes(Buffer.from(fragmento, 'utf8')),
      `${columna} contiene «${fragmento}»`,
    ).toBe(false);
  }
}

async function agencia(id: string): Promise<string> {
  await admin.tenant.create({
    data: { id, slug: `fixture-cifrado-${id.slice(-12)}`, nombre: `Agencia ${id.slice(-4)}` },
  });
  const cuenta = await admin.cuentaWhatsapp.create({
    data: { tenantId: id, wabaId: `waba-cf-${randomBytes(4).toString('hex')}`, nombre: 'WABA' },
  });
  const c = await admin.canal.create({
    data: {
      tenantId: id,
      cuentaId: cuenta.id,
      phoneNumberId: String(Math.floor(Math.random() * 9e14) + 1e14),
      numeroE164: `+57300${Math.floor(Math.random() * 9e6 + 1e6)}`,
    },
  });
  return c.id;
}

beforeAll(async () => {
  admin = new PrismaClient({ datasources: { db: { url: process.env['DATABASE_URL'] ?? '' } } });
  const [bd] = await admin.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
  if (bd?.db !== 'neondb') throw new Error(`Base inesperada: ${bd?.db}. No se escribe.`);
  adminPg = new Client({ connectionString: process.env['DATABASE_URL'] });
  await adminPg.connect();

  canalA = await agencia(TENANT_A);
  await agencia(TENANT_B);

  prismaWebhook = new PrismaWebhookService();
  await prismaWebhook.onModuleInit();

  // 1. El webhook: mensaje, vista previa y nombre del adjunto, por el adaptador real.
  const bandeja = new BandejaPrisma(prismaWebhook, new ContactosDeCrm(), cifrado);
  const r = await bandeja.registrarEntrante(TENANT_A, canalA, {
    wamid: `wamid.cf.${randomBytes(8).toString('hex')}`,
    deTelefono: `+57302${Math.floor(Math.random() * 9e6 + 1e6)}`,
    nombrePerfil: 'Viajera',
    instante: new Date(),
    tipo: 'DOCUMENTO',
    texto: TEXTO,
    medioId: `media-${randomBytes(4).toString('hex')}`,
    nombreArchivo: ARCHIVO,
    mimeType: 'image/jpeg',
    respondeA: null,
    reaccionaA: null,
  });
  expect(r).toBe('CREADO');
  const conversacion = await admin.conversacion.findFirstOrThrow({
    where: { tenantId: TENANT_A },
    select: { id: true, contactoId: true },
  });

  // 2. La nota, por el puerto de `crm` (la transacción del propietario hace de llamador).
  const notas = new NotasDeConversacionDeCrm(cifrado);
  await admin.$transaction((tx) =>
    notas.crear(tx as unknown as ClienteTenant, {
      tenantId: TENANT_A,
      conversacionId: conversacion.id,
      contactoId: conversacion.contactoId,
      autorId: null,
      texto: NOTA,
    }),
  );

  // 3. Las preferencias, por el adaptador de escritura de `crm`.
  const escritura = new EscrituraCrmPrisma(
    { conTenant: (fn) => admin.$transaction((tx) => fn(tx as unknown as ClienteTenant)) } as Pick<
      PrismaService,
      'conTenant'
    > as PrismaService,
    { existePaquete: () => Promise.resolve(false) },
    cifrado,
  );
  await ContextoTenant.ejecutarCon(
    {
      tenantId: TENANT_A,
      usuarioId: null,
      identidadId: null,
      permisos: new Set(),
      trazaId: 'cifrado-en-reposo',
    },
    () => escritura.editarContacto(conversacion.contactoId, { preferencias: PREFERENCIAS }, null),
  );
}, 60_000);

afterAll(async () => {
  await prismaWebhook?.onModuleDestroy();
  if (adminPg) {
    try {
      type Limpiador = (c: Client, ids: string[]) => Promise<unknown>;
      const ruta = '../../../../../packages/database/scripts/borrar-tenants.mjs';
      const modulo = (await import(ruta)) as { borrarTenants: Limpiador };
      await adminPg.query('BEGIN');
      await modulo.borrarTenants(adminPg, [TENANT_A, TENANT_B]);
      await adminPg.query('COMMIT');
    } finally {
      await adminPg.end();
    }
  }
  await admin?.$disconnect();
});

const CASOS: Array<[ColumnaCifrada, string, string, string]> = [
  [COLUMNAS_CIFRADAS.MENSAJES_TEXTO, 'mensajes', 'texto', TEXTO],
  [
    COLUMNAS_CIFRADAS.CONVERSACIONES_ULTIMO_MENSAJE_TEXTO,
    'conversaciones',
    'ultimo_mensaje_texto',
    TEXTO.slice(0, 200),
  ],
  [COLUMNAS_CIFRADAS.ADJUNTOS_NOMBRE_ARCHIVO, 'adjuntos', 'nombre_archivo', ARCHIVO],
  [COLUMNAS_CIFRADAS.NOTAS_INTERNAS_TEXTO, 'notas_internas', 'texto', NOTA],
  [COLUMNAS_CIFRADAS.CONTACTOS_PREFERENCIAS, 'contactos', 'preferencias', PREFERENCIAS],
];

describe('C2 / ADR-0015 — cero PII en claro en la base', () => {
  it('las cinco columnas en claro no existen', async () => {
    const filas = await admin.$queryRaw<Array<{ columna: string }>>`
      SELECT table_name || '.' || column_name AS columna
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name || '.' || column_name IN (
           'mensajes.texto', 'conversaciones.ultimo_mensaje_texto', 'contactos.preferencias',
           'notas_internas.texto', 'adjuntos.nombre_archivo')`;
    expect(filas).toEqual([]);
  });

  it.each(CASOS)(
    '%s: lo guardado no contiene texto legible, y abre solo con su agencia',
    async (columna, tabla, prefijo, claro) => {
      const filas = await crudas(tabla, prefijo);
      expect(filas.length, `filas cifradas en ${tabla}`).toBeGreaterThan(0);
      for (const f of filas) {
        sinTextoLegible(f, columna, claro);
        const campo = { cifrado: f.cifrado, nonce: f.nonce, tag: f.tag, claveVersion: f.version };
        // Ida y vuelta con la agencia y la fila dueñas: la prueba no es verde por vacío.
        expect(cifrado.descifrar(columna, TENANT_A, f.id, campo)).toBe(claro);
        // El mismo criptograma, leído como si fuera de la otra agencia, no abre (AAD).
        expect(() => cifrado.descifrar(columna, TENANT_B, f.id, campo)).toThrow(
          CampoCifradoIlegibleError,
        );
      }
    },
  );

  it('la búsqueda SQL por contenido ya no encuentra nada: ni por el texto ni por el pasaporte', async () => {
    const [n] = await admin.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n
        FROM mensajes
       WHERE tenant_id = ${TENANT_A}::uuid
         AND position(convert_to(${PASAPORTE}, 'UTF8') IN texto_cifrado) > 0`;
    expect(n?.n).toBe(0);
  });
});
