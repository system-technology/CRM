/**
 * Siembra, SOLO en desarrollo local, las columnas cifradas de la agencia demo (ADR-0015).
 *
 *   pnpm --filter @viajapro/api campos:sembrar-dev
 *
 * Las semillas de `packages/database` no pueden importar la primitiva de cifrado (la dependencia
 * apuntaría de la base hacia la API), así que dejan estas columnas vacías y este script las
 * completa **con el mismo servicio que usa la API**: la clave es `CAMPOS_SENSIBLES_KEY` del
 * entorno. No hay clave en el repositorio ni derivada de una constante.
 *
 * Idempotente: solo rellena lo que está vacío. Los textos son de demostración, no datos reales.
 *
 * Guardias, como `identidad:sembrar-dev`:
 *   1. Exige `APP_ENV=local`.
 *   2. Solo contra un anfitrión local: nunca contra Neon.
 *   3. Sin valor por omisión de la clave: la lee `clavesDeCamposDesdeEntorno`, que lanza si falta.
 *   4. Solo toca la agencia con slug `agencia-demo`.
 *
 * Escribe con el rol propietario (`DATABASE_URL`), el mismo que la semilla: es local y es DDL/datos
 * de arranque, no una ruta de la aplicación.
 */
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { CifradoDeCampos, clavesDeCamposDesdeEntorno } from './cifrado-de-campos.js';
import {
  columnasDePreferencias,
  columnasDeTexto,
  columnasDeUltimoMensaje,
} from './columnas-de-prisma.js';
import { COLUMNAS_CIFRADAS as C } from './puerto-de-cifrado.js';

const ANFITRIONES_LOCALES = new Set(['localhost', '127.0.0.1', '::1']);

/** El hilo de demostración que sembró `seed.ts`, por `wamid`. */
const HILO: ReadonlyArray<readonly [string, string]> = [
  ['wamid.DEMO.0001', 'Hola! Quiero ir a San Andres en diciembre, somos 2 adultos y un nino.'],
  ['wamid.DEMO.0002', 'Hola Laura! Con mucho gusto. Que fechas tiene en mente?'],
  ['wamid.DEMO.0003', 'Perfecto, cuando me manda la cotizacion?'],
];

const PREFERENCIAS = [
  'Prefiere hotel frente al mar. Asiento de pasillo.',
  'Viaja con dos niños. Necesita silla infantil en el bus.',
  'Pide siempre factura electrónica.',
  'Pregunta siempre por salidas de puente festivo.',
];

const NOTAS = [
  'Cliente pregunta por salida de puente festivo. Confirmar cupo con el mayorista.',
  'Pidió el PDF en formato imagen porque no abre adjuntos en el celular.',
  'Negocia precio. Confirmar el margen mínimo con la dirección.',
  'Viaja con su madre. Reservar asientos delanteros.',
];

async function principal(): Promise<void> {
  if (process.env['APP_ENV'] !== 'local') {
    throw new Error('Negado: este script solo corre con APP_ENV=local.');
  }
  const cadena = process.env['DATABASE_URL'];
  if (!cadena) throw new Error('Falta DATABASE_URL.');
  const anfitrion = new URL(cadena).hostname;
  if (!ANFITRIONES_LOCALES.has(anfitrion)) {
    throw new Error(`Negado: "${anfitrion}" no es un anfitrión local.`);
  }
  const cifrado = new CifradoDeCampos(clavesDeCamposDesdeEntorno(process.env));

  const prisma = new PrismaClient({ datasources: { db: { url: cadena } } });
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { slug: 'agencia-demo' },
      select: { id: true },
    });
    if (!tenant) {
      console.log('  No hay agencia demo. Corre pnpm db:seed.');
      return;
    }
    const tenantId = tenant.id;
    let n = 0;

    for (const [wamid, texto] of HILO) {
      const m = await prisma.mensaje.findFirst({
        where: { tenantId, wamid, textoCifrado: null },
        select: { id: true, conversacionId: true, ocurridoEn: true },
      });
      if (!m) continue;
      await prisma.mensaje.update({
        where: { id: m.id },
        data: columnasDeTexto(cifrado.cifrar(C.MENSAJES_TEXTO, tenantId, m.id, texto)),
      });
      n += 1;
    }
    const ultimo = HILO[HILO.length - 1];
    const conversacion = await prisma.mensaje.findFirst({
      where: { tenantId, wamid: ultimo?.[0] ?? '' },
      select: { conversacionId: true },
    });
    if (ultimo && conversacion) {
      const c = await prisma.conversacion.findFirst({
        where: { id: conversacion.conversacionId, ultimoMensajeTextoCifrado: null },
        select: { id: true },
      });
      if (c) {
        await prisma.conversacion.update({
          where: { id: c.id },
          data: columnasDeUltimoMensaje(
            cifrado.cifrar(C.CONVERSACIONES_ULTIMO_MENSAJE_TEXTO, tenantId, c.id, ultimo[1]),
          ),
        });
        n += 1;
      }
    }

    const contactos = await prisma.contacto.findMany({
      where: { tenantId, eliminadoEn: null },
      orderBy: { telefonoE164: 'asc' },
      select: { id: true, preferenciasCifrado: true },
    });
    for (const [i, c] of contactos.entries()) {
      if (c.preferenciasCifrado !== null) continue;
      const texto = PREFERENCIAS[i % PREFERENCIAS.length];
      if (!texto) continue;
      await prisma.contacto.update({
        where: { id: c.id },
        data: columnasDePreferencias(
          cifrado.cifrar(C.CONTACTOS_PREFERENCIAS, tenantId, c.id, texto),
        ),
      });
      n += 1;
    }

    const hayNotas = (await prisma.notaInterna.count({ where: { tenantId } })) > 0;
    if (!hayNotas) {
      for (const [i, texto] of NOTAS.entries()) {
        const contacto = contactos[i];
        if (!contacto) continue;
        const id = randomUUID();
        await prisma.notaInterna.create({
          data: {
            id,
            tenantId,
            contactoId: contacto.id,
            ...columnasDeTexto(cifrado.cifrar(C.NOTAS_INTERNAS_TEXTO, tenantId, id, texto)),
          },
        });
        n += 1;
      }
    }
    console.log(`  columnas cifradas sembradas: ${n}`);
  } finally {
    await prisma.$disconnect();
  }
}

principal().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
