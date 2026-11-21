import type { Permiso } from '@viajapro/contracts';
import { describe, expect, it } from 'vitest';
import type {
  AlcanceDeAgenciaConFiltro,
  AlcanceDeAgenciaEntera,
  AlcanceDeReporte,
} from '../../../shared/autorizacion/alcance-de-reporte.js';
import {
  type CobrosAgregados,
  type CotizacionesAbiertasAgregadas,
  type CotizacionesAgregadas,
  type CotizacionesDeUnAsesor,
  type OportunidadesDeUnAsesor,
  PuertoCobrosParaReportes,
  PuertoCotizacionesParaReportes,
  PuertoOportunidadesParaReportes,
  PuertoRespuestaParaReportes,
  type RangoDeReporte,
  type RespuestaDeUnAsesor,
  TOPE_DE_ARCHIVOS_PARA_COBRAR,
  type VentaPorDestinoAgregada,
} from '../../../shared/puertos/puertos-de-reportes.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { ObtenerResumenDeReportes } from './obtener-resumen.use-case.js';

const TENANT = '01932000-0000-7000-8000-000000000001';
const YO = '01932000-0000-7000-8000-00000000aaaa';
const OTRO = '01932000-0000-7000-8000-00000000bbbb';

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

  porAsesorLlamadas: Array<{ alcance: AlcanceDeAgenciaEntera; incluirMargen: boolean }> = [];
  resumirPorAsesor(
    _tenantId: string,
    _rango: RangoDeReporte,
    alcance: AlcanceDeAgenciaEntera,
    incluirMargen: boolean,
  ): Promise<CotizacionesDeUnAsesor[]> {
    this.porAsesorLlamadas.push({ alcance, incluirMargen });
    return Promise.resolve([
      {
        asesorId: OTRO,
        creadas: 4,
        enviadas: 2,
        aceptadas: 1,
        aceptadasSinFecha: 0,
        ventasPorMoneda: [{ moneda: 'USD', cotizacionesAceptadas: 1, ventaUnidades: 90_000n }],
      },
    ]);
  }

  destinosLlamadas: Array<{ alcance: AlcanceDeAgenciaConFiltro; incluirMargen: boolean }> = [];
  ventasPorDestino(
    _tenantId: string,
    _rango: RangoDeReporte,
    alcance: AlcanceDeAgenciaConFiltro,
    incluirMargen: boolean,
  ): Promise<VentaPorDestinoAgregada[]> {
    this.destinosLlamadas.push({ alcance, incluirMargen });
    return Promise.resolve([
      { destino: 'Cartagena', moneda: 'COP', cotizacionesAceptadas: 2, ventaUnidades: 5_000_000n },
      { destino: 'Cartagena', moneda: 'USD', cotizacionesAceptadas: 1, ventaUnidades: 90_000n },
    ]);
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
  porAsesorLlamadas = 0;
  porAsesor(
    _tenantId: string,
    _rango: RangoDeReporte,
    _alcance: AlcanceDeAgenciaEntera,
  ): Promise<OportunidadesDeUnAsesor[]> {
    this.porAsesorLlamadas += 1;
    return Promise.resolve([{ asesorId: OTRO, creadas: 3, ganadas: 1, perdidas: 1 }]);
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
  porAsesorLlamadas = 0;
  porAsesor(
    _tenantId: string,
    _rango: RangoDeReporte,
    _alcance: AlcanceDeAgenciaEntera,
  ): Promise<RespuestaDeUnAsesor[]> {
    this.porAsesorLlamadas += 1;
    return Promise.resolve([]);
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

  describe('por asesor y por destino (T-531, T-532): solo con alcance de agencia', () => {
    it('la agencia entera trae las dos claves, con una sola ronda de puertos por asesor', async () => {
      const { resultado, cotizaciones, oportunidades, respuesta } = ejecutar([
        'reportes.ver_agencia',
      ]);
      const r = await resultado;
      expect(cotizaciones.porAsesorLlamadas).toHaveLength(1);
      expect(oportunidades.porAsesorLlamadas).toBe(1);
      expect(respuesta.porAsesorLlamadas).toBe(1);
      if (r.alcance !== 'AGENCIA') throw new Error('debía ser de agencia');
      // El asesor sale de la unión de los tres puertos; lo que un puerto no trae es cero y `null`.
      expect(r.porAsesor).toHaveLength(1);
      expect(r.porAsesor?.[0]).toMatchObject({
        asesorId: OTRO,
        cotizaciones: { creadas: 4, enviadas: 2, aceptadas: 1, tasaAceptacion: 50 },
        ventasPorMoneda: [{ moneda: 'USD', ventas: { unidades: '90000', moneda: 'USD' } }],
        oportunidades: { creadas: 3, ganadas: 1, perdidas: 1, abiertas: 1, tasaConversion: 50 },
        respuesta: { conversacionesNuevas: 0, tasaRespuesta: null, medianaMinutos: null },
      });
      // Una fila por destino y moneda; el COP y el USD de Cartagena NO se suman (R8).
      expect(r.ventasPorDestino).toEqual([
        {
          destino: 'Cartagena',
          moneda: 'COP',
          cotizacionesAceptadas: 2,
          ventas: { unidades: '5000000', moneda: 'COP' },
        },
        {
          destino: 'Cartagena',
          moneda: 'USD',
          cotizacionesAceptadas: 1,
          ventas: { unidades: '90000', moneda: 'USD' },
        },
      ]);
    });

    it('con filtro de asesor hay destinos de ese asesor pero no la lista por asesor', async () => {
      const { resultado, cotizaciones, oportunidades, respuesta } = ejecutar(
        ['reportes.ver_agencia'],
        OTRO,
      );
      const r = await resultado;
      if (r.alcance !== 'AGENCIA') throw new Error('debía ser de agencia');
      expect(cotizaciones.porAsesorLlamadas).toHaveLength(0);
      expect(oportunidades.porAsesorLlamadas).toBe(0);
      expect(respuesta.porAsesorLlamadas).toBe(0);
      expect(r.porAsesor).toBeUndefined();
      expect(cotizaciones.destinosLlamadas[0]?.alcance).toEqual({
        nivel: 'AGENCIA',
        asesorId: OTRO,
      });
      expect(r.ventasPorDestino).toHaveLength(2);
    });

    it('con alcance PROPIO no se consulta nada de esto y las claves no existen', async () => {
      const { resultado, cotizaciones, oportunidades, respuesta } = ejecutar([]);
      const r = await resultado;
      expect(cotizaciones.porAsesorLlamadas).toHaveLength(0);
      expect(cotizaciones.destinosLlamadas).toHaveLength(0);
      expect(oportunidades.porAsesorLlamadas).toBe(0);
      expect(respuesta.porAsesorLlamadas).toBe(0);
      expect(JSON.stringify(r)).not.toMatch(/porAsesor|ventasPorDestino/);
    });

    it('el margen por asesor y por destino sigue el permiso de margen, no el alcance', async () => {
      const sin = ejecutar(['reportes.ver_agencia']);
      await sin.resultado;
      expect(sin.cotizaciones.porAsesorLlamadas[0]?.incluirMargen).toBe(false);
      expect(sin.cotizaciones.destinosLlamadas[0]?.incluirMargen).toBe(false);
      const con = ejecutar(['reportes.ver_agencia', 'cotizacion.ver_neto_y_margen']);
      await con.resultado;
      expect(con.cotizaciones.porAsesorLlamadas[0]?.incluirMargen).toBe(true);
      expect(con.cotizaciones.destinosLlamadas[0]?.incluirMargen).toBe(true);
    });
  });
});
