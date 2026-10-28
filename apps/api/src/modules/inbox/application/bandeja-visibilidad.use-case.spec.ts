/**
 * Los casos de uso de la bandeja con un puerto de mentira: lo que se afirma es que la visibilidad
 * llega al puerto TAL COMO la dicta el contexto, que una conversación que el puerto no devuelve es
 * el mismo 404 que un id inexistente, y que avisar al relay nunca rompe una acción ya confirmada.
 * La consulta real contra PostgreSQL con RLS está en `inbox-visibilidad.e2e-spec.ts`.
 */
import type { Permiso } from '@viajapro/contracts';
import { describe, expect, it } from 'vitest';
import type { Visibilidad } from '../../../shared/autorizacion/visibilidad-de-conversaciones.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import {
  AdjuntoNoEncontradoError,
  ConversacionNoEncontradaError,
} from '../domain/errores-de-conversacion.js';
import { ActuarEnConversacionUseCase } from './actuar-en-conversacion.js';
import { ConsultarBandejaUseCase } from './consultar-bandeja.js';
import { PuertoConversaciones } from './puertos-de-conversaciones.js';
import { PuertoAvisoAlRelay } from './puertos-de-eventos.js';

const TENANT = '01932000-0000-7000-8000-00000000000a';
const ANA = '01932000-0000-7000-8000-0000000000a1';
const DUENO = '01932000-0000-7000-8000-0000000000d1';
const C2 = '01932000-0000-7000-8000-0000000000c2';

const comoAna = <T>(fn: () => T, permisos: Permiso[] = []): T =>
  ContextoTenant.ejecutarCon(
    {
      tenantId: TENANT,
      usuarioId: ANA,
      identidadId: null,
      permisos: new Set(permisos),
      trazaId: 't',
    },
    fn,
  );

/** Un puerto que apunta con qué visibilidad lo llamaron y responde `null` (no existe o no se ve). */
class PuertoQueNoVeNada extends PuertoConversaciones {
  visibilidades: Visibilidad[] = [];
  private anota(v: Visibilidad): void {
    this.visibilidades.push(v);
  }
  listar(v: Visibilidad): Promise<never> {
    this.anota(v);
    return Promise.resolve({ datos: [], pageInfo: { nextCursor: null, hasMore: false } } as never);
  }
  contadores(v: Visibilidad): Promise<never> {
    this.anota(v);
    return Promise.resolve({
      todas: 0,
      mias: 0,
      sinAsignar: 0,
      conversacionesSinLeer: 0,
      mensajesSinLeer: 0,
    } as never);
  }
  detalle(v: Visibilidad): Promise<null> {
    this.anota(v);
    return Promise.resolve(null);
  }
  mensajes(v: Visibilidad): Promise<null> {
    this.anota(v);
    return Promise.resolve(null);
  }
  notas(v: Visibilidad): Promise<null> {
    this.anota(v);
    return Promise.resolve(null);
  }
  adjunto(v: Visibilidad): Promise<{ adjunto: null } | null> {
    this.anota(v);
    return Promise.resolve(null);
  }
  responder(v: Visibilidad): Promise<null> {
    this.anota(v);
    return Promise.resolve(null);
  }
  enviarCotizacion(v: Visibilidad): Promise<null> {
    this.anota(v);
    return Promise.resolve(null);
  }
  crearNota(v: Visibilidad): Promise<null> {
    this.anota(v);
    return Promise.resolve(null);
  }
  marcarLeida(v: Visibilidad): Promise<boolean> {
    this.anota(v);
    return Promise.resolve(false);
  }
  cambiarEstado(v: Visibilidad): Promise<null> {
    this.anota(v);
    return Promise.resolve(null);
  }
  asignar(v: Visibilidad): Promise<null> {
    this.anota(v);
    return Promise.resolve(null);
  }
}

class Relay extends PuertoAvisoAlRelay {
  avisados: string[] = [];
  constructor(private readonly falla = false) {
    super();
  }
  avisar(tenantId: string): Promise<void> {
    if (this.falla) return Promise.reject(new Error('Redis caído'));
    this.avisados.push(tenantId);
    return Promise.resolve();
  }
}

describe('ConsultarBandejaUseCase', () => {
  it('sin ver_todas, el puerto recibe «las suyas y la cola común» con el id de quien pregunta', async () => {
    const puerto = new PuertoQueNoVeNada();
    const uc = new ConsultarBandejaUseCase(puerto);
    await comoAna(() => uc.listar({ filtro: 'TODAS', limite: 30 }));
    await comoAna(() => uc.contadores());
    expect(puerto.visibilidades).toEqual([
      { alcance: 'ASIGNADAS_Y_COLA', usuarioId: ANA },
      { alcance: 'ASIGNADAS_Y_COLA', usuarioId: ANA },
    ]);
  });

  it('con ver_todas, el puerto recibe visibilidad total', async () => {
    const puerto = new PuertoQueNoVeNada();
    await comoAna(
      () => new ConsultarBandejaUseCase(puerto).listar({ filtro: 'TODAS', limite: 30 }),
      ['conversaciones.ver_todas'],
    );
    expect(puerto.visibilidades).toEqual([{ alcance: 'TODAS' }]);
  });

  it('CA3: detalle, mensajes, notas y media de una conversación ajena dan el mismo 404', async () => {
    const uc = new ConsultarBandejaUseCase(new PuertoQueNoVeNada());
    const pedidos: Array<() => Promise<unknown>> = [
      () => uc.detalle(C2),
      () => uc.mensajes(C2, { limite: 50 }),
      () => uc.notas(C2),
      () => uc.adjunto(C2, C2),
    ];
    for (const pedir of pedidos) {
      await expect(comoAna(pedir)).rejects.toBeInstanceOf(ConversacionNoEncontradaError);
    }
  });

  it('una conversación visible pero sin ese adjunto es otro error: el adjunto no existe', async () => {
    class ConConversacion extends PuertoQueNoVeNada {
      override adjunto(): Promise<{ adjunto: null }> {
        return Promise.resolve({ adjunto: null });
      }
    }
    await expect(
      comoAna(() => new ConsultarBandejaUseCase(new ConConversacion()).adjunto(C2, C2)),
    ).rejects.toBeInstanceOf(AdjuntoNoEncontradoError);
  });
});

describe('ActuarEnConversacionUseCase', () => {
  it('CA12: tomar, reasignar, responder, anotar, leer o cambiar el estado de una ajena da 404', async () => {
    const uc = new ActuarEnConversacionUseCase(new PuertoQueNoVeNada(), new Relay());
    const acciones: Array<() => Promise<unknown>> = [
      () => uc.asignar(C2, { usuarioId: ANA }),
      () =>
        uc.responder(C2, {
          texto: 'hola',
          claveIdempotencia: '01932000-0000-7000-8000-0000000000f1',
        }),
      () => uc.crearNota(C2, { texto: 'nota' }),
      () => uc.marcarLeida(C2),
      () => uc.cambiarEstado(C2, { estado: 'CERRADA' }),
    ];
    for (const accion of acciones) {
      await expect(comoAna(accion)).rejects.toBeInstanceOf(ConversacionNoEncontradaError);
    }
  });

  it('una acción que no encontró la conversación no avisa al relay (no hubo evento)', async () => {
    const relay = new Relay();
    const uc = new ActuarEnConversacionUseCase(new PuertoQueNoVeNada(), relay);
    await expect(comoAna(() => uc.asignar(C2, { usuarioId: null }))).rejects.toThrow();
    expect(relay.avisados).toEqual([]);
  });

  it('tras asignar avisa al relay de ESA agencia', async () => {
    class Asigna extends PuertoQueNoVeNada {
      override asignar(): Promise<never> {
        return Promise.resolve({ id: C2 } as never);
      }
    }
    const relay = new Relay();
    await comoAna(() =>
      new ActuarEnConversacionUseCase(new Asigna(), relay).asignar(C2, { usuarioId: DUENO }),
    );
    expect(relay.avisados).toEqual([TENANT]);
  });

  it('si el aviso al relay falla, la acción ya confirmada no falla: el barrido publicará el evento', async () => {
    class Asigna extends PuertoQueNoVeNada {
      override asignar(): Promise<never> {
        return Promise.resolve({ id: C2 } as never);
      }
    }
    const uc = new ActuarEnConversacionUseCase(new Asigna(), new Relay(true));
    await expect(comoAna(() => uc.asignar(C2, { usuarioId: DUENO }))).resolves.toMatchObject({
      id: C2,
    });
  });
});
