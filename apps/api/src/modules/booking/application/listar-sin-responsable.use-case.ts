/**
 * `GET /api/v1/archivos/sin-responsable` (T-529, ADR-0035 §2, H7): los archivos ABIERTOS por los
 * que hoy no responde nadie.
 *
 * **Qué resuelve.** Un archivo cuyo asesor no existe —o ya no está activo, o perdió
 * `archivo.operar`— no produce ningún error: simplemente deja de aparecer en el reporte PROPIO de
 * cualquiera, porque la atribución va por `travel_files.oportunidad_id` → `oportunidades.asesor_id`
 * (ADR-0035 §2). Su dueño natural lee «0 por cobrar» y todo parece bien. Esta lista es lo que
 * rompe ese silencio.
 *
 * **La regla es prestada, no inventada aquí**: la misma de `destinatariosDelAviso` (T-254). Por eso
 * el asesor se pregunta por el puerto de `crm` y la elegibilidad por el de `identity` (R4): este
 * módulo no toca `oportunidades` ni `usuarios`.
 *
 * **Alcance.** No es un reporte propio ni de agencia: es la lista de lo huérfano, y la ve quien
 * puede adoptarlo (`archivo.operar`, lo exige el controlador). Por eso no pasa por
 * `alcanceDeReporte`: filtrarla «por asesor» sería devolver siempre vacío, que es justo el agujero
 * que esto viene a tapar.
 *
 * **Ventana.** Se revisan los `limite` archivos abiertos MÁS URGENTES (el mismo orden de plazo de
 * `GET /api/v1/archivos`) y se filtran después: si había al menos esos, la respuesta viene marcada
 * `truncado` y la lista es un mínimo. Mover el filtro a SQL exigiría que `booking` hiciera JOIN con
 * tablas de `crm` e `identity`, que es lo que R4 prohíbe.
 */
import { Inject, Injectable } from '@nestjs/common';
import type {
  ArchivoSinResponsable,
  ListaDeArchivosSinResponsable,
  ListarArchivosSinResponsable,
} from '@viajapro/contracts';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import {
  PuertoAsesorDeOportunidad,
  PuertoUsuariosConPermiso,
} from '../../../shared/puertos/puertos-para-avisos.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { motivoSinResponsable, PERMISO_DE_RESPONSABLE } from '../domain/sin-responsable.js';
import { OperarArchivoUseCase } from './operar-archivo.use-case.js';

/**
 * Las dependencias se declaran por lo que se USA, no por la clase entera: el token de inyección
 * sigue siendo la clase (lo que Nest necesita en ejecución), pero el tipo es el mínimo. Así un
 * doble de prueba es un objeto con un método y no una clase con campos privados.
 */
export type FuenteDeArchivosAbiertos = Pick<OperarArchivoUseCase, 'listar'>;
export type FuenteDeTransaccion = Pick<PrismaService, 'conTenant'>;
export type FuenteDeAsesores = Pick<PuertoAsesorDeOportunidad, 'asesoresDe'>;
export type FuenteDeElegibles = Pick<PuertoUsuariosConPermiso, 'activosConPermiso'>;

@Injectable()
export class ListarArchivosSinResponsableUseCase {
  // `@Inject` explícito: sin él, bajo `tsx`, Nest construye esto con cero dependencias.
  constructor(
    @Inject(OperarArchivoUseCase) private readonly archivos: FuenteDeArchivosAbiertos,
    @Inject(PrismaService) private readonly prisma: FuenteDeTransaccion,
    @Inject(PuertoAsesorDeOportunidad) private readonly asesores: FuenteDeAsesores,
    @Inject(PuertoUsuariosConPermiso) private readonly usuarios: FuenteDeElegibles,
  ) {}

  async ejecutar(filtro: ListarArchivosSinResponsable): Promise<ListaDeArchivosSinResponsable> {
    const { tenantId } = ContextoTenant.obtener();
    // Se reutiliza la lista de siempre: mismo orden de urgencia y misma regla del neto (T-248),
    // que no se vuelve a decidir aquí.
    const { datos } = await this.archivos.listar({ estado: 'ABIERTO', limite: filtro.limite });
    const truncado = datos.length >= filtro.limite;
    if (datos.length === 0) return { datos: [], truncado: false };

    const oportunidades = [
      ...new Set(datos.map((a) => a.oportunidadId).filter((id): id is string => id !== null)),
    ];

    // Una sola transacción corta para las dos preguntas: quién puede operar, y de quién es cada
    // oportunidad. El tenant va además explícito, como defensa en profundidad sobre RLS (R1).
    const { elegibles, asesorPorOportunidad } = await this.prisma.conTenant(async (tx) => {
      const [operadores, filas] = await Promise.all([
        this.usuarios.activosConPermiso(tx, tenantId, PERMISO_DE_RESPONSABLE),
        this.asesores.asesoresDe(tx, tenantId, oportunidades),
      ]);
      return {
        elegibles: new Set(operadores),
        asesorPorOportunidad: new Map(filas.map((f) => [f.oportunidadId, f.asesorId])),
      };
    });

    const sinResponsable: ArchivoSinResponsable[] = [];
    for (const archivo of datos) {
      // Una oportunidad que no volvió (borrada, o de otra agencia) se trata como «sin asesor»:
      // el archivo sigue sin nadie que responda, que es lo único que esta lista afirma.
      const asesorId =
        archivo.oportunidadId === null
          ? null
          : (asesorPorOportunidad.get(archivo.oportunidadId) ?? null);
      const motivo = motivoSinResponsable(
        { oportunidadId: archivo.oportunidadId, asesorId },
        elegibles,
      );
      if (motivo === null) continue;
      sinResponsable.push({
        motivo,
        // Solo se nombra al asesor cuando el problema ES él: en los otros dos casos no hay ninguno.
        asesorId: motivo === 'ASESOR_NO_ELEGIBLE' ? asesorId : null,
        archivo,
      });
    }
    return { datos: sinResponsable, truncado };
  }
}
