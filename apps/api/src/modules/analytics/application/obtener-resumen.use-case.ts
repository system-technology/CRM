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
 *
 * **T-537:** el saldo por cobrar exige además `cobro.ver`, el mismo permiso que las pantallas de
 * cobro (`payments/interface/cobros.controller.ts`). Un reporte puede ser MÁS ESTRECHO que lo que
 * el usuario ve en pantalla, nunca más amplio (ADR-0035 §4): sin ese permiso la clave `porCobrar`
 * no viene —ni en cero ni en `null`—, exactamente como el margen con el suyo. Hoy los tres roles
 * sembrados lo tienen, así que no cambia nada visible; se cierra antes de que exista el endpoint
 * para componer roles a medida (R12), con el que un rol sin `cobro.ver` más `reportes.ver_agencia`
 * vería el dinero de toda la agencia que su propia pantalla de cobros le niega.
 */
import { Inject, Injectable } from '@nestjs/common';
import { type ConsultarResumenDeReportes, ResumenDeReportesPorAlcance } from '@viajapro/contracts';
import {
  type AlcanceDeAgenciaEntera,
  alcanceDeReporte,
  esAgencia,
  esAgenciaEntera,
} from '../../../shared/autorizacion/alcance-de-reporte.js';
import {
  PuertoCobrosParaReportes,
  PuertoCotizacionesParaReportes,
  PuertoOportunidadesParaReportes,
  PuertoRespuestaParaReportes,
  TOPE_DE_ARCHIVOS_PARA_COBRAR,
} from '../../../shared/puertos/puertos-de-reportes.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { armarResumen, resumenesPorAsesor } from '../domain/resumen.js';

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
    const incluirMargen = true;
    // T-537: el saldo por cobrar es la MISMA cifra que sirven las pantallas de cobro, que exigen
    // `cobro.ver`. Sin el permiso no se pide: ni se consulta el puerto ni la clave existe.
    const incluirPorCobrar = ContextoTenant.tienePermiso('cobro.ver');
    // Las dos cifras de T-528 son de HOY, no del rango: su reloj se lee una sola vez, aquí, para
    // que los tramos de antigüedad no se midan contra instantes distintos dentro de la misma
    // respuesta.
    const ahora = new Date();

    // T-531 y T-532: solo el alcance de agencia. `porAsesor` solo con la agencia entera (con un
    // filtro de asesor sería una lista de uno, que ya es la respuesta). Los puertos los exigen por
    // TIPO (`AlcanceDeAgenciaEntera`): un alcance propio no compila.
    const agenciaEntera = esAgenciaEntera(alcance) ? alcance : null;
    const agencia = esAgencia(alcance) ? alcance : null;

    const [cotizaciones, etapas, respuesta, abiertas, cobros, porAsesor, ventasPorDestino] =
      await Promise.all([
        this.cotizaciones.resumir(tenantId, rango, alcance, incluirMargen),
        this.oportunidades.porEtapa(tenantId, rango, alcance),
        this.respuesta.resumir(tenantId, rango, alcance),
        this.cotizaciones.abiertas(tenantId, alcance, ahora),
        incluirPorCobrar
          ? this.cobros.porCobrar(tenantId, alcance, TOPE_DE_ARCHIVOS_PARA_COBRAR)
          : undefined,
        agenciaEntera === null
          ? undefined
          : this.porAsesor(tenantId, rango, agenciaEntera, incluirMargen),
        agencia === null
          ? undefined
          : this.cotizaciones.ventasPorDestino(tenantId, rango, agencia, incluirMargen),
      ]);

    return ResumenDeReportesPorAlcance.parse(
      armarResumen({
        alcance,
        rango,
        cotizaciones,
        etapas,
        respuesta,
        abiertas,
        cobros,
        agencia: { porAsesor, ventasPorDestino },
      }),
    );
  }

  /** Los tres agregados por asesor, en paralelo (una consulta por contexto, no una por asesor). */
  private async porAsesor(
    tenantId: string,
    rango: { desde: Date; hasta: Date },
    alcance: AlcanceDeAgenciaEntera,
    incluirMargen: boolean,
  ) {
    const [cotizaciones, oportunidades, respuestas] = await Promise.all([
      this.cotizaciones.resumirPorAsesor(tenantId, rango, alcance, incluirMargen),
      this.oportunidades.porAsesor(tenantId, rango, alcance),
      this.respuesta.porAsesor(tenantId, rango, alcance),
    ]);
    return resumenesPorAsesor({ cotizaciones, oportunidades, respuestas });
  }
}
