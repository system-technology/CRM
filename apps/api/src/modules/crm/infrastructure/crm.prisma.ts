/**
 * Adaptador de persistencia de `crm`.
 *
 * Todo pasa por `conTenant()`, que abre transacción y fija `app.current_tenant` antes de nada:
 * las políticas RLS hacen el resto. Aquí **no se escribe un solo filtro de tenant a mano**, y es
 * deliberado — un filtro escrito a mano es un filtro que algún día se olvida.
 *
 * Lo borrado lógicamente sí se filtra aquí, porque eso no es aislamiento entre agencias sino
 * estado del dato: una oportunidad borrada sigue siendo de esta agencia.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Contacto, EtapaDefinida, FichaDeContacto, Oportunidad } from '@viajapro/contracts';
import { ClaveEtapa } from '@viajapro/contracts';
import {
  filtroDeNotasPorVisibilidad,
  visibilidadDe,
} from '../../../shared/autorizacion/visibilidad-de-conversaciones.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import {
  PuertoCrm,
  type EtapaResumida,
  type MovimientoDeOportunidad,
} from '../application/puerto-crm.js';

/** Lo que se trae de la oportunidad para pintar una tarjeta. Ni un campo más. */
const PARA_LA_TARJETA = {
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
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async listarEtapas(): Promise<EtapaDefinida[]> {
    return this.prisma.conTenant(async (tx) => {
      const filas = await tx.etapaPipeline.findMany({ orderBy: { orden: 'asc' } });
      return filas.map(aEtapaDefinida);
    });
  }

  async tableroPorEtapa(
    limitePorColumna: number,
  ): Promise<
    Map<string, { total: number; valorUnidades: bigint | null; oportunidades: Oportunidad[] }>
  > {
    return this.prisma.conTenant(async (tx) => {
      // Los totales se agrupan en la base. Contarlos sobre las tarjetas devueltas daría una
      // cifra que encoge cada vez que se pagina, que es peor que no darla.
      const totales = await tx.oportunidad.groupBy({
        by: ['etapaId'],
        where: { eliminadoEn: null },
        _count: { _all: true },
        _sum: { valorEstimadoUnidades: true },
      });

      const mapa = new Map<
        string,
        { total: number; valorUnidades: bigint | null; oportunidades: Oportunidad[] }
      >();

      for (const t of totales) {
        const tarjetas = await tx.oportunidad.findMany({
          where: { etapaId: t.etapaId, eliminadoEn: null },
          orderBy: { actualizadoEn: 'desc' },
          take: limitePorColumna,
          select: PARA_LA_TARJETA,
        });
        mapa.set(t.etapaId, {
          total: t._count._all,
          valorUnidades: t._sum.valorEstimadoUnidades,
          oportunidades: tarjetas.map(aOportunidad),
        });
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

  async moverOportunidad(m: MovimientoDeOportunidad): Promise<Oportunidad> {
    return this.prisma.conTenant(async (tx) => {
      const actualizada = await tx.oportunidad.update({
        where: { id: m.oportunidadId },
        data: {
          etapaId: m.etapaId,
          motivoPerdida: m.motivoPerdida,
          notaPerdida: m.notaPerdida,
        },
        select: PARA_LA_TARJETA,
      });
      return aOportunidad(actualizada);
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
            where: { eliminadoEn: null, cerradaEn: null },
            orderBy: { actualizadoEn: 'desc' },
            take: 1,
            select: PARA_LA_TARJETA,
          },
        },
      });
      if (!c) return null;

      // Auditoría R10: lectura de datos sensibles (preferencias puede contener datos de salud)
      const { tenantId, usuarioId } = ContextoTenant.obtener();
      await tx.registroAuditoria.create({
        data: {
          tenantId,
          usuarioId,
          accion: 'LECTURA_DATOS_SENSIBLES',
          entidad: 'Contacto',
          entidadId: contactoId,
          detalle: { camposSensibles: ['preferencias'] },
        },
      });

      const viva = c.oportunidades[0];
      return {
        contacto: aContacto(c),
        // La más reciente que no esté cerrada. Si hay varias vivas, el asesor ve la última que
        // tocó, que es la que tiene en la cabeza.
        oportunidadActual: viva ? aOportunidad(viva) : null,
        // Vacíos a propósito: `quoting` y `booking` todavía no publican sus puertos, y un
        // arreglo vacío es honesto. Consultar sus tablas desde aquí rompería R4.
        cotizaciones: [],
        archivosDeViajeIds: [],
        notasInternas: c.notasInternas.map((n) => ({
          id: n.id,
          autorNombre: n.autor?.nombre ?? null,
          texto: n.texto,
          escritaEn: n.escritaEn.toISOString(),
        })),
      };
    });
  }

  async listarContactos(p: { buscar: string | null; limite: number }): Promise<Contacto[]> {
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
      return filas.map(aContacto);
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

function aEtapaDefinida(e: FilaEtapa): EtapaDefinida {
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

function aOportunidad(o: FilaOportunidad): Oportunidad {
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

interface FilaContacto {
  id: string;
  nombre: string | null;
  telefonoE164: string;
  correo: string | null;
  etiquetas: string[];
  preferencias: string | null;
  creadoEn: Date;
  ultimoContactoEn: Date | null;
  consentimientos: { finalidad: string; revocadoEn: Date | null }[];
}

function aContacto(c: FilaContacto): Contacto {
  return {
    id: c.id,
    nombre: c.nombre,
    telefono: c.telefonoE164,
    correo: c.correo,
    etiquetas: c.etiquetas,
    preferencias: c.preferencias,
    // Solo los vigentes. Un consentimiento revocado sigue en la tabla porque la ley pide poder
    // demostrar la revocación, pero hacia fuera el contacto ya no lo tiene.
    consentimientos: c.consentimientos
      .filter((x) => x.revocadoEn === null)
      .map((x) => x.finalidad as 'TRANSACCIONAL' | 'PROMOCIONAL'),
    creadoEn: c.creadoEn.toISOString(),
    ultimoContactoEn: c.ultimoContactoEn ? c.ultimoContactoEn.toISOString() : null,
  };
}
