/**
 * Pruebas puras (sin base de datos) del mapeo y de la guardia de `semilla-agencia-desde-json`.
 *
 * El JSON de aquí es SINTÉTICO e inventado: agencia, tours, precios y textos son ficticios. No se
 * usa, ni se copia, ningún catálogo de una agencia real.
 */

import { describe, expect, it } from 'vitest';
import { POLITICA_POR_DEFECTO } from '@viajapro/domain';
import {
  CatalogoJsonInvalidoError,
  aSlug,
  mapearCatalogo,
  parsearHora,
  resumirCatalogo,
} from '../prisma/semilla-agencia-mapeo.js';
import {
  decidirSiSePuedeSembrarLaAgencia,
  estaDentroDelRepositorio,
  type EntradaGuardiaDeSemillaAgencia,
} from '../prisma/guardia-de-semilla-agencia.js';

const sintetico = () => ({
  agencia: { nombre: 'Agencia Ficticia Náutica', pais: 'CO', moneda: 'COP', ciudad: 'Ciudad Z' },
  contexto_destino: { ignorado: true },
  marca_observada: ['ignorada'],
  tours: [
    {
      nombre: 'Excursión Ñandú Clásica',
      tipo: 'excursion_ciudad',
      precio_lista_cop: 300000,
      precio_promo_cop: 250000,
      es_desde: false,
      sin_precio: false,
      duracion: 'Día completo',
      hora_salida: '4:00 AM',
      hora_regreso: '9:00 PM',
      opciones_de_salida: [],
      incluye: ['Guía', 'Almuerzo'],
      no_incluye: ['Entrada al museo'],
      restricciones: [],
      descripcion: 'Descripción ficticia.',
      notas: 'Salidas todos los días.',
    },
    {
      nombre: 'Isla Falsa',
      tipo: 'isla',
      precio_lista_cop: 500000,
      precio_promo_cop: null,
      es_desde: true,
      sin_precio: false,
      hora_salida: '5:00 AM',
      hora_regreso: '3:00 PM',
      opciones_de_salida: [
        {
          etiqueta: 'Lancha',
          hora_salida: '5:00 AM',
          hora_regreso: '2:00 PM - 2:30 PM (según oleaje)',
          punto_encuentro: 'Muelle Inventado',
        },
        { etiqueta: 'Terrestre', hora_salida: '12:00 AM', hora_regreso: null },
      ],
      incluye: ['Lancha'],
      no_incluye: ['Impuesto de muelle'],
      restricciones: ['Plan exclusivo para mayores de 12 años'],
      cargos_en_destino: [
        { concepto: 'Tasa portuaria', monto_cop: 29000, por: 'persona' },
        { concepto: 'Caminata (opcional)', monto_cop: 20000, por: 'persona', opcional: true },
      ],
    },
    {
      nombre: 'Club Sin Precio',
      precio_lista_cop: null,
      precio_promo_cop: null,
      es_desde: false,
      sin_precio: true,
      hora_salida: '7:00 AM',
    },
    {
      nombre: 'Bahía Inventada',
      precio_lista_cop: 450000,
      precio_promo_cop: null,
      es_desde: true,
      sin_precio: false,
      no_incluye: ['Recogida', 'Impuesto de muelle'],
      cargos_en_destino: [{ concepto: 'Impuesto de muelle', monto_cop: 31500, por: 'persona' }],
    },
  ],
});

const mapear = (datos: unknown = sintetico()) => mapearCatalogo(datos, POLITICA_POR_DEFECTO);

describe('mapeo del catálogo', () => {
  it('deriva el tenant del nombre de la agencia y soporta tildes y campos desconocidos', () => {
    const c = mapear();
    expect(c.agencia).toEqual({
      nombre: 'Agencia Ficticia Náutica',
      slug: 'agencia-ficticia-nautica',
      paisIso: 'CO',
      monedaIso: 'COP',
    });
    expect(c.paquetes).toHaveLength(4);
  });

  it('código estable sin tildes, un paquete de 1 día y 0 noches por tour', () => {
    const [p] = mapear().paquetes;
    expect(p?.codigo).toBe('excursion-nandu-clasica');
    expect(p?.nombre).toBe('Excursión Ñandú Clásica');
    expect([p?.dias, p?.noches]).toEqual([1, 0]);
    expect(mapear()).toEqual(mapear());
  });

  it('promo: venta = promo, lista > venta, neto derivado en enteros; sin vigencia de promo', () => {
    const t = mapear().paquetes[0]?.tarifas[0];
    expect(t?.ventaUnidades).toBe(250000n);
    expect(t?.listaUnidades).toBe(300000n);
    // 250000 / 1,20 = 208333,33… → el neto no se redondea a mil, solo al peso.
    expect(t?.netoUnidades).toBe(208333n);
    expect(t?.opcionEtiqueta).toBeNull();
    expect(t).not.toHaveProperty('promoHasta');
  });

  it('«desde» no se guarda: el precio de lista es la venta base y no hay campo de desde', () => {
    const p = mapear().paquetes[1];
    expect(p?.tarifas).toHaveLength(1);
    expect(p?.tarifas[0]?.ventaUnidades).toBe(500000n);
    expect(p?.tarifas[0]?.listaUnidades).toBeNull();
    expect(
      JSON.stringify(p, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)),
    ).not.toMatch(/desde/i);
  });

  it('sin precio: ninguna tarifa («Consultar»)', () => {
    const p = mapear().paquetes[2];
    expect(p?.tarifas).toEqual([]);
    expect(p?.camposPersonalizados['neto_es_derivado']).toBeUndefined();
    expect(resumirCatalogo(mapear())).toEqual({
      paquetes: 4,
      vigencias: 3,
      tarifas: 3,
      opcionesDeSalida: 2,
      sinPrecio: 1,
    });
  });

  it('opciones de salida: horas legibles a HH:MM, el resto va al punto de encuentro', () => {
    const op = mapear().paquetes[1]?.opciones;
    expect(op?.[0]).toMatchObject({
      etiqueta: 'Lancha',
      horaSalida: '05:00',
      horaRegreso: null,
      orden: 0,
    });
    expect(op?.[0]?.puntoDeEncuentro).toBe(
      'Muelle Inventado | Regreso: 2:00 PM - 2:30 PM (según oleaje)',
    );
    expect(op?.[1]).toMatchObject({
      horaSalida: '00:00',
      horaRegreso: null,
      puntoDeEncuentro: null,
    });
  });

  it('cargos en destino con monto por persona, sin sumarse a ninguna tarifa', () => {
    const p = mapear().paquetes[1];
    expect(p?.cargosEnDestino[0]).toEqual({
      concepto: 'Tasa portuaria',
      monto: { unidades: '29000', moneda: 'COP' },
      unidad: 'POR_PERSONA',
    });
    expect(p?.cargosEnDestino[1]?.nota).toBe('Opcional');
    expect(p?.tarifas[0]?.ventaUnidades).toBe(500000n);
  });

  it('«impuesto de muelle» en no_incluye sin cargo declarado: cargo SIN monto; con cargo, no se duplica', () => {
    const p = mapear().paquetes[1];
    const muelle = p?.cargosEnDestino.find((c) => c.concepto === 'Impuesto de muelle');
    expect(muelle).toMatchObject({ monto: null, unidad: 'POR_PERSONA' });
    expect(p?.exclusiones).toContain('Impuesto de muelle');

    const conMonto = mapear().paquetes[3]?.cargosEnDestino.filter((c) =>
      c.concepto.includes('muelle'),
    );
    expect(conMonto).toEqual([
      {
        concepto: 'Impuesto de muelle',
        monto: { unidades: '31500', moneda: 'COP' },
        unidad: 'POR_PERSONA',
      },
    ]);
  });

  it('restricción de edad, notas y datos publicados en campos personalizados', () => {
    const c = mapear().paquetes[1]?.camposPersonalizados;
    expect(c?.['restricciones']).toBe('Plan exclusivo para mayores de 12 años');
    expect(c?.['neto_es_derivado']).toBe(true);
    expect(c?.['tipo_de_producto']).toBe('isla');
    expect(mapear().paquetes[0]?.camposPersonalizados['hora_salida_publicada']).toBe('4:00 AM');
  });

  it('opción con precio propio ata la tarifa a su opción', () => {
    const datos = sintetico();
    Object.assign(datos.tours[1]?.opciones_de_salida?.[0] ?? {}, {
      precio_lista_cop: 520000,
    });
    const t = mapear(datos).paquetes[1]?.tarifas;
    expect(t).toHaveLength(1);
    expect(t?.[0]).toMatchObject({ opcionEtiqueta: 'Lancha', ventaUnidades: 520000n });
  });

  it.each([
    [
      'dinero decimal',
      (d: ReturnType<typeof sintetico>) =>
        ((d.tours[0] as { precio_lista_cop: number }).precio_lista_cop = 300000.5),
    ],
    [
      'promo mayor que la lista',
      (d: ReturnType<typeof sintetico>) =>
        ((d.tours[0] as { precio_promo_cop: number }).precio_promo_cop = 400000),
    ],
    [
      'sin precio y sin marca',
      (d: ReturnType<typeof sintetico>) =>
        ((d.tours[3] as { precio_lista_cop: number | null }).precio_lista_cop = null),
    ],
    [
      'nombre repetido',
      (d: ReturnType<typeof sintetico>) =>
        ((d.tours[3] as { nombre: string }).nombre = 'Isla Falsa'),
    ],
    [
      'moneda no COP',
      (d: ReturnType<typeof sintetico>) => ((d.agencia as { moneda: string }).moneda = 'USD'),
    ],
  ])('rechaza %s citando la ruta y no el valor', (_n, rompe) => {
    const d = sintetico();
    rompe(d);
    expect(() => mapear(d)).toThrow(CatalogoJsonInvalidoError);
    try {
      mapear(d);
    } catch (e) {
      expect((e as Error).message).not.toMatch(/Isla Falsa|300000|400000/);
    }
  });

  it('rechaza lo que no es un catálogo', () => {
    expect(() => mapear(null)).toThrow(CatalogoJsonInvalidoError);
    expect(() => mapear({ agencia: { nombre: 'X' }, tours: [] })).toThrow(
      CatalogoJsonInvalidoError,
    );
  });

  it('utilidades', () => {
    expect(aSlug('  Tour ÁÉÍ — Ñu!  ', 64)).toBe('tour-aei-nu');
    expect(parsearHora('7:30 AM')).toBe('07:30');
    expect(parsearHora('2:50 PM')).toBe('14:50');
    expect(parsearHora('12:50 PM')).toBe('12:50');
    expect(parsearHora('12:00 AM')).toBe('00:00');
    expect(parsearHora('15:05')).toBe('15:05');
    expect(parsearHora('2:00 PM - 2:30 PM')).toBeNull();
  });
});

describe('guardia de la semilla de agencia', () => {
  const ok: EntradaGuardiaDeSemillaAgencia = {
    appEnv: 'local',
    anfitrion: 'localhost',
    permitirRemoto: undefined,
    catalogo: { estado: 'ok' },
    correoDelDueno: 'dueno-x@agenciademo.test',
    agenciasAjenas: 0,
    identidadesAjenas: 0,
  };
  const negado = (e: Partial<EntradaGuardiaDeSemillaAgencia>) =>
    decidirSiSePuedeSembrarLaAgencia({ ...ok, ...e });

  it('permite en local', () => {
    expect(negado({})).toEqual({ permitido: true, remoto: false });
  });

  it('niega sin APP_ENV=local', () => {
    expect(negado({ appEnv: 'production' })).toMatchObject({ permitido: false });
    expect(negado({ appEnv: undefined })).toMatchObject({ permitido: false });
  });

  it('niega un remoto sin opt-in', () => {
    const d = negado({ anfitrion: 'ep-algo.neon.tech' });
    expect(d).toMatchObject({ permitido: false });
    expect(d.permitido ? '' : d.motivo).toContain('SEMILLA_AGENCIA_PERMITIR_REMOTO=si');
  });

  it('permite un remoto con opt-in y base limpia', () => {
    expect(negado({ anfitrion: 'ep.neon.tech', permitirRemoto: 'si' })).toEqual({
      permitido: true,
      remoto: true,
    });
  });

  it('niega un remoto con agencias ajenas o identidades reales, sin filtrar valores', () => {
    const a = negado({ anfitrion: 'ep.neon.tech', permitirRemoto: 'si', agenciasAjenas: 2 });
    const i = negado({ anfitrion: 'ep.neon.tech', permitirRemoto: 'si', identidadesAjenas: 1 });
    expect(a).toMatchObject({ permitido: false });
    expect(i).toMatchObject({ permitido: false });
    expect(negado({ anfitrion: 'ep.neon.tech', permitirRemoto: 'SI' })).toMatchObject({
      permitido: false,
    });
  });

  it.each(['ausente', 'no_existe', 'dentro_del_repositorio'] as const)(
    'niega el catálogo en estado %s',
    (estado) => {
      expect(negado({ catalogo: { estado } })).toMatchObject({ permitido: false });
    },
  );

  it('niega un JSON inválido y cita solo la ruta del defecto', () => {
    const d = negado({
      catalogo: { estado: 'json_invalido', detalle: 'tours[2].precio_lista_cop: x' },
    });
    expect(d.permitido ? '' : d.motivo).toContain('tours[2].precio_lista_cop');
  });

  it('niega un correo de dueño fuera de @agenciademo.test', () => {
    expect(negado({ correoDelDueno: 'dueno@real.com' })).toMatchObject({ permitido: false });
  });

  it('reconoce rutas dentro y fuera del repositorio', () => {
    const raiz = process.platform === 'win32' ? 'C:\\repo' : '/repo';
    const dentro = process.platform === 'win32' ? 'C:\\repo\\docs\\x.json' : '/repo/docs/x.json';
    const fuera = process.platform === 'win32' ? 'C:\\otro\\x.json' : '/otro/x.json';
    const hermana = process.platform === 'win32' ? 'C:\\repo-datos\\x.json' : '/repo-datos/x.json';
    expect(estaDentroDelRepositorio(dentro, raiz)).toBe(true);
    expect(estaDentroDelRepositorio(fuera, raiz)).toBe(false);
    expect(estaDentroDelRepositorio(hermana, raiz)).toBe(false);
  });
});
