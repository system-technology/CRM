import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_ETIQUETAS_POR_AGENCIA, MAX_ETIQUETAS_POR_CONVERSACION } from '@viajapro/contracts';
import { MOCK_CONVERSACIONES, consultarBandejaMock } from './mock-inbox';
import {
  ID_ETIQUETA_PAGADO,
  ID_ETIQUETA_PAGO_PENDIENTE,
  ID_ETIQUETA_SEGUIMIENTO,
  crearEtiquetaMock,
  listarEtiquetasMock,
  reiniciarCatalogoMock,
} from './mock-etiquetas';
import {
  actualizarEtiquetaEnConversacionesMock,
  borrarEtiquetaDeLaAgenciaMock,
  ponerEtiquetaMock,
  quitarEtiquetaMock,
} from './mock-etiquetas-conversaciones';
import { etiquetasApi } from './etiquetas-api';

/**
 * El catálogo de DEMO es el de la API real (HU-inbox-1 §3): las mismas tres etiquetas sembradas,
 * los mismos topes y los mismos errores tipados. Y las conversaciones de demo solo usan esas.
 */
const copiaDeFilas = MOCK_CONVERSACIONES.map((c) => ({ id: c.id, etiquetas: [...c.etiquetas] }));

beforeEach(() => {
  reiniciarCatalogoMock();
});
afterEach(() => {
  reiniciarCatalogoMock();
  for (const { id, etiquetas } of copiaDeFilas) {
    const fila = MOCK_CONVERSACIONES.find((c) => c.id === id);
    if (fila) fila.etiquetas = [...etiquetas];
  }
});

const conectado = (e: unknown) => (e as { code?: string }).code;

describe('catálogo de demo coherente con la API', () => {
  it('trae las tres sembradas, con sus colores', () => {
    expect(listarEtiquetasMock().map((e) => [e.nombre, e.color])).toEqual([
      ['Pagado', 'verde'],
      ['Pago pendiente', 'ambar'],
      ['Seguimiento', 'azul'],
    ]);
  });

  it('las conversaciones de demo solo usan etiquetas del catálogo, con su nombre y color', () => {
    const catalogo = new Map(listarEtiquetasMock().map((e) => [e.id, e]));
    let conEtiquetas = 0;
    for (const c of MOCK_CONVERSACIONES) {
      if (c.etiquetas.length > 0) conEtiquetas++;
      for (const e of c.etiquetas) {
        expect(catalogo.get(e.id), `etiqueta ajena en ${c.id}`).toMatchObject({
          nombre: e.nombre,
          color: e.color,
        });
      }
      // Sin repetir y en el orden del catálogo.
      expect(new Set(c.etiquetas.map((e) => e.id)).size).toBe(c.etiquetas.length);
    }
    // Muchas filas van sin etiqueta (densidad real), pero hay de sobra con ellas.
    expect(conEtiquetas).toBeGreaterThan(100);
    expect(conEtiquetas).toBeLessThan(MOCK_CONVERSACIONES.length);
  });

  it('no queda ninguna etiqueta de texto libre del mock anterior', () => {
    const nombres = new Set(MOCK_CONVERSACIONES.flatMap((c) => c.etiquetas.map((e) => e.nombre)));
    expect([...nombres].sort()).toEqual(['Pagado', 'Pago pendiente', 'Seguimiento']);
  });
});

describe('filtro de la bandeja de demo (cualquiera / todas)', () => {
  it('cualquiera: la unión; todas: la intersección', async () => {
    const pagina = (modo: 'cualquiera' | 'todas', ids: string[]) =>
      consultarBandejaMock({ filtro: 'TODAS', etiquetas: ids, modo, limite: 100 }, 0);
    const pend = MOCK_CONVERSACIONES.filter((c) =>
      c.etiquetas.some((e) => e.id === ID_ETIQUETA_PAGO_PENDIENTE),
    );
    const segu = MOCK_CONVERSACIONES.filter((c) =>
      c.etiquetas.some((e) => e.id === ID_ETIQUETA_SEGUIMIENTO),
    );
    const ambas = pend.filter((c) => segu.includes(c));
    const union = new Set([...pend, ...segu]);
    expect(ambas.length).toBeGreaterThan(0);

    const o = await consultarBandejaMock(
      {
        filtro: 'TODAS',
        etiquetas: [ID_ETIQUETA_PAGO_PENDIENTE, ID_ETIQUETA_SEGUIMIENTO],
        modo: 'cualquiera',
        limite: 100,
      },
      0,
    );
    // La página trae hasta 100; el total de la unión puede ser mayor: se comprueba con paginación.
    let total = o.datos.length;
    let cursor = o.pageInfo.nextCursor;
    while (cursor) {
      const sig = await consultarBandejaMock(
        {
          filtro: 'TODAS',
          etiquetas: [ID_ETIQUETA_PAGO_PENDIENTE, ID_ETIQUETA_SEGUIMIENTO],
          modo: 'cualquiera',
          limite: 100,
          cursor,
        },
        0,
      );
      total += sig.datos.length;
      cursor = sig.pageInfo.nextCursor;
    }
    expect(total).toBe(union.size);

    let totalY = 0;
    let c2: string | null | undefined;
    do {
      const p = await consultarBandejaMock(
        {
          filtro: 'TODAS',
          etiquetas: [ID_ETIQUETA_PAGO_PENDIENTE, ID_ETIQUETA_SEGUIMIENTO],
          modo: 'todas',
          limite: 100,
          ...(c2 ? { cursor: c2 } : {}),
        },
        0,
      );
      for (const fila of p.datos) {
        expect(fila.etiquetas.map((e) => e.id)).toEqual(
          expect.arrayContaining([ID_ETIQUETA_PAGO_PENDIENTE, ID_ETIQUETA_SEGUIMIENTO]),
        );
      }
      totalY += p.datos.length;
      c2 = p.pageInfo.nextCursor;
    } while (c2);
    expect(totalY).toBe(ambas.length);
    expect((await pagina('cualquiera', [ID_ETIQUETA_PAGADO])).datos.length).toBeGreaterThan(0);
  });

  it('un id que no existe da cero filas, no un error', async () => {
    const r = await consultarBandejaMock(
      {
        filtro: 'TODAS',
        etiquetas: ['00000000-0004-4000-8000-0000000000ff'],
        modo: 'cualquiera',
        limite: 30,
      },
      0,
    );
    expect(r.datos).toEqual([]);
  });
});

describe('poner, quitar y borrar en demo (mismos errores que la API)', () => {
  const sinEtiquetas = () => {
    const c = MOCK_CONVERSACIONES.find((x) => x.etiquetas.length === 0 && x.estado === 'ABIERTA');
    if (!c) throw new Error('el mock debe traer filas sin etiquetas');
    return c;
  };

  it('poner es idempotente y devuelve la fila con sus etiquetas en el orden del catálogo', async () => {
    const c = sinEtiquetas();
    await ponerEtiquetaMock(c.id, ID_ETIQUETA_SEGUIMIENTO);
    const r = await ponerEtiquetaMock(c.id, ID_ETIQUETA_PAGADO);
    await ponerEtiquetaMock(c.id, ID_ETIQUETA_PAGADO);
    expect(r.etiquetas.map((e) => e.nombre)).toEqual(['Pagado', 'Seguimiento']);
    expect(c.etiquetas).toHaveLength(2);
  });

  it('quitar es idempotente', async () => {
    const c = sinEtiquetas();
    await ponerEtiquetaMock(c.id, ID_ETIQUETA_PAGADO);
    await quitarEtiquetaMock(c.id, ID_ETIQUETA_PAGADO);
    const r = await quitarEtiquetaMock(c.id, ID_ETIQUETA_PAGADO);
    expect(r.etiquetas).toEqual([]);
  });

  it('etiqueta inexistente: ETIQUETA_NO_ENCONTRADA; conversación inexistente: CONVERSACION_NO_ENCONTRADA', async () => {
    const c = sinEtiquetas();
    await expect(
      ponerEtiquetaMock(c.id, '00000000-0004-4000-8000-0000000000ff'),
    ).rejects.toMatchObject({ code: 'ETIQUETA_NO_ENCONTRADA' });
    await expect(
      ponerEtiquetaMock('00000000-0001-4000-8000-0000000fffff', ID_ETIQUETA_PAGADO),
    ).rejects.toMatchObject({ code: 'CONVERSACION_NO_ENCONTRADA' });
  });

  it('tope de 10 por conversación solo si la etiqueta es nueva para ella', async () => {
    const c = sinEtiquetas();
    const nuevas = [];
    for (let i = 0; i < MAX_ETIQUETAS_POR_CONVERSACION; i++) {
      nuevas.push(crearEtiquetaMock({ nombre: `Extra ${i}`, color: 'gris' }));
    }
    for (const e of nuevas) await ponerEtiquetaMock(c.id, e.id);
    expect(c.etiquetas).toHaveLength(MAX_ETIQUETAS_POR_CONVERSACION);
    await expect(ponerEtiquetaMock(c.id, ID_ETIQUETA_PAGADO)).rejects.toMatchObject({
      code: 'TOPE_DE_ETIQUETAS_DE_LA_CONVERSACION',
    });
    // Repetir una que ya tiene no es «una nueva»: sigue siendo idempotente.
    const r = await ponerEtiquetaMock(c.id, (nuevas[0] as { id: string }).id);
    expect(r.etiquetas).toHaveLength(MAX_ETIQUETAS_POR_CONVERSACION);
  });

  it('crear: duplicada sin importar mayúsculas ni espacios, inválida y tope de 50', () => {
    expect(() => crearEtiquetaMock({ nombre: ' pagado ', color: 'rosa' })).toThrowError(
      expect.objectContaining({ code: 'ETIQUETA_DUPLICADA' }) as Error,
    );
    expect(() => crearEtiquetaMock({ nombre: '   ', color: 'rosa' })).toThrowError(
      expect.objectContaining({ code: 'ETIQUETA_INVALIDA' }) as Error,
    );
    expect(() => crearEtiquetaMock({ nombre: 'x'.repeat(31), color: 'rosa' })).toThrowError(
      expect.objectContaining({ code: 'ETIQUETA_INVALIDA' }) as Error,
    );
    while (listarEtiquetasMock().length < MAX_ETIQUETAS_POR_AGENCIA) {
      crearEtiquetaMock({ nombre: `Etiqueta ${listarEtiquetasMock().length}`, color: 'gris' });
    }
    let codigo: string | undefined;
    try {
      crearEtiquetaMock({ nombre: 'Una más', color: 'gris' });
    } catch (e) {
      codigo = conectado(e);
    }
    expect(codigo).toBe('TOPE_DE_ETIQUETAS_DE_LA_AGENCIA');
  });

  it('renombrar y recolorear se ven en todas las conversaciones, conservando la asignación', async () => {
    const c = sinEtiquetas();
    await ponerEtiquetaMock(c.id, ID_ETIQUETA_SEGUIMIENTO);
    await actualizarEtiquetaEnConversacionesMock(ID_ETIQUETA_SEGUIMIENTO, {
      nombre: 'Hacer seguimiento',
      color: 'rosa',
    });
    expect(c.etiquetas).toEqual([
      { id: ID_ETIQUETA_SEGUIMIENTO, nombre: 'Hacer seguimiento', color: 'rosa' },
    ]);
  });

  it('borrar una etiqueta la quita de todas las conversaciones', async () => {
    const c = sinEtiquetas();
    await ponerEtiquetaMock(c.id, ID_ETIQUETA_PAGADO);
    await borrarEtiquetaDeLaAgenciaMock(ID_ETIQUETA_PAGADO);
    expect(listarEtiquetasMock().map((e) => e.id)).not.toContain(ID_ETIQUETA_PAGADO);
    expect(
      MOCK_CONVERSACIONES.some((x) => x.etiquetas.some((e) => e.id === ID_ETIQUETA_PAGADO)),
    ).toBe(false);
    await expect(borrarEtiquetaDeLaAgenciaMock(ID_ETIQUETA_PAGADO)).rejects.toMatchObject({
      code: 'ETIQUETA_NO_ENCONTRADA',
    });
  });

  it('el cliente de la API en demo habla con el mismo catálogo y traduce los errores a InboxErrorApi', async () => {
    const lista = await etiquetasApi.listar();
    expect(lista).toHaveLength(3);
    await expect(etiquetasApi.crear({ nombre: 'Pagado', color: 'gris' })).rejects.toMatchObject({
      name: 'InboxErrorApi',
      code: 'ETIQUETA_DUPLICADA',
    });
  });
});
