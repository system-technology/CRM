/**
 * Caso de uso: el resumen de reportes de un periodo.
 *
 * Pide un agregado a cada contexto dueño de los datos, por puerto (R4), en paralelo. El permiso
 * `cotizacion.ver_neto_y_margen` se resuelve AQUÍ y se pasa como un booleano: sin él, `quoting`
 * ni siquiera calcula el neto, así que no hay respuesta que «recortar» después (ADR-0011).
 */
import { Inject, Injectable } from '@nestjs/common';
import type { ConsultarResumenDeReportes, ResumenDeReportes } from '@viajapro/contracts';
import {
  PuertoCotizacionesParaReportes,
  PuertoOportunidadesParaReportes,
  PuertoRespuestaParaReportes,
} from '../../../shared/puertos/puertos-de-reportes.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { armarResumen } from '../domain/resumen.js';

@Injectable()
export class ObtenerResumenDeReportes {
  constructor(
    @Inject(PuertoCotizacionesParaReportes)
    private readonly cotizaciones: PuertoCotizacionesParaReportes,
    @Inject(PuertoOportunidadesParaReportes)
    private readonly oportunidades: PuertoOportunidadesParaReportes,
    @Inject(PuertoRespuestaParaReportes) private readonly respuesta: PuertoRespuestaParaReportes,
  ) {}

  async ejecutar(consulta: ConsultarResumenDeReportes): Promise<ResumenDeReportes> {
    const { tenantId } = ContextoTenant.obtener();
    const rango = { desde: new Date(consulta.desde), hasta: new Date(consulta.hasta) };
    const incluirMargen = ContextoTenant.tienePermiso('cotizacion.ver_neto_y_margen');

    const [cotizaciones, etapas, respuesta] = await Promise.all([
      this.cotizaciones.resumir(tenantId, rango, incluirMargen),
      this.oportunidades.porEtapa(tenantId, rango),
      this.respuesta.resumir(tenantId, rango),
    ]);

    return armarResumen({ rango, cotizaciones, etapas, respuesta });
  }
}
