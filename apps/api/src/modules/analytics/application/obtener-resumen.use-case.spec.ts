import type { Permiso } from '@viajapro/contracts';
import { describe, expect, it } from 'vitest';
import {
  type CotizacionesAgregadas,
  PuertoCotizacionesParaReportes,
  PuertoOportunidadesParaReportes,
  PuertoRespuestaParaReportes,
  type RangoDeReporte,
} from '../../../shared/puertos/puertos-de-reportes.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { ObtenerResumenDeReportes } from './obtener-resumen.use-case.js';

const TENANT = '01932000-0000-7000-8000-000000000001';

class CotizacionesFalsas extends PuertoCotizacionesParaReportes {
  llamadas: Array<{ tenantId: string; rango: RangoDeReporte; incluirMargen: boolean }> = [];
  resumir(
    tenantId: string,
    rango: RangoDeReporte,
    incluirMargen: boolean,
  ): Promise<CotizacionesAgregadas> {
    this.llamadas.push({ tenantId, rango, incluirMargen });
    return Promise.resolve({
      creadas: 1,
      enviadas: 1,
      aceptadas: 1,
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
}

class OportunidadesFalsas extends PuertoOportunidadesParaReportes {
  tenants: string[] = [];
  porEtapa(tenantId: string) {
    this.tenants.push(tenantId);
    return Promise.resolve([]);
  }
}

class RespuestaFalsa extends PuertoRespuestaParaReportes {
  resumir() {
    return Promise.resolve({
      conversacionesNuevas: 0,
      conversacionesRespondidas: 0,
      promedioMinutos: null,
      medianaMinutos: null,
    });
  }
}

function ejecutar(permisos: Permiso[]) {
  const cotizaciones = new CotizacionesFalsas();
  const oportunidades = new OportunidadesFalsas();
  const caso = new ObtenerResumenDeReportes(cotizaciones, oportunidades, new RespuestaFalsa());
  const resultado = ContextoTenant.ejecutarCon(
    {
      tenantId: TENANT,
      usuarioId: null,
      identidadId: null,
      permisos: new Set(permisos),
      trazaId: 't',
    },
    () => caso.ejecutar({ desde: '2026-10-01T05:00:00.000Z', hasta: '2026-11-01T05:00:00.000Z' }),
  );
  return { resultado, cotizaciones, oportunidades };
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
});
