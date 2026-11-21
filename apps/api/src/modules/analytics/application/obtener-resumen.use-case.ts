/**
 * Caso de uso: el resumen de reportes de un periodo.
 *
 * Pide un agregado a cada contexto dueño de los datos, por puerto (R4), en paralelo. El permiso
 * `cotizacion.ver_neto_y_margen` se resuelve AQUÍ y se pasa como un booleano: sin él, `quoting`
 * ni siquiera calcula el neto, así que no hay respuesta que «recortar» después (ADR-0011).
 *
 * **El alcance también se resuelve aquí**, con `alcanceDeReporte` sobre la SESIÓN (ADR-0035 §1):
 * los puertos lo reciben ya decidido y ningún adaptador lee el `asesorId` del cliente (§9.1).
 * Margen y alcance son dos ejes que no se mezclan: el alcance decide qué FILAS, el permiso de
 * margen qué COLUMNAS de dinero.
 *
 * La salida se valida contra la unión discriminada del contrato antes de devolverse (§9.3): una
 * clave de agencia en una respuesta propia falla aquí, en la prueba, y no en producción.
 *
 * **T-528:** además del periodo, el resumen trae dos cifras de HOY —las cotizaciones abiertas por
 * antigüedad y el saldo por cobrar por moneda—, por los mismos puertos y con el MISMO alcance. Sin
 * ellas la web no podía decir «las tuyas» sin filtrar listas de agencia en el cliente, que es lo
 * que ADR-0035 §5 prohíbe.
 */
import { Inject, Injectable } from '@nestjs/common';
import { type ConsultarResumenDeReportes, ResumenDeReportesPorAlcance } from '@viajapro/contracts';
import { alcanceDeReporte } from '../../../shared/autorizacion/alcance-de-reporte.js';
import {
  PuertoCobrosParaReportes,
  PuertoCotizacionesParaReportes,
  PuertoOportunidadesParaReportes,
  PuertoRespuestaParaReportes,
  TOPE_DE_ARCHIVOS_PARA_COBRAR,
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
    @Inject(PuertoCobrosParaReportes) private readonly cobros: PuertoCobrosParaReportes,
  ) {}

  async ejecutar(consulta: ConsultarResumenDeReportes): Promise<ResumenDeReportesPorAlcance> {
    const contexto = ContextoTenant.obtener();
    const { tenantId } = contexto;
    const alcance = alcanceDeReporte(contexto, consulta.asesorId);
    const rango = { desde: new Date(consulta.desde), hasta: new Date(consulta.hasta) };
    const incluirMargen = ContextoTenant.tienePermiso('cotizacion.ver_neto_y_margen');
    // Las dos cifras de T-528 son de HOY, no del rango: su reloj se lee una sola vez, aquí, para
    // que los tramos de antigüedad no se midan contra instantes distintos dentro de la misma
    // respuesta.
    const ahora = new Date();

    const [cotizaciones, etapas, respuesta, abiertas, cobros] = await Promise.all([
      this.cotizaciones.resumir(tenantId, rango, alcance, incluirMargen),
      this.oportunidades.porEtapa(tenantId, rango, alcance),
      this.respuesta.resumir(tenantId, rango, alcance),
      this.cotizaciones.abiertas(tenantId, alcance, ahora),
      this.cobros.porCobrar(tenantId, alcance, TOPE_DE_ARCHIVOS_PARA_COBRAR),
    ]);

    return ResumenDeReportesPorAlcance.parse(
      armarResumen({ alcance, rango, cotizaciones, etapas, respuesta, abiertas, cobros }),
    );
  }
}
