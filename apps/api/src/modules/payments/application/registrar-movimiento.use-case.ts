/**
 * Registrar un movimiento de cobro (ADR-0034 §4) y reversarlo (§2, §4). Orquesta el dominio; las
 * reglas viven en `domain/reglas-de-registro.ts`.
 *
 * **Orden dentro de UNA transacción** (R5), el del ADR:
 *   1. candado consultivo por archivo, en su propia sentencia;
 *   2. buscar por `(tenant, clave)`: si existe, comparar **todo** lo que mandó el cliente —el
 *      dinero y también `referencia`, `nota` y `motivo` (T-516, ADR-0036)— → 200 con la fila o
 *      409; no se crea nada;
 *   3. si no existe: leer el archivo (bloqueado contra la cancelación), validar las reglas con la
 *      suma ya serializada por el candado e insertar con `ON CONFLICT DO NOTHING` como red.
 *
 * **Quién es quién.** `registrado_por` sale de la sesión (`ContextoTenant`), nunca del cuerpo (los
 * esquemas son `.strict()`); `registrado_en` lo fija la base. **Permisos por tipo**: PAGO exige
 * `cobro.registrar`; DEVOLUCION, AJUSTE, PENALIDAD y REVERSO exigen `cobro.corregir`. La ruta exige
 * `cobro.ver` (la respuesta trae el saldo); el permiso fino se comprueba aquí, ANTES de tocar la base.
 *
 * **Eventos.** `payments.pago_registrado` o `payments.pago_reversado` al outbox, en esta misma
 * transacción, con solo identificadores. Nada se publica desde aquí; no hay consumidor en el MVP,
 * así que no se avisa al despachador.
 */
import { Inject, Injectable } from '@nestjs/common';
import type {
  RegistrarMovimiento,
  ResultadoDeMovimiento,
  ReversarMovimiento,
} from '@viajapro/contracts';
import type { Permiso } from '@viajapro/contracts';
import { permisoDenegado } from '../../../shared/autorizacion/permiso.guard.js';
import { uuidV7 } from '../../../shared/cifrado/uuid-v7.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import {
  ArchivoDeCobroNoEncontradoError,
  ClaveDeIdempotenciaReutilizadaError,
  FalloDeEscrituraDelLibroError,
  MovimientoDeCobroNoEncontradoError,
  SinUsuarioParaRegistrarError,
} from '../domain/errors.js';
import { pagoRegistrado, pagoReversado } from '../domain/eventos.js';
import { diaEnZona } from '../domain/fechas.js';
import {
  type ContenidoDeMovimiento,
  type Movimiento,
  mismoContenido,
  type MovimientoNuevo,
} from '../domain/movimiento.js';
import { validarMovimiento, validarReverso } from '../domain/reglas-de-registro.js';
import { LeerCobroUseCase } from './leer-cobro.use-case.js';
import { aMovimiento } from './cobro.mapper.js';
import { RepositorioDeCobros } from './puertos-de-cobro.js';

export const PERMISO_PARA_REGISTRAR: Permiso = 'cobro.registrar';
export const PERMISO_PARA_CORREGIR: Permiso = 'cobro.corregir';

export interface ResultadoDeRegistro {
  /** `false` = reintento idempotente: la fila ya existía (200, no 201). */
  creado: boolean;
  resultado: ResultadoDeMovimiento;
}

/** La sesión debe tener usuario (el autor) y el permiso del tipo. Antes de cualquier consulta. */
function autor(permiso: Permiso): string {
  if (!ContextoTenant.tienePermiso(permiso)) throw permisoDenegado(permiso);
  const { usuarioId } = ContextoTenant.obtener();
  if (usuarioId === null) throw new SinUsuarioParaRegistrarError();
  return usuarioId;
}

@Injectable()
export class RegistrarMovimientoUseCase {
  constructor(
    @Inject(RepositorioDeCobros) private readonly cobros: RepositorioDeCobros,
    @Inject(LeerCobroUseCase) private readonly lector: LeerCobroUseCase,
  ) {}

  async registrar(archivoId: string, entrada: RegistrarMovimiento): Promise<ResultadoDeRegistro> {
    const usuarioId = autor(
      entrada.tipo === 'PAGO' ? PERMISO_PARA_REGISTRAR : PERMISO_PARA_CORREGIR,
    );
    const ahora = new Date();
    const montoUnidades = BigInt(entrada.monto.unidades);
    const tieneFechaYMedio = entrada.tipo === 'PAGO' || entrada.tipo === 'DEVOLUCION';
    // Todo lo que el cliente mandó, en la forma en que queda guardado: es lo que se inserta y es
    // lo que se compara contra un reintento con la misma clave (T-516, ADR-0036).
    const candidato: ContenidoDeMovimiento = {
      tipo: entrada.tipo,
      travelFileId: archivoId,
      montoUnidades,
      monedaIso: entrada.monto.moneda,
      pagadoEl: tieneFechaYMedio ? entrada.pagadoEl : null,
      medio: tieneFechaYMedio ? entrada.medio : null,
      pagadorId: entrada.tipo === 'PAGO' ? (entrada.pagadorId ?? null) : null,
      reversoDeId: null,
      referencia: tieneFechaYMedio ? (entrada.referencia ?? null) : null,
      nota: tieneFechaYMedio ? (entrada.nota ?? null) : null,
      motivo: entrada.tipo === 'AJUSTE' || entrada.tipo === 'PENALIDAD' ? entrada.motivo : null,
    };

    const { fila, creado } = await this.cobros.enTransaccion(async (ops) => {
      // 1. El candado, en su propia sentencia.
      await ops.bloquearCobroDelArchivo(archivoId);

      // 2. La clave primero: un reintento no se vuelve a validar contra un saldo que ya cambió.
      const previo = await ops.buscarPorClave(entrada.claveIdempotencia);
      if (previo) return { fila: igualOConflicto(previo, candidato), creado: false };

      // 3. Reglas y alta.
      const archivo = await ops.leerArchivoBloqueado(archivoId);
      if (!archivo) throw new ArchivoDeCobroNoEncontradoError(archivoId);
      const hoy = diaEnZona(ahora, await ops.zonaHoraria());
      validarMovimiento(
        {
          tipo: entrada.tipo,
          montoUnidades,
          monedaDelMonto: entrada.monto.moneda,
          pagadoEl: candidato.pagadoEl,
          confirmarSobrepago: entrada.tipo === 'PAGO' && entrada.confirmarSobrepago === true,
        },
        archivo,
        await ops.sumasVigentes(archivoId),
        hoy,
      );

      const nuevo: MovimientoNuevo = {
        id: uuidV7(),
        ...candidato,
        claveIdempotencia: entrada.claveIdempotencia,
        registradoPor: usuarioId,
      };
      const insertada = await ops.insertar(nuevo);
      if (!insertada) {
        // La red del ADR: no debería dispararse tras el candado. Si pasó, se vuelve al paso 2.
        const otra = await ops.buscarPorClave(entrada.claveIdempotencia);
        if (!otra) throw new FalloDeEscrituraDelLibroError('ON_CONFLICT_SIN_FILA', null);
        return { fila: igualOConflicto(otra, candidato), creado: false };
      }
      await ops.escribirEvento(
        pagoRegistrado({
          pagoId: insertada.id,
          travelFileId: archivoId,
          tipo: entrada.tipo,
        }),
      );
      return { fila: insertada, creado: true };
    });

    return { creado, resultado: await this.responder(archivoId, fila) };
  }

  async reversar(
    archivoId: string,
    pagoId: string,
    entrada: ReversarMovimiento,
  ): Promise<ResultadoDeRegistro> {
    const usuarioId = autor(PERMISO_PARA_CORREGIR);
    // El motivo es lo único que el cliente escribe en un reverso: un reintento que lo cambia NO es
    // el mismo movimiento (T-516, ADR-0036). Aceptarlo y guardar el motivo viejo sería mentirle.
    const esElMismoReverso = (fila: Movimiento): boolean =>
      fila.tipo === 'REVERSO' &&
      fila.travelFileId === archivoId &&
      fila.reversoDeId === pagoId &&
      fila.motivo === entrada.motivo;

    const { fila, creado } = await this.cobros.enTransaccion(async (ops) => {
      await ops.bloquearCobroDelArchivo(archivoId);

      const previo = await ops.buscarPorClave(entrada.claveIdempotencia);
      if (previo) {
        if (!esElMismoReverso(previo)) throw new ClaveDeIdempotenciaReutilizadaError();
        return { fila: previo, creado: false };
      }

      const archivo = await ops.leerArchivoBloqueado(archivoId);
      if (!archivo) throw new ArchivoDeCobroNoEncontradoError(archivoId);
      // Por `id AND travel_file_id`: un movimiento no se reversa desde la URL de otro archivo.
      const original = await ops.buscarMovimiento(archivoId, pagoId);
      if (!original) throw new MovimientoDeCobroNoEncontradoError(pagoId);

      validarReverso(
        original,
        await ops.yaReversado(pagoId),
        archivo,
        await ops.sumasVigentes(archivoId),
      );

      const insertada = await ops.insertar({
        id: uuidV7(),
        travelFileId: archivoId,
        tipo: 'REVERSO',
        // El reverso copia monto y moneda del original: la foránea de la base lo exige.
        montoUnidades: original.montoUnidades,
        monedaIso: original.monedaIso,
        pagadoEl: null,
        medio: null,
        pagadorId: null,
        referencia: null,
        nota: null,
        motivo: entrada.motivo,
        reversoDeId: original.id,
        claveIdempotencia: entrada.claveIdempotencia,
        registradoPor: usuarioId,
      });
      if (!insertada) {
        const otra = await ops.buscarPorClave(entrada.claveIdempotencia);
        if (!otra || !esElMismoReverso(otra)) throw new ClaveDeIdempotenciaReutilizadaError();
        return { fila: otra, creado: false };
      }
      await ops.escribirEvento(
        pagoReversado({ pagoId: insertada.id, reversoDeId: original.id, travelFileId: archivoId }),
      );
      return { fila: insertada, creado: true };
    });

    return { creado, resultado: await this.responder(archivoId, fila) };
  }

  /** La fila y cómo quedó el saldo, leídos de lo guardado. */
  private async responder(archivoId: string, fila: Movimiento): Promise<ResultadoDeMovimiento> {
    const cobro = await this.lector.delArchivo(archivoId);
    // El movimiento sale del mismo cálculo que el historial: lleva su marca `reversado`.
    const movimiento =
      cobro.movimientos.find((m) => m.id === fila.id) ?? aMovimiento(fila, new Set());
    return { movimiento, cobro };
  }
}

/** Reintento: el mismo contenido devuelve la fila existente; otro, un 409 tipado. */
function igualOConflicto(existente: Movimiento, candidato: ContenidoDeMovimiento): Movimiento {
  if (!mismoContenido(existente, candidato)) throw new ClaveDeIdempotenciaReutilizadaError();
  return existente;
}
