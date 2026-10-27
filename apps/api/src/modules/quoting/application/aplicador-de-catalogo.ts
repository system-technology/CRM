/**
 * `AplicadorDeCatalogo` — el paso 3 del núcleo (ADR-0017 §1): aplicar.
 *
 * **Es el único código de `apps/api` que crea o actualiza `paquetes`, `vigencias` o `tarifas`.**
 * Ningún canal escribe por otro camino; la pantalla, el archivo, la API pública y la IA producen
 * una `PropuestaDeCatalogo` y pasan por aquí.
 *
 * Lo que hace, en una sola transacción con el tenant fijado:
 *
 *   1. toma el bloqueo del catálogo de la agencia (dos cargas simultáneas no se pisan);
 *   2. lee el catálogo actual **dentro** del bloqueo y **recalcula** validar + planificar en el
 *      servidor: no confía en ninguna previsualización;
 *   3. si queda algún `ERROR`, o la huella que trae el canal ya no coincide, lanza y no queda nada
 *      (todo o nada);
 *   4. aplica solo lo que el plan marca como `CREAR` o `ACTUALIZAR` y escribe la auditoría por el
 *      puerto `RegistroDeCambios`, con el mismo `tx`.
 *
 * **Idempotencia (R5) por convergencia:** aplicar dos veces la misma propuesta deja el catálogo
 * igual; la segunda vez el plan es todo `SIN_CAMBIOS`, no se escribe ninguna fila de catálogo ni
 * de auditoría. No hay efecto externo que duplicar.
 *
 * Nunca borra: lo que no viene en la propuesta no se toca; una baja es `desactivarPaquete`.
 */

import { Inject, Injectable } from '@nestjs/common';
import type {
  CrearPaquete,
  Dinero,
  EditarPaquete,
  InformeDeCatalogo,
  Permiso,
  ProductoPropuesto,
  PropuestaDeCatalogo,
  TarifaPropuesta,
  OrigenDePropuesta,
} from '@viajapro/contracts';
import { estaConvergido, huellaDeEstado } from '../domain/huella-de-estado.js';
import {
  PaqueteDuplicadoError,
  PaqueteNoEncontradoError,
  PropuestaCambioError,
  PropuestaInvalidaError,
} from '../domain/errors.js';
import {
  type CambioDePaquete,
  type CatalogoActual,
  type PaqueteActual,
  type TarifaActual,
  normalizarNombre,
  paqueteCambia,
  validarYPlanificar,
} from '../domain/validar-y-planificar.js';
import {
  type CambioRegistrado,
  type EspacioDeTrabajo,
  type JsonValue,
  UnidadDeTrabajoDeCatalogo,
} from './puertos-de-catalogo.js';

/** Quién presenta la propuesta. Sale del contexto de la petición, nunca del cuerpo. */
export interface ContextoDeAplicacion {
  readonly tenantId: string;
  readonly usuarioId: string | null;
  readonly permisos: readonly Permiso[];
}

export interface OpcionesDeAplicacion {
  /** Huella de la previsualización que vio quien confirma; si no coincide, 409 `PROPUESTA_CAMBIO`. */
  readonly huellaEsperada?: string;
  /**
   * Huella de estado de la previsualización (`huellaDeEstado`): cubre la propuesta Y lo que el
   * catálogo hace con ella. Distinta = 409, salvo con el plan ya convergido (nada que escribir).
   */
  readonly huellaDeEstadoEsperada?: string;
  /** Datos del canal que se suman al detalle de `catalogo.propuesta_aplicada` (sin personales). */
  readonly anotacion?: { readonly [clave: string]: JsonValue };
}

export interface ResultadoDeAplicacion {
  readonly informe: InformeDeCatalogo;
  /** Un elemento por producto de la propuesta, en el mismo orden, con el id resultante. */
  readonly paquetes: readonly {
    readonly indice: number;
    readonly id: string;
    readonly accion: CambioDePaquete['accion'];
  }[];
}

/** Clave sintética con la que una edición casa su producto con el paquete que se edita. */
const CODIGO_DE_EDICION = '__edicion__';

interface ModoDeEdicion {
  readonly codigoNuevo: string | undefined;
  readonly forzarPaquete: boolean;
}

@Injectable()
export class AplicadorDeCatalogo {
  constructor(
    @Inject(UnidadDeTrabajoDeCatalogo) private readonly trabajo: UnidadDeTrabajoDeCatalogo,
  ) {}

  /** Aplica una propuesta ya validada por Zod. */
  async aplicar(
    propuesta: PropuestaDeCatalogo,
    contexto: ContextoDeAplicacion,
    opciones: OpcionesDeAplicacion = {},
  ): Promise<ResultadoDeAplicacion> {
    return this.trabajo.ejecutar(async (espacio) => {
      await espacio.catalogo.bloquear();
      const actual = await espacio.catalogo.leer();
      return this.aplicarDentro(espacio, propuesta, actual, contexto, opciones, null);
    });
  }

  /** Alta desde la pantalla: el formulario arma una propuesta de **un** producto (ADR-0017 §4.1). */
  async crearPaquete(
    datos: CrearPaquete,
    contexto: ContextoDeAplicacion,
  ): Promise<ResultadoDeAplicacion> {
    return this.aplicar(propuestaDeUnProducto('PANTALLA', productoDeFormulario(datos)), contexto);
  }

  /**
   * Edición parcial desde la pantalla. Pasa por el mismo validador y el mismo aplicador: se arma
   * un producto con lo actual más lo que cambia, y el paquete se casa por id (no por nombre, que
   * es justo lo que puede estar cambiando).
   */
  async editarPaquete(
    paqueteId: string,
    cambios: EditarPaquete,
    contexto: ContextoDeAplicacion,
  ): Promise<ResultadoDeAplicacion> {
    return this.trabajo.ejecutar(async (espacio) => {
      await espacio.catalogo.bloquear();
      const actual = await espacio.catalogo.leer();
      const objetivo = actual.paquetes.find((p) => p.id === paqueteId);
      if (!objetivo) throw new PaqueteNoEncontradoError(paqueteId);

      const producto: ProductoPropuesto = {
        codigo: CODIGO_DE_EDICION,
        nombre: cambios.nombre ?? objetivo.nombre,
        destino: cambios.destino ?? objetivo.destino,
        dias: cambios.dias ?? objetivo.dias,
        noches: cambios.noches ?? objetivo.noches,
        planAlimentacion:
          cambios.planAlimentacion !== undefined
            ? cambios.planAlimentacion
            : (objetivo.planAlimentacion as ProductoPropuesto['planAlimentacion']),
        inclusiones: cambios.inclusiones ?? [...objetivo.inclusiones],
        exclusiones: cambios.exclusiones ?? [...objetivo.exclusiones],
        ...(cambios.formato !== undefined ? { formato: cambios.formato } : {}),
        vigencias: [],
      };

      // El planificador casa por clave natural: aquí la clave es el paquete que se edita. Lo que
      // sí hay que vigilar es que el cambio no choque con OTRO paquete de la agencia.
      const otros = actual.paquetes.filter((p) => p.id !== paqueteId);
      const codigoFinal = cambios.codigo ?? objetivo.codigo;
      if (cambios.codigo !== undefined && otros.some((p) => p.codigo === cambios.codigo)) {
        throw new PaqueteDuplicadoError(cambios.codigo);
      }
      if (
        codigoFinal === null &&
        otros.some(
          (p) =>
            normalizarNombre(p.nombre) === normalizarNombre(producto.nombre) &&
            p.noches === producto.noches,
        )
      ) {
        throw new PaqueteDuplicadoError(`${producto.nombre} / ${producto.noches} noches`);
      }

      const visto: CatalogoActual = {
        ...actual,
        paquetes: actual.paquetes.map((p) =>
          p.id === paqueteId ? { ...p, codigo: CODIGO_DE_EDICION } : p,
        ),
      };
      const modo: ModoDeEdicion = {
        codigoNuevo: cambios.codigo,
        forzarPaquete:
          (cambios.codigo !== undefined && cambios.codigo !== objetivo.codigo) ||
          cambios.formato !== undefined,
      };
      return this.aplicarDentro(
        espacio,
        propuestaDeUnProducto('PANTALLA', producto),
        visto,
        contexto,
        {},
        modo,
      );
    });
  }

  /** Baja lógica. Idempotente: desactivar lo ya inactivo no escribe auditoría. */
  async desactivarPaquete(paqueteId: string, contexto: ContextoDeAplicacion): Promise<void> {
    await this.trabajo.ejecutar(async ({ catalogo, registro }) => {
      await catalogo.bloquear();
      const resultado = await catalogo.desactivarPaquete(paqueteId);
      if (resultado === 'NO_EXISTE') throw new PaqueteNoEncontradoError(paqueteId);
      if (resultado === 'DESACTIVADO') {
        await registro.registrar({ usuarioId: contexto.usuarioId }, [
          {
            accion: 'catalogo.paquete.desactivado',
            entidad: 'paquete',
            entidadId: paqueteId,
            detalle: { origen: 'PANTALLA' },
          },
        ]);
      }
    });
  }

  // ---------------------------------------------------------------------------------------------

  private async aplicarDentro(
    { catalogo, registro }: EspacioDeTrabajo,
    propuesta: PropuestaDeCatalogo,
    actual: CatalogoActual,
    contexto: ContextoDeAplicacion,
    opciones: OpcionesDeAplicacion,
    edicion: ModoDeEdicion | null,
  ): Promise<ResultadoDeAplicacion> {
    const { plan, informe } = validarYPlanificar(propuesta, actual, contexto.permisos, {
      tenantId: contexto.tenantId,
      soportaM2: true,
    });

    if (opciones.huellaEsperada !== undefined && opciones.huellaEsperada !== informe.huella) {
      throw new PropuestaCambioError();
    }
    if (
      opciones.huellaDeEstadoEsperada !== undefined &&
      opciones.huellaDeEstadoEsperada !== huellaDeEstado(informe, actual) &&
      !(informe.resumen.errores === 0 && estaConvergido(informe))
    ) {
      throw new PropuestaCambioError();
    }
    if (informe.resumen.errores > 0) {
      const errores = informe.elementos
        .filter((e) => e.nivel === 'ERROR')
        .map((e) => ({ codigo: e.codigo, ruta: e.ruta }));
      throw new PropuestaInvalidaError(errores, informe.resumen.errores);
    }

    const puedeVerNeto = contexto.permisos.includes('cotizacion.ver_neto_y_margen');
    const origen = propuesta.origen;
    const auditoria: CambioRegistrado[] = [];
    const resultado: { indice: number; id: string; accion: CambioDePaquete['accion'] }[] = [];

    for (const cambio of plan.paquetes) {
      const producto = propuesta.productos[cambio.indice];
      if (!producto) continue;
      const previo = actual.paquetes.find((p) => p.id === cambio.paqueteId) ?? null;

      if (cambio.accion === 'SIN_CAMBIOS' && previo) {
        resultado.push({ indice: cambio.indice, id: previo.id, accion: cambio.accion });
        continue;
      }

      // `auditarPaquete`: cambió algo que el planificador mide. `escribirPaquete`: además, la
      // propuesta trae campos de M2 (opciones, cargos…) que las tarifas pueden necesitar ya
      // escritos (una tarifa atada a una opción nueva). Escribir lo mismo es idempotente.
      const auditarPaquete =
        previo === null || paqueteCambia(producto, previo) || (edicion?.forzarPaquete ?? false);
      const escribirPaquete =
        auditarPaquete ||
        producto.opcionesDeSalida !== undefined ||
        producto.cargosEnDestino !== undefined ||
        producto.camposPersonalizados !== undefined ||
        producto.formato !== undefined;
      const codigo = edicion
        ? edicion.codigoNuevo
        : producto.codigo === undefined
          ? previo
            ? undefined
            : null
          : producto.codigo;
      const paqueteId = escribirPaquete
        ? await catalogo.guardarPaquete(previo?.id ?? null, producto, codigo)
        : (previo?.id ?? '');
      if (auditarPaquete) {
        auditoria.push({
          accion: previo ? 'catalogo.paquete.modificado' : 'catalogo.paquete.creado',
          entidad: 'paquete',
          entidadId: paqueteId,
          detalle: {
            origen,
            nombre: producto.nombre,
            huella: informe.huella,
            ...(previo ? { antes: resumenDePaquete(previo) } : {}),
          },
        });
      }

      for (const cv of cambio.vigencias) {
        if (cv.accion === 'SIN_CAMBIOS') continue;
        const vigencia = producto.vigencias.find(
          (v) => v.desde === cv.desde && v.hasta === cv.hasta,
        );
        if (!vigencia) continue;
        const vigenciaActual =
          previo?.vigencias.find((v) => v.desde === cv.desde && v.hasta === cv.hasta) ?? null;
        const vigenciaId = await catalogo.guardarVigencia(paqueteId, {
          desde: vigencia.desde,
          hasta: vigencia.hasta,
          publicada: vigencia.publicada,
        });

        for (const ct of cv.tarifas) {
          if (ct.accion === 'SIN_CAMBIOS') continue;
          const clave = normalizarNombre(ct.nombre);
          const tarifa = vigencia.tarifas.find((t) => normalizarNombre(t.nombre) === clave);
          if (!tarifa) continue;
          const tarifaActual =
            vigenciaActual?.tarifas.find((t) => normalizarNombre(t.nombre) === clave) ?? null;
          const tarifaId = await catalogo.guardarTarifa(paqueteId, vigenciaId, tarifa, {
            conservarNeto: !puedeVerNeto && tarifaActual !== null,
          });
          auditoria.push(
            ...cambiosDePrecio(tarifaId, tarifa, tarifaActual, {
              origen,
              huella: informe.huella,
              incluirNeto: puedeVerNeto,
            }),
          );
        }
      }
      resultado.push({ indice: cambio.indice, id: paqueteId, accion: cambio.accion });
    }

    if (auditoria.length > 0 && origen !== 'PANTALLA') {
      auditoria.push({
        accion: 'catalogo.propuesta_aplicada',
        entidad: 'propuesta',
        entidadId: null,
        detalle: {
          ...opciones.anotacion,
          origen,
          huella: informe.huella,
          creados: informe.resumen.creados,
          actualizados: informe.resumen.actualizados,
          sinCambios: informe.resumen.sinCambios,
        },
      });
    }
    if (auditoria.length > 0) {
      await registro.registrar({ usuarioId: contexto.usuarioId }, auditoria);
    }

    return { informe, paquetes: resultado };
  }
}

// =================================================================================================
// Piezas puras
// =================================================================================================

function propuestaDeUnProducto(
  origen: OrigenDePropuesta,
  producto: ProductoPropuesto,
): PropuestaDeCatalogo {
  return { version: 1, origen, productos: [producto] };
}

function productoDeFormulario(datos: CrearPaquete): ProductoPropuesto {
  return {
    ...(datos.codigo !== undefined ? { codigo: datos.codigo } : {}),
    nombre: datos.nombre,
    destino: datos.destino,
    dias: datos.dias,
    noches: datos.noches,
    ...(datos.formato !== undefined ? { formato: datos.formato } : {}),
    ...(datos.planAlimentacion !== undefined ? { planAlimentacion: datos.planAlimentacion } : {}),
    ...(datos.inclusiones !== undefined ? { inclusiones: datos.inclusiones } : {}),
    ...(datos.exclusiones !== undefined ? { exclusiones: datos.exclusiones } : {}),
    vigencias: [],
  };
}

function resumenDePaquete(p: PaqueteActual): { [clave: string]: JsonValue } {
  return {
    nombre: p.nombre,
    destino: p.destino,
    dias: p.dias,
    noches: p.noches,
    planAlimentacion: p.planAlimentacion,
  };
}

function textoDeDinero(d: Dinero | null | undefined): string | null {
  return d ? d.unidades : null;
}

/**
 * Una fila de auditoría por cada campo de precio que cambia (ADR-0017 §8): `venta`, `neto`,
 * `lista` y `promo_hasta`, con el valor anterior y el nuevo. Sin cambio de precio no hay fila: la
 * convergencia es silenciosa. El detalle trae solo importes, moneda y origen: ningún dato personal.
 */
function cambiosDePrecio(
  tarifaId: string,
  nueva: TarifaPropuesta,
  actual: TarifaActual | null,
  ctx: { origen: OrigenDePropuesta; huella: string; incluirNeto: boolean },
): CambioRegistrado[] {
  const campos: { campo: string; antes: string | null; despues: string | null }[] = [
    {
      campo: 'venta',
      antes: textoDeDinero(actual?.venta),
      despues: nueva.venta.unidades,
    },
    ...(ctx.incluirNeto
      ? [{ campo: 'neto', antes: textoDeDinero(actual?.neto), despues: textoDeDinero(nueva.neto) }]
      : []),
    {
      campo: 'lista',
      antes: textoDeDinero(actual?.lista),
      despues: textoDeDinero(nueva.lista),
    },
    {
      campo: 'promo_hasta',
      antes: actual?.promoHasta ?? null,
      despues: nueva.promoHasta ?? null,
    },
  ];
  return campos
    .filter((c) => c.antes !== c.despues)
    .map((c) => ({
      accion: actual ? 'catalogo.tarifa.modificada' : 'catalogo.tarifa.creada',
      entidad: 'tarifa' as const,
      entidadId: tarifaId,
      detalle: {
        campo: c.campo,
        antes: c.antes,
        despues: c.despues,
        moneda: nueva.venta.moneda,
        origen: ctx.origen,
        huella: ctx.huella,
      },
    }));
}
