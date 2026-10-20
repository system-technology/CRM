/**
 * La traducción de eventos de dominio a eventos de socket, con puertos de mentira, y A QUIÉN se le
 * emite (`docs/01-producto/12-visibilidad-de-conversaciones.md`). La integración con RLS y sockets
 * reales está en `inbox-tiempo-real.e2e-spec.ts` y `inbox-visibilidad.e2e-spec.ts`.
 */
import type { ConversacionResumen, EventoBandeja, Mensaje } from '@viajapro/contracts';
import { describe, expect, it } from 'vitest';
import type { MiembroParaAudiencia } from '../../../shared/autorizacion/visibilidad-de-conversaciones.js';
import {
  type EventoDeDominio,
  TIPO_ACCESO_REVOCADO,
  TIPO_CONVERSACION_ACTUALIZADA,
  TIPO_MENSAJE_RECIBIDO,
  TIPO_MENSAJE_SALIENTE_CREADO,
} from '../domain/evento-de-dominio.js';
import { EmitirEventosEnVivo } from './emitir-eventos-en-vivo.js';
import {
  PuertoEmisionEnVivo,
  PuertoLecturaDeConversaciones,
  PuertoLecturaDeMensajes,
} from './puertos-de-eventos.js';

const TENANT = '01932000-0000-7000-8000-00000000000a';
const MENSAJE = '01932000-0000-7000-8000-0000000000b1';
const CONVERSACION = '01932000-0000-7000-8000-0000000000c1';
const DUENO = '01932000-0000-7000-8000-0000000000d1';
const ANA = '01932000-0000-7000-8000-0000000000a1';
const BETO = '01932000-0000-7000-8000-0000000000b2';
const USUARIO = ANA;

const mensaje: Mensaje = {
  id: MENSAJE,
  conversacionId: CONVERSACION,
  direccion: 'ENTRANTE',
  tipo: 'TEXTO',
  texto: 'Hola',
  adjuntos: [],
  estado: 'ENTREGADO',
  motivoFallo: null,
  autorId: null,
  autorNombre: null,
  ocurridoEn: '2027-01-01T00:00:00.000Z',
  cotizacionId: null,
};

const resumen = (asignadoAId: string | null): ConversacionResumen => ({
  id: CONVERSACION,
  contactoId: '01932000-0000-7000-8000-0000000000e1',
  contactoNombre: 'Viajero',
  contactoTelefono: '+573001234567',
  estado: 'ABIERTA',
  ventana: { abierta: true, expiraEn: null, minutosRestantes: 100 },
  asignadoAId,
  asignadoANombre: null,
  ultimoMensajeTexto: 'Hola',
  ultimoMensajeEn: '2027-01-01T00:00:00.000Z',
  ultimoMensajeDireccion: 'ENTRANTE',
  mensajesSinLeer: 1,
  slaVenceEn: null,
  etiquetas: [],
});

const MIEMBROS: MiembroParaAudiencia[] = [
  { usuarioId: DUENO, verTodas: true },
  { usuarioId: ANA, verTodas: false },
  { usuarioId: BETO, verTodas: false },
];

class Lectura extends PuertoLecturaDeMensajes {
  consultas: Array<[string, string]> = [];
  constructor(private readonly m: Mensaje | null) {
    super();
  }
  mensajePorId(tenantId: string, id: string): Promise<Mensaje | null> {
    this.consultas.push([tenantId, id]);
    return Promise.resolve(this.m);
  }
}

class Conversaciones extends PuertoLecturaDeConversaciones {
  constructor(
    public asignadoAId: string | null,
    public existe = true,
    public miembros: MiembroParaAudiencia[] = MIEMBROS,
  ) {
    super();
  }
  asignacionDe(): Promise<{ asignadoAId: string | null } | null> {
    return Promise.resolve(this.existe ? { asignadoAId: this.asignadoAId } : null);
  }
  resumenPorId(): Promise<ConversacionResumen | null> {
    return Promise.resolve(this.existe ? resumen(this.asignadoAId) : null);
  }
  miembrosActivos(): Promise<MiembroParaAudiencia[]> {
    return Promise.resolve(this.miembros);
  }
}

class Emision extends PuertoEmisionEnVivo {
  emitidos: Array<{ tenantId: string; para: string[]; evento: EventoBandeja }> = [];
  desconectados: Array<[string, string]> = [];
  emitirAUsuarios(tenantId: string, para: ReadonlySet<string>, evento: EventoBandeja): void {
    this.emitidos.push({ tenantId, para: [...para].sort(), evento });
  }
  desconectarUsuario(t: string, u: string): void {
    this.desconectados.push([t, u]);
  }
}

const evento = (
  tipo: string,
  payload: Record<string, unknown> = {},
  agregadoId = MENSAJE,
): EventoDeDominio => ({ id: '1', tipo, tenantId: TENANT, agregadoId, payload });

const emisor = (
  lectura: PuertoLecturaDeMensajes,
  conversaciones: PuertoLecturaDeConversaciones,
  emision: PuertoEmisionEnVivo,
): EmitirEventosEnVivo => new EmitirEventosEnVivo(lectura, conversaciones, emision);

describe('EmitirEventosEnVivo: mensajes', () => {
  it('un mensaje recibido se lee con el tenant del EVENTO y sale solo hacia quien ve la conversación', async () => {
    const lectura = new Lectura(mensaje);
    const emision = new Emision();
    // Asignada a Ana: la ven Ana y el dueño; Beto no (CA6).
    await emisor(lectura, new Conversaciones(ANA), emision).atender(evento(TIPO_MENSAJE_RECIBIDO));
    expect(lectura.consultas).toEqual([[TENANT, MENSAJE]]);
    expect(emision.emitidos).toEqual([
      {
        tenantId: TENANT,
        para: [ANA, DUENO].sort(),
        evento: { tipo: 'MENSAJE_NUEVO', conversacionId: CONVERSACION, mensaje },
      },
    ]);
  });

  it('CA6: si la conversación es de Beto, Ana no está en la audiencia', async () => {
    const emision = new Emision();
    await emisor(new Lectura(mensaje), new Conversaciones(BETO), emision).atender(
      evento(TIPO_MENSAJE_RECIBIDO),
    );
    expect(emision.emitidos[0]?.para).toEqual([BETO, DUENO].sort());
    expect(emision.emitidos[0]?.para).not.toContain(ANA);
  });

  it('CA7: en la cola común (sin asignar) lo reciben todos', async () => {
    const emision = new Emision();
    await emisor(new Lectura(mensaje), new Conversaciones(null), emision).atender(
      evento(TIPO_MENSAJE_RECIBIDO),
    );
    expect(emision.emitidos[0]?.para).toEqual([ANA, BETO, DUENO].sort());
  });

  it('CA16: con ver_todas añadido al rol, Ana entra en la audiencia sin reconectar; al quitarlo, sale', async () => {
    const emision = new Emision();
    const conv = new Conversaciones(BETO);
    const e = emisor(new Lectura(mensaje), conv, emision);

    await e.atender(evento(TIPO_MENSAJE_RECIBIDO));
    expect(emision.emitidos[0]?.para).not.toContain(ANA);

    conv.miembros = MIEMBROS.map((m) => (m.usuarioId === ANA ? { ...m, verTodas: true } : m));
    await e.atender(evento(TIPO_MENSAJE_RECIBIDO));
    expect(emision.emitidos[1]?.para).toContain(ANA);

    conv.miembros = MIEMBROS;
    await e.atender(evento(TIPO_MENSAJE_RECIBIDO));
    expect(emision.emitidos[2]?.para).not.toContain(ANA);
  });

  it('un mensaje saliente sigue la misma regla que uno entrante', async () => {
    const emision = new Emision();
    await emisor(new Lectura(mensaje), new Conversaciones(ANA), emision).atender(
      evento(TIPO_MENSAJE_SALIENTE_CREADO),
    );
    expect(emision.emitidos[0]?.para).toEqual([ANA, DUENO].sort());
  });

  it('lo que el evento traiga en su payload no llega al cliente', async () => {
    const emision = new Emision();
    await emisor(new Lectura(mensaje), new Conversaciones(null), emision).atender(
      evento(TIPO_MENSAJE_RECIBIDO, { neto: '1000', margen: '200', secreto: 'x' }),
    );
    expect(JSON.stringify(emision.emitidos)).not.toMatch(/neto|margen|secreto/);
  });

  it('si el mensaje no existe en ese tenant, no se emite nada', async () => {
    const emision = new Emision();
    await emisor(new Lectura(null), new Conversaciones(null), emision).atender(
      evento(TIPO_MENSAJE_RECIBIDO),
    );
    expect(emision.emitidos).toHaveLength(0);
  });

  it('si la conversación no existe en ese tenant, no se emite nada', async () => {
    const emision = new Emision();
    await emisor(new Lectura(mensaje), new Conversaciones(null, false), emision).atender(
      evento(TIPO_MENSAJE_RECIBIDO),
    );
    expect(emision.emitidos).toHaveLength(0);
  });
});

describe('EmitirEventosEnVivo: cambios de la conversación', () => {
  const actualizada = (payload: Record<string, unknown>) =>
    evento(TIPO_CONVERSACION_ACTUALIZADA, payload, CONVERSACION);

  it('CA11: Ana reasigna C1 a Beto: Ana recibe la retirada; Beto y el dueño, la actualización', async () => {
    const emision = new Emision();
    // Ya está asignada a Beto; antes era de Ana.
    await emisor(new Lectura(null), new Conversaciones(BETO), emision).atender(
      actualizada({ anteriorAsignadoAId: ANA }),
    );
    expect(emision.emitidos).toHaveLength(2);
    expect(emision.emitidos[0]).toMatchObject({
      para: [BETO, DUENO].sort(),
      evento: { tipo: 'CONVERSACION_ACTUALIZADA' },
    });
    expect(emision.emitidos[1]).toEqual({
      tenantId: TENANT,
      para: [ANA],
      evento: { tipo: 'CONVERSACION_RETIRADA', conversacionId: CONVERSACION },
    });
  });

  it('CA8: al tomar una conversación sin asignar, a quien no la toma se le retira de la bandeja', async () => {
    const emision = new Emision();
    await emisor(new Lectura(null), new Conversaciones(ANA), emision).atender(
      actualizada({ anteriorAsignadoAId: null }),
    );
    const retirada = emision.emitidos.find((e) => e.evento.tipo === 'CONVERSACION_RETIRADA');
    expect(retirada?.para).toEqual([BETO]);
    // El dueño la sigue viendo: no se le retira.
    expect(emision.emitidos[0]?.para).toEqual([ANA, DUENO].sort());
  });

  it('CA13: Ana suelta C1: vuelve a la cola común y la reciben todos; nadie pierde visibilidad', async () => {
    const emision = new Emision();
    await emisor(new Lectura(null), new Conversaciones(null), emision).atender(
      actualizada({ anteriorAsignadoAId: ANA }),
    );
    expect(emision.emitidos).toHaveLength(1);
    expect(emision.emitidos[0]?.para).toEqual([ANA, BETO, DUENO].sort());
  });

  it('CA15: al dar de baja a Beto, su conversación pasa a la cola común y la ven todos los activos', async () => {
    const emision = new Emision();
    const sinBeto = MIEMBROS.filter((m) => m.usuarioId !== BETO);
    await emisor(new Lectura(null), new Conversaciones(null, true, sinBeto), emision).atender(
      actualizada({ anteriorAsignadoAId: BETO }),
    );
    expect(emision.emitidos[0]?.para).toEqual([ANA, DUENO].sort());
    // Beto ya no es miembro activo: no hay a quién retirarle nada.
    expect(emision.emitidos.some((e) => e.evento.tipo === 'CONVERSACION_RETIRADA')).toBe(false);
  });

  it('sin `anteriorAsignadoAId` (cambio de estado, lectura) solo se actualiza; nadie pierde la fila', async () => {
    const emision = new Emision();
    await emisor(new Lectura(null), new Conversaciones(ANA), emision).atender(actualizada({}));
    expect(emision.emitidos).toHaveLength(1);
    expect(emision.emitidos[0]?.evento.tipo).toBe('CONVERSACION_ACTUALIZADA');
  });

  it('la actualización lleva solo el resumen del contrato, no el cuerpo del evento', async () => {
    const emision = new Emision();
    await emisor(new Lectura(null), new Conversaciones(ANA), emision).atender(
      actualizada({ anteriorAsignadoAId: null, secreto: 'x' }),
    );
    expect(JSON.stringify(emision.emitidos)).not.toContain('secreto');
  });

  it('si la conversación no existe en ese tenant, no se emite nada', async () => {
    const emision = new Emision();
    await emisor(new Lectura(null), new Conversaciones(null, false), emision).atender(
      actualizada({ anteriorAsignadoAId: ANA }),
    );
    expect(emision.emitidos).toHaveLength(0);
  });

  it('una carga malformada se trata como «nadie perdió visibilidad»', async () => {
    const emision = new Emision();
    await emisor(new Lectura(null), new Conversaciones(ANA), emision).atender(
      actualizada({ anteriorAsignadoAId: 'todos' }),
    );
    expect(emision.emitidos.map((e) => e.evento.tipo)).toEqual(['CONVERSACION_ACTUALIZADA']);
  });
});

describe('EmitirEventosEnVivo: otros eventos', () => {
  it('acceso revocado desconecta al usuario de ESE tenant', async () => {
    const emision = new Emision();
    await emisor(new Lectura(null), new Conversaciones(null), emision).atender(
      evento(TIPO_ACCESO_REVOCADO, { usuarioId: USUARIO }),
    );
    expect(emision.desconectados).toEqual([[TENANT, USUARIO]]);
  });

  it('una carga de acceso revocado malformada no desconecta a nadie', async () => {
    const emision = new Emision();
    await emisor(new Lectura(null), new Conversaciones(null), emision).atender(
      evento(TIPO_ACCESO_REVOCADO, { usuarioId: 'todos' }),
    );
    expect(emision.desconectados).toHaveLength(0);
  });

  it('un tipo desconocido se ignora', async () => {
    const lectura = new Lectura(mensaje);
    const emision = new Emision();
    await emisor(lectura, new Conversaciones(null), emision).atender(evento('otro.contexto.cosa'));
    expect(lectura.consultas).toHaveLength(0);
    expect(emision.emitidos).toHaveLength(0);
  });
});
