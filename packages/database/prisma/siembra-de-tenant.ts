/**
 * Lo que recibe TODA agencia sembrada: roles, formatos de viaje de sistema y embudo por defecto.
 *
 * Salió de `seed.ts` sin cambiar de comportamiento para que la agencia demo y las agencias de
 * prospecto (`semilla-agencia-desde-json.ts`) usen exactamente el mismo camino: un solo sitio
 * donde se decide qué trae una agencia nueva. Todas las funciones reciben el cliente ya atado a
 * una transacción con el tenant fijado (o, en la semilla demo, el cliente de plataforma).
 */

import type { Prisma } from '@prisma/client';

export type ClienteDeSiembra = Prisma.TransactionClient;

// --- Roles ------------------------------------------------------------------
// Tabla por agencia, no enum (R12, ADR-0011). Los tres sembrados se identifican por CLAVE: la
// agencia puede renombrarlos, y la siembra no le pisa ni el nombre ni los permisos.
export const ROLES_SEMBRADOS = [
  {
    clave: 'DUENO',
    nombre: 'Dueño',
    permisos: [
      'cotizacion.ver_neto_y_margen',
      'usuarios.administrar',
      'roles.administrar',
      'conversaciones.ver_todas',
      'catalogo.administrar',
    ],
  },
  { clave: 'ASESOR', nombre: 'Asesor', permisos: [] },
  {
    clave: 'OPERACIONES',
    nombre: 'Operaciones',
    // ADR-0017 D2: Operaciones mantiene el catálogo; el Asesor no.
    permisos: ['conversaciones.ver_todas', 'catalogo.administrar'],
  },
] as const;

/** Devuelve `clave → id` de los roles de la agencia. */
export async function sembrarRoles(
  tx: ClienteDeSiembra,
  tenantId: string,
): Promise<Map<string, string>> {
  const rolPorClave = new Map<string, string>();
  for (const r of ROLES_SEMBRADOS) {
    const rol = await tx.rol.upsert({
      where: { tenantId_clave: { tenantId, clave: r.clave } },
      update: {},
      create: { tenantId, clave: r.clave, nombre: r.nombre, permisos: [...r.permisos] },
    });
    rolPorClave.set(r.clave, rol.id);
  }
  return rolPorClave;
}

// --- Formatos de viaje (ADR-0017 M2) ------------------------------------------
// Los cuatro de sistema, como copias editables de la agencia. Mismo contenido que siembra la
// migración 20261026120100 para las agencias que ya existían. Por NOMBRE y sin pisar nada: la
// agencia puede haber editado la plantilla o el orden.
export const FORMATOS_DE_SISTEMA = [
  { nombre: 'Excursión de un día', orden: 1, clave: 'excursion-de-un-dia', dias: 1, noches: 0 },
  { nombre: 'Pasadía', orden: 2, clave: 'pasadia', dias: 1, noches: 0 },
  { nombre: 'Pasanoche', orden: 3, clave: 'pasanoche', dias: 2, noches: 1 },
  { nombre: 'Paquete con hotel', orden: 4, clave: 'paquete-con-hotel' },
] as const satisfies ReadonlyArray<{
  nombre: string;
  orden: number;
  clave: string;
  dias?: number;
  noches?: number;
}>;

export const NOMBRE_FORMATO_EXCURSION_DE_UN_DIA = 'Excursión de un día';

/** Devuelve `nombre → id` de los formatos de la agencia. */
export async function sembrarFormatos(
  tx: ClienteDeSiembra,
  tenantId: string,
): Promise<Map<string, string>> {
  const idPorNombre = new Map<string, string>();
  for (const f of FORMATOS_DE_SISTEMA) {
    const valoresPorDefecto =
      'dias' in f ? { dias: f.dias, noches: f.noches } : ({} as Record<string, never>);
    const formato = await tx.formatoDeViaje.upsert({
      where: { tenantId_nombre: { tenantId, nombre: f.nombre } },
      update: {},
      create: {
        tenantId,
        nombre: f.nombre,
        orden: f.orden,
        plantilla: { clave: f.clave, version: 1, valoresPorDefecto },
      },
    });
    idPorNombre.set(f.nombre, formato.id);
  }
  return idPorNombre;
}

// --- Embudo ------------------------------------------------------------------
// Tabla, no enum: cada agencia define su proceso. R12 y ADR-0006.
export const ETAPAS_POR_DEFECTO = [
  { nombre: 'Consulta nueva', clave: 'NUEVO_LEAD', orden: 1, probabilidad: 10 },
  { nombre: 'En cotización', clave: 'EN_COTIZACION', orden: 2, probabilidad: 35 },
  { nombre: 'En negociación', clave: 'EN_NEGOCIACION', orden: 3, probabilidad: 70 },
  { nombre: 'Ganada', clave: 'GANADA', orden: 4, probabilidad: 100, esGanada: true },
  { nombre: 'Perdida', clave: 'PERDIDA', orden: 5, probabilidad: 0, esPerdida: true },
] as const satisfies ReadonlyArray<{
  nombre: string;
  clave: string;
  orden: number;
  probabilidad: number;
  esGanada?: boolean;
  esPerdida?: boolean;
}>;

/**
 * **Se identifican por CLAVE, no por orden.** El orden es presentación: una agencia lo reordena
 * arrastrando columnas y eso no convierte «Ganada» en otra etapa. La clave sí es identidad, y la
 * base lo respalda con una unique parcial `(tenant_id, clave) WHERE clave IS NOT NULL`.
 *
 * Identificarlas por orden rompía la siembra en cuanto la agencia tenía más etapas que las cinco
 * canónicas: con siete en la base, poner `GANADA` en el orden 4 chocaba contra la fila que ya la
 * tenía en el 6, y `pnpm db:seed` moría con P2002. Una semilla que solo funciona sobre una base
 * virgen no sirve para nada.
 */
export async function sembrarEtapas(tx: ClienteDeSiembra, tenantId: string): Promise<void> {
  const ordenesOcupados = new Set(
    (await tx.etapaPipeline.findMany({ where: { tenantId }, select: { orden: true } })).map(
      (x) => x.orden,
    ),
  );

  for (const e of ETAPAS_POR_DEFECTO) {
    const existente = await tx.etapaPipeline.findFirst({ where: { tenantId, clave: e.clave } });
    const esGanada = 'esGanada' in e ? e.esGanada : false;
    const esPerdida = 'esPerdida' in e ? e.esPerdida : false;

    if (existente) {
      // NO se toca el orden: la agencia pudo reordenar su embudo, y devolverlo a nuestro orden
      // por defecto en cada siembra le desharía la configuración.
      await tx.etapaPipeline.update({
        where: { id: existente.id },
        data: { nombre: e.nombre, probabilidad: e.probabilidad, esGanada, esPerdida },
      });
      continue;
    }

    // Si el orden que queríamos ya está ocupado por una etapa propia de la agencia, se va al
    // final en vez de pelearse por el sitio.
    let orden: number = e.orden;
    while (ordenesOcupados.has(orden)) orden += 1;
    ordenesOcupados.add(orden);

    await tx.etapaPipeline.create({
      data: {
        tenantId,
        nombre: e.nombre,
        clave: e.clave,
        orden,
        probabilidad: e.probabilidad,
        esGanada,
        esPerdida,
      },
    });
  }
}
