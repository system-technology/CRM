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
    where: { id: '01932000-0000-7000-8000-00000000aa01' },
    update: {},
    create: {
      id: '01932000-0000-7000-8000-00000000aa01',
      tenantId,
      nombre: 'Mayorista por confirmar',
      notas:
        'La hoja de referencia es de venta al público. Los netos de estas tarifas están DERIVADOS ' +
        'de la venta con la política de la agencia (20 % sobre el neto), no vienen del mayorista. ' +
        'Se sustituyen en cuanto llegue su tarifario.',
    },
  });

  const paquetesPorNombre = new Map<string, string>();

  const asegurarPaquete = async (nombre: string, noches: number): Promise<string> => {
    const existente = paquetesPorNombre.get(nombre);
    if (existente) return existente;

    const paquete = await prisma.paquete.create({
      data: {
        tenantId,
        nombre,
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
    paquetesPorNombre.set(nombre, paquete.id);
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

  return {
    paquetes: paquetesPorNombre.size,
    vigencias: await prisma.vigencia.count({ where: { tenantId } }),
    tarifas: await prisma.tarifa.count({ where: { tenantId } }),
  };
}
