/**
 * Adaptador puro tabla + mapeo -> `PropuestaDeCatalogo` (origen `ARCHIVO`). ADR-0017 §4.2.
 *
 * Convierte texto de una hoja en datos tipados. **No decide nada de negocio**: los invariantes
 * (noches, vigencias empatadas, listas, neto sin permiso...) los comprueba `validarYPlanificar`.
 * Lo que sí hace aquí es lo único que el núcleo no puede: dar error a una celda que no se deja
 * leer (fecha que no existe, importe ilegible, valor fuera de la lista) con su fila y columna.
 *
 * Una fila con algún error de lectura se descarta de la propuesta y se informa; como el informe
 * final lleva el error, confirmar es imposible mientras exista (todo o nada).
 *
 * Una fila sin precio no es un error: crea el producto sin vigencia, y el núcleo avisa
 * `SIN_PRECIO` (el producto existe y se mostrará «a consultar»).
 */

import {
  CONDICION_SIEMPRE,
  PLANTILLAS_DE_SISTEMA,
  type DescriptorDePlantilla,
  type ElementoDeInforme,
  type MapeoDeColumnas,
  type OpcionDeSalidaPropuesta,
  type ProductoPropuesto,
  type PropuestaDeCatalogo,
  type TablaDeImportacion,
  type TarifaPropuesta,
  type VigenciaPropuesta,
} from '@viajapro/contracts';
import { DomainError } from '@viajapro/domain';
import { normalizarNombre } from './validar-y-planificar.js';

/** El mapeo no sirve para esta tabla o esta plantilla. Es un 400: la persona corrige el mapeo. */
export class MapeoInvalidoError extends DomainError {
  readonly code = 'MAPEO_INVALIDO';
  constructor(detalle: string) {
    super(`El mapeo de columnas no es válido: ${detalle}`);
  }
}

export interface ResultadoDeLectura {
  /** `null` si ninguna fila se pudo leer. */
  readonly propuesta: PropuestaDeCatalogo | null;
  /** Errores de lectura, uno por celda, con fila y columna. */
  readonly errores: readonly ElementoDeInforme[];
}

type Moneda = 'COP' | 'USD' | 'EUR' | 'MXN';
type Dinero = { unidades: string; moneda: Moneda };

/** Decimales de la unidad mínima. En COP la unidad mínima es el peso (R8). */
const DECIMALES: Record<Moneda, number> = { COP: 0, USD: 2, EUR: 2, MXN: 2 };

// =============================================================================
// Lectores de celda (puros, exportados para sus pruebas)
// =============================================================================

/** `'$ 1.236.000'` COP -> `'1236000'`; `'12,50'` USD -> `'1250'`. `null` si no se puede leer. */
export function leerDinero(texto: string, moneda: Moneda): string | null {
  const s = texto.replace(/\s|\$|€|COP|USD|EUR|MXN/gi, '');
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const decimales = DECIMALES[moneda];
  const ultimo = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
  if (ultimo === -1) return (BigInt(s) * 10n ** BigInt(decimales)).toString();

  const antes = s.slice(0, ultimo);
  const despues = s.slice(ultimo + 1);
  const agrupado = (t: string): boolean => /^\d{1,3}([.,]\d{3})*$/.test(t) || /^\d+$/.test(t);

  // Solo miles: «1.236.000», o «1.236» cuando la moneda no tiene decimales o hay tres cifras.
  if (despues.length === 3 || decimales === 0) {
    if (!agrupado(s) || (despues.length !== 3 && decimales === 0)) return null;
    return (BigInt(s.replace(/[.,]/g, '')) * 10n ** BigInt(decimales)).toString();
  }
  if (despues.length < 1 || despues.length > decimales || !agrupado(antes)) return null;
  const entero = BigInt(antes.replace(/[.,]/g, ''));
  return (entero * 10n ** BigInt(decimales) + BigInt(despues.padEnd(decimales, '0'))).toString();
}

/** `'15/12/2026'` -> `'2026-12-15'`. `null` si no es una fecha que exista. */
export function leerFecha(
  texto: string,
  formato: MapeoDeColumnas['formatoDeFecha'] = 'DD/MM/AAAA',
): string | null {
  const t = texto.trim();
  let a: string;
  let m: string;
  let d: string;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  const barras = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (iso) [, a = '', m = '', d = ''] = iso;
  else if (barras) {
    const [, x = '', y = '', anio = ''] = barras;
    a = anio;
    [d, m] = formato === 'DD/MM/AAAA' ? [x, y] : [y, x];
  } else return null;
  const anio = Number(a);
  const mes = Number(m);
  const dia = Number(d);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  if (
    fecha.getUTCFullYear() !== anio ||
    fecha.getUTCMonth() !== mes - 1 ||
    fecha.getUTCDate() !== dia
  ) {
    return null;
  }
  return `${a}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function leerHora(texto: string): string | null {
  const r = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(texto.trim());
  return r ? `${(r[1] ?? '').padStart(2, '0')}:${r[2] ?? ''}` : null;
}

function leerBooleano(texto: string): boolean | null {
  const t = normalizarNombre(texto);
  if (['si', 'true', '1', 'x', 'yes'].includes(t)) return true;
  if (['no', 'false', '0'].includes(t)) return false;
  return null;
}

// =============================================================================
// Adaptador
// =============================================================================

export function plantillaDeSistema(formato: string): DescriptorDePlantilla | undefined {
  return PLANTILLAS_DE_SISTEMA.find((p) => p.formato === formato);
}

class FilaIlegible extends Error {}

interface ProductoEnConstruccion {
  producto: Omit<ProductoPropuesto, 'vigencias' | 'opcionesDeSalida'> & {
    opcionesDeSalida: OpcionDeSalidaPropuesta[];
    vigencias: VigenciaPropuesta[];
  };
}

export function tablaAPropuesta(
  tabla: TablaDeImportacion,
  mapeo: MapeoDeColumnas,
): ResultadoDeLectura {
  const plantilla = plantillaDeSistema(mapeo.formato);
  if (!plantilla) throw new MapeoInvalidoError(`el formato '${mapeo.formato}' no existe`);
  const claves = new Set(plantilla.columnas.map((c) => c.clave));
  const mapeadas = new Map<string, number>();
  for (const [clave, indice] of Object.entries(mapeo.columnas)) {
    if (!claves.has(clave)) {
      throw new MapeoInvalidoError(
        `la columna '${clave}' no existe en el formato '${mapeo.formato}'`,
      );
    }
    if (indice >= tabla.encabezados.length) {
      throw new MapeoInvalidoError(`'${clave}' apunta a una columna que la tabla no tiene`);
    }
    mapeadas.set(clave, indice);
  }
  const porDefecto = plantilla.valoresPorDefecto;
  const tieneRespaldo = (clave: string): boolean =>
    (clave === 'dias' && porDefecto.dias !== undefined) ||
    (clave === 'noches' && porDefecto.noches !== undefined) ||
    clave === 'vigencia_hasta' ||
    clave === 'tarifa_nombre' ||
    (clave === 'moneda' && mapeo.moneda !== undefined);
  const faltan = plantilla.columnas
    .filter((c) => c.obligatoria && !mapeadas.has(c.clave) && !tieneRespaldo(c.clave))
    .map((c) => c.clave);
  if (faltan.length > 0) {
    throw new MapeoInvalidoError(`faltan columnas obligatorias sin mapear: ${faltan.join(', ')}`);
  }
  if (!mapeadas.has('dias') && porDefecto.dias === undefined) {
    throw new MapeoInvalidoError('falta la columna dias');
  }

  const errores: ElementoDeInforme[] = [];
  const productos = new Map<string, ProductoEnConstruccion>();

  tabla.filas.forEach((celdas, i) => {
    const fila = tabla.filaInicial + i;
    if (celdas.every((c) => c.trim() === '')) return;
    const columnaDe = (clave: string): string => {
      const indice = mapeadas.get(clave);
      return (
        ((indice === undefined ? clave : tabla.encabezados[indice]) ?? clave).trim().slice(0, 80) ||
        clave
      );
    };
    const errorDeFila = (clave: string, codigo: string, mensaje: string): void => {
      const indice = mapeadas.get(clave);
      const encabezado = indice === undefined ? clave : (tabla.encabezados[indice] ?? clave);
      errores.push({
        nivel: 'ERROR',
        codigo,
        ruta: `tabla.filas[${fila}].${clave}`,
        mensaje,
        procedencia: { fila, columna: (encabezado.trim() || clave).slice(0, 80) },
      });
    };
    const texto = (clave: string): string => {
      const indice = mapeadas.get(clave);
      return indice === undefined ? '' : (celdas[indice] ?? '').trim();
    };
    let ilegible = false;
    const falla = (clave: string, codigo: string, mensaje: string): void => {
      errorDeFila(clave, codigo, mensaje);
      ilegible = true;
    };
    const obligatoria = (clave: string): string => {
      const t = texto(clave);
      if (t === '') falla(clave, 'CELDA_OBLIGATORIA', 'la celda no puede estar vacía');
      return t;
    };
    const entero = (clave: string, defecto: number | undefined): number => {
      const t = texto(clave);
      if (t === '') {
        if (defecto === undefined)
          falla(clave, 'CELDA_OBLIGATORIA', 'la celda no puede estar vacía');
        return defecto ?? 0;
      }
      if (!/^\d{1,4}$/.test(t)) falla(clave, 'VALOR_INVALIDO', `'${t}' no es un entero`);
      return Number(t.slice(0, 4)) || 0;
    };
    const fecha = (clave: string): string | null => {
      const t = texto(clave);
      if (t === '') return null;
      const f = leerFecha(t, mapeo.formatoDeFecha);
      if (f === null) falla(clave, 'FECHA_INVALIDA', `'${t}' no es una fecha que exista`);
      return f;
    };
    const hora = (clave: string): string | undefined => {
      const t = texto(clave);
      if (t === '') return undefined;
      const h = leerHora(t);
      if (h === null) falla(clave, 'VALOR_INVALIDO', `'${t}' no es una hora HH:MM`);
      return h ?? undefined;
    };
    const enumerado = (clave: string, valores: readonly string[]): string | undefined => {
      const t = texto(clave);
      if (t === '') return undefined;
      const v = normalizarNombre(t).toUpperCase().replace(/ /g, '_');
      if (!valores.includes(v)) falla(clave, 'VALOR_INVALIDO', `'${t}' no es un valor admitido`);
      return v;
    };

    try {
      // ---- producto ----
      const codigo = texto('codigo') || undefined;
      const nombre = obligatoria('nombre');
      const destino = obligatoria('destino');
      const dias = entero('dias', porDefecto.dias);
      const noches = entero('noches', porDefecto.noches);
      const plan = enumerado('plan_alimentacion', [
        'TODO_INCLUIDO',
        'DESAYUNO',
        'MEDIA_PENSION',
        'PENSION_COMPLETA',
        'SIN_ALIMENTACION',
      ]);
      if (
        mapeadas.has('plan_alimentacion') &&
        plantilla.columnas.find((c) => c.clave === 'plan_alimentacion')?.obligatoria &&
        plan === undefined
      ) {
        falla('plan_alimentacion', 'CELDA_OBLIGATORIA', 'la celda no puede estar vacía');
      }
      const inclusiones = texto('inclusiones');
      const exclusiones = texto('exclusiones');

      // ---- vigencia y tarifa ----
      const hayPrecio = texto('precio_venta') !== '';
      let moneda: Moneda | undefined;
      let tarifa: TarifaPropuesta | null = null;
      let desde: string | null = null;
      let hasta: string | null = null;
      let publicada = false;
      let opcion: OpcionDeSalidaPropuesta | null = null;
      if (hayPrecio) {
        const m = enumerado('moneda', ['COP', 'USD', 'EUR', 'MXN']) ?? mapeo.moneda;
        moneda = m as Moneda | undefined;
        if (moneda === undefined)
          falla('moneda', 'CELDA_OBLIGATORIA', 'la celda no puede estar vacía');
        desde = fecha('vigencia_desde');
        if (desde === null && !ilegible) {
          falla('vigencia_desde', 'CELDA_OBLIGATORIA', 'la celda no puede estar vacía');
        }
        hasta = fecha('vigencia_hasta') ?? desde;
        const pub = texto('publicada');
        if (pub !== '') {
          const b = leerBooleano(pub);
          if (b === null) falla('publicada', 'VALOR_INVALIDO', `'${pub}' no es sí/no`);
          publicada = b ?? false;
        }
        const dinero = (clave: string): Dinero | null => {
          const t = texto(clave);
          if (t === '' || moneda === undefined) return null;
          const u = leerDinero(t, moneda);
          if (u === null) {
            falla(
              clave,
              'PRECIO_INVALIDO',
              `'${t}' no es un importe que se pueda leer en ${moneda}`,
            );
            return null;
          }
          return { unidades: u, moneda };
        };
        const venta = dinero('precio_venta');
        const neto = dinero('precio_neto');
        const lista = dinero('precio_lista');
        const promo = fecha('promo_hasta');
        const unidad =
          enumerado('unidad', ['POR_PERSONA', 'POR_GRUPO']) ?? porDefecto.unidad ?? 'POR_PERSONA';
        const cubre = entero('cubre_pasajeros', 1);
        const acomodacion = enumerado('acomodacion', ['SENCILLA', 'DOBLE', 'TRIPLE', 'CUADRUPLE']);
        const tipoPasajero = enumerado('tipo_pasajero', ['ADT', 'CHD', 'INF']);
        const etiqueta = texto('opcion_salida');
        if (etiqueta !== '') {
          const horaSalida = hora('hora_salida');
          const horaRegreso = hora('hora_regreso');
          const punto = texto('punto_encuentro');
          opcion = {
            etiqueta,
            ...(horaSalida ? { horaSalida } : {}),
            ...(horaRegreso ? { horaRegreso } : {}),
            ...(punto ? { puntoDeEncuentro: punto } : {}),
          };
        }
        const mayorista = texto('mayorista');
        if (venta !== null) {
          tarifa = {
            nombre: texto('tarifa_nombre') || 'General',
            unidad: unidad as TarifaPropuesta['unidad'],
            cubrePasajeros: cubre,
            neto,
            venta,
            ...(lista ? { lista } : {}),
            ...(promo ? { promoHasta: promo } : {}),
            mayorista: mayorista || null,
            aditiva: false,
            condicion: {
              ...CONDICION_SIEMPRE,
              ...(acomodacion ? { acomodacion: acomodacion as 'DOBLE' } : {}),
              ...(tipoPasajero ? { tipoPasajero: tipoPasajero as 'ADT' } : {}),
            },
            ...(opcion ? { opcionDeSalida: opcion.etiqueta } : {}),
            procedencia: { fila, columna: columnaDe('precio_venta') },
          };
        }
      }
      if (ilegible) throw new FilaIlegible();

      // ---- agrupar en el producto ----
      const clave = codigo ? `codigo:${codigo}` : `nombre:${normalizarNombre(nombre)}|${noches}`;
      let enConstruccion = productos.get(clave);
      if (!enConstruccion) {
        enConstruccion = {
          producto: {
            ...(codigo ? { codigo } : {}),
            nombre,
            destino,
            dias,
            noches,
            ...(plan ? { planAlimentacion: plan as 'TODO_INCLUIDO' } : {}),
            ...(inclusiones ? { inclusiones: partirLista(inclusiones) } : {}),
            ...(exclusiones ? { exclusiones: partirLista(exclusiones) } : {}),
            opcionesDeSalida: [],
            vigencias: [],
            procedencia: { fila, columna: columnaDe('nombre') },
          },
        };
        productos.set(clave, enConstruccion);
      }
      const p = enConstruccion.producto;
      if (opcion) {
        const previa = p.opcionesDeSalida.find(
          (o) => normalizarNombre(o.etiqueta) === normalizarNombre(opcion.etiqueta),
        );
        if (!previa) p.opcionesDeSalida.push(opcion);
        else if (
          previa.horaSalida !== opcion.horaSalida ||
          previa.horaRegreso !== opcion.horaRegreso
        ) {
          falla(
            'opcion_salida',
            'OPCION_INCOHERENTE',
            `la opción '${opcion.etiqueta}' ya apareció en el producto con otras horas`,
          );
          throw new FilaIlegible();
        }
      }
      if (tarifa && desde !== null && hasta !== null) {
        let vigencia = p.vigencias.find((v) => v.desde === desde && v.hasta === hasta);
        if (!vigencia) {
          vigencia = { desde, hasta, publicada, tarifas: [] };
          p.vigencias.push(vigencia);
        }
        vigencia.tarifas.push(tarifa);
      }
    } catch (e) {
      if (!(e instanceof FilaIlegible)) throw e;
    }
  });

  const lista_ = [...productos.values()].map(({ producto }) => {
    const { opcionesDeSalida, ...resto } = producto;
    return { ...resto, ...(opcionesDeSalida.length > 0 ? { opcionesDeSalida } : {}) };
  });
  const propuesta: PropuestaDeCatalogo | null =
    lista_.length === 0 ? null : { version: 1, origen: 'ARCHIVO', productos: lista_ };
  return { propuesta, errores };
}

function partirLista(texto: string): string[] {
  return texto
    .split('|')
    .map((t) => t.trim())
    .filter((t) => t !== '');
}
