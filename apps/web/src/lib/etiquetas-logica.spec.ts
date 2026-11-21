import { describe, expect, it } from 'vitest';
import {
  COLORES_DE_ETIQUETA,
  type Etiqueta,
  type EtiquetaDeConversacion,
} from '@viajapro/contracts';
import {
  PALETA_DE_ETIQUETAS,
  cambiosDeOrdenAlMover,
  conEtiqueta,
  consultaConFiltroDeEtiquetas,
  hrefConFiltro,
  interpretarErrorDeEtiqueta,
  leerFiltroDeEtiquetasDeUrl,
  modoDeNavegacionDelFiltro,
  ordenarSegunCatalogo,
  recortarParaFila,
  soloFiltroDeEtiquetas,
  textoSinResultadosDelFiltro,
} from './etiquetas-logica';

const id = (n: number) => `00000000-0004-4000-8000-${n.toString(16).padStart(12, '0')}`;
const E = (n: number, nombre: string, orden = n): Etiqueta => ({
  id: id(n),
  nombre,
  color: 'azul',
  orden,
});
const C = (n: number, nombre: string): EtiquetaDeConversacion => ({
  id: id(n),
  nombre,
  color: 'azul',
});

describe('paleta de etiquetas', () => {
  it('cubre exactamente los 8 colores del contrato, con nombre en español y sin rojo', () => {
    expect(Object.keys(PALETA_DE_ETIQUETAS).sort()).toEqual([...COLORES_DE_ETIQUETA].sort());
    expect(COLORES_DE_ETIQUETA).toHaveLength(8);
    const nombres = COLORES_DE_ETIQUETA.map((c) => PALETA_DE_ETIQUETAS[c].nombre);
    expect(nombres).toContain('Ámbar');
    expect(nombres.join(' ').toLowerCase()).not.toMatch(/rojo|alerta/);
  });

  it('cada color usa tokens propios del sistema de diseño, nunca un hexadecimal', () => {
    for (const c of COLORES_DE_ETIQUETA) {
      const { chip, punto } = PALETA_DE_ETIQUETAS[c];
      expect(chip).toBe(`bg-etiqueta-${c}-fondo text-etiqueta-${c}-texto`);
      expect(punto).toBe(`bg-etiqueta-${c}-punto`);
      expect(`${chip} ${punto}`).not.toMatch(/#|\[/);
    }
  });
});

describe('orden y conjuntos', () => {
  const catalogo = [E(1, 'Pagado'), E(2, 'Pago pendiente'), E(3, 'Seguimiento')];

  it('ordena las de la conversación como el catálogo, no como se pusieron', () => {
    const r = ordenarSegunCatalogo([C(3, 'Seguimiento'), C(1, 'Pagado')], catalogo);
    expect(r.map((e) => e.nombre)).toEqual(['Pagado', 'Seguimiento']);
  });

  it('las que el catálogo aún no conoce van al final, en su orden de llegada', () => {
    const r = ordenarSegunCatalogo([C(9, 'Nueva'), C(1, 'Pagado'), C(8, 'Otra')], catalogo);
    expect(r.map((e) => e.nombre)).toEqual(['Pagado', 'Nueva', 'Otra']);
  });

  it('poner no duplica y quitar es idempotente', () => {
    const una = [C(1, 'Pagado')];
    expect(conEtiqueta(una, C(1, 'Pagado'), true, catalogo)).toHaveLength(1);
    expect(conEtiqueta(una, C(2, 'Pago pendiente'), true, catalogo).map((e) => e.nombre)).toEqual([
      'Pagado',
      'Pago pendiente',
    ]);
    expect(conEtiqueta(una, C(1, 'Pagado'), false, catalogo)).toEqual([]);
    expect(conEtiqueta([], C(1, 'Pagado'), false, catalogo)).toEqual([]);
  });

  it('una fila muestra 2 y cuenta el resto', () => {
    const r = recortarParaFila([C(1, 'a'), C(2, 'b'), C(3, 'c'), C(4, 'd')], 2);
    expect(r.visibles.map((e) => e.nombre)).toEqual(['a', 'b']);
    expect(r.ocultas.map((e) => e.nombre)).toEqual(['c', 'd']);
    expect(recortarParaFila([C(1, 'a')]).ocultas).toEqual([]);
  });
});

describe('errores: qué pasó y qué hacer', () => {
  const err = (code: string) => ({ code, message: 'TEXTO CRUDO DEL SERVIDOR' });

  it('sin conexión ofrece reintentar y dice cuál etiqueta', () => {
    const a = interpretarErrorDeEtiqueta(err('ERROR_CONEXION'), 'poner', 'Pagado');
    expect(a.mensaje).toBe('No se pudo poner “Pagado”: sin conexión. Toca para reintentar.');
    expect(a.siguiente).toBe('reintentar');
    expect(interpretarErrorDeEtiqueta(err('ERROR_CONEXION'), 'quitar', 'Pagado').mensaje).toContain(
      'No se pudo quitar “Pagado”',
    );
  });

  it('etiqueta borrada por otra persona: lo dice y pide recargar la lista', () => {
    const a = interpretarErrorDeEtiqueta(err('ETIQUETA_NO_ENCONTRADA'), 'poner', 'Pagado');
    expect(a.siguiente).toBe('recargar');
    expect(a.mensaje).toContain('“Pagado” ya no existe');
    expect(a.mensaje).toContain('otra persona la borró');
  });

  it('conversación que ya no se ve: «Ya no tienes acceso a esta conversación»', () => {
    expect(interpretarErrorDeEtiqueta(err('CONVERSACION_NO_ENCONTRADA'), 'poner').mensaje).toBe(
      'Ya no tienes acceso a esta conversación.',
    );
  });

  it('los dos topes dicen el número y qué hacer', () => {
    const conv = interpretarErrorDeEtiqueta(
      err('TOPE_DE_ETIQUETAS_DE_LA_CONVERSACION'),
      'poner',
      'Pagado',
    );
    expect(conv.mensaje).toBe(
      'Una conversación admite hasta 10 etiquetas. Quita una para poner “Pagado”.',
    );
    expect(conv.siguiente).toBe('ninguna');
    expect(
      interpretarErrorDeEtiqueta(err('TOPE_DE_ETIQUETAS_DE_LA_AGENCIA'), 'crear').mensaje,
    ).toBe('La agencia ya tiene 50 etiquetas. Borra una que no uses para crear otra.');
  });

  it('duplicada, inválida y sin permiso', () => {
    expect(interpretarErrorDeEtiqueta(err('ETIQUETA_DUPLICADA'), 'crear', 'Pagado').mensaje).toBe(
      'Ya existe “Pagado”. Usa otro nombre.',
    );
    expect(interpretarErrorDeEtiqueta(err('ETIQUETA_INVALIDA'), 'crear').mensaje).toMatch(
      /1 a 30 caracteres/,
    );
    expect(interpretarErrorDeEtiqueta(err('PERMISO_DENEGADO'), 'poner').mensaje).toMatch(
      /Operar bandeja/,
    );
    expect(interpretarErrorDeEtiqueta(err('PERMISO_DENEGADO'), 'borrar').mensaje).toMatch(
      /Administrar etiquetas/,
    );
  });

  it('un error desconocido no deja pasar el texto crudo del servidor', () => {
    const a = interpretarErrorDeEtiqueta(err('ALGO_RARO'), 'poner', 'Pagado');
    expect(a.mensaje).not.toContain('CRUDO');
    expect(a.siguiente).toBe('reintentar');
    expect(interpretarErrorDeEtiqueta(new Error('x'), 'poner').codigo).toBe('DESCONOCIDO');
  });
});

describe('filtro en la URL', () => {
  const A = id(1);
  const B = id(2);

  it('lee uuid separados por coma o repetidos, sin duplicados', () => {
    expect(leerFiltroDeEtiquetasDeUrl(new URLSearchParams(`etiquetas=${A},${B}`)).ids).toEqual([
      A,
      B,
    ]);
    expect(
      leerFiltroDeEtiquetasDeUrl(
        new URLSearchParams(`etiquetas=${A}&etiquetas=${B}&etiquetas=${A}`),
      ),
    ).toMatchObject({ ids: [A, B], hayBasura: true });
  });

  it('descarta lo que no es UUID: nunca llega a la consulta', () => {
    const r = leerFiltroDeEtiquetasDeUrl(
      new URLSearchParams(`etiquetas=${A},'; drop table,../../x,1234`),
    );
    expect(r.ids).toEqual([A]);
    expect(r.hayBasura).toBe(true);
  });

  it('respeta el tope de 10 del contrato', () => {
    const muchos = Array.from({ length: 14 }, (_, i) => id(i + 1)).join(',');
    const r = leerFiltroDeEtiquetasDeUrl(new URLSearchParams(`etiquetas=${muchos}`));
    expect(r.ids).toHaveLength(10);
    expect(r.hayBasura).toBe(true);
  });

  it('el modo por defecto es cualquiera; uno desconocido cae a cualquiera y se marca', () => {
    expect(leerFiltroDeEtiquetasDeUrl(new URLSearchParams(`etiquetas=${A}`)).modo).toBe(
      'cualquiera',
    );
    expect(leerFiltroDeEtiquetasDeUrl(new URLSearchParams(`etiquetas=${A}&modo=todas`)).modo).toBe(
      'todas',
    );
    const raro = leerFiltroDeEtiquetasDeUrl(new URLSearchParams(`etiquetas=${A}&modo=xx`));
    expect(raro.modo).toBe('cualquiera');
    expect(raro.hayBasura).toBe(true);
  });

  it('sin parámetros no hay filtro ni basura', () => {
    expect(leerFiltroDeEtiquetasDeUrl(new URLSearchParams(''))).toEqual({
      ids: [],
      modo: 'cualquiera',
      hayBasura: false,
    });
  });

  it('arma la consulta conservando otros parámetros y sin ensuciar con el modo por defecto', () => {
    expect(consultaConFiltroDeEtiquetas(new URLSearchParams('demo=1'), [A], 'cualquiera')).toBe(
      `demo=1&etiquetas=${A}`,
    );
    expect(consultaConFiltroDeEtiquetas(new URLSearchParams(''), [A, B], 'todas')).toContain(
      'modo=todas',
    );
    // Con una sola etiqueta el modo no significa nada.
    expect(consultaConFiltroDeEtiquetas(new URLSearchParams(''), [A], 'todas')).not.toContain(
      'modo',
    );
    expect(
      consultaConFiltroDeEtiquetas(
        new URLSearchParams(`demo=1&etiquetas=${A}&modo=todas`),
        [],
        'todas',
      ),
    ).toBe('demo=1');
  });

  it('push al empezar a filtrar y replace al ajustar o limpiar', () => {
    expect(modoDeNavegacionDelFiltro([], [A])).toBe('push');
    expect(modoDeNavegacionDelFiltro([A], [A, B])).toBe('replace');
    expect(modoDeNavegacionDelFiltro([A, B], [])).toBe('replace');
    expect(modoDeNavegacionDelFiltro([], [])).toBe('replace');
  });

  it('al abrir un chat solo viaja el filtro de etiquetas', () => {
    const q = soloFiltroDeEtiquetas(new URLSearchParams(`demo=1&etiquetas=${A}&modo=todas&x=2`));
    expect(q).toBe(`etiquetas=${A}&modo=todas`);
    expect(soloFiltroDeEtiquetas(new URLSearchParams('demo=1&modo=todas'))).toBe('');
    expect(hrefConFiltro('/bandeja/abc', q)).toBe(`/bandeja/abc?${q}`);
    expect(hrefConFiltro('/bandeja', '')).toBe('/bandeja');
  });

  it('el texto de «sin resultados» nombra la etiqueta o el modo', () => {
    expect(textoSinResultadosDelFiltro([{ nombre: 'Pagado' }], 'cualquiera')).toBe(
      'Ninguna conversación tiene “Pagado”.',
    );
    expect(textoSinResultadosDelFiltro([{ nombre: 'a' }, { nombre: 'b' }], 'todas')).toMatch(
      /todas las etiquetas/,
    );
    expect(textoSinResultadosDelFiltro([{ nombre: 'a' }, { nombre: 'b' }], 'cualquiera')).toMatch(
      /alguna de las etiquetas/,
    );
  });
});

describe('subir y bajar en Configuración', () => {
  const lista = [E(1, 'a', 0), E(2, 'b', 1), E(3, 'c', 2)];

  it('renumera y manda solo lo que cambia', () => {
    expect(cambiosDeOrdenAlMover(lista, id(2), 'subir')).toEqual([
      { id: id(2), orden: 0 },
      { id: id(1), orden: 1 },
    ]);
    expect(cambiosDeOrdenAlMover(lista, id(2), 'bajar')).toEqual([
      { id: id(3), orden: 1 },
      { id: id(2), orden: 2 },
    ]);
  });

  it('en el borde no hace nada', () => {
    expect(cambiosDeOrdenAlMover(lista, id(1), 'subir')).toEqual([]);
    expect(cambiosDeOrdenAlMover(lista, id(3), 'bajar')).toEqual([]);
    expect(cambiosDeOrdenAlMover(lista, id(9), 'subir')).toEqual([]);
  });

  it('con empates de orden (la API los admite) sí desempata', () => {
    const empatadas = [E(1, 'a', 0), E(2, 'b', 0), E(3, 'c', 0)];
    const cambios = cambiosDeOrdenAlMover(empatadas, id(3), 'subir');
    expect(cambios.length).toBeGreaterThan(0);
    expect(cambios.find((c) => c.id === id(3))?.orden).toBe(1);
  });
});
