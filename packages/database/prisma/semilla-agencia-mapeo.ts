/**
 * Mapeo PURO de un catálogo en JSON (la forma que trae una agencia prospecto) a filas del modelo.
 *
 * Sin base de datos, sin reloj, sin sistema de archivos: recibe `unknown`, valida y devuelve
 * datos listos para que `semilla-agencia-desde-json.ts` los escriba. Eso permite probarlo con un
 * JSON sintético en `tests/`.
 *
 * Forma esperada (la de `docs/03-adr/0017`, «Contrastado contra JD Tours Cartagena»):
 *
 *   { agencia: { nombre, pais?, moneda? }, tours: [{ nombre, tipo?, precio_lista_cop,
 *     precio_promo_cop, es_desde, sin_precio, duracion?, hora_salida?, hora_regreso?,
 *     opciones_de_salida?, incluye?, no_incluye?, restricciones?, descripcion?, notas?,
 *     cargos_en_destino?, destino? }] }
 *
 * **Reglas que este archivo hace cumplir (y por qué):**
 *  - R8: el dinero se valida como entero con `Money` y se entrega en la unidad mínima. En COP es
 *    el peso: 29.000 es 29000, no 2.900.000.
 *  - **No se inventa nada.** `promo_hasta` queda nulo (el sitio no publica vigencia de la promo),
 *    no hay cupos y no hay fechas de salida.
 *  - **«Desde» no se guarda.** `es_desde` se descarta a propósito: lo calcula el dominio sobre las
 *    tarifas base. Convertirlo en un precio sería afirmar un precio que nadie publicó.
 *  - `sin_precio` ⇒ ninguna tarifa («Consultar»). Un precio sin vigencia no existe (ADR-0009).
 *  - El sitio publica precios de VENTA. El neto es DERIVADO con la política de la agencia y es
 *    un dato fabricado: no debe mostrarse como real (`neto_es_derivado` lo declara).
 *  - Los mensajes de error citan la RUTA del campo («tours[3].precio_lista_cop»), nunca su valor:
 *    el archivo es de un tercero y no se publica.
 */

import { DomainError, Money, derivarNeto, esCodigoMoneda } from '@viajapro/domain';
import type { CodigoMoneda, PoliticaDePrecio } from '@viajapro/domain';

export class CatalogoJsonInvalidoError extends DomainError {
  readonly code = 'CATALOGO_JSON_INVALIDO';
}

/**
 * Ventana abierta de las tarifas («Permanente»). El sitio dice «salidas todos los días» y no
 * publica vigencia; el modelo exige `desde`/`hasta` en toda vigencia (ADR-0009: un precio sin
 * vigencia no existe). Es una CONVENCIÓN de ventana abierta, no una fecha de negocio.
 */
export const VIGENCIA_PERMANENTE = { desde: '2026-01-01', hasta: '2099-12-31' } as const;

export const NOMBRE_DE_TARIFA_ADULTO = 'Adulto';
export const NOMBRE_DEL_MAYORISTA_POR_CONFIRMAR = 'Operador por confirmar';
export const NOTA_DEL_MAYORISTA_POR_CONFIRMAR =
  'El catálogo de origen publica precios de VENTA al público. Los netos de estas tarifas están ' +
  'DERIVADOS de la venta con la política de la agencia, no vienen de ningún operador: no son ' +
  'datos reales y no deben mostrarse como tales. Se sustituyen cuando llegue el tarifario neto.';

/** Definiciones (entidad PAQUETE) de las claves que esta semilla escribe en `campos_personalizados`. */
export const CAMPOS_DEL_PAQUETE = [
  { clave: 'tipo_de_producto', etiqueta: 'Tipo de producto', tipo: 'TEXTO', orden: 1 },
  { clave: 'duracion_publicada', etiqueta: 'Duración publicada', tipo: 'TEXTO', orden: 2 },
  { clave: 'hora_salida_publicada', etiqueta: 'Hora de salida publicada', tipo: 'TEXTO', orden: 3 },
  {
    clave: 'hora_regreso_publicada',
    etiqueta: 'Hora de regreso publicada',
    tipo: 'TEXTO',
    orden: 4,
  },
  { clave: 'restricciones', etiqueta: 'Restricciones', tipo: 'TEXTO', orden: 5 },
  { clave: 'notas', etiqueta: 'Notas', tipo: 'TEXTO', orden: 6 },
  { clave: 'neto_es_derivado', etiqueta: 'Neto derivado (no real)', tipo: 'BOOLEANO', orden: 7 },
  // Ruta relativa que sirve la web en desarrollo. Solo el texto: nunca se leen ni se copian ficheros.
  { clave: 'imagen', etiqueta: 'Imagen', tipo: 'TEXTO', orden: 8 },
] as const;

export type ValorDeCampo = string | boolean;

export interface CargoEnDestinoMapeado {
  readonly concepto: string;
  readonly monto: { readonly unidades: string; readonly moneda: CodigoMoneda } | null;
  readonly unidad: 'POR_PERSONA' | 'POR_GRUPO';
  readonly nota?: string;
}

export interface OpcionMapeada {
  readonly etiqueta: string;
  /** `HH:MM` local, o nulo si el sitio no la publica en una forma que se pueda leer. */
  readonly horaSalida: string | null;
  readonly horaRegreso: string | null;
  readonly puntoDeEncuentro: string | null;
  readonly orden: number;
}

export interface TarifaMapeada {
  readonly nombre: string;
  readonly ventaUnidades: bigint;
  /** Precio de lista (tachado). Solo si hay promo. */
  readonly listaUnidades: bigint | null;
  /** DERIVADO de la venta con la política de la agencia. */
  readonly netoUnidades: bigint;
  /** Etiqueta de la opción de salida a la que se ata; nulo = vale para todas. */
  readonly opcionEtiqueta: string | null;
}

export interface PaqueteMapeado {
  readonly codigo: string;
  readonly nombre: string;
  readonly destino: string;
  readonly dias: 1;
  readonly noches: 0;
  readonly descripcion: string | null;
  readonly inclusiones: readonly string[];
  readonly exclusiones: readonly string[];
  readonly cargosEnDestino: readonly CargoEnDestinoMapeado[];
  readonly camposPersonalizados: Readonly<Record<string, ValorDeCampo>>;
  readonly opciones: readonly OpcionMapeada[];
  /** Vacío = «Consultar»: el paquete queda sin vigencia. */
  readonly tarifas: readonly TarifaMapeada[];
}

export interface CatalogoMapeado {
  readonly agencia: {
    readonly nombre: string;
    readonly slug: string;
    readonly paisIso: string;
    readonly monedaIso: CodigoMoneda;
    /**
     * Marca de la agencia, validada pero SIN DESTINO hoy: `tenants` no tiene dónde guardarla
     * (T-038 y T-039 añadirán el almacenamiento). El script no la escribe.
     */
    readonly logo: string | null;
    readonly colorAcento: string | null;
  };
  readonly paquetes: readonly PaqueteMapeado[];
}

export interface ResumenDelCatalogo {
  readonly paquetes: number;
  readonly vigencias: number;
  readonly tarifas: number;
  readonly opcionesDeSalida: number;
  readonly sinPrecio: number;
}

// --- Utilidades puras --------------------------------------------------------------------

/** «Tour Santa Marta Clásico» → «tour-santa-marta-clasico». Estable entre corridas. */
export function aSlug(texto: string, maximo: number): string {
  const base = texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base.slice(0, maximo).replace(/-+$/g, '');
}

/**
 * «7:30 AM» → «07:30», «12:50 PM» → «12:50», «12:00 AM» → «00:00», «15:00» → «15:00».
 * Cualquier otra cosa («2:00 PM - 2:30 PM (desde Isla Palma)») → `null`: no se adivina.
 */
export function parsearHora(texto: string): string | null {
  const m = /^\s*(\d{1,2}):(\d{2})\s*(?:([AaPp])\.?\s*[Mm]\.?)?\s*$/.exec(texto);
  if (!m) return null;
  let hora = Number(m[1]);
  const minuto = Number(m[2]);
  const meridiano = m[3]?.toLowerCase();
  if (minuto > 59) return null;
  if (meridiano) {
    if (hora < 1 || hora > 12) return null;
    if (meridiano === 'a') hora = hora === 12 ? 0 : hora;
    else hora = hora === 12 ? 12 : hora + 12;
  } else if (hora > 23) {
    return null;
  }
  return `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
}

type Objeto = Record<string, unknown>;

const esObjeto = (v: unknown): v is Objeto =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function invalido(ruta: string, motivo: string): never {
  throw new CatalogoJsonInvalidoError(`${ruta}: ${motivo}`);
}

function textoObligatorio(o: Objeto, clave: string, ruta: string, maximo: number): string {
  const v = o[clave];
  if (typeof v !== 'string' || v.trim() === '') invalido(`${ruta}.${clave}`, 'se esperaba texto');
  const limpio = v.trim();
  if (limpio.length > maximo) invalido(`${ruta}.${clave}`, `excede ${maximo} caracteres`);
  return limpio;
}

function textoOpcional(o: Objeto, clave: string, ruta: string, maximo: number): string | null {
  const v = o[clave];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') invalido(`${ruta}.${clave}`, 'se esperaba texto o nulo');
  const limpio = v.trim();
  if (limpio === '') return null;
  if (limpio.length > maximo) invalido(`${ruta}.${clave}`, `excede ${maximo} caracteres`);
  return limpio;
}

function listaDeTexto(o: Objeto, clave: string, ruta: string): string[] {
  const v = o[clave];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) invalido(`${ruta}.${clave}`, 'se esperaba una lista');
  return (v as unknown[]).map((x, i) => {
    if (typeof x !== 'string' || x.trim() === '') {
      invalido(`${ruta}.${clave}[${i}]`, 'se esperaba texto');
    }
    return x.trim();
  });
}

/** Pesos enteros positivos, o nulo. Nunca coma flotante (R8). */
function pesosOpcionales(o: Objeto, clave: string, ruta: string): number | null {
  const v = o[clave];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v <= 0) {
    invalido(`${ruta}.${clave}`, 'se esperaba un entero positivo en pesos');
  }
  return v;
}

function booleano(o: Objeto, clave: string, ruta: string): boolean {
  const v = o[clave];
  if (v === undefined || v === null) return false;
  if (typeof v !== 'boolean') invalido(`${ruta}.${clave}`, 'se esperaba verdadero o falso');
  return v;
}

/** Una tarifa a partir de lista/promo en pesos. `null` si no hay precio. */
function tarifaDe(
  lista: number | null,
  promo: number | null,
  moneda: CodigoMoneda,
  politica: PoliticaDePrecio,
  opcionEtiqueta: string | null,
  ruta: string,
): TarifaMapeada | null {
  if (lista === null) {
    if (promo !== null) invalido(ruta, 'hay promo sin precio de lista');
    return null;
  }
  if (promo !== null && promo >= lista) {
    invalido(ruta, 'la promo debe ser menor que el precio de lista');
  }
  const venta = Money.desdeUnidades(promo ?? lista, moneda);
  const neto = derivarNeto(venta, politica);
  return {
    nombre: NOMBRE_DE_TARIFA_ADULTO,
    ventaUnidades: venta.aPersistencia().unidades,
    listaUnidades:
      promo === null ? null : Money.desdeUnidades(lista, moneda).aPersistencia().unidades,
    netoUnidades: neto.aPersistencia().unidades,
    opcionEtiqueta,
  };
}

const NOTA_MONTO_NO_PUBLICADO = 'Monto no publicado por la agencia';

function cargosDe(
  tour: Objeto,
  noIncluye: readonly string[],
  moneda: CodigoMoneda,
  ruta: string,
): CargoEnDestinoMapeado[] {
  const crudo = tour['cargos_en_destino'];
  const salida: CargoEnDestinoMapeado[] = [];
  if (crudo !== undefined && crudo !== null) {
    if (!Array.isArray(crudo)) invalido(`${ruta}.cargos_en_destino`, 'se esperaba una lista');
    (crudo as unknown[]).forEach((c, i) => {
      const r = `${ruta}.cargos_en_destino[${i}]`;
      if (!esObjeto(c)) invalido(r, 'se esperaba un objeto');
      const o = c;
      const concepto = textoObligatorio(o, 'concepto', r, 200);
      const monto = pesosOpcionales(o, 'monto_cop', r);
      const por = o['por'];
      if (por !== 'persona' && por !== 'grupo')
        invalido(`${r}.por`, "se esperaba 'persona' o 'grupo'");
      const opcional = booleano(o, 'opcional', r);
      const nota = textoOpcional(o, 'nota', r, 200) ?? (opcional ? 'Opcional' : undefined);
      salida.push({
        concepto,
        monto: monto === null ? null : { unidades: String(monto), moneda },
        unidad: por === 'grupo' ? 'POR_GRUPO' : 'POR_PERSONA',
        ...(nota === undefined ? {} : { nota }),
      });
    });
  }
  // «Impuesto de muelle no incluido»: el sitio lo avisa en «no incluye» sin monto. Se deja como
  // cargo en destino SIN monto, para que el asesor sepa que existe; no se suma ni se inventa.
  const yaDeclarado = salida.some((c) => aSlug(c.concepto, 200).includes('impuesto-de-muelle'));
  if (!yaDeclarado && noIncluye.some((l) => aSlug(l, 200).includes('impuesto-de-muelle'))) {
    salida.push({
      concepto: 'Impuesto de muelle',
      monto: null,
      unidad: 'POR_PERSONA',
      nota: NOTA_MONTO_NO_PUBLICADO,
    });
  }
  return salida;
}

/** Hora legible → columna; si no se puede leer, el texto original va al punto de encuentro. */
function opcionesDe(tour: Objeto, ruta: string): Array<OpcionMapeada & { entrada: Objeto }> {
  const crudo = tour['opciones_de_salida'];
  if (crudo === undefined || crudo === null) return [];
  if (!Array.isArray(crudo)) invalido(`${ruta}.opciones_de_salida`, 'se esperaba una lista');
  const vistas = new Set<string>();
  return (crudo as unknown[]).map((c, i) => {
    const r = `${ruta}.opciones_de_salida[${i}]`;
    if (!esObjeto(c)) invalido(r, 'se esperaba un objeto');
    const o = c;
    const etiqueta = textoObligatorio(o, 'etiqueta', r, 120);
    const clave = aSlug(etiqueta, 200);
    if (vistas.has(clave)) invalido(`${r}.etiqueta`, 'etiqueta repetida dentro del producto');
    vistas.add(clave);

    const salidaTexto = textoOpcional(o, 'hora_salida', r, 200);
    const regresoTexto = textoOpcional(o, 'hora_regreso', r, 200);
    const horaSalida = salidaTexto === null ? null : parsearHora(salidaTexto);
    const horaRegreso = regresoTexto === null ? null : parsearHora(regresoTexto);
    const partes: string[] = [];
    const punto = textoOpcional(o, 'punto_encuentro', r, 300);
    if (punto !== null) partes.push(punto);
    if (salidaTexto !== null && horaSalida === null) partes.push(`Salida: ${salidaTexto}`);
    if (regresoTexto !== null && horaRegreso === null) partes.push(`Regreso: ${regresoTexto}`);
    const compuesto = partes.join(' | ');
    return {
      etiqueta,
      horaSalida,
      horaRegreso,
      puntoDeEncuentro: compuesto === '' ? null : compuesto.slice(0, 300),
      orden: i,
      entrada: o,
    };
  });
}

function mapearTour(
  tour: Objeto,
  indice: number,
  agencia: { paisIso: string; ciudad: string | null; moneda: CodigoMoneda },
  politica: PoliticaDePrecio,
): PaqueteMapeado {
  const ruta = `tours[${indice}]`;
  const nombre = textoObligatorio(tour, 'nombre', ruta, 200);
  const codigo = aSlug(nombre, 64);
  if (codigo === '') invalido(`${ruta}.nombre`, 'no produce un código estable');

  const sinPrecio = booleano(tour, 'sin_precio', ruta);
  // `es_desde` se valida y se DESCARTA: «desde» lo calcula el dominio, nunca se guarda.
  booleano(tour, 'es_desde', ruta);
  const lista = pesosOpcionales(tour, 'precio_lista_cop', ruta);
  const promo = pesosOpcionales(tour, 'precio_promo_cop', ruta);
  if (sinPrecio && (lista !== null || promo !== null)) {
    invalido(ruta, 'marcado sin precio pero trae precios');
  }
  if (!sinPrecio && lista === null) {
    invalido(`${ruta}.precio_lista_cop`, 'falta el precio (o marca sin_precio)');
  }

  const inclusiones = listaDeTexto(tour, 'incluye', ruta);
  const exclusiones = listaDeTexto(tour, 'no_incluye', ruta);
  const restricciones = listaDeTexto(tour, 'restricciones', ruta);
  const opciones = opcionesDe(tour, ruta);

  // Tarifas. Si alguna opción trae precio propio, esas tarifas se atan a su opción y no se
  // emite la tarifa «para todas»; si ninguna lo trae (lo normal), una sola tarifa sin opción.
  const tarifas: TarifaMapeada[] = [];
  if (!sinPrecio) {
    const conPrecioPropio = opciones.filter(
      (op) =>
        op.entrada['precio_lista_cop'] !== undefined && op.entrada['precio_lista_cop'] !== null,
    );
    if (conPrecioPropio.length > 0) {
      for (const op of conPrecioPropio) {
        const r = `${ruta}.opciones_de_salida[${op.orden}]`;
        const t = tarifaDe(
          pesosOpcionales(op.entrada, 'precio_lista_cop', r),
          pesosOpcionales(op.entrada, 'precio_promo_cop', r),
          agencia.moneda,
          politica,
          op.etiqueta,
          r,
        );
        if (t) tarifas.push(t);
      }
    } else {
      const t = tarifaDe(lista, promo, agencia.moneda, politica, null, ruta);
      if (t) tarifas.push(t);
    }
  }

  const campos: Record<string, ValorDeCampo> = {};
  const tipo = textoOpcional(tour, 'tipo', ruta, 120);
  if (tipo !== null) campos['tipo_de_producto'] = tipo;
  const duracion = textoOpcional(tour, 'duracion', ruta, 300);
  if (duracion !== null) campos['duracion_publicada'] = duracion;
  const horaSalida = textoOpcional(tour, 'hora_salida', ruta, 200);
  if (horaSalida !== null) campos['hora_salida_publicada'] = horaSalida;
  const horaRegreso = textoOpcional(tour, 'hora_regreso', ruta, 200);
  if (horaRegreso !== null) campos['hora_regreso_publicada'] = horaRegreso;
  if (restricciones.length > 0) campos['restricciones'] = restricciones.join('\n');
  const notas = textoOpcional(tour, 'notas', ruta, 2000);
  if (notas !== null) campos['notas'] = notas;
  if (tarifas.length > 0) campos['neto_es_derivado'] = true;
  const imagen = textoOpcional(tour, 'imagen', ruta, 300);
  if (imagen !== null) campos['imagen'] = imagen;

  return {
    codigo,
    nombre,
    destino: (textoOpcional(tour, 'destino', ruta, 120) ?? nombre).slice(0, 120),
    dias: 1,
    noches: 0,
    descripcion: textoOpcional(tour, 'descripcion', ruta, 5000),
    inclusiones,
    exclusiones,
    cargosEnDestino: cargosDe(tour, exclusiones, agencia.moneda, ruta),
    camposPersonalizados: campos,
    opciones: opciones.map(({ entrada: _entrada, ...op }) => op),
    tarifas,
  };
}

/** Punto de entrada. Lanza `CatalogoJsonInvalidoError` con la ruta del primer defecto. */
export function mapearCatalogo(datos: unknown, politica: PoliticaDePrecio): CatalogoMapeado {
  if (!esObjeto(datos)) invalido('(raíz)', 'se esperaba un objeto');
  const raiz = datos;
  const agenciaCruda = raiz['agencia'];
  if (!esObjeto(agenciaCruda)) invalido('agencia', 'se esperaba un objeto');
  const a = agenciaCruda;

  const nombre = textoObligatorio(a, 'nombre', 'agencia', 200);
  const slug = aSlug(nombre, 63);
  if (slug === '') invalido('agencia.nombre', 'no produce un slug');
  const paisIso = (textoOpcional(a, 'pais', 'agencia', 2) ?? 'CO').toUpperCase();
  if (!/^[A-Z]{2}$/.test(paisIso))
    invalido('agencia.pais', 'se esperaba un código ISO-3166 de 2 letras');
  const moneda = textoOpcional(a, 'moneda', 'agencia', 3) ?? 'COP';
  if (!esCodigoMoneda(moneda)) invalido('agencia.moneda', 'moneda no soportada');
  // Los campos del JSON se llaman `*_cop` y vienen en pesos: otra moneda sería otra unidad mínima.
  if (moneda !== 'COP') invalido('agencia.moneda', 'este formato de catálogo es solo COP');
  const ciudad = textoOpcional(a, 'ciudad', 'agencia', 120);

  const tours = raiz['tours'];
  if (!Array.isArray(tours) || tours.length === 0)
    invalido('tours', 'se esperaba una lista no vacía');

  const codigos = new Set<string>();
  const paquetes = (tours as unknown[]).map((t, i) => {
    if (!esObjeto(t)) invalido(`tours[${i}]`, 'se esperaba un objeto');
    const p = mapearTour(t, i, { paisIso, ciudad, moneda }, politica);
    if (codigos.has(p.codigo)) invalido(`tours[${i}].nombre`, 'produce un código repetido');
    codigos.add(p.codigo);
    return p;
  });

  const logo = textoOpcional(a, 'logo', 'agencia', 300);
  const colorAcento = textoOpcional(a, 'color_acento', 'agencia', 32);
  return {
    agencia: { nombre, slug, paisIso, monedaIso: moneda, logo, colorAcento },
    paquetes,
  };
}

export function resumirCatalogo(c: CatalogoMapeado): ResumenDelCatalogo {
  const conPrecio = c.paquetes.filter((p) => p.tarifas.length > 0);
  return {
    paquetes: c.paquetes.length,
    vigencias: conPrecio.length,
    tarifas: c.paquetes.reduce((n, p) => n + p.tarifas.length, 0),
    opcionesDeSalida: c.paquetes.reduce((n, p) => n + p.opciones.length, 0),
    sinPrecio: c.paquetes.length - conPrecio.length,
  };
}
