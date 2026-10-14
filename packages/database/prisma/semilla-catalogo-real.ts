/**
 * Siembra el catálogo REAL de Agencias André's Tours sobre el modelo de ADR-0009.
 *
 * La fuente es `docs/01-producto/10-catalogo-real-de-referencia.json`, transcrito de la pieza de
 * la campaña «Octubre — Semana de receso». **47 líneas, 34 productos, 8 grupos de salida.**
 *
 * **Lo que esta hoja demuestra, y es el motivo de que ADR-0009 cambiara de forma:** la misma
 * agencia, en la misma campaña, vende de las dos maneras. Siete grupos publican fechas concretas
 * —sábado 3 y 10, domingo 4 y 11—, y las cuatro super excursiones no publican fecha de salida
 * común: cada una tiene la suya. Si hubiéramos apostado por un solo arquetipo, media hoja no
 * cabría. Aquí las dos formas son la misma tabla.
 *
 * **Los netos son DERIVADOS, no del mayorista.** La hoja trae precios de venta al público. Hasta
 * que llegue el tarifario neto, el neto se calcula con la política de la agencia —20 % sobre el
 * neto— y queda anotado como derivado en las notas del mayorista. No es el dato real y no debe
 * enseñarse como tal.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { PrismaClient } from '@prisma/client';
import { POLITICA_POR_DEFECTO, Money, derivarNeto } from '@viajapro/domain';

/** Se lee del archivo en vez de importarlo para no atar la semilla a `resolveJsonModule`. */
const RUTA_CATALOGO = fileURLToPath(
  new URL('../../../docs/01-producto/10-catalogo-real-de-referencia.json', import.meta.url),
);

interface ProductoHoja {
  nombre: string;
  precio_cop: number;
  sale?: string;
  regresa?: string;
}

interface GrupoHoja {
  tipo: string;
  fechas?: string[];
  productos: ProductoHoja[];
}

/**
 * Noches por tipo de producto. El invariante es **el número de noches**; «pasadía» y «excursión»
 * son etiquetas de la agencia (R12, `TripFormat`). Las super excursiones traen sus propias fechas
 * de ida y vuelta, así que ahí se calcula y no se supone.
 */
const NOCHES_POR_TIPO: Record<string, number> = {
  PASADIA: 0,
  PASANOCHE: 1,
  MINI_EXCURSION: 2,
  EXCURSION: 3,
  PROMO_PAREJA: 0,
};

/**
 * La promo de pareja no es un producto aparte: es **otra tarifa sobre el mismo día** de un
 * pasadía que ya existe. Por eso se mapea a mano, con la correspondencia explícita: así el
 * tablero enseña una vigencia con dos tarifas —por persona y por pareja—, que es justo lo que
 * `UnidadDeCobro` existe para representar.
 *
 * «Ukumarí + Filandia» no aparece como pasadía en la hoja, así que ese sí es producto propio.
 */
const PAREJA_SOBRE_PASADIA: Record<string, string> = {
  Consotá: 'Parque Consotá',
};

/** Fijo, para que la semilla reconozca lo que ella misma creo en corridas anteriores. */
const MAYORISTA_ID = '01932000-0000-7000-8000-00000000aa01';

const diasEntre = (desde: string, hasta: string): number =>
  Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000);

export async function sembrarCatalogoReal(
  prisma: PrismaClient,
  tenantId: string,
): Promise<{ paquetes: number; vigencias: number; tarifas: number }> {
  const catalogo = JSON.parse(readFileSync(RUTA_CATALOGO, 'utf8')) as { salidas: GrupoHoja[] };
  const grupos = catalogo.salidas;

  // --- La política de precio de esta agencia --------------------------------
  // 20 % sobre el neto, que es lo que fijó el propietario el 2026-10-13. `AMBOS` porque su hoja
  // demuestra las dos formas de publicar.
  await prisma.politicaDePrecio.upsert({
    where: { tenantId },
    update: {},
    create: {
      tenantId,
      modoDeCatalogo: 'AMBOS',
      porcentaje: POLITICA_POR_DEFECTO.porcentaje,
      base: POLITICA_POR_DEFECTO.base,
      origenDeLaVenta: POLITICA_POR_DEFECTO.origenDeLaVenta,
      redondeoVenta: POLITICA_POR_DEFECTO.redondeoVenta,
    },
  });

  // --- El mayorista -------------------------------------------------------
  // Se llama así a propósito: la hoja es de venta al público y no dice a quién se le compra.
  // Un nombre inventado haría pasar por dato lo que es un hueco.
  const mayorista = await prisma.mayorista.upsert({
    where: { id: MAYORISTA_ID },
    update: {},
    create: {
      id: MAYORISTA_ID,
      tenantId,
      nombre: 'Mayorista por confirmar',
      notas:
        'La hoja de referencia es de venta al público. Los netos de estas tarifas están DERIVADOS ' +
        'de la venta con la política de la agencia (20 % sobre el neto), no vienen del mayorista. ' +
        'Se sustituyen en cuanto llegue su tarifario.',
    },
  });

  // --- Idempotencia -------------------------------------------------------
  // Correr `db:seed` dos veces duplicaba el catalogo entero: 33 paquetes pasaban a 70. Se borra
  // lo que ESTA semilla creo en corridas anteriores —se reconoce por el mayorista fijo— y se
  // vuelve a sembrar. Vigencias y tarifas caen por cascada.
  //
  // **Lo que tiene una oportunidad enganchada NO se toca.** La foranea es `RESTRICT` y con razon:
  // borrar un paquete por el que alguien esta negociando dejaria la oportunidad sin producto. Se
  // conservan y mas abajo se reutilizan en vez de duplicarse.
  const mios = await prisma.paquete.findMany({
    where: { tenantId, mayoristaId: MAYORISTA_ID },
    select: { id: true },
  });
  if (mios.length > 0) {
    const ids = mios.map((p) => p.id);
    const enUso = await prisma.oportunidad.findMany({
      where: { tenantId, paqueteId: { in: ids } },
      select: { paqueteId: true },
    });
    const protegidos = new Set(enUso.map((o) => o.paqueteId));
    const borrables = ids.filter((id) => !protegidos.has(id));
    if (borrables.length > 0) {
      await prisma.paquete.deleteMany({ where: { id: { in: borrables } } });
    }
    if (protegidos.size > 0) {
      console.log(`  (se conservan ${protegidos.size} paquetes con oportunidad viva)`);
    }
  }

  const paquetesPorNombre = new Map<string, string>();

  /**
   * **La clave es el nombre MAS las noches, y no solo el nombre.** La hoja tiene «Pianguita +
   * Ballenas» como pasadia a 329.000 y como pasanoche a 569.000: mismo nombre, producto distinto.
   * Con el nombre solo, el segundo se colaba como una tarifa mas del primero y el tablero
   * enseñaba un pasadia con dos precios sin decir que uno incluye una noche.
   *
   * Es justo el hecho 3 del ADR-0009 visto desde el otro lado: el nombre no identifica el
   * producto. Aqui lo identifica la combinacion con las noches.
   */
  const asegurarPaquete = async (nombre: string, noches: number): Promise<string> => {
    const clave = `${nombre}::${noches}`;
    const enMemoria = paquetesPorNombre.get(clave);
    if (enMemoria) return enMemoria;

    const nombreVisible =
      noches > 0 ? `${nombre} (${noches} ${noches === 1 ? 'noche' : 'noches'})` : nombre;

    // Puede sobrevivir de una corrida anterior por tener una oportunidad enganchada.
    const sobreviviente = await prisma.paquete.findFirst({
      where: { tenantId, nombre: nombreVisible, noches },
      select: { id: true },
    });
    if (sobreviviente) {
      paquetesPorNombre.set(clave, sobreviviente.id);
      return sobreviviente.id;
    }

    const paquete = await prisma.paquete.create({
      data: {
        tenantId,
        nombre: nombreVisible,
        // La hoja no declara destino aparte del nombre del producto, y el nombre ES el destino
        // en este mercado: «Parque del café», «Lago Calima». No se inventa uno.
        destino: nombre.slice(0, 120),
        paisIso: 'CO',
        dias: noches + 1,
        noches,
        // La hoja no declara régimen alimenticio. Se deja el más conservador en vez de suponer
        // un «todo incluido» que después haya que desdecir delante de un cliente.
        planAlimentacion: 'SIN_ALIMENTACION',
        inclusiones: [],
        exclusiones: [],
        mayoristaId: mayorista.id,
      },
    });
    paquetesPorNombre.set(clave, paquete.id);
    return paquete.id;
  };

  const crearVigencia = async (
    paqueteId: string,
    desde: string,
    hasta: string,
    publicada: boolean,
  ): Promise<string> => {
    const vigencia = await prisma.vigencia.upsert({
      where: {
        tenantId_paqueteId_desde_hasta: {
          tenantId,
          paqueteId,
          desde: new Date(desde),
          hasta: new Date(hasta),
        },
      },
      update: {},
      create: {
        tenantId,
        paqueteId,
        desde: new Date(desde),
        hasta: new Date(hasta),
        publicada,
      },
    });
    return vigencia.id;
  };

  const crearTarifa = async (
    vigenciaId: string,
    nombre: string,
    ventaCop: number,
    unidad: 'POR_PERSONA' | 'POR_GRUPO',
    cubrePasajeros: number,
    tipoPasajero: 'ADT' | 'CHD' | null = null,
    edades: { minima: number | null; maxima: number | null } = { minima: null, maxima: null },
  ): Promise<void> => {
    const venta = Money.desdeUnidades(ventaCop, 'COP');
    const neto = derivarNeto(venta, POLITICA_POR_DEFECTO);

    await prisma.tarifa.create({
      data: {
        tenantId,
        vigenciaId,
        nombre,
        unidad,
        cubrePasajeros,
        netoUnidades: neto.aPersistencia().unidades,
        ventaUnidades: venta.aPersistencia().unidades,
        monedaIso: 'COP',
        mayoristaId: mayorista.id,
        tipoPasajero,
        edadMinima: edades.minima,
        edadMaxima: edades.maxima,
      },
    });
  };

  // --- Los siete grupos con fecha publicada --------------------------------
  for (const grupo of grupos) {
    if (grupo.tipo === 'SUPER_EXCURSION' || grupo.tipo === 'PROMO_PAREJA') continue;

    const noches = NOCHES_POR_TIPO[grupo.tipo] ?? 0;
    for (const producto of grupo.productos) {
      const paqueteId = await asegurarPaquete(producto.nombre, noches);
      for (const fecha of grupo.fechas ?? []) {
        const vigenciaId = await crearVigencia(paqueteId, fecha, fecha, true);
        await crearTarifa(vigenciaId, 'Adulto', producto.precio_cop, 'POR_PERSONA', 1);
      }
    }
  }

  // --- Las super excursiones: cada una con SU fecha ------------------------
  // Es el grupo que tumbó la idea de que una campaña tiene un calendario común.
  for (const grupo of grupos) {
    if (grupo.tipo !== 'SUPER_EXCURSION') continue;
    for (const producto of grupo.productos) {
      if (!producto.sale || !producto.regresa) continue;
      const noches = diasEntre(producto.sale, producto.regresa);
      const paqueteId = await asegurarPaquete(producto.nombre, noches);
      const vigenciaId = await crearVigencia(paqueteId, producto.sale, producto.sale, true);
      await crearTarifa(vigenciaId, 'Adulto', producto.precio_cop, 'POR_PERSONA', 1);
    }
  }

  // --- La promo de pareja: segunda tarifa sobre el mismo día ---------------
  for (const grupo of grupos) {
    if (grupo.tipo !== 'PROMO_PAREJA') continue;
    for (const producto of grupo.productos) {
      const nombrePasadia = PAREJA_SOBRE_PASADIA[producto.nombre] ?? producto.nombre;
      const paqueteId = await asegurarPaquete(nombrePasadia, 0);
      for (const fecha of grupo.fechas ?? []) {
        const vigenciaId = await crearVigencia(paqueteId, fecha, fecha, true);
        await crearTarifa(vigenciaId, 'Promo pareja', producto.precio_cop, 'POR_GRUPO', 2);
      }
    }
  }

  // --- Tarifa de menor en los productos con noche --------------------------
  //
  // **Esto NO sale de la hoja, y es una suposición explícita.** El tarifario del piloto no trae
  // ni una tarifa diferenciada por edad: son pasadías, y en un pasadía el niño paga la silla
  // igual. Pero en cuanto hay hotel, la tarifa de menor existe siempre, y sin ella no se puede
  // demostrar —ni probar— que una cotización es la SUMA de varias tarifas y no una sola.
  //
  // El 25 % de descuento es nuestro, no del mayorista. Se sustituye en cuanto llegue su hoja.
  const DESCUENTO_MENOR = 0.75;

  const conNoche = await prisma.vigencia.findMany({
    where: { tenantId, paquete: { noches: { gt: 0 }, mayoristaId: MAYORISTA_ID } },
    select: { id: true, tarifas: { select: { ventaUnidades: true, nombre: true } } },
  });
  for (const v of conNoche) {
    if (v.tarifas.some((t) => t.nombre.startsWith('Menor'))) continue;
    const adulto = v.tarifas[0];
    if (!adulto) continue;
    const ventaMenor = Math.round((Number(adulto.ventaUnidades) * DESCUENTO_MENOR) / 1000) * 1000;
    await crearTarifa(v.id, 'Menor de 2 a 11 años', ventaMenor, 'POR_PERSONA', 1, 'CHD', {
      minima: 2,
      maxima: 11,
    });
    // La de adulto tiene que decir que es de adulto, o se cobraría también a los niños.
    await prisma.tarifa.updateMany({
      where: { tenantId, vigenciaId: v.id, tipoPasajero: null, aditiva: false },
      data: { tipoPasajero: 'ADT' },
    });
  }

  // --- Vigencias abiertas: la OTRA forma de vender -------------------------
  //
  // **Esto no sale de la hoja, y hay que decirlo.** La hoja publica fechas concretas. Pero una
  // agencia real vende el mismo pasadia cualquier otro dia de la campania «bajo consulta de
  // cupo», y ese es el segundo modo que el ADR-0009 existe para cubrir.
  //
  // Sin esto, la base NO contiene ni una sola vigencia abierta: el modelo diria que soporta las
  // dos formas de vender y los datos solo demostrarian una. Ademas deja sin probar la regla de
  // desempate —la salida publicada gana al rango que la contiene— y el filtro `publicada` del
  // listado, que es lo que impide anunciar un rango de un mes como si fuera una fecha.
  //
  // Mismo precio que la fecha publicada: subirlo o bajarlo seria inventar una politica comercial
  // que nadie nos ha dicho.
  const CAMPANIA_DESDE = '2026-10-01';
  const CAMPANIA_HASTA = '2026-10-31';

  for (const grupo of grupos) {
    if (grupo.tipo !== 'PASADIA') continue;
    for (const producto of grupo.productos) {
      const paqueteId = await asegurarPaquete(producto.nombre, 0);
      const vigenciaId = await crearVigencia(paqueteId, CAMPANIA_DESDE, CAMPANIA_HASTA, false);
      const yaTiene = await prisma.tarifa.count({ where: { tenantId, vigenciaId } });
      if (yaTiene === 0) {
        await crearTarifa(
          vigenciaId,
          'Adulto (bajo consulta)',
          producto.precio_cop,
          'POR_PERSONA',
          1,
        );
      }
    }
  }

  return {
    paquetes: paquetesPorNombre.size,
    vigencias: await prisma.vigencia.count({ where: { tenantId } }),
    tarifas: await prisma.tarifa.count({ where: { tenantId } }),
  };
}
