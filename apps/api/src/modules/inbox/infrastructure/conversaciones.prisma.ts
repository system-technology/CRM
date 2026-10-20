/**
 * La bandeja que ve el asesor, contra PostgreSQL, con el pool de la API y SIEMPRE bajo RLS.
 *
 * **La visibilidad dentro de la agencia se aplica aquí, en un solo sitio:** `ambito()` combina el
 * predicado de la agencia con `filtroDeVisibilidad(v)`, y TODA consulta de conversaciones —o de
 * algo que cuelgue de una— parte de él. Los mensajes, las notas, la media, la búsqueda y los
 * contadores no tienen su propia regla: preguntan primero si la conversación se ve, o se cuelgan
 * del mismo predicado. Una conversación que no existe y una que no se ve son indistinguibles
 * (`null`), y de ahí sale el 404 idéntico.
 *
 * Todo lo que escribe lo hace en UNA transacción junto con su evento de outbox (R5): el relay lo
 * publica después; aquí no se publica nada.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AdjuntoDeConversacion,
  ConsultarBandeja,
  ConsultarMensajes,
  ContadoresBandeja,
  ConversacionDetalle,
  ConversacionResumen,
  EstadoConversacion,
  Mensaje,
  NotaDeConversacion,
  PaginaBandeja,
  PaginaMensajes,
} from '@viajapro/contracts';
import {
  filtroDeVisibilidad,
  type Visibilidad,
} from '../../../shared/autorizacion/visibilidad-de-conversaciones.js';
import { type ClienteTenant, PrismaService } from '../../../shared/prisma/prisma.service.js';
import { PuertoNotasDeConversacion } from '../../../shared/puertos/puertos-hacia-crm.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { PuertoConversaciones } from '../application/puertos-de-conversaciones.js';
import { asignacionTrasResponder } from '../domain/asignacion-de-conversacion.js';
import {
  ClaveDeIdempotenciaEnUsoError,
  ConversacionModificadaError,
  SinUsuarioError,
  UsuarioNoAsignableError,
  VentanaCerradaError,
} from '../domain/errores-de-conversacion.js';
import {
  TIPO_CONVERSACION_ACTUALIZADA,
  TIPO_MENSAJE_SALIENTE_CREADO,
} from '../domain/evento-de-dominio.js';
import { calcularVentana, nuevaExpiracion } from '../domain/ventana-de-servicio.js';
import {
  aMensaje,
  aResumen,
  codificarCursor,
  decodificarCursor,
  PARA_EL_MENSAJE,
  PARA_EL_RESUMEN,
} from './mapeo.js';

/** Mensajes que trae el detalle de una conversación al abrirla. */
const MENSAJES_DEL_DETALLE = 50;

/** El predicado de la agencia + la visibilidad del miembro. El punto de entrada de toda consulta. */
function ambito(tenantId: string, v: Visibilidad): Prisma.ConversacionWhereInput {
  return { AND: [{ tenantId, eliminadoEn: null }, filtroDeVisibilidad(v)] };
}

function unaConversacion(
  tenantId: string,
  v: Visibilidad,
  id: string,
): Prisma.ConversacionWhereInput {
  return { AND: [{ id }, ambito(tenantId, v)] };
}

function esUnicidadViolada(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

async function escribirEvento(
  tx: ClienteTenant,
  e: {
    tenantId: string;
    agregado: string;
    agregadoId: string;
    tipo: string;
    // Solo identificadores y banderas: el outbox no lleva texto de mensajes ni teléfonos (R10).
    payload: Prisma.InputJsonObject;
  },
): Promise<void> {
  await tx.outbox.create({
    data: {
      tenantId: e.tenantId,
      agregado: e.agregado,
      agregadoId: e.agregadoId,
      tipoEvento: e.tipo,
      payload: e.payload,
    },
  });
}

@Injectable()
export class ConversacionesPrisma extends PuertoConversaciones {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PuertoNotasDeConversacion) private readonly notasDeCrm: PuertoNotasDeConversacion,
  ) {
    super();
  }

  // ---------------------------------------------------------------------------------- lectura

  async listar(
    v: Visibilidad,
    usuarioId: string | null,
    c: ConsultarBandeja,
    ahora: Date,
  ): Promise<PaginaBandeja> {
    const { tenantId } = ContextoTenant.obtener();
    const cursor = c.cursor ? decodificarCursor(c.cursor) : null;
    const termino = c.buscar?.trim();

    const pestana: Prisma.ConversacionWhereInput = (() => {
      switch (c.filtro) {
        case 'TODAS':
          return {};
        case 'MIAS':
          // Sin usuario no hay «mías»: ninguna fila, no todas.
          return usuarioId ? { asignadoAId: usuarioId } : { id: { in: [] } };
        case 'SIN_ASIGNAR':
          return { asignadoAId: null };
        case 'SIN_LEER':
          return { mensajesSinLeer: { gt: 0 } };
        case 'SLA_VENCIDO':
          return { primeraRespuestaEn: null, slaVenceEn: { lt: ahora } };
      }
    })();

    const busqueda: Prisma.ConversacionWhereInput = termino
      ? {
          OR: [
            { contacto: { nombre: { contains: termino, mode: 'insensitive' } } },
            { contacto: { telefonoE164: { contains: termino } } },
            {
              mensajes: {
                some: { eliminadoEn: null, texto: { contains: termino, mode: 'insensitive' } },
              },
            },
          ],
        }
      : {};

    const desdeElCursor: Prisma.ConversacionWhereInput =
      cursor === null
        ? {}
        : cursor.t === null
          ? { ultimoMensajeEn: null, id: { lt: cursor.id } }
          : {
              OR: [
                { ultimoMensajeEn: { lt: new Date(cursor.t) } },
                { ultimoMensajeEn: new Date(cursor.t), id: { lt: cursor.id } },
                { ultimoMensajeEn: null },
              ],
            };

    const filas = await this.prisma.conTenant((tx) =>
      tx.conversacion.findMany({
        where: {
          AND: [
            ambito(tenantId, v),
            pestana,
            busqueda,
            c.estado ? { estado: c.estado } : {},
            desdeElCursor,
          ],
        },
        orderBy: [{ ultimoMensajeEn: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
        take: c.limite + 1,
        select: PARA_EL_RESUMEN,
      }),
    );

    const hayMas = filas.length > c.limite;
    const pagina = filas.slice(0, c.limite);
    const ultima = pagina[pagina.length - 1];
    return {
      datos: pagina.map((f) => aResumen(f, ahora)),
      pageInfo: {
        hasMore: hayMas,
        nextCursor:
          hayMas && ultima
            ? codificarCursor({ t: ultima.ultimoMensajeEn?.toISOString() ?? null, id: ultima.id })
            : null,
      },
    };
  }

  async contadores(v: Visibilidad, usuarioId: string | null): Promise<ContadoresBandeja> {
    const { tenantId } = ContextoTenant.obtener();
    const base = ambito(tenantId, v);
    return this.prisma.conTenant(async (tx) => {
      const todas = await tx.conversacion.count({ where: base });
      const mias = usuarioId
        ? await tx.conversacion.count({ where: { AND: [base, { asignadoAId: usuarioId }] } })
        : 0;
      const sinAsignar = await tx.conversacion.count({
        where: { AND: [base, { asignadoAId: null }] },
      });
      const conversacionesSinLeer = await tx.conversacion.count({
        where: { AND: [base, { mensajesSinLeer: { gt: 0 } }] },
      });
      const suma = await tx.conversacion.aggregate({
        where: base,
        _sum: { mensajesSinLeer: true },
      });
      return {
        todas,
        mias,
        sinAsignar,
        conversacionesSinLeer,
        mensajesSinLeer: suma._sum.mensajesSinLeer ?? 0,
      };
    });
  }

  async detalle(v: Visibilidad, id: string, ahora: Date): Promise<ConversacionDetalle | null> {
    const { tenantId } = ContextoTenant.obtener();
    return this.prisma.conTenant(async (tx) => {
      const fila = await tx.conversacion.findFirst({
        where: unaConversacion(tenantId, v, id),
        select: PARA_EL_RESUMEN,
      });
      if (!fila) return null;

      const recientes = await tx.mensaje.findMany({
        where: { tenantId, conversacionId: id, eliminadoEn: null },
        orderBy: [{ ocurridoEn: 'desc' }, { id: 'desc' }],
        take: MENSAJES_DEL_DETALLE,
        select: PARA_EL_MENSAJE,
      });
      const notas = await this.notasDeCrm.deLaConversacion(tx, tenantId, id);

      return {
        ...aResumen(fila, ahora),
        mensajes: recientes.reverse().map(aMensaje),
        notas: notas.map(aNota),
      };
    });
  }

  async mensajes(v: Visibilidad, id: string, c: ConsultarMensajes): Promise<PaginaMensajes | null> {
    const { tenantId } = ContextoTenant.obtener();
    const cursor = c.cursor ? decodificarCursor(c.cursor) : null;
    return this.prisma.conTenant(async (tx) => {
      const visible = await tx.conversacion.findFirst({
        where: unaConversacion(tenantId, v, id),
        select: { id: true },
      });
      if (!visible) return null;

      const filas = await tx.mensaje.findMany({
        where: {
          tenantId,
          conversacionId: id,
          eliminadoEn: null,
          ...(cursor && cursor.t !== null
            ? {
                OR: [
                  { ocurridoEn: { lt: new Date(cursor.t) } },
                  { ocurridoEn: new Date(cursor.t), id: { lt: cursor.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ ocurridoEn: 'desc' }, { id: 'desc' }],
        take: c.limite + 1,
        select: PARA_EL_MENSAJE,
      });
      const hayMas = filas.length > c.limite;
      const pagina = filas.slice(0, c.limite);
      const masAntiguo = pagina[pagina.length - 1];
      return {
        datos: pagina.reverse().map(aMensaje),
        pageInfo: {
          hasMore: hayMas,
          nextCursor:
            hayMas && masAntiguo
              ? codificarCursor({ t: masAntiguo.ocurridoEn.toISOString(), id: masAntiguo.id })
              : null,
        },
      };
    });
  }

  async notas(v: Visibilidad, id: string): Promise<NotaDeConversacion[] | null> {
    const { tenantId } = ContextoTenant.obtener();
    return this.prisma.conTenant(async (tx) => {
      const visible = await tx.conversacion.findFirst({
        where: unaConversacion(tenantId, v, id),
        select: { id: true },
      });
      if (!visible) return null;
      return (await this.notasDeCrm.deLaConversacion(tx, tenantId, id)).map(aNota);
    });
  }

  async adjunto(
    v: Visibilidad,
    id: string,
    adjuntoId: string,
  ): Promise<{ adjunto: AdjuntoDeConversacion | null } | null> {
    const { tenantId } = ContextoTenant.obtener();
    return this.prisma.conTenant(async (tx) => {
      const visible = await tx.conversacion.findFirst({
        where: unaConversacion(tenantId, v, id),
        select: { id: true },
      });
      if (!visible) return null;

      const a = await tx.adjunto.findFirst({
        where: {
          id: adjuntoId,
          tenantId,
          eliminadoEn: null,
          mensaje: { conversacionId: id, eliminadoEn: null },
        },
        select: {
          id: true,
          tipo: true,
          nombreArchivo: true,
          tamanoBytes: true,
          mimeType: true,
          descargadoEn: true,
        },
      });
      return {
        adjunto: a
          ? {
              id: a.id,
              tipo: a.tipo,
              nombreArchivo: a.nombreArchivo,
              tamanoBytes: a.tamanoBytes === null ? null : Number(a.tamanoBytes),
              mimeType: a.mimeType,
              descargado: a.descargadoEn !== null,
            }
          : null,
      };
    });
  }

  // --------------------------------------------------------------------------------- acciones

  async responder(
    v: Visibilidad,
    autorId: string | null,
    id: string,
    entrada: { texto: string; claveIdempotencia: string },
    ahora: Date,
  ): Promise<Mensaje | null> {
    try {
      return await this.responderUnaVez(v, autorId, id, entrada, ahora);
    } catch (error) {
      // Dos envíos simultáneos con la misma clave: uno pierde la carrera por la unicidad. Al
      // reintentar, el mensaje del otro ya existe y se devuelve (idempotencia, R5).
      if (esUnicidadViolada(error)) return this.responderUnaVez(v, autorId, id, entrada, ahora);
      throw error;
    }
  }

  private async responderUnaVez(
    v: Visibilidad,
    autorId: string | null,
    id: string,
    entrada: { texto: string; claveIdempotencia: string },
    ahora: Date,
  ): Promise<Mensaje | null> {
    const { tenantId } = ContextoTenant.obtener();
    return this.prisma.conTenant(async (tx) => {
      const conv = await tx.conversacion.findFirst({
        where: unaConversacion(tenantId, v, id),
        select: {
          id: true,
          canalId: true,
          asignadoAId: true,
          ultimoMensajeClienteEn: true,
          primeraRespuestaEn: true,
        },
      });
      if (!conv) return null;

      // La clave se mira ANTES de la ventana: un reintento después de que la ventana cerró
      // devuelve el mensaje que ya se guardó, no un error.
      const previo = await tx.mensaje.findFirst({
        where: { tenantId, claveIdempotencia: entrada.claveIdempotencia },
        select: PARA_EL_MENSAJE,
      });
      if (previo) {
        if (previo.conversacionId !== id) throw new ClaveDeIdempotenciaEnUsoError();
        return aMensaje(previo);
      }

      const expira = conv.ultimoMensajeClienteEn
        ? nuevaExpiracion(null, conv.ultimoMensajeClienteEn)
        : null;
      if (!calcularVentana(expira, ahora).abierta) throw new VentanaCerradaError();

      const creado = await tx.mensaje.create({
        data: {
          tenantId,
          conversacionId: id,
          direccion: 'SALIENTE',
          tipo: 'TEXTO',
          // Pendiente hasta que el envío por la Cloud API lo confirme; ese envío es de `whatsapp`.
          estado: 'PENDIENTE',
          texto: entrada.texto,
          autorId,
          claveIdempotencia: entrada.claveIdempotencia,
          ocurridoEn: ahora,
        },
        select: PARA_EL_MENSAJE,
      });

      await tx.conversacion.update({
        where: { id },
        data: {
          ultimoMensajeEn: ahora,
          ultimoMensajeDireccion: 'SALIENTE',
          ultimoMensajeTexto: entrada.texto.slice(0, 200),
          primeraRespuestaEn: conv.primeraRespuestaEn ?? ahora,
          actualizadoPorId: autorId,
        },
      });

      // Responder es tomar: solo si sigue sin asignar. Condicional en la base, no en la memoria:
      // dos asesores que responden a la vez no se pisan, gana el primero.
      const quedaAsignada = asignacionTrasResponder(conv.asignadoAId, autorId);
      let tomada = false;
      if (conv.asignadoAId === null && quedaAsignada !== null) {
        const r = await tx.conversacion.updateMany({
          where: { id, tenantId, asignadoAId: null },
          data: { asignadoAId: quedaAsignada },
        });
        tomada = r.count === 1;
      }

      await escribirEvento(tx, {
        tenantId,
        agregado: 'mensaje',
        agregadoId: creado.id,
        tipo: TIPO_MENSAJE_SALIENTE_CREADO,
        payload: { conversacionId: id, canalId: conv.canalId },
      });
      if (tomada) {
        await escribirEvento(tx, {
          tenantId,
          agregado: 'conversacion',
          agregadoId: id,
          tipo: TIPO_CONVERSACION_ACTUALIZADA,
          payload: { anteriorAsignadoAId: null },
        });
      }
      return aMensaje(creado);
    });
  }

  async crearNota(
    v: Visibilidad,
    autorId: string | null,
    id: string,
    texto: string,
  ): Promise<NotaDeConversacion | null> {
    const { tenantId } = ContextoTenant.obtener();
    // El contrato de la nota exige autor: sin usuario detrás (atajo de desarrollo) no se escribe.
    if (autorId === null) throw new SinUsuarioError();
    return this.prisma.conTenant(async (tx) => {
      const conv = await tx.conversacion.findFirst({
        where: unaConversacion(tenantId, v, id),
        select: { id: true, contactoId: true },
      });
      if (!conv) return null;

      const nota = await this.notasDeCrm.crear(tx, {
        tenantId,
        conversacionId: id,
        contactoId: conv.contactoId,
        autorId,
        texto,
      });
      const autor = await tx.usuario.findFirst({
        where: { id: autorId, tenantId },
        select: { nombre: true },
      });
      return {
        id: nota.id,
        texto,
        autorId,
        autorNombre: autor?.nombre ?? '',
        creadaEn: nota.escritaEn.toISOString(),
      };
    });
  }

  async marcarLeida(v: Visibilidad, id: string): Promise<boolean> {
    const { tenantId } = ContextoTenant.obtener();
    return this.prisma.conTenant(async (tx) => {
      const conv = await tx.conversacion.findFirst({
        where: unaConversacion(tenantId, v, id),
        select: { mensajesSinLeer: true },
      });
      if (!conv) return false;
      if (conv.mensajesSinLeer > 0) {
        await tx.conversacion.update({ where: { id }, data: { mensajesSinLeer: 0 } });
        await escribirEvento(tx, {
          tenantId,
          agregado: 'conversacion',
          agregadoId: id,
          tipo: TIPO_CONVERSACION_ACTUALIZADA,
          payload: {},
        });
      }
      return true;
    });
  }

  async cambiarEstado(
    v: Visibilidad,
    id: string,
    estado: EstadoConversacion,
    actorId: string | null,
    ahora: Date,
  ): Promise<ConversacionResumen | null> {
    const { tenantId } = ContextoTenant.obtener();
    return this.prisma.conTenant(async (tx) => {
      const conv = await tx.conversacion.findFirst({
        where: unaConversacion(tenantId, v, id),
        select: { id: true, estado: true },
      });
      if (!conv) return null;
      if (conv.estado !== estado) {
        await tx.conversacion.update({
          where: { id },
          data: { estado, actualizadoPorId: actorId },
        });
        await escribirEvento(tx, {
          tenantId,
          agregado: 'conversacion',
          agregadoId: id,
          tipo: TIPO_CONVERSACION_ACTUALIZADA,
          payload: {},
        });
      }
      return this.resumen(tx, tenantId, id, ahora);
    });
  }

  async asignar(
    v: Visibilidad,
    id: string,
    usuarioId: string | null,
    actorId: string | null,
    ahora: Date,
  ): Promise<ConversacionResumen | null> {
    const { tenantId } = ContextoTenant.obtener();
    return this.prisma.conTenant(async (tx) => {
      const conv = await tx.conversacion.findFirst({
        where: unaConversacion(tenantId, v, id),
        select: { id: true, asignadoAId: true },
      });
      if (!conv) return null;

      if (usuarioId !== null) {
        // Miembro activo de ESTA agencia: bajo RLS, uno de otra agencia no existe aquí. Los tres
        // casos (otra agencia, de baja, inexistente) dan el mismo error.
        const destino = await tx.usuario.findFirst({
          where: { id: usuarioId, tenantId, activo: true, eliminadoEn: null },
          select: { id: true },
        });
        if (!destino) throw new UsuarioNoAsignableError();
      }

      if (conv.asignadoAId !== usuarioId) {
        // Condicional sobre lo que se leyó: si otro la cambió entre medias, no se pisa.
        const r = await tx.conversacion.updateMany({
          where: { id, tenantId, asignadoAId: conv.asignadoAId },
          data: { asignadoAId: usuarioId, actualizadoPorId: actorId },
        });
        if (r.count !== 1) throw new ConversacionModificadaError();
        await escribirEvento(tx, {
          tenantId,
          agregado: 'conversacion',
          agregadoId: id,
          tipo: TIPO_CONVERSACION_ACTUALIZADA,
          payload: { anteriorAsignadoAId: conv.asignadoAId },
        });
      }
      return this.resumen(tx, tenantId, id, ahora);
    });
  }

  /**
   * La fila de la bandeja tras una acción. Sin filtro de visibilidad: es la conversación sobre la
   * que quien actúa acaba de operar, y puede que ya no la vea (la reasignó a otro).
   */
  private async resumen(
    tx: ClienteTenant,
    tenantId: string,
    id: string,
    ahora: Date,
  ): Promise<ConversacionResumen> {
    const fila = await tx.conversacion.findFirstOrThrow({
      where: { id, tenantId },
      select: PARA_EL_RESUMEN,
    });
    return aResumen(fila, ahora);
  }
}

function aNota(n: {
  id: string;
  texto: string;
  autorId: string;
  autorNombre: string;
  creadaEn: Date;
}): NotaDeConversacion {
  return {
    id: n.id,
    texto: n.texto,
    autorId: n.autorId,
    autorNombre: n.autorNombre,
    creadaEn: n.creadaEn.toISOString(),
  };
}
