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
 * **El filtro va ANTES del tope (T-549).** Antes se leían los `limite` archivos abiertos más
 * urgentes y se filtraban DESPUÉS: un archivo huérfano que cayera bajo esa ventana no salía nunca
 * y la cifra era un mínimo disfrazado de total —la web la pintaba como total—. Ahora se pregunta
 * en tres pasos, sin que `booking` cruce la frontera (R4):
 *
 *   1. qué oportunidades sostienen los archivos ABIERTOS (columna propia, sin tope ni JOIN);
 *   2. cuáles de ellas no tienen quien responda, por los puertos de `crm` y de `identity`;
 *   3. la lista de siempre, restringida a esas oportunidades y a los archivos sin ninguna, con el
 *      tope aplicado ya sobre lo filtrado.
 *
 * Así `truncado` solo se marca cuando sobran huérfanos de verdad, y mientras no sobre ninguno la
 * cifra es el total del periodo. El coste es una consulta más de una columna; no hay JOIN nuevo,
 * ni vista, ni cambio de esquema.
 *
 * **Lo que no garantiza.** Los tres pasos no comparten transacción: un archivo que se abra entre
 * el primero y el tercero puede quedar fuera de esta respuesta, igual que quedaba antes. Es una
 * foto, no un candado; la siguiente lectura lo trae.
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
import { RepositorioDeOperacionDeArchivos } from './puertos-de-operacion.js';

/**
 * Las dependencias se declaran por lo que se USA, no por la clase entera: el token de inyección
 * sigue siendo la clase (lo que Nest necesita en ejecución), pero el tipo es el mínimo. Así un
 * doble de prueba es un objeto con un método y no una clase con campos privados.
 */
export type FuenteDeArchivosAbiertos = Pick<OperarArchivoUseCase, 'listar'>;
export type FuenteDeTransaccion = Pick<PrismaService, 'conTenant'>;
export type FuenteDeAsesores = Pick<PuertoAsesorDeOportunidad, 'asesoresDe'>;
export type FuenteDeElegibles = Pick<PuertoUsuariosConPermiso, 'activosConPermiso'>;
export type FuenteDeOportunidadesAbiertas = Pick<
  RepositorioDeOperacionDeArchivos,
  'oportunidadesDeArchivosAbiertos'
>;

@Injectable()
export class ListarArchivosSinResponsableUseCase {
  // `@Inject` explícito: sin él, bajo `tsx`, Nest construye esto con cero dependencias.
  constructor(
    @Inject(OperarArchivoUseCase) private readonly archivos: FuenteDeArchivosAbiertos,
    @Inject(PrismaService) private readonly prisma: FuenteDeTransaccion,
    @Inject(PuertoAsesorDeOportunidad) private readonly asesores: FuenteDeAsesores,
    @Inject(PuertoUsuariosConPermiso) private readonly usuarios: FuenteDeElegibles,
    @Inject(RepositorioDeOperacionDeArchivos)
    private readonly repositorio: FuenteDeOportunidadesAbiertas,
  ) {}

  async ejecutar(filtro: ListarArchivosSinResponsable): Promise<ListaDeArchivosSinResponsable> {
    const { tenantId } = ContextoTenant.obtener();

    // 1. De qué oportunidades cuelgan los archivos abiertos. Solo ids, sin tope: es lo único que
    //    hay que llevar fuera del módulo para saber qué está huérfano.
    const oportunidades = await this.repositorio.oportunidadesDeArchivosAbiertos();

    // 2. Quién puede responder hoy, y de quién es cada oportunidad. Una sola transacción corta
    //    para las dos preguntas. El tenant va además explícito, como defensa en profundidad sobre
    //    RLS (R1). Sin oportunidades en juego no hay nada que preguntar: todo lo abierto que haya
    //    es SIN_OPORTUNIDAD.
    const asesorPorOportunidad = new Map<string, string | null>();
    let elegibles: ReadonlySet<string> = new Set<string>();
    if (oportunidades.length > 0) {
      const leido = await this.prisma.conTenant(async (tx) => {
        const [operadores, filas] = await Promise.all([
          this.usuarios.activosConPermiso(tx, tenantId, PERMISO_DE_RESPONSABLE),
          this.asesores.asesoresDe(tx, tenantId, oportunidades),
        ]);
        return { operadores, filas };
      });
      elegibles = new Set(leido.operadores);
      for (const f of leido.filas) asesorPorOportunidad.set(f.oportunidadId, f.asesorId);
    }

    // 3. Las oportunidades por las que hoy no responde nadie. Una que no volvió de `crm` (borrada,
    //    o de otra agencia) se trata como «sin asesor»: el archivo sigue sin nadie que responda,
    //    que es lo único que esta lista afirma.
    const huerfanas = oportunidades.filter(
      (id) =>
        motivoSinResponsable(
          { oportunidadId: id, asesorId: asesorDe(asesorPorOportunidad, id) },
          elegibles,
        ) !== null,
    );

    // 4. Y RECIÉN AHORA se recortan filas, sobre lo ya filtrado. Se pide una de más: si vuelve,
    //    es que sobran huérfanos y la lista sí es un mínimo.
    const { datos } = await this.archivos.listar(
      { estado: 'ABIERTO', limite: filtro.limite + 1 },
      { oportunidades: huerfanas, incluirSinOportunidad: true },
    );
    const truncado = datos.length > filtro.limite;

    const sinResponsable: ArchivoSinResponsable[] = [];
    for (const archivo of datos.slice(0, filtro.limite)) {
      const asesorId =
        archivo.oportunidadId === null
          ? null
          : asesorDe(asesorPorOportunidad, archivo.oportunidadId);
      const motivo = motivoSinResponsable(
        { oportunidadId: archivo.oportunidadId, asesorId },
        elegibles,
      );
      // La restricción del paso 4 ya lo garantiza; se vuelve a comprobar porque afirmar «nadie
      // responde por esto» de un archivo que sí tiene dueño sería peor que dejarlo fuera.
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

/** Ausente y `null` son lo mismo aquí: «esa oportunidad no tiene asesor». */
const asesorDe = (asesores: ReadonlyMap<string, string | null>, id: string): string | null =>
  asesores.get(id) ?? null;
