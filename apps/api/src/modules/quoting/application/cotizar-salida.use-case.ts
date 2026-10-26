/**
 * Cotizar contra una fecha: resolver la ventana y decir todas las formas de cobrarla.
 *
 * **Aquí es donde ADR-0009 deja de ser un documento.** Este caso de uso no sabe si la agencia
 * publica salidas con fecha o trabaja con vigencias abiertas: pide las ventanas del paquete y
 * deja que `resolverVigencia` elija. Esa indiferencia es la decisión.
 *
 * **Devuelve TODAS las opciones aplicables, no una.** Si dos personas van a un pasadía que tiene
 * promo de pareja, el asesor ve las dos y elige. Elegir por él en silencio le escondería una
 * decisión comercial que es suya, y la barata no siempre es la que quiere.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { CotizacionDeSalida, CotizarSalida, OpcionDePrecio } from '@viajapro/contracts';
import {
  Money,
  POLITICA_POR_DEFECTO,
  calcularMargen,
  esSalidaProgramada,
  resolverVigencia,
  type BaseDelMargen,
} from '@viajapro/domain';
import { type ClienteTenant, PrismaService } from '../../../shared/prisma/prisma.service.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { PaqueteNoEncontradoError, TarifasConCondicionNoEvaluableError } from '../domain/errors.js';
import { monedaDeLaBase } from '../domain/moneda-de-la-base.js';
import {
  type Composicion,
  condicionNoEvaluable,
  esSuplemento,
  exigeComposicion,
  motivoNoAplica,
  vecesQueSeCobra,
} from '../domain/seleccion-de-tarifas.js';

/** Una tarifa tal como sale de la base, antes de convertirse en opción de precio. */
interface FilaTarifa {
  id: string;
  nombre: string;
  unidad: 'POR_PERSONA' | 'POR_GRUPO';
  cubrePasajeros: number;
  netoUnidades?: bigint | null;
  ventaUnidades: bigint;
  monedaIso: string;
  aditiva: boolean;
  acomodacion: string | null;
  tipoPasajero: string | null;
  edadMinima: number | null;
  edadMaxima: number | null;
  pasajerosMinimo: number | null;
  pasajerosMaximo: number | null;
  ocupaSilla: boolean | null;
}

const aFecha = (d: Date): string => d.toISOString().slice(0, 10);

@Injectable()
export class CotizarSalidaUseCase {
  // `@Inject` explicito, y no es ceremonia: el transpilador de desarrollo (`tsx`) NO emite los
  // metadatos de decorador que Nest necesita para resolver el tipo. Sin esto, Nest construye la
  // clase CON CERO DEPENDENCIAS y sin quejarse, y el fallo sale como `undefined` en la primera
  // peticion real. Compila, arranca, y revienta al usarse. Ver cola 11c de `ESTADO.md`.
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async ejecutar(peticion: CotizarSalida): Promise<CotizacionDeSalida> {
    return this.prisma.conTenant((tx) => this.calcular(tx, peticion));
  }

  /**
   * El cálculo, sobre una transacción que ya trae el tenant fijado. Separado de `ejecutar` para
   * que guardar una cotización calcule y escriba EN LA MISMA transacción: lo guardado es
   * exactamente lo calculado, sin una ventana en la que cambie el tarifario o la política.
   */
  async calcular(tx: ClienteTenant, peticion: CotizarSalida): Promise<CotizacionDeSalida> {
    const adultos = peticion.adultos ?? 1;
    const ninos = peticion.ninos ?? 0;
    const infantes = peticion.infantes ?? 0;
    // Por defecto NO sale el margen: revela el neto por resta (`neto = venta − margen`).
    const incluirMargen = peticion.incluirMargen ?? false;
    const composicion: Composicion = { adultos, ninos, infantes };
    const pasajeros = adultos + ninos + infantes;

    const paquete = await tx.paquete.findFirst({
      where: { id: peticion.paqueteId, eliminadoEn: null },
      select: { id: true, nombre: true, destino: true, noches: true },
    });
    if (!paquete) throw new PaqueteNoEncontradoError(peticion.paqueteId);

    const ventanas = await tx.vigencia.findMany({
      where: { paqueteId: paquete.id, activa: true },
      select: { id: true, desde: true, hasta: true, publicada: true },
    });

    // Aquí no se decide nada: la regla de desempate vive en el dominio, probada aparte, y es
    // la misma para toda agencia. Si dos ventanas empatan, sale como error de datos.
    const elegida = resolverVigencia(
      ventanas.map((v) => ({ ...v, desde: aFecha(v.desde), hasta: aFecha(v.hasta) })),
      peticion.fecha,
    );

    // **Predicado explícito MÁS RLS**, y no RLS sola. Lo era: un `findFirst` sin `where`, con
    // el argumento de que pasar el `tenantId` «abriría la puerta a que alguien lo tome del
    // cuerpo de la petición». `auditor-seguridad` desmontó ese argumento: `ContextoTenant` es
    // **la misma fuente** de la que `conTenant` saca el valor para `set_config` —el token de
    // sesión—, y no hay forma de que un cuerpo de petición llegue ahí.
    //
    // Lo que sí había era un agujero latente. El SQL emitido era `SELECT ... LIMIT 1` sin
    // `WHERE` ni `ORDER BY`: acierta mientras el conjunto visible tenga una sola fila. Él lo
    // reprodujo con un rol que ve más —el propietario, que en Neon se salta RLS— y devuelve la
    // política de una agencia **arbitraria, sin error y sin aviso**, con el margen de otra
    // aplicado al cálculo. El día que esto se llame desde un informe o un trabajo en cola, no
    // falla: acierta mal.
    const { tenantId } = ContextoTenant.obtener();
    const politica = await tx.politicaDePrecio.findUnique({
      where: { tenantId },
      select: { base: true },
    });
    const base: BaseDelMargen = (politica?.base as BaseDelMargen) ?? POLITICA_POR_DEFECTO.base;

    // `select` explicito y no `findMany` a secas. El neto es lo que la agencia le paga al
    // mayorista: no debe llegar a la capa de respuesta por inercia, sino porque alguien lo
    // escribio. Y cuando no se pide el margen, ni siquiera sale de la base: defensa en
    // profundidad, no una sola barrera en el mapeador.
    const filas = (await tx.tarifa.findMany({
      where: { vigenciaId: elegida.id },
      orderBy: { ventaUnidades: 'asc' },
      select: {
        id: true,
        nombre: true,
        unidad: true,
        cubrePasajeros: true,
        netoUnidades: incluirMargen,
        ventaUnidades: true,
        monedaIso: true,
        aditiva: true,
        acomodacion: true,
        tipoPasajero: true,
        edadMinima: true,
        edadMaxima: true,
        pasajerosMinimo: true,
        pasajerosMaximo: true,
        ocupaSilla: true,
      },
    })) as unknown as FilaTarifa[];

    const aOpcion = (t: FilaTarifa, veces: number): OpcionDePrecio => {
      const moneda = monedaDeLaBase(t.monedaIso);
      const unitario = Money.desdeUnidades(t.ventaUnidades, moneda);
      const total = unitario.porCantidad(veces);
      // `undefined` cuando no se pidio el margen y la columna ni se consulto; `null` cuando la
      // tarifa no tiene neto cargado. Las dos son «no hay margen que informar», y ninguna es
      // margen cero.
      const neto =
        t.netoUnidades === null || t.netoUnidades === undefined
          ? null
          : Money.desdeUnidades(t.netoUnidades, moneda);
      const margenLinea = incluirMargen ? calcularMargen(neto, unitario, base) : null;

      return {
        tarifaId: t.id,
        nombre: t.nombre,
        unidad: t.unidad,
        cubrePasajeros: t.cubrePasajeros,
        veces,
        precioUnitario: { unidades: t.ventaUnidades.toString(), moneda },
        total: { unidades: total.aPersistencia().unidades.toString(), moneda },
        // Las claves se OMITEN enteras cuando no se piden, en vez de venir en `null`: asi una
        // pantalla que consuma esto no recibe el dato ni puede despejarlo, y un `Object.keys`
        // lo demuestra — que es la asercion que sobrevive a un `...spread` futuro.
        ...(incluirMargen
          ? {
              margen:
                margenLinea === null
                  ? null
                  : {
                      unidades: margenLinea.importe
                        .porCantidad(veces)
                        .aPersistencia()
                        .unidades.toString(),
                      moneda,
                    },
              margenPorcentaje: margenLinea?.porcentaje ?? null,
            }
          : {}),
        masBarata: false,
      };
    };

    // --- La cotización armada: una línea por tarifa que cubra a alguien ---------
    //
    // Una cotización real NO es una tarifa: es una suma. Dos adultos a precio de adulto más un
    // niño a precio de menor. Antes solo se devolvían tarifas sueltas, y el número que el
    // asesor tiene que escribir en WhatsApp no estaba en ninguna respuesta.
    const lineas: OpcionDePrecio[] = [];
    const alternativas: OpcionDePrecio[] = [];
    const suplementos: OpcionDePrecio[] = [];
    const noAplicables: { tarifaId: string; nombre: string; motivo: string }[] = [];
    const sinEvaluar: string[] = [];

    for (const t of filas) {
      const veces = vecesQueSeCobra(t, composicion);

      if (veces === null) {
        const motivo = motivoNoAplica(t, composicion);
        // Se devuelve CON su motivo en vez de desaparecer. Una promo que se esconde acaba
        // aplicándose con la calculadora del celular, y el informe de margen deja de cuadrar.
        if (motivo !== null) noAplicables.push({ tarifaId: t.id, nombre: t.nombre, motivo });

        // Si la tarifa no se puede cobrar POR una condición no evaluable, registrar el motivo
        // para poder lanzar error si TODAS las tarifas aplicables tienen este problema.
        const noEvaluable = condicionNoEvaluable(t, composicion);
        if (noEvaluable !== null && motivo !== null) {
          sinEvaluar.push(motivo);
        }
        continue;
      }

      if (esSuplemento(t)) {
        suplementos.push(aOpcion(t, 1));
      } else if (t.unidad === 'POR_GRUPO') {
        // Las de grupo REEMPLAZAN al armado: llevan condiciones que no conocemos —cupo del
        // mayorista, «no acumulable»—, y prometer un precio que no se puede honrar cuesta un
        // cliente. Se enseñan; no se aplican solas.
        alternativas.push(aOpcion(t, veces));
      } else {
        lineas.push(aOpcion(t, veces));
      }
    }

    // Si todas las tarifas aplicables tienen condiciones no evaluables, no hay alternativas
    // de grupo y no se cubren todos los pasajeros → error de dominio tipado.
    const cubiertos = lineas.reduce((n, l) => n + l.veces, 0);
    if (sinEvaluar.length > 0 && alternativas.length === 0 && cubiertos < pasajeros) {
      throw new TarifasConCondicionNoEvaluableError([...new Set(sinEvaluar)]);
    }

    const moneda = monedaDeLaBase(filas[0]?.monedaIso ?? 'COP');
    let total = Money.cero(moneda);
    for (const l of lineas)
      total = total.sumar(Money.desdeUnidades(BigInt(l.total.unidades), moneda));

    // Por TOTAL, no por precio unitario: en un celular se lee la primera línea, y ordenar por
    // unitario ponía la opción cara arriba —$189.000 por persona delante de $280.000 la pareja,
    // cuando para dos personas la pareja sale más barata—.
    alternativas.sort((a, b) => Number(BigInt(a.total.unidades) - BigInt(b.total.unidades)));
    if (alternativas[0]) alternativas[0].masBarata = true;

    return {
      paqueteId: paquete.id,
      paqueteNombre: paquete.nombre,
      destino: paquete.destino,
      noches: paquete.noches,
      fecha: peticion.fecha,
      vigenciaId: elegida.id,
      vigenciaDesde: elegida.desde,
      vigenciaHasta: elegida.hasta,
      deSalidaProgramada: esSalidaProgramada(elegida),
      adultos,
      ninos,
      infantes,
      pasajeros,
      lineas,
      total: { unidades: total.aPersistencia().unidades.toString(), moneda },
      alternativas,
      noAplicables,
      suplementos,
      pideComposicion: filas.some(exigeComposicion),
    };
  }
}
