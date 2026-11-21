import { describe, expect, it } from 'vitest';
import {
  ActualizarEtiquetaCuerpo,
  COLORES_DE_ETIQUETA,
  ConsultarBandeja,
  ConversacionResumen,
  CrearEtiquetaCuerpo,
  MAX_ETIQUETAS_EN_EL_FILTRO,
  normalizarNombreDeEtiqueta,
} from './index.js';

/** Los caracteres raros se arman por punto de código: un literal invisible no se puede revisar. */
const cp = (n: number): string => String.fromCodePoint(n);

const ID_A = '01932000-0000-7000-8000-000000000001';
const ID_B = '01932000-0000-7000-8000-000000000002';

describe('normalizarNombreDeEtiqueta (T-399)', () => {
  it('recorta, y deja el nombre tal cual si ya es normal', () => {
    expect(normalizarNombreDeEtiqueta('  Pago pendiente  ')).toEqual({
      ok: true,
      nombre: 'Pago pendiente',
    });
  });

  it('NFC: «é» descompuesta y compuesta dan lo mismo', () => {
    const descompuesta = 'Cafe' + cp(0x0301);
    expect(descompuesta).not.toBe('Caf' + cp(0x00e9));
    const r = normalizarNombreDeEtiqueta(descompuesta);
    expect(r).toEqual({ ok: true, nombre: 'Caf' + cp(0x00e9) });
    expect(normalizarNombreDeEtiqueta('Caf' + cp(0x00e9))).toEqual(r);
  });

  it.each([
    ['NBSP', cp(0x00a0)],
    ['espacio de ancho de un em', cp(0x2003)],
    ['espacio fino', cp(0x2009)],
    ['separador de línea', cp(0x2028)],
    ['espacio ideográfico', cp(0x3000)],
    ['tabulación', '\t'],
    ['salto de línea', '\n'],
  ])('convierte %s en U+0020 ANTES de recortar', (_n, c) => {
    expect(normalizarNombreDeEtiqueta(`${c}Pagado${c}`)).toEqual({ ok: true, nombre: 'Pagado' });
    expect(normalizarNombreDeEtiqueta(`Pago${c}pendiente`)).toEqual({
      ok: true,
      nombre: 'Pago pendiente',
    });
  });

  it('reduce espacios seguidos a uno', () => {
    expect(normalizarNombreDeEtiqueta('Pago ' + cp(0x00a0) + '  pendiente')).toEqual({
      ok: true,
      nombre: 'Pago pendiente',
    });
  });

  it.each([
    ['ancho cero U+200B', cp(0x200b)],
    ['ZWNJ U+200C', cp(0x200c)],
    ['ZWJ U+200D', cp(0x200d)],
    ['BOM U+FEFF', cp(0xfeff)],
    ['LRE U+202A', cp(0x202a)],
    ['RLO U+202E', cp(0x202e)],
    ['LRI U+2066', cp(0x2066)],
    ['PDI U+2069', cp(0x2069)],
    ['NEL (C1) U+0085', '\u0085'],
    ['C1 U+009F', '\u009f'],
    ['NUL', '\u0000'],
    ['BEL', '\u0007'],
    ['DEL', '\u007f'],
  ])('rechaza %s, también en los extremos', (_n, c) => {
    expect(normalizarNombreDeEtiqueta(`Pa${c}gado`)).toEqual({ ok: false, motivo: 'PROHIBIDO' });
    expect(normalizarNombreDeEtiqueta(`${c}Pagado`)).toEqual({ ok: false, motivo: 'PROHIBIDO' });
    expect(normalizarNombreDeEtiqueta(`Pagado${c}`)).toEqual({ ok: false, motivo: 'PROHIBIDO' });
  });

  it('rechaza lo vacío, o solo espacios Unicode', () => {
    expect(normalizarNombreDeEtiqueta('')).toEqual({ ok: false, motivo: 'VACIO' });
    expect(normalizarNombreDeEtiqueta(' ' + cp(0x00a0) + cp(0x3000) + '\t ')).toEqual({
      ok: false,
      motivo: 'VACIO',
    });
  });

  it('acota a 30 caracteres (puntos de código, no unidades UTF-16)', () => {
    expect(normalizarNombreDeEtiqueta('a'.repeat(30)).ok).toBe(true);
    expect(normalizarNombreDeEtiqueta('a'.repeat(31))).toEqual({ ok: false, motivo: 'LARGO' });
    // 30 emojis son 60 unidades UTF-16 pero 30 caracteres para `char_length`.
    expect(normalizarNombreDeEtiqueta('😀'.repeat(30)).ok).toBe(true);
    expect(normalizarNombreDeEtiqueta('😀'.repeat(31))).toEqual({ ok: false, motivo: 'LARGO' });
  });

  it('conserva emojis y acentos', () => {
    expect(normalizarNombreDeEtiqueta('Cartagena ñandú 🌴')).toEqual({
      ok: true,
      nombre: 'Cartagena ñandú 🌴',
    });
  });
});

describe('CrearEtiquetaCuerpo / ActualizarEtiquetaCuerpo', () => {
  it('devuelve el nombre ya normalizado', () => {
    expect(CrearEtiquetaCuerpo.parse({ nombre: cp(0x00a0) + 'Pagado ', color: 'verde' })).toEqual({
      nombre: 'Pagado',
      color: 'verde',
    });
  });

  it('el color es uno de los ocho y no hay rojo', () => {
    expect(COLORES_DE_ETIQUETA).toHaveLength(8);
    expect(COLORES_DE_ETIQUETA).not.toContain('rojo');
    expect(CrearEtiquetaCuerpo.safeParse({ nombre: 'X', color: 'rojo' }).success).toBe(false);
    expect(CrearEtiquetaCuerpo.safeParse({ nombre: 'X', color: '#ff0000' }).success).toBe(false);
  });

  it('el mensaje de error NO repite el nombre (R10)', () => {
    const r = CrearEtiquetaCuerpo.safeParse({
      nombre: 'Ana' + cp(0x200b) + 'Pérez',
      color: 'azul',
    });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).not.toMatch(/Ana|Pérez/);
  });

  it('rechaza un cuerpo gigante sin procesarlo', () => {
    const r = CrearEtiquetaCuerpo.safeParse({ nombre: 'a'.repeat(10_000), color: 'azul' });
    expect(r.success).toBe(false);
  });

  it('actualizar exige al menos un cambio', () => {
    expect(ActualizarEtiquetaCuerpo.safeParse({}).success).toBe(false);
    expect(ActualizarEtiquetaCuerpo.safeParse({ color: 'rosa' }).success).toBe(true);
    expect(ActualizarEtiquetaCuerpo.safeParse({ orden: 3 }).success).toBe(true);
    expect(ActualizarEtiquetaCuerpo.safeParse({ orden: -1 }).success).toBe(false);
    expect(ActualizarEtiquetaCuerpo.safeParse({ orden: 40000 }).success).toBe(false);
    expect(ActualizarEtiquetaCuerpo.safeParse({ nombre: cp(0x200b) }).success).toBe(false);
  });
});

describe('ConsultarBandeja: filtro por etiqueta', () => {
  it('sin etiquetas, igual que antes', () => {
    const c = ConsultarBandeja.parse({});
    expect(c.etiquetas).toBeUndefined();
    expect(c.modo).toBeUndefined();
  });

  it('admite una lista separada por comas, repetida, y quita duplicados', () => {
    expect(ConsultarBandeja.parse({ etiquetas: `${ID_A},${ID_B},${ID_A}` }).etiquetas).toEqual([
      ID_A,
      ID_B,
    ]);
    expect(ConsultarBandeja.parse({ etiquetas: [ID_A, ID_B] }).etiquetas).toEqual([ID_A, ID_B]);
    expect(ConsultarBandeja.parse({ etiquetas: ID_A, modo: 'todas' })).toMatchObject({
      etiquetas: [ID_A],
      modo: 'todas',
    });
  });

  it.each([
    ['una cadena cualquiera', 'pagado'],
    ['un UUID con basura', `${ID_A}'; DROP TABLE etiquetas;--`],
    ['vacío', ''],
    ['un elemento vacío', `${ID_A},`],
  ])('rechaza %s', (_n, valor) => {
    expect(ConsultarBandeja.safeParse({ etiquetas: valor }).success).toBe(false);
  });

  it('rechaza más etiquetas que las que cabe en una conversación', () => {
    const ids = Array.from(
      { length: MAX_ETIQUETAS_EN_EL_FILTRO + 1 },
      (_, i) => `01932000-0000-7000-8000-${String(i).padStart(12, '0')}`,
    );
    expect(ConsultarBandeja.safeParse({ etiquetas: ids.join(',') }).success).toBe(false);
  });

  it('rechaza un modo que no existe', () => {
    expect(ConsultarBandeja.safeParse({ etiquetas: ID_A, modo: 'ninguna' }).success).toBe(false);
  });
});

describe('ConversacionResumen.etiquetas', () => {
  it('lleva id, nombre y color', () => {
    const e = { id: ID_A, nombre: 'Pagado', color: 'verde' };
    const base = {
      id: ID_B,
      contactoId: ID_B,
      contactoNombre: null,
      contactoTelefono: '+573001234567',
      estado: 'ABIERTA',
      ventana: { abierta: false, expiraEn: null, minutosRestantes: null },
      asignadoAId: null,
      asignadoANombre: null,
      ultimoMensajeTexto: null,
      ultimoMensajeEn: null,
      ultimoMensajeDireccion: null,
      mensajesSinLeer: 0,
      slaVenceEn: null,
    };
    expect(ConversacionResumen.parse({ ...base, etiquetas: [e] }).etiquetas).toEqual([e]);
    expect(ConversacionResumen.parse(base).etiquetas).toEqual([]);
    expect(ConversacionResumen.safeParse({ ...base, etiquetas: ['VIP'] }).success).toBe(false);
  });
});
