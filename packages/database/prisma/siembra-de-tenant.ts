/**
 * Lo que recibe TODA agencia sembrada: roles, formatos de viaje de sistema, embudo por defecto,
 * motivos de pérdida y etiquetas de conversación.
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
      'bandeja.operar',
      'crm.escribir',
      'cotizacion.escribir',
      'archivo.ver',
      'archivo.operar',
      // T-324 (HU-inbox-1 §3): solo el dueño gestiona el catálogo de etiquetas; las asesoras
      // ponen y quitan con `bandeja.operar`. La agencia puede dárselo a ASESOR.
      'etiquetas.administrar',
      // T-329 (ADR-0034 §6): los tres de cobro. `cobro.corregir` (devolución, ajuste, penalidad,
      // reverso y plazos) solo aquí: quien registra un pago no lo compensa.
      'cobro.ver',
      'cobro.registrar',
      'cobro.corregir',
      // T-341 (ADR-0035 §3): los reportes de toda la agencia. SOLO aquí: la ausencia del permiso
      // es el nivel «propio», que es lo que ven ASESOR y OPERACIONES. La agencia puede dárselo a
      // otro rol desde Ajustes.
      'reportes.ver_agencia',
    ],
  },
  {
    clave: 'ASESOR',
    nombre: 'Asesor',
    // T-089: el Asesor atiende la bandeja, escribe en el CRM y cotiza. T-249: y opera los
    // archivos de viaje que nacen de sus cotizaciones (ADR-0024 §3.7).
    // T-329 (ADR-0034 §6): ve el cobro y registra pagos; no los compensa (sin `cobro.corregir`).
    permisos: [
      'bandeja.operar',
      'crm.escribir',
      'cotizacion.escribir',
      'archivo.ver',
      'archivo.operar',
      'cobro.ver',
      'cobro.registrar',
    ],
  },
  {
    clave: 'OPERACIONES',
    nombre: 'Operaciones',
    // ADR-0017 D2: Operaciones mantiene el catálogo; el Asesor no. T-089: sin `bandeja.operar`,
    // `crm.escribir` ni `cotizacion.escribir`. T-249 (ADR-0024 §3.7): sí opera los archivos de
    // viaje, que es confirmar con el proveedor y pagarle. T-329 (ADR-0034 §6, supuesto sin
    // verificar): solo ve el cobro.
    permisos: [
      'conversaciones.ver_todas',
      'catalogo.administrar',
      'archivo.ver',
      'archivo.operar',
      'cobro.ver',
    ],
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

// --- Motivos de pérdida (T-214) -----------------------------------------------
// Tabla por agencia, no enum (R12). Las siete CLAVES son los valores del enum `MotivoPerdida`
// (la taxonomía común con la que se comparan agencias); las etiquetas, las que muestra la web.
// Mismo contenido que siembra la migración 20261115150000 para las agencias que ya existían.
export const MOTIVOS_DE_PERDIDA_SEMBRADOS = [
  { clave: 'PRECIO', etiqueta: 'Precio alto frente a presupuesto', orden: 0 },
  { clave: 'TIEMPO_DE_RESPUESTA', etiqueta: 'Tiempo de respuesta tardío (SLA)', orden: 1 },
  { clave: 'SIN_DISPONIBILIDAD', etiqueta: 'Sin disponibilidad en fechas / cupos', orden: 2 },
  { clave: 'COMPRO_EN_OTRA_AGENCIA', etiqueta: 'Compró con otra agencia', orden: 3 },
  { clave: 'VIAJE_APLAZADO', etiqueta: 'Viaje aplazado o cancelado por el cliente', orden: 4 },
  { clave: 'NO_RESPONDE', etiqueta: 'Cliente dejó de responder', orden: 5 },
  { clave: 'OTRO', etiqueta: 'Otro motivo (especificar)', orden: 6, exigeNota: true },
] as const satisfies ReadonlyArray<{
  clave: string;
  etiqueta: string;
  orden: number;
  exigeNota?: boolean;
}>;

/**
 * Por CLAVE y sin pisar nada: la agencia puede haber cambiado la etiqueta, el orden o
 * desactivado un motivo, y la siembra no se lo deshace.
 */
export async function sembrarMotivosDePerdida(
  tx: ClienteDeSiembra,
  tenantId: string,
): Promise<void> {
  for (const m of MOTIVOS_DE_PERDIDA_SEMBRADOS) {
    await tx.motivoDePerdida.upsert({
      where: { tenantId_clave: { tenantId, clave: m.clave } },
      update: {},
      create: {
        tenantId,
        clave: m.clave,
        etiqueta: m.etiqueta,
        orden: m.orden,
        exigeNota: 'exigeNota' in m ? m.exigeNota : false,
      },
    });
  }
}

// --- Etiquetas de conversación (T-324, HU-inbox-1) ------------------------------
// Tabla por agencia, no enum (R12). Mismo contenido que siembra la migración 20261121110000 para
// las agencias que ya existían. Editables y borrables como cualquier otra. Ojo: volver a sembrar
// una agencia (`pnpm db:seed` sobre la demo) repone la que la agencia hubiera borrado; las agencias
// reales no se re-siembran.
/** Una etiqueta sembrable: nombre, clave de color de la paleta (CHECK en la base) y orden. */
export interface EtiquetaSembrada {
  readonly nombre: string;
  readonly color: string;
  readonly orden: number;
}

export const ETIQUETAS_SEMBRADAS = [
  { nombre: 'Pagado', color: 'verde', orden: 0 },
  { nombre: 'Pago pendiente', color: 'ambar', orden: 1 },
  { nombre: 'Seguimiento', color: 'azul', orden: 2 },
] as const satisfies ReadonlyArray<EtiquetaSembrada>;

/** La clave de la unicidad de la base: `lower(btrim(nombre))`. */
const nombreNormalizado = (nombre: string): string => nombre.trim().toLowerCase();

/**
 * Por NOMBRE NORMALIZADO y sin pisar nada: si la agencia ya tiene «pagado» (con otro color u
 * orden), se le deja la suya. La unicidad es de expresión (`lower(btrim(nombre))`) y Prisma no
 * sabe hacer `upsert` sobre ella: se filtra lo que ya existe y el resto entra con
 * `skipDuplicates` (ON CONFLICT DO NOTHING), que además cubre a dos siembras a la vez.
 *
 * Recibe la lista para que la agencia demo pueda añadir las suyas (T-614) por el mismo camino, sin
 * copiar aquí la comparación con `lower(btrim(nombre))` ni la carrera que cubre `skipDuplicates`.
 */
export async function sembrarEtiquetasDadas(
  tx: ClienteDeSiembra,
  tenantId: string,
  etiquetas: ReadonlyArray<EtiquetaSembrada>,
): Promise<void> {
  const existentes = new Set(
    (await tx.label.findMany({ where: { tenantId }, select: { nombre: true } })).map((e) =>
      nombreNormalizado(e.nombre),
    ),
  );
  const faltan = etiquetas.filter((e) => !existentes.has(nombreNormalizado(e.nombre)));
  if (faltan.length === 0) return;
  await tx.label.createMany({
    data: faltan.map((e) => ({ tenantId, nombre: e.nombre, color: e.color, orden: e.orden })),
    skipDuplicates: true,
  });
}

/** Las tres que recibe TODA agencia. Son las mismas que sembró la migración 20261121110000. */
export async function sembrarEtiquetas(tx: ClienteDeSiembra, tenantId: string): Promise<void> {
  await sembrarEtiquetasDadas(tx, tenantId, ETIQUETAS_SEMBRADAS);
}
