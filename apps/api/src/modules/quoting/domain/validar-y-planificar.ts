/**
 * Validar y planificar una `PropuestaDeCatalogo` — el núcleo común de los cuatro canales.
 * ADR-0017 §1 (pasos 1 y 2).
 *
 * **Función pura: no escribe, no lee la base, no mira el reloj.** Recibe la propuesta ya validada
 * por Zod, una fotografía del catálogo actual del tenant y los permisos de quien la presenta, y
 * devuelve el `Plan` (qué se crearía, actualizaría o dejaría igual) y el `InformeDeCatalogo`
 * (qué está bien, qué es un aviso y qué es un error, con código estable y ubicación).
 *
 * Quien aplica (`AplicadorDeCatalogo`, otra tarea) recalcula esto en el servidor y rechaza todo si
 * queda algún `ERROR` (todo o nada, D4). Aquí no se borra nunca: lo que estaba y la propuesta no
 * menciona se lista en `noIncluidos` (D5).
 *
 * El empate de vigencias se detecta con `resolverVigencia` de `@viajapro/domain`, la misma función
 * que usa el cotizador: el invariante de ADR-0009 no se duplica.
 */

import { createHash } from 'node:crypto';
import type {
  AccionDePlan,
  Dinero,
  ElementoDeInforme,
  InformeDeCatalogo,
  Permiso,
  ProductoPropuesto,
  Procedencia,
  PropuestaDeCatalogo,
  TarifaPropuesta,
  VigenciaPropuesta,
} from '@viajapro/contracts';
import {
  FechaInvalidaError,
  longitudEnDias,
  resolverVigencia,
  VigenciasEmpatadasError,
} from '@viajapro/domain';

/** Cambia cuando cambian las reglas del núcleo: invalida las huellas de las previsualizaciones. */
export const VERSION_DEL_NUCLEO = 1;

// =============================================================================
// Entradas
// =============================================================================

export interface TarifaActual {
  /** Identificador de la fila; lo llenan los adaptadores de lectura, no la propuesta. */
  readonly id?: string;
  readonly nombre: string;
  readonly unidad: 'POR_PERSONA' | 'POR_GRUPO';
  readonly cubrePasajeros: number;
  readonly neto: Dinero | null;
  readonly venta: Dinero;
  readonly lista?: Dinero | null;
  readonly promoHasta?: string | null;
  readonly mayorista: string | null;
  readonly mayoristaId?: string | null;
  /** Etiqueta de la opción de salida a la que está atada, si lo está. */
  readonly opcionDeSalida?: string | null;
  readonly aditiva: boolean;
  readonly condicion: TarifaPropuesta['condicion'];
}

export interface VigenciaActual {
  readonly id?: string;
  readonly desde: string;
  readonly hasta: string;
  readonly publicada: boolean;
  readonly cupoTotal?: number | null;
  readonly tarifas: readonly TarifaActual[];
}

export interface PaqueteActual {
  readonly id: string;
  readonly codigo: string | null;
  readonly nombre: string;
  readonly destino: string;
  readonly dias: number;
  readonly noches: number;
  readonly planAlimentacion: string | null;
  readonly inclusiones: readonly string[];
  readonly exclusiones: readonly string[];
  readonly vigencias: readonly VigenciaActual[];
}

/** Fotografía del catálogo del tenant. La toma quien llama, dentro de su transacción. */
export interface CatalogoActual {
  readonly paquetes: readonly PaqueteActual[];
  /** Nombres de los mayoristas existentes. */
  readonly mayoristas: readonly string[];
}

export interface ContextoDePlanificacion {
  /** Entra en la huella: la misma propuesta en dos agencias da huellas distintas. */
  readonly tenantId: string;
  /**
   * `true` cuando la migración M2 ya está aplicada y las columnas nuevas existen. Mientras sea
   * `false`, los campos que dependen de M2 producen `AVISO CAMPO_NO_SOPORTADO_AUN` y se ignoran.
   */
  readonly soportaM2?: boolean;
}

// =============================================================================
// Salidas
// =============================================================================

export interface CambioDeTarifa {
  readonly accion: AccionDePlan;
  readonly nombre: string;
}

export interface CambioDeVigencia {
  readonly accion: AccionDePlan;
  readonly desde: string;
  readonly hasta: string;
  readonly tarifas: readonly CambioDeTarifa[];
}

export interface CambioDePaquete {
  readonly accion: AccionDePlan;
  /** Índice en `propuesta.productos`. */
  readonly indice: number;
  readonly nombre: string;
  readonly codigo: string | null;
  /** `null` cuando se crea. */
  readonly paqueteId: string | null;
  readonly vigencias: readonly CambioDeVigencia[];
}

export interface Plan {
  readonly paquetes: readonly CambioDePaquete[];
}

export interface ResultadoDePlanificacion {
  readonly plan: Plan;
  readonly informe: InformeDeCatalogo;
}

// =============================================================================
// Utilidades
// =============================================================================

/** Sin tildes, minúsculas, espacios colapsados: la forma en que se compara un nombre. */
export function normalizarNombre(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** JSON con las claves ordenadas y sin `undefined`: la misma entrada siempre da el mismo texto. */
function canonico(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor) ?? 'null';
  if (Array.isArray(valor)) return `[${valor.map((v) => canonico(v)).join(',')}]`;
  const entradas = Object.entries(valor as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonico(v)}`);
  return `{${entradas.join(',')}}`;
}

export function huellaDePropuesta(propuesta: PropuestaDeCatalogo, tenantId: string): string {
  return createHash('sha256')
    .update(`v${VERSION_DEL_NUCLEO}|${tenantId}|${canonico(propuesta)}`)
    .digest('hex');
}

function mismoDinero(a: Dinero | null | undefined, b: Dinero | null | undefined): boolean {
  const x = a ?? null;
  const y = b ?? null;
  if (x === null || y === null) return x === y;
  return x.moneda === y.moneda && BigInt(x.unidades) === BigInt(y.unidades);
}

function mayorQue(a: Dinero, b: Dinero): boolean {
  return BigInt(a.unidades) > BigInt(b.unidades);
}

function mismosTextos(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function sumarUnDia(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function fechaValida(fecha: string): boolean {
  try {
    longitudEnDias({ desde: fecha, hasta: fecha, publicada: false });
    return true;
  } catch (e) {
    if (e instanceof FechaInvalidaError) return false;
    throw e;
  }
}

// =============================================================================
// El núcleo
// =============================================================================

export function validarYPlanificar(
  propuesta: PropuestaDeCatalogo,
  catalogoActual: CatalogoActual,
  permisos: readonly Permiso[],
  contexto: ContextoDePlanificacion,
): ResultadoDePlanificacion {
  const soportaM2 = contexto.soportaM2 ?? false;
  const puedeVerNeto = permisos.includes('cotizacion.ver_neto_y_margen');
  const elementos: ElementoDeInforme[] = [];
  const mayoristasConocidos = new Set(catalogoActual.mayoristas.map(normalizarNombre));
  const mayoristasAvisados = new Set<string>();

  const emitir = (
    nivel: 'AVISO' | 'ERROR',
    codigo: string,
    ruta: string,
    mensaje: string,
    procedencia?: Procedencia,
  ): void => {
    elementos.push({ nivel, codigo, ruta, mensaje, ...(procedencia ? { procedencia } : {}) });
  };

  const cambios: CambioDePaquete[] = [];
  const clavesDeLaPropuesta = new Map<string, number>();
  const idsTocados = new Set<string>();

  propuesta.productos.forEach((producto, p) => {
    const ruta = `productos[${p}]`;
    const antes = elementos.length;

    // ---- campos de M2 ----------------------------------------------------------------------
    if (!soportaM2) {
      const presentes: string[] = [];
      if (producto.codigo !== undefined) presentes.push('codigo');
      if (producto.formato !== undefined) presentes.push('formato');
      if (producto.planAlimentacion === null) presentes.push('planAlimentacion (nulo)');
      if (producto.opcionesDeSalida !== undefined) presentes.push('opcionesDeSalida');
      if (producto.cargosEnDestino !== undefined) presentes.push('cargosEnDestino');
      if (producto.camposPersonalizados !== undefined) presentes.push('camposPersonalizados');
      for (const campo of presentes) {
        emitir(
          'AVISO',
          'CAMPO_NO_SOPORTADO_AUN',
          `${ruta}.${campo}`,
          `'${campo}' aún no se guarda en este catálogo: se ignora`,
          producto.procedencia,
        );
      }
    }

    // ---- invariantes del producto -------------------------------------------------------------
    if (producto.noches > producto.dias) {
      emitir(
        'ERROR',
        'NOCHES_MAYOR_QUE_DIAS',
        `${ruta}.noches`,
        'las noches no pueden superar a los días',
        producto.procedencia,
      );
    }

    // ---- opciones de salida -------------------------------------------------------------------
    const etiquetas = new Set<string>();
    (producto.opcionesDeSalida ?? []).forEach((opcion, o) => {
      const etiqueta = normalizarNombre(opcion.etiqueta);
      if (etiquetas.has(etiqueta)) {
        emitir(
          'ERROR',
          'OPCION_DE_SALIDA_REPETIDA',
          `${ruta}.opcionesDeSalida[${o}].etiqueta`,
          `la opción de salida '${opcion.etiqueta}' está repetida en el producto`,
          producto.procedencia,
        );
      }
      etiquetas.add(etiqueta);
    });

    // ---- clave natural y paquete actual ---------------------------------------------------------
    const codigo = producto.codigo ?? null;
    const clave =
      codigo !== null
        ? `codigo:${codigo}`
        : `nombre:${normalizarNombre(producto.nombre)}|${producto.noches}`;
    const previo = clavesDeLaPropuesta.get(clave);
    if (previo !== undefined) {
      emitir(
        'ERROR',
        'PRODUCTO_DUPLICADO',
        ruta,
        `el producto aparece dos veces en la propuesta (también en productos[${previo}])`,
        producto.procedencia,
      );
    } else {
      clavesDeLaPropuesta.set(clave, p);
    }

    const candidatos = catalogoActual.paquetes.filter((paquete) =>
      codigo !== null
        ? paquete.codigo === codigo
        : normalizarNombre(paquete.nombre) === normalizarNombre(producto.nombre) &&
          paquete.noches === producto.noches,
    );
    let actual: PaqueteActual | null = null;
    if (candidatos.length > 1) {
      emitir(
        'ERROR',
        'PAQUETE_AMBIGUO',
        ruta,
        `'${producto.nombre}' casa con ${candidatos.length} paquetes del catálogo: no se elige en silencio`,
        producto.procedencia,
      );
    } else {
      actual = candidatos[0] ?? null;
      if (actual) idsTocados.add(actual.id);
    }

    // ---- vigencias ----------------------------------------------------------------------------
    const vigenciasCambio: CambioDeVigencia[] = [];
    const clavesDeVigencia = new Set<string>();
    const vigenciasFinales = new Map<
      string,
      { desde: string; hasta: string; publicada: boolean }
    >();
    for (const v of actual?.vigencias ?? []) {
      vigenciasFinales.set(`${v.desde}|${v.hasta}`, v);
    }

    producto.vigencias.forEach((vigencia, v) => {
      const rutaV = `${ruta}.vigencias[${v}]`;
      const validas = fechaValida(vigencia.desde) && fechaValida(vigencia.hasta);
      if (!validas) {
        emitir(
          'ERROR',
          'FECHA_INVALIDA',
          rutaV,
          `'${vigencia.desde}..${vigencia.hasta}' contiene una fecha que no existe`,
          producto.procedencia,
        );
      }
      const claveV = `${vigencia.desde}|${vigencia.hasta}`;
      if (clavesDeVigencia.has(claveV)) {
        emitir(
          'ERROR',
          'VIGENCIA_DUPLICADA',
          rutaV,
          `la vigencia ${vigencia.desde}..${vigencia.hasta} aparece dos veces en el producto`,
          producto.procedencia,
        );
      }
      clavesDeVigencia.add(claveV);
      if (validas) {
        vigenciasFinales.set(claveV, {
          desde: vigencia.desde,
          hasta: vigencia.hasta,
          publicada: vigencia.publicada,
        });
      }

      const vigenciaActual =
        actual?.vigencias.find((x) => x.desde === vigencia.desde && x.hasta === vigencia.hasta) ??
        null;
      const tarifasCambio = planificarTarifas(vigencia, vigenciaActual, rutaV, producto, {
        emitir,
        puedeVerNeto,
        soportaM2,
        mayoristasConocidos,
        mayoristasAvisados,
      });
      const hayCambioDeTarifas = tarifasCambio.some((t) => t.accion !== 'SIN_CAMBIOS');
      let accionV: AccionDePlan;
      if (vigenciaActual === null) accionV = 'CREAR';
      else if (hayCambioDeTarifas || vigenciaActual.publicada !== vigencia.publicada)
        accionV = 'ACTUALIZAR';
      else accionV = 'SIN_CAMBIOS';
      vigenciasCambio.push({
        accion: accionV,
        desde: vigencia.desde,
        hasta: vigencia.hasta,
        tarifas: tarifasCambio,
      });
    });

    // ---- empate de vigencias sobre el estado resultante ----------------------------------------
    detectarEmpates([...vigenciasFinales.values()]).forEach((empate) => {
      emitir(
        'ERROR',
        'VIGENCIA_EMPATADA',
        `${ruta}.vigencias`,
        `el ${empate.fecha} cae en vigencias igual de específicas: ${empate.ventanas}`,
        producto.procedencia,
      );
    });

    // ---- sin precio ---------------------------------------------------------------------------
    const hayTarifasFinales =
      producto.vigencias.some((v) => v.tarifas.length > 0) ||
      (actual?.vigencias.some((v) => v.tarifas.length > 0) ?? false);
    if (!hayTarifasFinales) {
      emitir(
        'AVISO',
        'SIN_PRECIO',
        ruta,
        `'${producto.nombre}' no tiene precio: se mostrará «a consultar»`,
        producto.procedencia,
      );
    }

    // ---- acción del paquete -------------------------------------------------------------------
    let accion: AccionDePlan;
    if (actual === null) accion = 'CREAR';
    else if (
      paqueteCambia(producto, actual) ||
      vigenciasCambio.some((v) => v.accion !== 'SIN_CAMBIOS')
    ) {
      accion = 'ACTUALIZAR';
    } else accion = 'SIN_CAMBIOS';

    cambios.push({
      accion,
      indice: p,
      nombre: producto.nombre,
      codigo,
      paqueteId: actual?.id ?? null,
      vigencias: vigenciasCambio,
    });

    if (elementos.length === antes) {
      elementos.push({
        nivel: 'OK',
        codigo: 'PRODUCTO_OK',
        ruta,
        mensaje: `'${producto.nombre}': ${accion}`,
      });
    }
  });

  // ---- resumen -------------------------------------------------------------------------------
  let creados = 0;
  let actualizados = 0;
  let sinCambios = 0;
  for (const cambio of cambios) {
    if (cambio.accion === 'CREAR') creados++;
    else if (cambio.accion === 'ACTUALIZAR') actualizados++;
    else sinCambios++;
  }

  const informe: InformeDeCatalogo = {
    elementos,
    resumen: {
      errores: elementos.filter((e) => e.nivel === 'ERROR').length,
      avisos: elementos.filter((e) => e.nivel === 'AVISO').length,
      creados,
      actualizados,
      sinCambios,
    },
    noIncluidos: catalogoActual.paquetes
      .filter((paquete) => !idsTocados.has(paquete.id))
      .map((paquete) => ({ codigo: paquete.codigo, nombre: paquete.nombre })),
    huella: huellaDePropuesta(propuesta, contexto.tenantId),
  };

  return { plan: { paquetes: cambios }, informe };
}

// =============================================================================
// Piezas
// =============================================================================

interface ServiciosDeTarifa {
  readonly emitir: (
    nivel: 'AVISO' | 'ERROR',
    codigo: string,
    ruta: string,
    mensaje: string,
    procedencia?: Procedencia,
  ) => void;
  readonly puedeVerNeto: boolean;
  readonly soportaM2: boolean;
  readonly mayoristasConocidos: Set<string>;
  readonly mayoristasAvisados: Set<string>;
}

function planificarTarifas(
  vigencia: VigenciaPropuesta,
  vigenciaActual: VigenciaActual | null,
  rutaV: string,
  producto: ProductoPropuesto,
  s: ServiciosDeTarifa,
): CambioDeTarifa[] {
  const etiquetas = new Set(
    (producto.opcionesDeSalida ?? []).map((o) => normalizarNombre(o.etiqueta)),
  );
  const nombresVistos = new Set<string>();
  const cambios: CambioDeTarifa[] = [];

  vigencia.tarifas.forEach((tarifa, t) => {
    const ruta = `${rutaV}.tarifas[${t}]`;
    const err = (codigo: string, mensaje: string, sufijo = ''): void =>
      s.emitir('ERROR', codigo, `${ruta}${sufijo}`, mensaje, tarifa.procedencia);

    const nombre = normalizarNombre(tarifa.nombre);
    if (nombresVistos.has(nombre)) {
      err(
        'TARIFA_DUPLICADA',
        `la tarifa '${tarifa.nombre}' está repetida en la vigencia`,
        '.nombre',
      );
    }
    nombresVistos.add(nombre);

    if (tarifa.unidad === 'POR_PERSONA' && tarifa.cubrePasajeros !== 1) {
      err(
        'POR_PERSONA_CUBRE_UNO',
        'una tarifa por persona cubre exactamente a una persona',
        '.cubrePasajeros',
      );
    }
    if (tarifa.neto !== null) {
      if (!s.puedeVerNeto) {
        err(
          'NETO_SIN_PERMISO',
          'enviar el neto exige el permiso cotizacion.ver_neto_y_margen',
          '.neto',
        );
      }
      if (tarifa.neto.moneda !== tarifa.venta.moneda) {
        err('MONEDA_INCOHERENTE', 'el neto y la venta deben estar en la misma moneda', '.neto');
      }
    }
    if (tarifa.lista != null) {
      if (tarifa.lista.moneda !== tarifa.venta.moneda) {
        err('MONEDA_INCOHERENTE', 'la lista y la venta deben estar en la misma moneda', '.lista');
      } else if (!mayorQue(tarifa.lista, tarifa.venta)) {
        err(
          'LISTA_NO_MAYOR_QUE_VENTA',
          'el precio de lista debe ser mayor que el de venta',
          '.lista',
        );
      }
    }
    if (BigInt(tarifa.venta.unidades) < 0n) {
      err('PRECIO_NEGATIVO', 'el precio de venta no puede ser negativo', '.venta');
    }
    if (
      tarifa.opcionDeSalida !== undefined &&
      !etiquetas.has(normalizarNombre(tarifa.opcionDeSalida))
    ) {
      err(
        'OPCION_DE_SALIDA_DESCONOCIDA',
        `la opción de salida '${tarifa.opcionDeSalida}' no existe en este producto`,
        '.opcionDeSalida',
      );
    }
    if (!s.soportaM2) {
      const campos: string[] = [];
      if (tarifa.lista != null) campos.push('lista');
      if (tarifa.promoHasta != null) campos.push('promoHasta');
      if (tarifa.opcionDeSalida !== undefined) campos.push('opcionDeSalida');
      for (const campo of campos) {
        s.emitir(
          'AVISO',
          'CAMPO_NO_SOPORTADO_AUN',
          `${ruta}.${campo}`,
          `'${campo}' aún no se guarda en este catálogo: se ignora`,
          tarifa.procedencia,
        );
      }
    }
    if (tarifa.mayorista !== null) {
      const m = normalizarNombre(tarifa.mayorista);
      if (!s.mayoristasConocidos.has(m) && !s.mayoristasAvisados.has(m)) {
        s.mayoristasAvisados.add(m);
        s.emitir(
          'AVISO',
          'MAYORISTA_NUEVO',
          `${ruta}.mayorista`,
          `el mayorista '${tarifa.mayorista}' no existe y se creará`,
          tarifa.procedencia,
        );
      }
    }

    const actual =
      vigenciaActual?.tarifas.find((x) => normalizarNombre(x.nombre) === nombre) ?? null;
    cambios.push({
      accion:
        actual === null
          ? 'CREAR'
          : tarifaCambia(tarifa, actual, s.soportaM2)
            ? 'ACTUALIZAR'
            : 'SIN_CAMBIOS',
      nombre: tarifa.nombre,
    });
  });

  return cambios;
}

function tarifaCambia(nueva: TarifaPropuesta, actual: TarifaActual, soportaM2: boolean): boolean {
  const c = nueva.condicion;
  const a = actual.condicion;
  const condicionIgual =
    c.acomodacion === a.acomodacion &&
    c.tipoPasajero === a.tipoPasajero &&
    c.edadMinima === a.edadMinima &&
    c.edadMaxima === a.edadMaxima &&
    c.pasajerosMinimo === a.pasajerosMinimo &&
    c.pasajerosMaximo === a.pasajerosMaximo &&
    c.ocupaSilla === a.ocupaSilla;
  const mayoristaIgual =
    (nueva.mayorista === null ? null : normalizarNombre(nueva.mayorista)) ===
    (actual.mayorista === null ? null : normalizarNombre(actual.mayorista));
  const base =
    nueva.unidad === actual.unidad &&
    nueva.cubrePasajeros === actual.cubrePasajeros &&
    mismoDinero(nueva.venta, actual.venta) &&
    mismoDinero(nueva.neto, actual.neto) &&
    mayoristaIgual &&
    nueva.aditiva === actual.aditiva &&
    condicionIgual;
  if (!base) return true;
  if (!soportaM2) return false;
  return (
    !mismoDinero(nueva.lista, actual.lista) ||
    (nueva.promoHasta ?? null) !== (actual.promoHasta ?? null)
  );
}

/** ¿Cambia algún dato del paquete en sí (no de sus vigencias)? Lo usa también el aplicador. */
export function paqueteCambia(producto: ProductoPropuesto, actual: PaqueteActual): boolean {
  if (producto.nombre !== actual.nombre) return true;
  if (producto.destino !== actual.destino) return true;
  if (producto.dias !== actual.dias || producto.noches !== actual.noches) return true;
  if (producto.planAlimentacion != null && producto.planAlimentacion !== actual.planAlimentacion)
    return true;
  if (producto.inclusiones !== undefined && !mismosTextos(producto.inclusiones, actual.inclusiones))
    return true;
  if (producto.exclusiones !== undefined && !mismosTextos(producto.exclusiones, actual.exclusiones))
    return true;
  return false;
}

interface Empate {
  readonly fecha: string;
  readonly ventanas: string;
}

/**
 * Busca fechas en las que dos o más vigencias son igual de específicas, usando la función del
 * cotizador. El conjunto de vigencias que cubren una fecha solo cambia en un `desde` o justo
 * después de un `hasta`: probar esas fechas cubre todo el calendario.
 */
function detectarEmpates(
  vigencias: readonly { desde: string; hasta: string; publicada: boolean }[],
): Empate[] {
  if (vigencias.length < 2) return [];
  const fechas = new Set<string>();
  for (const v of vigencias) {
    fechas.add(v.desde);
    fechas.add(sumarUnDia(v.hasta));
  }
  const empates: Empate[] = [];
  const vistos = new Set<string>();
  for (const fecha of [...fechas].sort()) {
    if (vigencias.filter((v) => v.desde <= fecha && fecha <= v.hasta).length < 2) continue;
    try {
      resolverVigencia(vigencias, fecha);
    } catch (e) {
      if (!(e instanceof VigenciasEmpatadasError)) throw e;
      const ventanas = e.empatadas
        .map((v) => `${v.desde}..${v.hasta}`)
        .sort()
        .join(', ');
      if (vistos.has(ventanas)) continue;
      vistos.add(ventanas);
      empates.push({ fecha, ventanas });
    }
  }
  return empates;
}
