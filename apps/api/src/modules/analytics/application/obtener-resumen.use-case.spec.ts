import type { Permiso } from '@viajapro/contracts';
import { describe, expect, it } from 'vitest';
import type { AlcanceDeReporte } from '../../../shared/autorizacion/alcance-de-reporte.js';
import {
  type CobrosAgregados,
  type CotizacionesAbiertasAgregadas,
  type CotizacionesAgregadas,
  type CotizacionesDeUnAsesor,
  PuertoCobrosParaReportes,
  PuertoCotizacionesParaReportes,
  PuertoOportunidadesParaReportes,
  PuertoRespuestaParaReportes,
  type RangoDeReporte,
  TOPE_DE_ARCHIVOS_PARA_COBRAR,
  type VentaAgregada,
  type VentaDeUnDestino,
} from '../../../shared/puertos/puertos-de-reportes.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { ObtenerResumenDeReportes } from './obtener-resumen.use-case.js';

const TENANT = '01932000-0000-7000-8000-000000000001';
const YO = '01932000-0000-7000-8000-00000000aaaa';
const OTRO = '01932000-0000-7000-8000-00000000bbbb';

function ventaDeCop(incluirMargen: boolean): VentaAgregada {
  return {
    moneda: 'COP',
    cotizacionesAceptadas: 1,
    ventaUnidades: 1_200_000n,
    ...(incluirMargen
      ? {
          margen: {
            netoUnidades: 1_000_000n,
            margenUnidades: 200_000n,
            ventaConNetoUnidades: 1_200_000n,
            cotizacionesSinNeto: 0,
          },
        }
      : {}),
  };
}

class CotizacionesFalsas extends PuertoCotizacionesParaReportes {
  llamadas: Array<{
    tenantId: string;
    rango: RangoDeReporte;
    alcance: AlcanceDeReporte;
    incluirMargen: boolean;
  }> = [];
  resumir(
    tenantId: string,
    rango: RangoDeReporte,
    alcance: AlcanceDeReporte,
    incluirMargen: boolean,
  ): Promise<CotizacionesAgregadas> {
    this.llamadas.push({ tenantId, rango, alcance, incluirMargen });
    return Promise.resolve({
      creadas: 1,
      enviadas: 1,
      aceptadas: 1,
      aceptadasSinFecha: 0,
      ventasPorMoneda: [
        {
          moneda: 'COP',
          cotizacionesAceptadas: 1,
          ventaUnidades: 1_200_000n,
          ...(incluirMargen
            ? {
                margen: {
                  netoUnidades: 1_000_000n,
                  margenUnidades: 200_000n,
                  ventaConNetoUnidades: 1_200_000n,
                  cotizacionesSinNeto: 0,
                },
              }
            : {}),
        },
      ],
    });
  }

  // T-531 y T-532: lo que cada puerto nuevo recibió. Las dos particiones traen margen SOLO si se
  // les pidió, como el puerto real: lo que prueba la compuerta es que el flag baje hasta aquí.
  porAsesorLlamadas: Array<{ alcance: AlcanceDeReporte; incluirMargen: boolean }> = [];
  resumirPorAsesor(
    _tenantId: string,
    _rango: RangoDeReporte,
    alcance: AlcanceDeReporte,
    incluirMargen: boolean,
  ): Promise<CotizacionesDeUnAsesor[]> {
    this.porAsesorLlamadas.push({ alcance, incluirMargen });
    return Promise.resolve([
      {
        asesorId: YO,
        creadas: 4,
        enviadas: 3,
        aceptadas: 1,
        aceptadasSinFecha: 0,
        ventasPorMoneda: [ventaDeCop(incluirMargen)],
      },
    ]);
  }

  porDestinoLlamadas: Array<{ alcance: AlcanceDeReporte; incluirMargen: boolean }> = [];
  ventasPorDestino(
    _tenantId: string,
    _rango: RangoDeReporte,
    alcance: AlcanceDeReporte,
    incluirMargen: boolean,
  ): Promise<VentaDeUnDestino[]> {
    this.porDestinoLlamadas.push({ alcance, incluirMargen });
    return Promise.resolve([{ destino: 'Cartagena', ...ventaDeCop(incluirMargen) }]);
  }

  abiertasLlamadas: Array<{ tenantId: string; alcance: AlcanceDeReporte; ahora: Date }> = [];
  abiertas(
    tenantId: string,
    alcance: AlcanceDeReporte,
    ahora: Date,
  ): Promise<CotizacionesAbiertasAgregadas> {
    this.abiertasLlamadas.push({ tenantId, alcance, ahora });
    return Promise.resolve({
      borradores: 2,
      enviadas: 5,
      hastaTresDias: 1,
      deCuatroASiete: 1,
      masDeSiete: 3,
    });
  }
}

class CobrosFalsos extends PuertoCobrosParaReportes {
  llamadas: Array<{ tenantId: string; alcance: AlcanceDeReporte; tope: number }> = [];
  porCobrar(tenantId: string, alcance: AlcanceDeReporte, tope: number): Promise<CobrosAgregados> {
    this.llamadas.push({ tenantId, alcance, tope });
    return Promise.resolve({
      archivos: [
        {
          moneda: 'COP',
          estado: 'ABIERTO',
          ventaUnidades: 3_000_000n,
          sumas: { pagos: 1_000_000n, devoluciones: 0n, ajustes: 0n, penalidades: 0n },
        },
      ],
      truncado: false,
    });
  }
}

class OportunidadesFalsas extends PuertoOportunidadesParaReportes {
  tenants: string[] = [];
  alcances: AlcanceDeReporte[] = [];
  porEtapa(tenantId: string, _rango: RangoDeReporte, alcance: AlcanceDeReporte) {
    this.tenants.push(tenantId);
    this.alcances.push(alcance);
    return Promise.resolve([]);
  }

  porAsesorAlcances: AlcanceDeReporte[] = [];
  porAsesor(_tenantId: string, _rango: RangoDeReporte, alcance: AlcanceDeReporte) {
    this.porAsesorAlcances.push(alcance);
    return Promise.resolve([{ asesorId: YO, creadas: 5, ganadas: 2, perdidas: 1 }]);
  }
}

class RespuestaFalsa extends PuertoRespuestaParaReportes {
  alcances: AlcanceDeReporte[] = [];
  resumir(_tenantId: string, _rango: RangoDeReporte, alcance: AlcanceDeReporte) {
    this.alcances.push(alcance);
    return Promise.resolve({
      conversacionesNuevas: 0,
      conversacionesRespondidas: 0,
      promedioMinutos: null,
      medianaMinutos: null,
      p90Minutos: null,
      sinResponder: 0,
    });
  }

  porAsesorAlcances: AlcanceDeReporte[] = [];
  porAsesor(_tenantId: string, _rango: RangoDeReporte, alcance: AlcanceDeReporte) {
    this.porAsesorAlcances.push(alcance);
    return Promise.resolve([
      {
        asesorId: OTRO,
        conversacionesNuevas: 4,
        conversacionesRespondidas: 3,
        promedioMinutos: 10,
        medianaMinutos: 8,
        p90Minutos: 20,
        sinResponder: 1,
      },
    ]);
  }
}

function ejecutar(permisos: Permiso[], asesorId?: string, usuarioId: string | null = YO) {
  const cotizaciones = new CotizacionesFalsas();
  const oportunidades = new OportunidadesFalsas();
  const respuesta = new RespuestaFalsa();
  const cobros = new CobrosFalsos();
  const caso = new ObtenerResumenDeReportes(cotizaciones, oportunidades, respuesta, cobros);
  const resultado = ContextoTenant.ejecutarCon(
    {
      tenantId: TENANT,
      usuarioId,
      identidadId: null,
      permisos: new Set(permisos),
      trazaId: 't',
    },
    () =>
      caso.ejecutar({
        desde: '2026-10-01T05:00:00.000Z',
        hasta: '2026-11-01T05:00:00.000Z',
        ...(asesorId === undefined ? {} : { asesorId }),
      }),
  );
  return { resultado, cotizaciones, oportunidades, respuesta, cobros };
}

describe('ObtenerResumenDeReportes', () => {
  it('sin el permiso no pide el margen y la respuesta no trae esas claves', async () => {
    const { resultado, cotizaciones, oportunidades } = ejecutar([]);
    const r = await resultado;
    expect(cotizaciones.llamadas).toHaveLength(1);
    expect(cotizaciones.llamadas[0]?.incluirMargen).toBe(false);
    expect(cotizaciones.llamadas[0]?.tenantId).toBe(TENANT);
    expect(oportunidades.tenants).toEqual([TENANT]);
    const texto = JSON.stringify(r);
    expect(texto).not.toMatch(/neto|margen/i);
    expect(r.ventasPorMoneda[0]?.ventas).toEqual({ unidades: '1200000', moneda: 'COP' });
  });

  it('con cotizacion.ver_neto_y_margen pide el margen y lo devuelve', async () => {
    const { resultado, cotizaciones } = ejecutar(['cotizacion.ver_neto_y_margen']);
    const r = await resultado;
    expect(cotizaciones.llamadas[0]?.incluirMargen).toBe(true);
    expect(r.ventasPorMoneda[0]).toMatchObject({
      neto: { unidades: '1000000', moneda: 'COP' },
      margen: { unidades: '200000', moneda: 'COP' },
      margenPorcentaje: 16.7,
      cotizacionesSinNeto: 0,
    });
  });

  it('otro permiso no abre el margen', async () => {
    const { resultado, cotizaciones } = ejecutar([
      'cotizacion.escribir',
      'conversaciones.ver_todas',
    ]);
    await resultado;
    expect(cotizaciones.llamadas[0]?.incluirMargen).toBe(false);
  });

  // --- alcance (T-342, ADR-0035 §1 y §4) -------------------------------------------------------

  it('sin reportes.ver_agencia el alcance es PROPIO y LOS TRES puertos lo reciben', async () => {
    const { resultado, cotizaciones, oportunidades, respuesta, cobros } = ejecutar(['cobro.ver']);
    const r = await resultado;
    const propio = { nivel: 'PROPIO', asesorId: YO };
    expect(cotizaciones.llamadas[0]?.alcance).toEqual(propio);
    expect(oportunidades.alcances).toEqual([propio]);
    expect(respuesta.alcances).toEqual([propio]);
    // T-528: los dos puertos nuevos reciben EL MISMO alcance, no uno propio suyo.
    expect(cotizaciones.abiertasLlamadas[0]?.alcance).toEqual(propio);
    expect(cobros.llamadas[0]?.alcance).toEqual(propio);
    expect(r.alcance).toBe('PROPIO');
    expect(r.asesorId).toBe(YO);
  });

  it('sin el permiso, el asesorId del cliente NO amplia: el servidor impone el de la sesion', async () => {
    for (const pedido of [undefined, 'yo', YO]) {
      const { resultado, cotizaciones } = ejecutar(['conversaciones.ver_todas'], pedido);
      await resultado;
      expect(cotizaciones.llamadas[0]?.alcance).toEqual({ nivel: 'PROPIO', asesorId: YO });
    }
  });

  it('sin el permiso, un asesorId ajeno es 403 y no llega a ningun puerto', async () => {
    const { resultado, cotizaciones } = ejecutar([], OTRO);
    await expect(resultado).rejects.toMatchObject({
      response: { error: { code: 'PERMISO_DENEGADO' } },
    });
    expect(cotizaciones.llamadas).toHaveLength(0);
    expect(cotizaciones.abiertasLlamadas).toHaveLength(0);
  });

  it('con reportes.ver_agencia: sin asesor es toda la agencia, con asesor filtra', async () => {
    const todos = ejecutar(['reportes.ver_agencia']);
    const r = await todos.resultado;
    expect(todos.cotizaciones.llamadas[0]?.alcance).toEqual({ nivel: 'AGENCIA', asesorId: null });
    expect(r.alcance).toBe('AGENCIA');
    expect(r.asesorId).toBeNull();

    const filtrado = ejecutar(['reportes.ver_agencia'], OTRO);
    const f = await filtrado.resultado;
    expect(filtrado.cotizaciones.llamadas[0]?.alcance).toEqual({
      nivel: 'AGENCIA',
      asesorId: OTRO,
    });
    expect(f.asesorId).toBe(OTRO);

    const mios = ejecutar(['reportes.ver_agencia'], 'yo');
    expect((await mios.resultado).asesorId).toBe(YO);
  });

  it('sin usuario de sesion no hay «lo propio»: 403 en vez de devolverlo todo', async () => {
    const { resultado } = ejecutar([], undefined, null);
    await expect(resultado).rejects.toMatchObject({
      response: { error: { code: 'PERMISO_DENEGADO' } },
    });
  });

  // --- cotizaciones abiertas y por cobrar (T-528) ----------------------------------------------

  it('con cobro.ver trae las dos cifras de hoy, con el alcance de la sesión', async () => {
    const { resultado, cotizaciones, cobros } = ejecutar(['cobro.ver']);
    const r = await resultado;

    expect(r.cotizacionesAbiertas).toEqual({
      total: 7,
      borradores: 2,
      enviadas: 5,
      porAntiguedad: { hastaTresDias: 1, deCuatroASiete: 1, masDeSiete: 3 },
    });
    // 3.000.000 vendidos − 1.000.000 pagados.
    expect(r.porCobrar).toEqual({
      porMoneda: [{ moneda: 'COP', archivos: 1, saldo: { unidades: '2000000', moneda: 'COP' } }],
      truncado: false,
    });

    expect(cotizaciones.abiertasLlamadas[0]?.tenantId).toBe(TENANT);
    expect(cobros.llamadas[0]?.tenantId).toBe(TENANT);
    expect(cobros.llamadas[0]?.tope).toBe(TOPE_DE_ARCHIVOS_PARA_COBRAR);
  });

  it('con reportes.ver_agencia y filtro de asesor, los dos puertos nuevos lo reciben', async () => {
    const { resultado, cotizaciones, cobros } = ejecutar(
      ['reportes.ver_agencia', 'cobro.ver'],
      OTRO,
    );
    await resultado;
    const esperado = { nivel: 'AGENCIA', asesorId: OTRO };
    expect(cotizaciones.abiertasLlamadas[0]?.alcance).toEqual(esperado);
    expect(cobros.llamadas[0]?.alcance).toEqual(esperado);
  });

  // --- por cobrar y `cobro.ver` (T-537, ADR-0035 §4) --------------------------------------------

  it('sin cobro.ver NO se consulta el puerto y la clave `porCobrar` no existe', async () => {
    const { resultado, cobros } = ejecutar([]);
    const r = await resultado;

    expect(cobros.llamadas).toHaveLength(0);
    expect(r).not.toHaveProperty('porCobrar');
    // Ni en cero ni en `null`: la clave no está en el JSON, como el margen sin su permiso.
    expect(JSON.stringify(r)).not.toContain('porCobrar');
    // Y lo que no depende de ese permiso sigue ahí: se recorta la cifra, no el reporte.
    expect(r.cotizacionesAbiertas?.total).toBe(7);
  });

  it('otro permiso no abre el saldo por cobrar, tampoco el de ver toda la agencia', async () => {
    for (const permisos of [
      ['cotizacion.ver_neto_y_margen'],
      ['reportes.ver_agencia'],
      ['cobro.registrar'],
    ] satisfies Permiso[][]) {
      const { resultado, cobros } = ejecutar(permisos);
      const r = await resultado;
      expect(cobros.llamadas).toHaveLength(0);
      expect(r).not.toHaveProperty('porCobrar');
    }
  });

  it('el reporte nunca es más amplio que la pantalla: con reportes.ver_agencia pero sin cobro.ver tampoco hay cifra de agencia', async () => {
    const { resultado, cotizaciones } = ejecutar(['reportes.ver_agencia']);
    const r = await resultado;
    // Ve toda la agencia en todo lo demás...
    expect(r.alcance).toBe('AGENCIA');
    expect(cotizaciones.llamadas[0]?.alcance).toEqual({ nivel: 'AGENCIA', asesorId: null });
    // ...pero el dinero por cobrar de la agencia, que su pantalla de cobros le niega, no viene.
    expect(r).not.toHaveProperty('porCobrar');
  });

  it('un solo reloj para toda la respuesta: `ahora` no se lee dos veces', async () => {
    const antes = Date.now();
    const { resultado, cotizaciones } = ejecutar([]);
    await resultado;
    const ahora = cotizaciones.abiertasLlamadas[0]?.ahora;
    expect(ahora).toBeInstanceOf(Date);
    expect(ahora!.getTime()).toBeGreaterThanOrEqual(antes);
    expect(ahora!.getTime()).toBeLessThanOrEqual(Date.now());
  });

  // --- por asesor y por destino (T-531, T-532) ---------------------------------------------------

  it('con alcance de agencia trae las cifras por asesor y las ventas por destino, con el MISMO alcance', async () => {
    const { resultado, cotizaciones, oportunidades, respuesta } = ejecutar([
      'reportes.ver_agencia',
    ]);
    const r = await resultado;
    const agencia = { nivel: 'AGENCIA', asesorId: null };

    // Una consulta por fuente: cada puerto recibe UNA llamada, no una por asesor.
    expect(cotizaciones.porAsesorLlamadas.map((l) => l.alcance)).toEqual([agencia]);
    expect(cotizaciones.porDestinoLlamadas.map((l) => l.alcance)).toEqual([agencia]);
    expect(oportunidades.porAsesorAlcances).toEqual([agencia]);
    expect(respuesta.porAsesorAlcances).toEqual([agencia]);

    if (r.alcance !== 'AGENCIA') throw new Error('se esperaba AGENCIA');
    // Las tres fuentes se unen: YO viene de cotizaciones y oportunidades, OTRO solo de respuesta.
    expect(r.porAsesor?.map((f) => f.asesorId)).toEqual([YO, OTRO]);
    expect(r.porAsesor?.[0]).toMatchObject({
      asesorId: YO,
      cotizaciones: { creadas: 4, enviadas: 3, aceptadas: 1, tasaAceptacion: 33.3 },
      oportunidades: { creadas: 5, ganadas: 2, perdidas: 1, abiertas: 2, tasaConversion: 66.7 },
      respuesta: { conversacionesNuevas: 0, tasaRespuesta: null, medianaMinutos: null },
    });
    // Quien no tiene cotizaciones ni oportunidades: ceros y razones `null`, no cifras inventadas.
    expect(r.porAsesor?.[1]).toMatchObject({
      asesorId: OTRO,
      cotizaciones: { creadas: 0, tasaAceptacion: null },
      ventasPorMoneda: [],
      oportunidades: { creadas: 0, tasaConversion: null },
      respuesta: { conversacionesNuevas: 4, sinResponder: 1, tasaRespuesta: 75 },
    });
    expect(r.ventasPorDestino).toEqual([
      {
        destino: 'Cartagena',
        moneda: 'COP',
        cotizacionesAceptadas: 1,
        ventas: { unidades: '1200000', moneda: 'COP' },
      },
    ]);
  });

  it('con filtro de asesor, las dos particiones reciben ese filtro y no una agencia entera', async () => {
    const { resultado, cotizaciones, oportunidades, respuesta } = ejecutar(
      ['reportes.ver_agencia'],
      OTRO,
    );
    await resultado;
    const filtrado = { nivel: 'AGENCIA', asesorId: OTRO };
    expect(cotizaciones.porAsesorLlamadas[0]?.alcance).toEqual(filtrado);
    expect(cotizaciones.porDestinoLlamadas[0]?.alcance).toEqual(filtrado);
    expect(oportunidades.porAsesorAlcances).toEqual([filtrado]);
    expect(respuesta.porAsesorAlcances).toEqual([filtrado]);
  });

  it('con alcance PROPIO no se consulta ninguna partición y las claves no existen', async () => {
    // Ni siquiera con TODOS los permisos de dinero: el alcance manda, no el permiso.
    const { resultado, cotizaciones, oportunidades, respuesta } = ejecutar([
      'cotizacion.ver_neto_y_margen',
      'cobro.ver',
      'conversaciones.ver_todas',
    ]);
    const r = await resultado;
    expect(r.alcance).toBe('PROPIO');
    expect(cotizaciones.porAsesorLlamadas).toHaveLength(0);
    expect(cotizaciones.porDestinoLlamadas).toHaveLength(0);
    expect(oportunidades.porAsesorAlcances).toHaveLength(0);
    expect(respuesta.porAsesorAlcances).toHaveLength(0);
    expect(r).not.toHaveProperty('porAsesor');
    expect(r).not.toHaveProperty('ventasPorDestino');
  });

  // LA COMPUERTA DE DINERO. Estas dos pruebas son las que se ponen en rojo si alguien deja de
  // pasar `incluirMargen` a las particiones (verificado a mano: ver la entrega).

  it('con reportes.ver_agencia SIN cotizacion.ver_neto_y_margen, el margen no se pide ni viaja en ninguna partición', async () => {
    const { resultado, cotizaciones } = ejecutar(['reportes.ver_agencia', 'cobro.ver']);
    const r = await resultado;

    expect(cotizaciones.porAsesorLlamadas.map((l) => l.incluirMargen)).toEqual([false]);
    expect(cotizaciones.porDestinoLlamadas.map((l) => l.incluirMargen)).toEqual([false]);

    if (r.alcance !== 'AGENCIA') throw new Error('se esperaba AGENCIA');
    expect(r.porAsesor?.[0]?.ventasPorMoneda).toHaveLength(1);
    expect(r.ventasPorDestino).toHaveLength(1);
    // Ni la clave, ni en cero ni en `null`: ni en el total, ni por asesor, ni por destino.
    expect(JSON.stringify(r)).not.toMatch(/neto|margen/i);
  });

  it('con AMBOS permisos, el margen sí llega a las dos particiones (lo que cambia es el permiso)', async () => {
    const { resultado, cotizaciones } = ejecutar([
      'reportes.ver_agencia',
      'cotizacion.ver_neto_y_margen',
    ]);
    const r = await resultado;

    expect(cotizaciones.porAsesorLlamadas.map((l) => l.incluirMargen)).toEqual([true]);
    expect(cotizaciones.porDestinoLlamadas.map((l) => l.incluirMargen)).toEqual([true]);

    if (r.alcance !== 'AGENCIA') throw new Error('se esperaba AGENCIA');
    expect(r.porAsesor?.[0]?.ventasPorMoneda[0]).toMatchObject({
      neto: { unidades: '1000000', moneda: 'COP' },
      margen: { unidades: '200000', moneda: 'COP' },
      margenPorcentaje: 16.7,
    });
    expect(r.ventasPorDestino?.[0]).toMatchObject({
      destino: 'Cartagena',
      margen: { unidades: '200000', moneda: 'COP' },
    });
  });

  it('no hay saldo por cobrar por asesor: `porCobrar` sigue siendo del total y de `cobro.ver`', async () => {
    const sin = ejecutar(['reportes.ver_agencia']);
    const r = await sin.resultado;
    expect(JSON.stringify(r)).not.toContain('porCobrar');
    expect(sin.cobros.llamadas).toHaveLength(0);

    const con = ejecutar(['reportes.ver_agencia', 'cobro.ver']);
    const c = await con.resultado;
    if (c.alcance !== 'AGENCIA') throw new Error('se esperaba AGENCIA');
    expect(c.porCobrar?.porMoneda).toHaveLength(1);
    // Una sola consulta de cobros, y las filas por asesor no llevan ninguna cifra de cobro.
    expect(con.cobros.llamadas).toHaveLength(1);
    expect(JSON.stringify(c.porAsesor)).not.toMatch(/cobrar|saldo/i);
  });
});
