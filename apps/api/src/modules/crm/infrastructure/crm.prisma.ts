/**
 * Adaptador de persistencia de `crm`.
 *
 * Todo pasa por `conTenant()`, que abre transacción y fija `app.current_tenant` antes de nada:
 * las políticas RLS hacen el resto. Aquí **no se escribe un solo filtro de tenant a mano**, y es
 * deliberado — un filtro escrito a mano es un filtro que algún día se olvida.
 *
 * Lo borrado lógicamente sí se filtra aquí, porque eso no es aislamiento entre agencias sino
 * estado del dato: una oportunidad borrada sigue siendo de esta agencia.
 *
 * ADR-0015: `contactos.preferencias` y `notas_internas.texto` se guardan cifrados y se descifran
 * aquí. Toda respuesta que le devuelve a una persona uno de esos valores deja una fila
 * `LECTURA_DATOS_SENSIBLES` en la misma transacción (R10).
 */

import { Inject, Injectable } from '@nestjs/common';
import type {
  Contacto,
  ContactoDeLista,
  EtapaDefinida,
  FichaDeContacto,
  Oportunidad,
} from '@viajapro/contracts';
import { ClaveEtapa } from '@viajapro/contracts';
import {
  filtroDeNotasPorVisibilidad,
  visibilidadDe,
} from '../../../shared/autorizacion/visibilidad-de-conversaciones.js';
import {
  campoDePreferencias,
  campoDeTextoObligatorio,
} from '../../../shared/cifrado/columnas-de-prisma.js';
import { RegistroDeLectura } from '../../../shared/cifrado/lectura-auditada.js';
import {
  COLUMNAS_CIFRADAS,
  PuertoCifradoDeCampos,
} from '../../../shared/cifrado/puerto-de-cifrado.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import {
  PuertoCrm,
  type EtapaResumida,
  type MovimientoDeOportunidad,
  type TotalesDeEtapa,
} from '../application/puerto-crm.js';
import {
  EtapaNoEncontradaError,
  MotivoDePerdidaInactivoError,
  OportunidadNoEncontradaError,
} from '../domain/errors.js';
import { esMotivoDePerdidaInactivoEnBase } from './errores-de-base.js';
import { registrarCambioDeEtapa } from './historial-de-etapas.prisma.js';

/** Lo que se trae de la oportunidad para pintar una tarjeta. Ni un campo más. */
export const PARA_LA_TARJETA = {
  id: true,
  titulo: true,
  destino: true,
  paqueteId: true,
  fechaViajeDesde: true,
  probabilidad: true,
  asesorId: true,
  valorEstimadoUnidades: true,
  monedaIso: true,
  motivoPerdida: true,
  notaPerdida: true,
  creadoEn: true,
  ultimoContactoEn: true,
  proximaTareaDescripcion: true,
  proximaTareaVenceEn: true,
  proximaTareaCompletada: true,
  contactoId: true,
  contacto: { select: { nombre: true } },
  asesor: { select: { nombre: true } },
  etapa: {
    select: {
      id: true,
      clave: true,
      nombre: true,
      orden: true,
      probabilidad: true,
      esGanada: true,
      esPerdida: true,
    },
  },
} as const;

@Injectable()
export class CrmPrisma extends PuertoCrm {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PuertoCifradoDeCampos) private readonly cifrado: PuertoCifradoDeCampos,
  ) {
    super();
  }

  async listarEtapas(): Promise<EtapaDefinida[]> {
    return this.prisma.conTenant(async (tx) => {
      const { tenantId } = ContextoTenant.obtener();
      const filas = await tx.etapaPipeline.findMany({
        where: { tenantId },
        orderBy: { orden: 'asc' },
      });
      return filas.map(aEtapaDefinida);
    });
  }

  async tableroPorEtapa(limitePorColumna: number): Promise<Map<string, TotalesDeEtapa>> {
    return this.prisma.conTenant(async (tx) => {
      // Los totales se agrupan en la base. Contarlos sobre las tarjetas devueltas daría una
      // cifra que encoge cada vez que se pagina, que es peor que no darla.
      // Por etapa Y moneda: sumar pesos con dólares en un solo total es inventarse una cifra
      // (R8, T-181). Una oportunidad sin valor estimado cuenta, pero no suma.
      const totales = await tx.oportunidad.groupBy({
        by: ['etapaId', 'monedaIso'],
        where: { eliminadoEn: null },
        _count: { _all: true },
        _sum: { valorEstimadoUnidades: true },
      });

      const mapa = new Map<string, TotalesDeEtapa>();
      for (const t of totales) {
        const actual = mapa.get(t.etapaId) ?? { total: 0, valores: [], oportunidades: [] };
        actual.total += t._count._all;
        const suma = t._sum.valorEstimadoUnidades;
        if (suma !== null && t.monedaIso !== null) {
          actual.valores.push({ monedaIso: t.monedaIso, unidades: suma });
        }
        mapa.set(t.etapaId, actual);
      }

      for (const [etapaId, datos] of mapa) {
        const tarjetas = await tx.oportunidad.findMany({
          where: { etapaId, eliminadoEn: null },
          orderBy: { actualizadoEn: 'desc' },
          take: limitePorColumna,
          select: PARA_LA_TARJETA,
        });
        datos.oportunidades = tarjetas.map(aOportunidad);
        datos.valores.sort((a, b) => a.monedaIso.localeCompare(b.monedaIso));
      }

      return mapa;
    });
  }

  async buscarEtapa(etapaId: string): Promise<EtapaResumida | null> {
    return this.prisma.conTenant(async (tx) => {
      const e = await tx.etapaPipeline.findUnique({
        where: { id: etapaId },
        select: { id: true, nombre: true, esPerdida: true },
      });
      return e ?? null;
    });
  }

  async buscarOportunidad(oportunidadId: string): Promise<Oportunidad | null> {
    return this.prisma.conTenant(async (tx) => {
      const o = await tx.oportunidad.findFirst({
        where: { id: oportunidadId, eliminadoEn: null },
        select: PARA_LA_TARJETA,
      });
      return o ? aOportunidad(o) : null;
    });
  }

  /**
   * El movimiento, su fila del historial (T-131) y `cerrada_en`, en UNA transacción.
   *
   * `FOR UPDATE` sobre la oportunidad: dos movimientos simultáneos de la misma tarjeta se
   * serializan, y el segundo lee como «etapa de origen» la que dejó el primero, no la de antes.
   * Sin el bloqueo, el historial tendría dos filas con el mismo origen y una transición inventada.
   *
   * `cerrada_en`: se fija con el instante del historial al llegar a una etapa ganada o perdida
   * (también si ya estaba cerrada y pasa de ganada a perdida: es un cierre nuevo), y se VACÍA al
   * volver a una etapa viva. El historial conserva el cierre anterior y su motivo.
   */
  async moverOportunidad(m: MovimientoDeOportunidad): Promise<Oportunidad> {
    const { tenantId } = ContextoTenant.obtener();
    return this.prisma.conTenant(async (tx) => {
      const [actual] = await tx.$queryRaw<Array<{ etapa_id: string; asesor_id: string | null }>>`
        SELECT etapa_id::text AS etapa_id, asesor_id::text AS asesor_id
          FROM oportunidades
         WHERE tenant_id = ${tenantId}::uuid
           AND id = ${m.oportunidadId}::uuid
           AND eliminado_en IS NULL
           FOR UPDATE`;
      if (!actual) throw new OportunidadNoEncontradaError(m.oportunidadId);

      // Las banderas se leen DENTRO de la transacción: son las que se copian al historial.
      const destino = await tx.etapaPipeline.findFirst({
        where: { id: m.etapaId, tenantId },
        select: { esGanada: true, esPerdida: true },
      });
      if (!destino) throw new EtapaNoEncontradaError(m.etapaId);

      const ocurridoEn = await registrarCambioDeEtapa(tx, {
        tenantId,
        oportunidadId: m.oportunidadId,
        origen: 'CAMBIO',
        etapaDesdeId: actual.etapa_id,
        etapaHastaId: m.etapaId,
        esGanada: destino.esGanada,
        esPerdida: destino.esPerdida,
        motivoPerdida: m.motivoPerdida,
        asesorId: actual.asesor_id,
        usuarioId: m.actorId,
      });

      try {
        const actualizada = await tx.oportunidad.update({
          where: { id_tenantId: { id: m.oportunidadId, tenantId } },
          data: {
            etapaId: m.etapaId,
            motivoPerdida: m.motivoPerdida,
            // Solo si llega: un `null` explícito no aporta nada (el disparador resuelve el id desde
            // el enum, y al reabrir lo vacía con él). Con id, el disparador lo respeta (20261115190000).
            ...(m.motivoPerdidaId !== null ? { motivoPerdidaId: m.motivoPerdidaId } : {}),
            notaPerdida: m.notaPerdida,
            cerradaEn: destino.esGanada || destino.esPerdida ? ocurridoEn : null,
            actualizadoPorId: m.actorId,
          },
          select: PARA_LA_TARJETA,
        });
        return aOportunidad(actualizada);
      } catch (error) {
        // T-232: el disparador rechaza asignar un motivo desactivado (VP001). Por id ya lo miró el
        // caso de uso (en otra transacción); por enum solo lo ve la base. Mismo 409 en los dos.
        if (esMotivoDePerdidaInactivoEnBase(error)) {
          throw new MotivoDePerdidaInactivoError(m.motivoPerdidaId ?? m.motivoPerdida ?? '');
        }
        throw error;
      }
    });
  }

  async fichaDeContacto(contactoId: string): Promise<FichaDeContacto | null> {
    const visibilidad = visibilidadDe(ContextoTenant.obtener());
    return this.prisma.conTenant(async (tx) => {
      const c = await tx.contacto.findFirst({
        where: { id: contactoId, eliminadoEn: null },
        include: {
          consentimientos: true,
          notasInternas: {
            where: {
              eliminadaEn: null,
              // Una nota escrita en el hilo de una conversación que este miembro no ve no sale por
              // la ficha: "lo que no se ve no se ve por ningún camino". Las notas del panel del
              // contacto (sin hilo) son de toda la agencia.
              ...filtroDeNotasPorVisibilidad(visibilidad),
            },
            orderBy: { escritaEn: 'desc' },
            take: 20,
            // El autor sale del join: el contrato pide `autorNombre` y la nota solo guarda el
            // id. Nulo cuando la escribió una automatización, que es un caso real.
            include: { autor: { select: { nombre: true } } },
          },
          oportunidades: {
            // «Viva» se decide por la etapa y no por `cerrada_en`: antes de T-131 nada escribía
            // `cerrada_en`, y las oportunidades que ya estaban cerradas lo siguen teniendo nulo
            // (la migración no inventa la fecha). Con el filtro viejo, una ganada era «la actual».
            where: { eliminadoEn: null, etapa: { esGanada: false, esPerdida: false } },
            orderBy: { actualizadoEn: 'desc' },
            take: 1,
            select: PARA_LA_TARJETA,
          },
        },
      });
      if (!c) return null;

      // Auditoría R10: hay lectura sensible si la ficha trae `preferencias` (puede ser dato de
      // salud) o notas internas. Se registran los NOMBRES de las columnas y los ids, jamás el valor.
      // Clave y AAD con el tenant de la SESIÓN; una fila que diga ser de otro no se descifra.
      const { tenantId } = ContextoTenant.obtener();
      const registro = new RegistroDeLectura();
      const contacto = aContactoDescifrado(c, this.cifrado, tenantId, registro);
      const notasInternas = c.notasInternas.map((n) => ({
        id: n.id,
        autorNombre: n.autor?.nombre ?? null,
        texto: registro.anotar(
          COLUMNAS_CIFRADAS.NOTAS_INTERNAS_TEXTO,
          n.id,
          this.cifrado.descifrarDeFila(
            COLUMNAS_CIFRADAS.NOTAS_INTERNAS_TEXTO,
            tenantId,
            n,
            campoDeTextoObligatorio(n),
          ) ?? '',
        ),
        escritaEn: n.escritaEn.toISOString(),
      }));
      await registro.registrar(tx, 'Contacto', contactoId);

      const viva = c.oportunidades[0];
      return {
        contacto,
        // La más reciente que no esté cerrada. Si hay varias vivas, el asesor ve la última que
        // tocó, que es la que tiene en la cabeza.
        oportunidadActual: viva ? aOportunidad(viva) : null,
        // Vacíos a propósito: `quoting` y `booking` todavía no publican sus puertos, y un
        // arreglo vacío es honesto. Consultar sus tablas desde aquí rompería R4.
        cotizaciones: [],
        archivosDeViajeIds: [],
        notasInternas,
      };
    });
  }

  async listarContactos(p: { buscar: string | null; limite: number }): Promise<ContactoDeLista[]> {
    return this.prisma.conTenant(async (tx) => {
      const filas = await tx.contacto.findMany({
        where: {
          eliminadoEn: null,
          ...(p.buscar
            ? {
                OR: [
                  { nombre: { contains: p.buscar, mode: 'insensitive' as const } },
                  { telefonoE164: { contains: p.buscar } },
                ],
              }
            : {}),
        },
        include: { consentimientos: true },
        orderBy: { ultimoContactoEn: 'desc' },
        take: p.limite,
      });
      // T-227: el listado NO descifra `preferencias` (puede ser dato de salud) ni, por tanto,
      // deja fila de lectura sensible: no se lee ningún dato sensible. Solo la ficha las devuelve.
      return filas.map(aContactoDeLista);
    });
  }
}

// =============================================================================
// Traducción de fila a contrato
// =============================================================================

/**
 * La clave de la etapa, o `null` si la agencia tiene una que el vocabulario común no nombra.
 *
 * Se valida en vez de confiar: la columna es texto libre en la base, y un valor que no esté en
 * el contrato haría fallar la validación del lado del cliente, lejos de aquí y sin pistas.
 */
function aClave(valor: string | null): EtapaDefinida['clave'] {
  if (valor === null) return null;
  const r = ClaveEtapa.safeParse(valor);
  return r.success ? r.data : null;
}

interface FilaEtapa {
  id: string;
  clave: string | null;
  nombre: string;
  orden: number;
  probabilidad: number;
  esGanada: boolean;
  esPerdida: boolean;
}

export function aEtapaDefinida(e: FilaEtapa): EtapaDefinida {
  return {
    id: e.id,
    clave: aClave(e.clave),
    nombre: e.nombre,
    orden: e.orden,
    probabilidad: e.probabilidad,
    esGanada: e.esGanada,
    esPerdida: e.esPerdida,
  };
}

interface FilaOportunidad {
  id: string;
  titulo: string;
  destino: string | null;
  paqueteId: string | null;
  fechaViajeDesde: Date | null;
  probabilidad: number | null;
  asesorId: string | null;
  valorEstimadoUnidades: bigint | null;
  monedaIso: string | null;
  motivoPerdida: string | null;
  notaPerdida: string | null;
  creadoEn: Date;
  ultimoContactoEn: Date | null;
  proximaTareaDescripcion: string | null;
  proximaTareaVenceEn: Date | null;
  proximaTareaCompletada: boolean | null;
  contactoId: string;
  contacto: { nombre: string | null } | null;
  asesor: { nombre: string } | null;
  etapa: FilaEtapa;
}

export function aOportunidad(o: FilaOportunidad): Oportunidad {
  return {
    id: o.id,
    contactoId: o.contactoId,
    contactoNombre: o.contacto?.nombre ?? null,
    titulo: o.titulo,
    destino: o.destino,
    paqueteId: o.paqueteId,
    // Solo la fecha, sin hora: el contrato pide AAAA-MM-DD y la columna es de tipo fecha.
    fechaSalida: o.fechaViajeDesde ? o.fechaViajeDesde.toISOString().slice(0, 10) : null,
    etapa: aEtapaDefinida(o.etapa),
    valorEstimado:
      o.valorEstimadoUnidades === null
        ? null
        : {
            unidades: o.valorEstimadoUnidades.toString(),
            moneda: (o.monedaIso ?? 'COP') as 'COP',
          },
    probabilidad: o.probabilidad,
    asesorId: o.asesorId,
    asesorNombre: o.asesor?.nombre ?? null,
    proximaTarea:
      o.proximaTareaDescripcion && o.proximaTareaVenceEn
        ? {
            descripcion: o.proximaTareaDescripcion,
            venceEn: o.proximaTareaVenceEn.toISOString(),
            completada: o.proximaTareaCompletada ?? false,
          }
        : null,
    motivoPerdida: (o.motivoPerdida ?? null) as Oportunidad['motivoPerdida'],
    notaPerdida: o.notaPerdida,
    creadaEn: o.creadoEn.toISOString(),
    ultimoContactoEn: o.ultimoContactoEn ? o.ultimoContactoEn.toISOString() : null,
  };
}

/** Lo que el listado necesita de la fila: sin `preferencias`. */
interface FilaContactoDeLista {
  id: string;
  nombre: string | null;
  telefonoE164: string;
  correo: string | null;
  etiquetas: string[];
  creadoEn: Date;
  ultimoContactoEn: Date | null;
  consentimientos: { finalidad: string; revocadoEn: Date | null }[];
}

/** La fila tal como sale de la base: `preferencias` en sus cuatro columnas cifradas. */
type FilaContactoCifrada = FilaContactoDeLista & {
  tenantId: string;
  preferenciasCifrado: Uint8Array | null;
  preferenciasNonce: Uint8Array | null;
  preferenciasTag: Uint8Array | null;
  preferenciasClaveVersion: number | null;
};

/**
 * Descifra `preferencias` con la agencia y el id del contacto (el AAD) y traduce al contrato. Con
 * `registro`, lo descifrado queda anotado para la lectura auditada; sin él, es la respuesta a una
 * escritura que acaba de poner ese mismo valor.
 */
export function aContactoDescifrado(
  c: FilaContactoCifrada,
  cifrado: PuertoCifradoDeCampos,
  /** El de la sesión, NUNCA el de la fila: si no coinciden, se lanza sin descifrar. */
  tenantId: string,
  registro?: RegistroDeLectura,
): Contacto {
  const columna = COLUMNAS_CIFRADAS.CONTACTOS_PREFERENCIAS;
  const preferencias = cifrado.descifrarDeFila(columna, tenantId, c, campoDePreferencias(c));
  registro?.anotar(columna, c.id, preferencias);
  return { ...aContactoDeLista(c), preferencias };
}

export function aContactoDeLista(c: FilaContactoDeLista): ContactoDeLista {
  return {
    id: c.id,
    nombre: c.nombre,
    telefono: c.telefonoE164,
    correo: c.correo,
    etiquetas: c.etiquetas,
    // Solo los vigentes. Un consentimiento revocado sigue en la tabla porque la ley pide poder
    // demostrar la revocación, pero hacia fuera el contacto ya no lo tiene.
    consentimientos: c.consentimientos
      .filter((x) => x.revocadoEn === null)
      .map((x) => x.finalidad as 'TRANSACCIONAL' | 'PROMOCIONAL'),
    creadoEn: c.creadoEn.toISOString(),
    ultimoContactoEn: c.ultimoContactoEn ? c.ultimoContactoEn.toISOString() : null,
  };
}
