/**
 * Convierte un aviso de plazo del outbox en notificaciones en la aplicación (T-254). Lo invoca el
 * consumidor DENTRO de la transacción del despachador (tenant ya fijado a `outbox.tenant_id`).
 *
 * Datos de otros contextos, solo por puertos (R4): `booking` (número de file y oportunidad), `crm`
 * (asesor) e `identity` (activos con permiso). Idempotente por la base: una fila por
 * (evento, destinatario).
 */
import { Inject, Injectable } from '@nestjs/common';
import type { AvisoDePlazoV1 } from '@viajapro/contracts';
import type { ClienteTenant } from '../../../shared/prisma/prisma.service.js';
import {
  PuertoArchivoDeUnAviso,
  PuertoAsesorDeOportunidad,
  PuertoUsuariosConPermiso,
} from '../../../shared/puertos/puertos-para-avisos.js';
import {
  destinatariosDelAviso,
  type NotificacionPorCrear,
  PERMISO_DE_DESTINATARIO,
  type TipoDeAvisoDePlazo,
} from '../domain/aviso-de-plazo.js';
import { ArchivoDelAvisoNoEncontradoError } from '../domain/errors-de-avisos.js';
import { RepositorioDeAvisos } from './puertos-de-notificaciones.js';

export interface ResultadoDelAviso {
  destinatarios: number;
  creadas: number;
}

@Injectable()
export class RegistrarAvisoDePlazoUseCase {
  // `@Inject` explícito: sin él, bajo `tsx`, Nest construye esto con cero dependencias.
  constructor(
    @Inject(PuertoArchivoDeUnAviso) private readonly archivos: PuertoArchivoDeUnAviso,
    @Inject(PuertoAsesorDeOportunidad) private readonly asesores: PuertoAsesorDeOportunidad,
    @Inject(PuertoUsuariosConPermiso) private readonly usuarios: PuertoUsuariosConPermiso,
    @Inject(RepositorioDeAvisos) private readonly avisos: RepositorioDeAvisos,
  ) {}

  async ejecutar(
    tx: ClienteTenant,
    tenantId: string,
    outboxId: bigint,
    tipo: TipoDeAvisoDePlazo,
    aviso: AvisoDePlazoV1,
  ): Promise<ResultadoDelAviso> {
    const archivo = await this.archivos.leer(tx, tenantId, aviso.archivoId, aviso.reservaId);
    if (!archivo) throw new ArchivoDelAvisoNoEncontradoError(aviso.archivoId, aviso.reservaId);

    const asesorId = archivo.oportunidadId
      ? await this.asesores.asesorDe(tx, tenantId, archivo.oportunidadId)
      : null;
    const asesorElegible = asesorId
      ? await this.usuarios.activosConPermiso(tx, tenantId, PERMISO_DE_DESTINATARIO, [asesorId])
      : [];
    // Solo se consulta a todos si el asesor no sirve.
    const operadores =
      asesorElegible.length > 0
        ? []
        : await this.usuarios.activosConPermiso(tx, tenantId, PERMISO_DE_DESTINATARIO);

    const destinatarios = destinatariosDelAviso(asesorElegible, operadores);
    if (destinatarios.length === 0) return { destinatarios: 0, creadas: 0 };

    const nuevas: NotificacionPorCrear[] = destinatarios.map((usuarioId) => ({
      usuarioId,
      tipo: tipo.tipo,
      outboxId,
      archivoId: aviso.archivoId,
      reservaId: aviso.reservaId,
      archivoNumero: archivo.numero,
      venceEn: new Date(aviso.venceEn),
    }));
    const creadas = await this.avisos.crear(tx, tenantId, nuevas);
    return { destinatarios: destinatarios.length, creadas };
  }
}
