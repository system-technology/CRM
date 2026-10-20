/**
 * El gateway Socket.IO de la bandeja en vivo (ADR-0001, ADR-0011 «La bandeja en vivo»).
 *
 * **No pasa por `TenantMiddleware`**, así que repite por su cuenta los pasos 3 y 4 de ADR-0011 con
 * el mismo puerto (`ResolutorDeAcceso`): sesión viva y no revocada, `tenant_activo_id` revalidado
 * bajo RLS contra `usuarios`, agencia no suspendida.
 *
 *   · **Al conectar**, con la cookie del handshake. Si falla, se rechaza. **El cliente no aporta
 *     tenant**: ni en `auth`, ni en la query, ni en una cabecera, ni en un mensaje; nada de eso se
 *     lee. La cabecera de desarrollo tampoco: aquí no existe.
 *   · **Las salas las asigna el servidor** (`tenant:<id>` y `usuario:<id>`) y el cliente no tiene
 *     forma de unirse a otra. **Los eventos de conversaciones salen solo por `usuario:<id>`**, a
 *     quien ve la conversación (visibilidad dentro de la agencia): nada emite a `tenant:<id>`,
 *     que queda solo como pertenencia. El evento `unirse` no da ninguna capacidad: devuelve un rechazo si
 *     piden una sala que no es suya.
 *   · **Cada 60 s** se repiten los pasos 3 y 4 para cada socket, con la cookie guardada del
 *     handshake. Si la sesión se revocó, dieron de baja al usuario, la agencia se suspendió o
 *     cambió la agencia activa, el socket se cierra. Es el respaldo: el cierre inmediato llega por
 *     el evento `identity.acceso_revocado`.
 *   · **Origen:** un handshake con `Origin` que no es la web se rechaza (el navegador lo envía
 *     siempre en una conexión entre sitios).
 *
 * La emisión llega por `PuertoEmisionEnVivo`: este gateway no sabe de dónde vienen los eventos.
 */
import {
  EVENTO_SOCKET_BANDEJA,
  EVENTO_SOCKET_CIERRE,
  EVENTO_SOCKET_UNIRSE,
  type EventoBandeja,
  PeticionDeUnirse,
  type RespuestaDeUnirse,
  RUTA_SOCKET_BANDEJA,
} from '@viajapro/contracts';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Server, type Socket } from 'socket.io';
import {
  type AccesoConcedido,
  ResolutorDeAcceso,
} from '../../../shared/puertos/puerto-de-acceso.js';
import { origenEsDeConfianza, origenesDeConfianzaDeLaWeb } from '../../../shared/red/origen.js';
import { PuertoEmisionEnVivo } from '../application/puertos-de-eventos.js';
import { salaDeTenant, salaDeUsuario } from '../domain/evento-de-dominio.js';

/** Cada cuánto se revalida un socket abierto (ADR-0011). */
export const INTERVALO_DE_REVALIDACION_MS = 60_000;

/** Lo que el servidor guarda de cada socket. Sale de la SESIÓN, nunca del cliente. */
interface DatosDelSocket {
  cookie: string | null;
  tenantId: string;
  usuarioId: string;
}

const datosDe = (socket: Socket): DatosDelSocket => socket.data as DatosDelSocket;

@Injectable()
export class BandejaEnVivoGateway
  extends PuertoEmisionEnVivo
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly log = new Logger(BandejaEnVivoGateway.name);
  private io: Server | null = null;
  private temporizador: NodeJS.Timeout | null = null;
  private revalidando = false;

  constructor(
    @Inject(HttpAdapterHost) private readonly host: HttpAdapterHost,
    @Inject(ResolutorDeAcceso) private readonly acceso: ResolutorDeAcceso,
  ) {
    super();
  }

  onApplicationBootstrap(): void {
    const servidorHttp = this.host.httpAdapter.getHttpServer() as ConstructorParameters<
      typeof Server
    >[0];
    this.io = new Server(servidorHttp, {
      path: RUTA_SOCKET_BANDEJA,
      serveClient: false,
      cors: { origin: origenesDeConfianzaDeLaWeb(process.env), credentials: true },
      allowRequest: (req, devolver) => {
        const origen = req.headers.origin;
        const ok =
          origen === undefined ||
          origenEsDeConfianza(origen, origenesDeConfianzaDeLaWeb(process.env));
        devolver(ok ? null : 'ORIGEN_NO_CONFIABLE', ok);
      },
    });

    this.io.use((socket, siguiente) => {
      this.autenticar(socket).then(
        () => siguiente(),
        (error: unknown) => siguiente(error instanceof Error ? error : new Error('NO_AUTORIZADO')),
      );
    });
    this.io.on('connection', (socket) => this.alConectar(socket));

    this.temporizador = setInterval(() => void this.revalidarTodos(), INTERVALO_DE_REVALIDACION_MS);
    // No retener el proceso vivo por el temporizador.
    this.temporizador.unref();
  }

  /** Pasos 3 y 4. Lanza `NO_AUTORIZADO:<motivo>` si algo falla: es el `connect_error` del cliente. */
  private async autenticar(socket: Socket): Promise<void> {
    const cookie = socket.handshake.headers.cookie ?? null;
    const r = await this.acceso.resolver({ cookie });
    if (!r.concedido) throw new Error(`NO_AUTORIZADO:${r.motivo}`);
    guardar(socket, cookie, r.acceso);
  }

  private alConectar(socket: Socket): void {
    const { tenantId, usuarioId } = datosDe(socket);
    const salas = new Set([salaDeTenant(tenantId), salaDeUsuario(usuarioId)]);
    for (const sala of salas) void socket.join(sala);

    // Ningún otro evento del cliente tiene efecto. Este solo responde si la sala es suya.
    socket.on(EVENTO_SOCKET_UNIRSE, (carga: unknown, ack?: unknown) => {
      const p = PeticionDeUnirse.safeParse(carga);
      const respuesta: RespuestaDeUnirse =
        p.success && salas.has(p.data.sala)
          ? { ok: true, sala: p.data.sala }
          : { ok: false, error: 'SALA_NO_PERMITIDA' };
      if (typeof ack === 'function') (ack as (r: RespuestaDeUnirse) => void)(respuesta);
    });
  }

  /**
   * Repite los pasos 3 y 4 para todos los sockets abiertos. Público para las pruebas, que no
   * esperan 60 s. No se solapa consigo mismo.
   */
  async revalidarTodos(): Promise<void> {
    if (!this.io || this.revalidando) return;
    this.revalidando = true;
    try {
      const sockets = [...this.io.sockets.sockets.values()];
      for (let i = 0; i < sockets.length; i += 10) {
        await Promise.all(sockets.slice(i, i + 10).map((s) => this.revalidar(s)));
      }
    } finally {
      this.revalidando = false;
    }
  }

  private async revalidar(socket: Socket): Promise<void> {
    const antes = datosDe(socket);
    try {
      const r = await this.acceso.resolver({ cookie: antes.cookie });
      if (!r.concedido) return this.cerrar(socket, r.motivo);
      // Cambió la agencia activa o el usuario: las salas ya no corresponden. Cerrar y que
      // reconecte es más simple —y más seguro— que mover salas.
      if (r.acceso.tenantId !== antes.tenantId || r.acceso.usuarioId !== antes.usuarioId) {
        return this.cerrar(socket, 'SIN_AGENCIA_ACTIVA');
      }
    } catch {
      // Un fallo de infraestructura NO concede ni niega: el socket sigue y se reintenta en 60 s.
      this.log.error('La revalidación de un socket falló; se reintenta en la siguiente.');
    }
  }

  private cerrar(socket: Socket, motivo: string): void {
    socket.emit(EVENTO_SOCKET_CIERRE, { motivo });
    socket.disconnect(true);
  }

  /**
   * Emite a los sockets de CADA usuario del conjunto, por su sala `usuario:<id>`. Quién va en el
   * conjunto lo decidió quien llama (la regla de visibilidad, evaluada al emitir). Se comprueba
   * además que el socket sea de la agencia del evento: un id de usuario es único, pero emitir a una
   * sala sin mirar de quién es el socket es el tipo de atajo que no se perdona.
   */
  emitirAUsuarios(tenantId: string, usuarioIds: ReadonlySet<string>, evento: EventoBandeja): void {
    for (const usuarioId of usuarioIds) {
      const sala = this.io?.sockets.adapter.rooms.get(salaDeUsuario(usuarioId));
      for (const id of sala ?? []) {
        const socket = this.io?.sockets.sockets.get(id);
        if (socket && datosDe(socket).tenantId === tenantId) {
          socket.emit(EVENTO_SOCKET_BANDEJA, evento);
        }
      }
    }
  }

  desconectarUsuario(tenantId: string, usuarioId: string): void {
    const sala = this.io?.sockets.adapter.rooms.get(salaDeUsuario(usuarioId));
    for (const id of sala ?? []) {
      const socket = this.io?.sockets.sockets.get(id);
      if (socket && datosDe(socket).tenantId === tenantId) {
        this.cerrar(socket, 'ACCESO_REVOCADO');
      }
    }
  }

  /** Cuántos sockets hay conectados a una sala. Para las pruebas y la observabilidad. */
  async cuantosEnSala(sala: string): Promise<number> {
    return (await this.io?.in(sala).fetchSockets())?.length ?? 0;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.temporizador) clearInterval(this.temporizador);
    await this.io?.close();
  }
}

function guardar(socket: Socket, cookie: string | null, acceso: AccesoConcedido): void {
  const datos: DatosDelSocket = {
    cookie,
    tenantId: acceso.tenantId,
    usuarioId: acceso.usuarioId,
  };
  socket.data = datos;
}
