/**
 * El núcleo de escritura de `semilla-agencia-desde-json.ts`, separado del script para poder
 * ejercitarlo en una prueba con base de datos (`tests/semilla-agencia-aislamiento.spec.ts`).
 *
 * **No decide si se puede sembrar**: eso es de la guardia y del script, que lo llaman ya
 * decidido. Aquí solo se escribe.
 *
 * **Roles (R2).** Todo lo de negocio (roles, usuario, embudo, política, catálogo) se escribe con
 * el cliente `app` —`viajapro_app`, bajo RLS— con el tenant fijado en cada transacción. Lo único
 * que usa el cliente `plataforma` (propietario) es lo que ningún rol de aplicación puede hacer y
 * la migración 20261007120100 declara «camino de plataforma»: crear la fila de `tenants` y la fila
 * global de `identidades`. Es el mismo camino que ya usa `seed.ts`; no se inventa otro.
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import { POLITICA_POR_DEFECTO, type PoliticaDePrecio } from '@viajapro/domain';
import {
  CAMPOS_DEL_PAQUETE,
  NOMBRE_DEL_MAYORISTA_POR_CONFIRMAR,
  NOTA_DEL_MAYORISTA_POR_CONFIRMAR,
  VIGENCIA_PERMANENTE,
  mapearCatalogo,
  type PaqueteMapeado,
} from './semilla-agencia-mapeo.js';
import {
  NOMBRE_FORMATO_EXCURSION_DE_UN_DIA,
  sembrarEtapas,
  sembrarFormatos,
  sembrarRoles,
} from './siembra-de-tenant.js';

export interface ResumenSembrado {
  readonly tenantId: string;
  readonly slug: string;
  readonly paquetes: number;
  readonly vigencias: number;
  readonly tarifas: number;
  readonly opcionesDeSalida: number;
  readonly sinPrecio: number;
}

const aHora = (hhmm: string | null): Date | null =>
  hhmm === null ? null : new Date(`1970-01-01T${hhmm}:00.000Z`);

const aFecha = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

async function sembrarPaquete(
  tx: Prisma.TransactionClient,
  tenantId: string,
  p: PaqueteMapeado,
  paisIso: string,
  formatoId: string,
  mayoristaId: string,
  moneda: string,
): Promise<void> {
  const existente = await tx.paquete.findFirst({
    where: { tenantId, codigo: p.codigo, eliminadoEn: null },
    select: { id: true, camposPersonalizados: true },
  });

  // Los campos propios que esta semilla no conoce (los que la agencia añadió después) se
  // conservan: solo se pisan las claves que vienen del JSON.
  const previosCrudos = existente?.camposPersonalizados;
  const previos =
    typeof previosCrudos === 'object' && previosCrudos !== null && !Array.isArray(previosCrudos)
      ? previosCrudos
      : {};
  const datos = {
    nombre: p.nombre,
    destino: p.destino,
    paisIso,
    dias: p.dias,
    noches: p.noches,
    // Nulo: un pasadía no tiene régimen (ADR-0017 M2). No se inventa «sin alimentación».
    planAlimentacion: null,
    inclusiones: [...p.inclusiones],
    exclusiones: [...p.exclusiones],
    descripcion: p.descripcion,
    cargosEnDestino: p.cargosEnDestino.map((c) => ({
      concepto: c.concepto,
      monto: c.monto === null ? null : { unidades: c.monto.unidades, moneda: c.monto.moneda },
      unidad: c.unidad,
      ...(c.nota === undefined ? {} : { nota: c.nota }),
    })),
    camposPersonalizados: { ...previos, ...p.camposPersonalizados },
    formatoId,
    mayoristaId,
  };

  const paquete = existente
    ? await tx.paquete.update({ where: { id: existente.id }, data: datos, select: { id: true } })
    : await tx.paquete.create({
        data: { tenantId, codigo: p.codigo, ...datos },
        select: { id: true },
      });

  // Opciones de salida: por (paquete, etiqueta).
  const opcionPorEtiqueta = new Map<string, string>();
  for (const o of p.opciones) {
    const campos = {
      horaSalida: aHora(o.horaSalida),
      horaRegreso: aHora(o.horaRegreso),
      puntoDeEncuentro: o.puntoDeEncuentro,
      orden: o.orden,
    };
    const previa = await tx.opcionDeSalida.findFirst({
      where: { tenantId, paqueteId: paquete.id, etiqueta: o.etiqueta },
      select: { id: true },
    });
    const opcion = previa
      ? await tx.opcionDeSalida.update({
          where: { id: previa.id },
          data: campos,
          select: { id: true },
        })
      : await tx.opcionDeSalida.create({
          data: { tenantId, paqueteId: paquete.id, etiqueta: o.etiqueta, ...campos },
          select: { id: true },
        });
    opcionPorEtiqueta.set(o.etiqueta, opcion.id);
  }

  // Sin tarifas = «Consultar»: NO hay vigencia (ni vacía).
  if (p.tarifas.length === 0) return;

  const vigencia = await tx.vigencia.upsert({
    where: {
      tenantId_paqueteId_desde_hasta: {
        tenantId,
        paqueteId: paquete.id,
        desde: aFecha(VIGENCIA_PERMANENTE.desde),
        hasta: aFecha(VIGENCIA_PERMANENTE.hasta),
      },
    },
    update: {},
    create: {
      tenantId,
      paqueteId: paquete.id,
      desde: aFecha(VIGENCIA_PERMANENTE.desde),
      hasta: aFecha(VIGENCIA_PERMANENTE.hasta),
      publicada: false,
    },
    select: { id: true },
  });

  for (const t of p.tarifas) {
    const opcionDeSalidaId = t.opcionEtiqueta
      ? (opcionPorEtiqueta.get(t.opcionEtiqueta) ?? null)
      : null;
    const valores = {
      netoUnidades: t.netoUnidades,
      ventaUnidades: t.ventaUnidades,
      listaUnidades: t.listaUnidades,
      mayoristaId,
    };
    const previa = await tx.tarifa.findFirst({
      where: { tenantId, vigenciaId: vigencia.id, nombre: t.nombre, opcionDeSalidaId },
      select: { id: true },
    });
    if (previa) {
      // `promoHasta` NO se toca: si la agencia le puso fin a la promo, la siembra no lo borra.
      await tx.tarifa.update({ where: { id: previa.id }, data: valores });
    } else {
      await tx.tarifa.create({
        data: {
          tenantId,
          vigenciaId: vigencia.id,
          nombre: t.nombre,
          unidad: 'POR_PERSONA',
          cubrePasajeros: 1,
          monedaIso: moneda,
          opcionDeSalidaId,
          // `promoHasta` queda nulo: el sitio no publica vigencia de la promo y no se inventa.
          ...valores,
        },
      });
    }
  }
}

export interface EntradaDeSiembra {
  /** Propietario: SOLO `tenants` e `identidades` (camino de plataforma). */
  readonly plataforma: PrismaClient;
  /** `viajapro_app`: todo lo demás, bajo RLS. */
  readonly app: PrismaClient;
  /** El JSON ya leído (sin validar: lo valida `mapearCatalogo`). */
  readonly datos: unknown;
  readonly correoDelDueno: string;
}

export async function sembrarAgenciaDesdeCatalogo(
  entrada: EntradaDeSiembra,
): Promise<ResumenSembrado> {
  const { plataforma, app, datos, correoDelDueno } = entrada;
  // Primera lectura con la política por defecto: solo hace falta la agencia (nombre, slug).
  const agencia = mapearCatalogo(datos, POLITICA_POR_DEFECTO).agencia;

  // --- Plataforma: lo que ningún rol de aplicación puede escribir ---------------------
  await plataforma.moneda.createMany({
    data: [{ codigoIso: 'COP', nombre: 'Peso colombiano', decimales: 0 }],
    skipDuplicates: true,
  });
  const tenant = await plataforma.tenant.upsert({
    where: { slug: agencia.slug },
    update: {},
    create: {
      slug: agencia.slug,
      nombre: agencia.nombre,
      paisIso: agencia.paisIso,
      monedaIso: agencia.monedaIso,
      estado: 'ACTIVO',
    },
    select: { id: true },
  });
  const identidad = await plataforma.identidad.upsert({
    where: { correo: correoDelDueno },
    update: {},
    create: { correo: correoDelDueno, nombre: `Dueño de ${agencia.nombre}` },
    select: { id: true },
  });

  // --- Negocio: viajapro_app, bajo RLS, con el tenant fijado en cada transacción ------
  const conTenant = <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> =>
    app.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenant.id}::text, true)`;
        return fn(tx);
      },
      { timeout: 120_000, maxWait: 30_000 },
    );

  const base = await conTenant(async (tx) => {
    const rolPorClave = await sembrarRoles(tx, tenant.id);
    const rolDueno = rolPorClave.get('DUENO');
    if (!rolDueno) throw new Error('Falta el rol sembrado DUENO.');
    await tx.usuario.upsert({
      where: { tenantId_correo: { tenantId: tenant.id, correo: correoDelDueno } },
      update: {},
      create: {
        tenantId: tenant.id,
        identidadId: identidad.id,
        rolId: rolDueno,
        correo: correoDelDueno,
        nombre: `Dueño de ${agencia.nombre}`,
      },
    });
    await sembrarEtapas(tx, tenant.id);
    const formatos = await sembrarFormatos(tx, tenant.id);

    // La política de la agencia: las mismas cifras por defecto que la demo. `AMBOS` como en
    // `semilla-catalogo-real.ts`. Si ya existe NO se pisa: puede haberla cambiado la agencia.
    const fila = await tx.politicaDePrecio.upsert({
      where: { tenantId: tenant.id },
      update: {},
      create: {
        tenantId: tenant.id,
        modoDeCatalogo: 'AMBOS',
        porcentaje: POLITICA_POR_DEFECTO.porcentaje,
        base: POLITICA_POR_DEFECTO.base,
        origenDeLaVenta: POLITICA_POR_DEFECTO.origenDeLaVenta,
        redondeoVenta: POLITICA_POR_DEFECTO.redondeoVenta,
      },
    });
    const politica: PoliticaDePrecio = {
      porcentaje: Number(fila.porcentaje),
      base: fila.base,
      origenDeLaVenta: fila.origenDeLaVenta,
      redondeoVenta: fila.redondeoVenta,
    };

    await tx.definicionCampoPersonalizado.createMany({
      data: CAMPOS_DEL_PAQUETE.map((c) => ({ tenantId: tenant.id, entidad: 'PAQUETE', ...c })),
      skipDuplicates: true,
    });

    const mayoristaPrevio = await tx.mayorista.findFirst({
      where: { tenantId: tenant.id, nombre: NOMBRE_DEL_MAYORISTA_POR_CONFIRMAR },
      select: { id: true },
    });
    const mayorista =
      mayoristaPrevio ??
      (await tx.mayorista.create({
        data: {
          tenantId: tenant.id,
          nombre: NOMBRE_DEL_MAYORISTA_POR_CONFIRMAR,
          notas: NOTA_DEL_MAYORISTA_POR_CONFIRMAR,
        },
        select: { id: true },
      }));

    const formatoId = formatos.get(NOMBRE_FORMATO_EXCURSION_DE_UN_DIA);
    if (!formatoId) throw new Error('Falta el formato «Excursión de un día».');
    return { politica, formatoId, mayoristaId: mayorista.id };
  });

  // El neto se deriva con la política REAL de la agencia, no con la de por defecto.
  const catalogo = mapearCatalogo(datos, base.politica);
  for (const p of catalogo.paquetes) {
    await conTenant((tx) =>
      sembrarPaquete(
        tx,
        tenant.id,
        p,
        agencia.paisIso,
        base.formatoId,
        base.mayoristaId,
        agencia.monedaIso,
      ),
    );
  }

  return conTenant(async (tx) => ({
    tenantId: tenant.id,
    slug: agencia.slug,
    paquetes: await tx.paquete.count({ where: { tenantId: tenant.id } }),
    vigencias: await tx.vigencia.count({ where: { tenantId: tenant.id } }),
    tarifas: await tx.tarifa.count({ where: { tenantId: tenant.id } }),
    opcionesDeSalida: await tx.opcionDeSalida.count({ where: { tenantId: tenant.id } }),
    sinPrecio: await tx.paquete.count({ where: { tenantId: tenant.id, vigencias: { none: {} } } }),
  }));
}
