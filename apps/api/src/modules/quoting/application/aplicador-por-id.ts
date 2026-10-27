/**
 * `AplicadorPorId` — vigencias y tarifas gestionables por id (ADR-0017 §4.1, T-043).
 *
 * Es el compañero de `AplicadorDeCatalogo`, no un camino paralelo: **todo lo que se puede expresar
 * como propuesta pasa por `AplicadorDeCatalogo.aplicarDentro`** (mismo validador, misma auditoría
 * de precio, misma transacción). Cada operación por id se traduce a la propuesta de **un** producto
 * con la vigencia afectada y se casa con el paquete por id, como hace `editarPaquete`.
 *
 * Solo dos cosas no caben en una propuesta, porque el planificador casa por clave natural y no
 * sabe «mover» ni «borrar»: cambiar la ventana de una vigencia existente y eliminar una tarifa. Esas
 * pasan por el puerto `OperacionesPorId`, **después** de validar el estado resultante con
 * `validarYPlanificar` (el empate se detecta con la misma función del cotizador), y escriben su
 * auditoría en la misma transacción.
 *
 * Reglas:
 *   · crear lo que ya existe igual es idempotente (no escribe nada); con datos distintos es 409;
 *   · un empate de vigencias es 409 `VIGENCIA_EMPATADA` y no se guarda nada;
 *   · el neto solo lo escribe y lo ve quien tiene `cotizacion.ver_neto_y_margen`.
 */

import { Inject, Injectable } from '@nestjs/common';
import type {
  CrearTarifa,
  CrearVigencia,
  EditarTarifa,
  EditarVigencia,
  TarifaDeGestion,
  TarifaPropuesta,
  VigenciaDeGestion,
  VigenciaPropuesta,
} from '@viajapro/contracts';
import { PaqueteNoEncontradoError, PropuestaInvalidaError } from '../domain/errors.js';
import {
  MayoristaNoEncontradoError,
  TarifaDuplicadaError,
  TarifaNoEncontradaError,
  VigenciaDuplicadaError,
  VigenciaEmpatadaError,
  VigenciaInvalidaError,
  VigenciaNoEncontradaError,
} from '../domain/errores-de-gestion.js';
import {
  type CambioDePaquete,
  type CatalogoActual,
  type PaqueteActual,
  type TarifaActual,
  type VigenciaActual,
  normalizarNombre,
  validarYPlanificar,
} from '../domain/validar-y-planificar.js';
import {
  AplicadorDeCatalogo,
  type ContextoDeAplicacion,
  CODIGO_DE_EDICION,
  productoDesdeActual,
  propuestaDeUnProducto,
} from './aplicador-de-catalogo.js';
import {
  type EspacioDeGestion,
  UnidadDeTrabajoDeGestion,
  type VentanaDeVigencia,
} from './puertos-de-gestion.js';

export interface ResultadoPorId {
  readonly id: string;
  readonly informe: import('@viajapro/contracts').InformeDeCatalogo | null;
}

const ventanaTexto = (desde: string, hasta: string): string => `${desde}..${hasta}`;

@Injectable()
export class AplicadorPorId {
  constructor(
    @Inject(UnidadDeTrabajoDeGestion) private readonly trabajo: UnidadDeTrabajoDeGestion,
    @Inject(AplicadorDeCatalogo) private readonly aplicador: AplicadorDeCatalogo,
  ) {}

  // ---------------------------------------------------------------------------------------------
  // Lectura
  // ---------------------------------------------------------------------------------------------

  async listarVigencias(
    paqueteId: string,
    contexto: ContextoDeAplicacion,
  ): Promise<VigenciaDeGestion[]> {
    const actual = await this.trabajo.ejecutar(({ catalogo }) => catalogo.leer());
    const paquete = actual.paquetes.find((p) => p.id === paqueteId);
    if (!paquete) throw new PaqueteNoEncontradoError(paqueteId);
    const puedeVerNeto = contexto.permisos.includes('cotizacion.ver_neto_y_margen');
    return paquete.vigencias
      .filter((v): v is VigenciaActual & { id: string } => v.id !== undefined)
      .map((v) => ({
        id: v.id,
        paqueteId: paquete.id,
        desde: v.desde,
        hasta: v.hasta,
        publicada: v.publicada,
        cupoTotal: v.cupoTotal ?? null,
        tarifas: v.tarifas
          .filter((t): t is TarifaActual & { id: string } => t.id !== undefined)
          .map((t) => tarifaDeGestion(t, puedeVerNeto)),
      }));
  }

  // ---------------------------------------------------------------------------------------------
  // Vigencias
  // ---------------------------------------------------------------------------------------------

  async crearVigencia(
    datos: CrearVigencia,
    contexto: ContextoDeAplicacion,
  ): Promise<ResultadoPorId> {
    return this.trabajo.ejecutar(async (espacio) => {
      await espacio.catalogo.bloquear();
      const actual = await espacio.catalogo.leer();
      const paquete = actual.paquetes.find((p) => p.id === datos.paqueteId);
      if (!paquete) throw new PaqueteNoEncontradoError(datos.paqueteId);

      const tarifas: TarifaPropuesta[] = [];
      for (const t of datos.tarifas) tarifas.push(await propuestaDeTarifa(espacio, t));
      const vigencia: VigenciaPropuesta = {
        desde: datos.desde,
        hasta: datos.hasta,
        publicada: datos.publicada,
        tarifas,
      };

      const informe = await this.aplicarVigencia(
        espacio,
        actual,
        paquete,
        vigencia,
        contexto,
        (cv) => {
          if (cv.accion === 'ACTUALIZAR') {
            throw new VigenciaDuplicadaError(ventanaTexto(datos.desde, datos.hasta));
          }
        },
      );

      const despues = await espacio.catalogo.leer();
      const creada = buscarVigencia(despues, paquete.id, datos.desde, datos.hasta);
      if (!creada?.id) throw new VigenciaNoEncontradaError(`${datos.desde}..${datos.hasta}`);
      if (datos.cupoTotal !== null && creada.cupoTotal !== datos.cupoTotal) {
        await espacio.porId.actualizarVigencia(creada.id, {
          desde: creada.desde,
          hasta: creada.hasta,
          publicada: creada.publicada,
          cupoTotal: datos.cupoTotal,
        });
      }
      return { id: creada.id, informe };
    });
  }

  async editarVigencia(
    vigenciaId: string,
    cambios: EditarVigencia,
    contexto: ContextoDeAplicacion,
  ): Promise<ResultadoPorId> {
    return this.trabajo.ejecutar(async (espacio) => {
      await espacio.catalogo.bloquear();
      const actual = await espacio.catalogo.leer();
      const { paquete, vigencia } = localizarVigencia(actual, vigenciaId);

      const final: VentanaDeVigencia = {
        desde: cambios.desde ?? vigencia.desde,
        hasta: cambios.hasta ?? vigencia.hasta,
        publicada: cambios.publicada ?? vigencia.publicada,
        cupoTotal:
          cambios.cupoTotal !== undefined ? cambios.cupoTotal : (vigencia.cupoTotal ?? null),
      };
      if (final.desde > final.hasta) {
        throw new VigenciaInvalidaError('la fecha de inicio no puede ser posterior a la de fin');
      }
      if (final.publicada && final.desde !== final.hasta) {
        throw new VigenciaInvalidaError(
          'solo se publica una fecha concreta: una vigencia abierta no es una salida',
        );
      }
      const igual =
        final.desde === vigencia.desde &&
        final.hasta === vigencia.hasta &&
        final.publicada === vigencia.publicada &&
        final.cupoTotal === (vigencia.cupoTotal ?? null);
      if (igual) return { id: vigenciaId, informe: null };

      if (
        paquete.vigencias.some(
          (o) => o.id !== vigenciaId && o.desde === final.desde && o.hasta === final.hasta,
        )
      ) {
        throw new VigenciaDuplicadaError(ventanaTexto(final.desde, final.hasta));
      }

      // El resto de las vigencias del paquete + la ventana resultante: ahí se detecta el empate.
      const visto: CatalogoActual = {
        ...actual,
        paquetes: actual.paquetes.map((p) =>
          p.id === paquete.id
            ? {
                ...p,
                codigo: CODIGO_DE_EDICION,
                vigencias: p.vigencias.filter((o) => o.id !== vigenciaId),
              }
            : p,
        ),
      };
      const propuesta = propuestaDeUnProducto(
        'PANTALLA',
        productoDesdeActual(paquete, [
          { desde: final.desde, hasta: final.hasta, publicada: final.publicada, tarifas: [] },
        ]),
      );
      const { informe } = validarYPlanificar(propuesta, visto, contexto.permisos, {
        tenantId: contexto.tenantId,
        soportaM2: true,
      });
      if (informe.resumen.errores > 0) {
        const errores = informe.elementos
          .filter((e) => e.nivel === 'ERROR')
          .map((e) => ({ codigo: e.codigo, ruta: e.ruta }));
        throw traducir(new PropuestaInvalidaError(errores, informe.resumen.errores));
      }

      await espacio.porId.actualizarVigencia(vigenciaId, final);
      await espacio.registro.registrar({ usuarioId: contexto.usuarioId }, [
        {
          accion: 'catalogo.vigencia.modificada',
          entidad: 'vigencia',
          entidadId: vigenciaId,
          detalle: {
            origen: 'PANTALLA',
            antes: {
              desde: vigencia.desde,
              hasta: vigencia.hasta,
              publicada: vigencia.publicada,
              cupoTotal: vigencia.cupoTotal ?? null,
            },
            despues: { ...final },
          },
        },
      ]);
      return { id: vigenciaId, informe };
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Tarifas
  // ---------------------------------------------------------------------------------------------

  async crearTarifa(
    vigenciaId: string,
    datos: CrearTarifa,
    contexto: ContextoDeAplicacion,
  ): Promise<ResultadoPorId> {
    return this.trabajo.ejecutar(async (espacio) => {
      await espacio.catalogo.bloquear();
      const actual = await espacio.catalogo.leer();
      const { paquete, vigencia } = localizarVigencia(actual, vigenciaId);

      const tarifa = await propuestaDeTarifa(espacio, datos);
      const informe = await this.aplicarVigencia(
        espacio,
        actual,
        paquete,
        {
          desde: vigencia.desde,
          hasta: vigencia.hasta,
          publicada: vigencia.publicada,
          tarifas: [tarifa],
        },
        contexto,
        (cv) => {
          if (cv.tarifas.some((t) => t.accion === 'ACTUALIZAR')) {
            throw new TarifaDuplicadaError(datos.nombre);
          }
        },
      );
      const despues = await espacio.catalogo.leer();
      const creada = buscarVigencia(
        despues,
        paquete.id,
        vigencia.desde,
        vigencia.hasta,
      )?.tarifas.find((t) => normalizarNombre(t.nombre) === normalizarNombre(datos.nombre));
      if (!creada?.id) throw new TarifaNoEncontradaError(datos.nombre);
      return { id: creada.id, informe };
    });
  }

  async editarTarifa(
    tarifaId: string,
    cambios: EditarTarifa,
    contexto: ContextoDeAplicacion,
  ): Promise<ResultadoPorId> {
    return this.trabajo.ejecutar(async (espacio) => {
      await espacio.catalogo.bloquear();
      const actual = await espacio.catalogo.leer();
      const { paquete, vigencia, tarifa } = localizarTarifa(actual, tarifaId);
      const puedeVerNeto = contexto.permisos.includes('cotizacion.ver_neto_y_margen');

      const mayorista =
        cambios.mayoristaId === undefined
          ? tarifa.mayorista
          : cambios.mayoristaId === null
            ? null
            : await nombreDeMayoristaODefecto(espacio, cambios.mayoristaId);

      const editada: TarifaPropuesta = {
        nombre: tarifa.nombre,
        unidad: cambios.unidad ?? tarifa.unidad,
        cubrePasajeros: cambios.cubrePasajeros ?? tarifa.cubrePasajeros,
        // Sin permiso el neto actual no se ve ni se reenvía: el puerto lo conserva (`conservarNeto`).
        neto: !puedeVerNeto ? null : cambios.neto !== undefined ? cambios.neto : tarifa.neto,
        venta: cambios.venta ?? tarifa.venta,
        lista: tarifa.lista ?? null,
        promoHasta: tarifa.promoHasta ?? null,
        mayorista,
        aditiva: cambios.aditiva ?? tarifa.aditiva,
        condicion: cambios.condicion ?? tarifa.condicion,
      };
      // La opción de salida no viaja en la propuesta: el adaptador conserva el vínculo existente.
      const informe = await this.aplicarVigencia(
        espacio,
        actual,
        paquete,
        {
          desde: vigencia.desde,
          hasta: vigencia.hasta,
          publicada: vigencia.publicada,
          tarifas: [editada],
        },
        contexto,
        () => undefined,
      );
      return { id: tarifaId, informe };
    });
  }

  async eliminarTarifa(tarifaId: string, contexto: ContextoDeAplicacion): Promise<void> {
    await this.trabajo.ejecutar(async (espacio) => {
      await espacio.catalogo.bloquear();
      const actual = await espacio.catalogo.leer();
      const { tarifa, vigencia } = localizarTarifa(actual, tarifaId);
      const puedeVerNeto = contexto.permisos.includes('cotizacion.ver_neto_y_margen');

      await espacio.porId.eliminarTarifa(tarifaId);
      await espacio.registro.registrar({ usuarioId: contexto.usuarioId }, [
        {
          accion: 'catalogo.tarifa.eliminada',
          entidad: 'tarifa',
          entidadId: tarifaId,
          detalle: {
            origen: 'PANTALLA',
            nombre: tarifa.nombre,
            vigencia: ventanaTexto(vigencia.desde, vigencia.hasta),
            venta: tarifa.venta.unidades,
            ...(puedeVerNeto ? { neto: tarifa.neto ? tarifa.neto.unidades : null } : {}),
            lista: tarifa.lista ? tarifa.lista.unidades : null,
            moneda: tarifa.venta.moneda,
          },
        },
      ]);
    });
  }

  // ---------------------------------------------------------------------------------------------

  /**
   * Arma la propuesta de un producto con **una** vigencia y la aplica con el aplicador. `politica`
   * revisa el plan antes (solo si no hay errores) para convertir «crear» sobre algo distinto en 409.
   */
  private async aplicarVigencia(
    espacio: EspacioDeGestion,
    actual: CatalogoActual,
    paquete: PaqueteActual,
    vigencia: VigenciaPropuesta,
    contexto: ContextoDeAplicacion,
    politica: (cambio: CambioDePaquete['vigencias'][number]) => void,
  ) {
    const visto: CatalogoActual = {
      ...actual,
      paquetes: actual.paquetes.map((p) =>
        p.id === paquete.id ? { ...p, codigo: CODIGO_DE_EDICION } : p,
      ),
    };
    const propuesta = propuestaDeUnProducto('PANTALLA', productoDesdeActual(paquete, [vigencia]));

    const { plan, informe } = validarYPlanificar(propuesta, visto, contexto.permisos, {
      tenantId: contexto.tenantId,
      soportaM2: true,
    });
    const cambio = plan.paquetes[0]?.vigencias[0];
    if (informe.resumen.errores === 0 && cambio) politica(cambio);

    try {
      const resultado = await this.aplicador.aplicarDentro(
        espacio,
        propuesta,
        visto,
        contexto,
        {},
        { codigoNuevo: undefined, forzarPaquete: false },
      );
      return resultado.informe;
    } catch (e) {
      throw traducir(e);
    }
  }
}

// =================================================================================================
// Piezas puras
// =================================================================================================

function traducir(e: unknown): unknown {
  if (
    e instanceof PropuestaInvalidaError &&
    e.errores.some((x) => x.codigo === 'VIGENCIA_EMPATADA')
  ) {
    return new VigenciaEmpatadaError(e.message);
  }
  return e;
}

async function nombreDeMayoristaODefecto(espacio: EspacioDeGestion, id: string): Promise<string> {
  const nombre = await espacio.porId.nombreDeMayorista(id);
  if (nombre === null) throw new MayoristaNoEncontradoError(id);
  return nombre;
}

async function propuestaDeTarifa(
  espacio: EspacioDeGestion,
  t: CrearTarifa,
): Promise<TarifaPropuesta> {
  return {
    nombre: t.nombre,
    unidad: t.unidad,
    cubrePasajeros: t.cubrePasajeros,
    neto: t.neto,
    venta: t.venta,
    mayorista:
      t.mayoristaId === null ? null : await nombreDeMayoristaODefecto(espacio, t.mayoristaId),
    aditiva: t.aditiva,
    condicion: t.condicion,
  };
}

function buscarVigencia(
  catalogo: CatalogoActual,
  paqueteId: string,
  desde: string,
  hasta: string,
): VigenciaActual | undefined {
  return catalogo.paquetes
    .find((p) => p.id === paqueteId)
    ?.vigencias.find((v) => v.desde === desde && v.hasta === hasta);
}

function localizarVigencia(
  catalogo: CatalogoActual,
  vigenciaId: string,
): { paquete: PaqueteActual; vigencia: VigenciaActual } {
  for (const paquete of catalogo.paquetes) {
    const vigencia = paquete.vigencias.find((v) => v.id === vigenciaId);
    if (vigencia) return { paquete, vigencia };
  }
  throw new VigenciaNoEncontradaError(vigenciaId);
}

function localizarTarifa(
  catalogo: CatalogoActual,
  tarifaId: string,
): { paquete: PaqueteActual; vigencia: VigenciaActual; tarifa: TarifaActual } {
  for (const paquete of catalogo.paquetes) {
    for (const vigencia of paquete.vigencias) {
      const tarifa = vigencia.tarifas.find((t) => t.id === tarifaId);
      if (tarifa) return { paquete, vigencia, tarifa };
    }
  }
  throw new TarifaNoEncontradaError(tarifaId);
}

function tarifaDeGestion(t: TarifaActual & { id: string }, puedeVerNeto: boolean): TarifaDeGestion {
  return {
    id: t.id,
    nombre: t.nombre,
    unidad: t.unidad,
    cubrePasajeros: t.cubrePasajeros,
    ...(puedeVerNeto ? { neto: t.neto } : {}),
    venta: t.venta,
    lista: t.lista ?? null,
    promoHasta: t.promoHasta ?? null,
    mayoristaId: t.mayoristaId ?? null,
    opcionDeSalida: t.opcionDeSalida ?? null,
    aditiva: t.aditiva,
    condicion: t.condicion,
  };
}
