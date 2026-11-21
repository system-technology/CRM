/**
 * La fecha límite de cobro de un archivo y los días por defecto de la agencia (ADR-0034 §3).
 * Ambos exigen `cobro.corregir` (ruta) y un usuario en la sesión (el autor).
 *
 * **Plazo por archivo.** Insert-only: rige la última fila. Repetir lo mismo (misma fecha y mismo
 * motivo que la última fila) no inserta otra: el reintento de una petición de red es inocuo.
 */
import { Inject, Injectable } from '@nestjs/common';
import type {
  CobroDelArchivo,
  FijarParametrosDeCobro,
  FijarPlazoDeCobro,
  ParametrosDeCobro,
} from '@viajapro/contracts';
import { uuidV7 } from '../../../shared/cifrado/uuid-v7.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { ArchivoDeCobroNoEncontradoError, SinUsuarioParaRegistrarError } from '../domain/errors.js';
import { LeerCobroUseCase } from './leer-cobro.use-case.js';
import { RepositorioDeCobros } from './puertos-de-cobro.js';

function usuarioDeLaSesion(): string {
  const { usuarioId } = ContextoTenant.obtener();
  if (usuarioId === null) throw new SinUsuarioParaRegistrarError();
  return usuarioId;
}

@Injectable()
export class PlazosYParametrosUseCase {
  constructor(
    @Inject(RepositorioDeCobros) private readonly cobros: RepositorioDeCobros,
    @Inject(LeerCobroUseCase) private readonly lector: LeerCobroUseCase,
  ) {}

  async fijarPlazo(archivoId: string, entrada: FijarPlazoDeCobro): Promise<CobroDelArchivo> {
    const usuarioId = usuarioDeLaSesion();
    const motivo = entrada.motivo ?? null;

    await this.cobros.enTransaccion(async (ops) => {
      await ops.bloquearCobroDelArchivo(archivoId);
      const archivo = await ops.leerArchivoBloqueado(archivoId);
      if (!archivo) throw new ArchivoDeCobroNoEncontradoError(archivoId);
      const ultimo = await ops.ultimoPlazo(archivoId);
      if (ultimo && ultimo.venceEl === entrada.venceEl && ultimo.motivo === motivo) return;
      await ops.insertarPlazo({
        id: uuidV7(),
        travelFileId: archivoId,
        venceEl: entrada.venceEl,
        motivo,
        registradoPor: usuarioId,
      });
    });
    return this.lector.delArchivo(archivoId);
  }

  async fijarParametros(entrada: FijarParametrosDeCobro): Promise<ParametrosDeCobro> {
    const usuarioId = usuarioDeLaSesion();
    await this.cobros.fijarDiasDePlazo(entrada.diasPlazoDeCobro, usuarioId);
    return { diasPlazoDeCobro: entrada.diasPlazoDeCobro, fijadoPorLaAgencia: true };
  }
}
