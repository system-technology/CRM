/**
 * La traducción de eventos de dominio a eventos de socket, con puertos de mentira. La integración
 * con RLS y sockets reales está en `inbox-tiempo-real.e2e-spec.ts`.
 */
import type { EventoBandeja, Mensaje } from '@viajapro/contracts';
import { describe, expect, it } from 'vitest';
import {
  type EventoDeDominio,
  TIPO_ACCESO_REVOCADO,
  TIPO_MENSAJE_RECIBIDO,
} from '../domain/evento-de-dominio.js';
import { EmitirEventosEnVivo } from './emitir-eventos-en-vivo.js';
import { PuertoEmisionEnVivo, PuertoLecturaDeMensajes } from './puertos-de-eventos.js';

const TENANT = '01932000-0000-7000-8000-00000000000a';
const MENSAJE = '01932000-0000-7000-8000-0000000000b1';
const CONVERSACION = '01932000-0000-7000-8000-0000000000c1';
const USUARIO = '01932000-0000-7000-8000-0000000000d1';

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
class Emision extends PuertoEmisionEnVivo {
  emitidos: Array<[string, EventoBandeja]> = [];
  desconectados: Array<[string, string]> = [];
  emitirATenant(t: string, e: EventoBandeja): void {
    this.emitidos.push([t, e]);
  }
  desconectarUsuario(t: string, u: string): void {
    this.desconectados.push([t, u]);
  }
}

const evento = (tipo: string, payload: Record<string, unknown> = {}): EventoDeDominio => ({
  id: '1',
  tipo,
  tenantId: TENANT,
  agregadoId: MENSAJE,
  payload,
});

describe('EmitirEventosEnVivo', () => {
  it('un mensaje recibido se lee con el tenant del EVENTO y se emite a la sala de ese tenant', async () => {
    const lectura = new Lectura(mensaje);
    const emision = new Emision();
    await new EmitirEventosEnVivo(lectura, emision).atender(evento(TIPO_MENSAJE_RECIBIDO));
    expect(lectura.consultas).toEqual([[TENANT, MENSAJE]]);
    expect(emision.emitidos).toEqual([
      [TENANT, { tipo: 'MENSAJE_NUEVO', conversacionId: CONVERSACION, mensaje }],
    ]);
  });

  it('lo que el evento traiga en su payload no llega al cliente', async () => {
    const emision = new Emision();
    await new EmitirEventosEnVivo(new Lectura(mensaje), emision).atender(
      evento(TIPO_MENSAJE_RECIBIDO, { neto: '1000', margen: '200', secreto: 'x' }),
    );
    expect(JSON.stringify(emision.emitidos)).not.toMatch(/neto|margen|secreto/);
  });

  it('si el mensaje no existe en ese tenant, no se emite nada', async () => {
    const emision = new Emision();
    await new EmitirEventosEnVivo(new Lectura(null), emision).atender(
      evento(TIPO_MENSAJE_RECIBIDO),
    );
    expect(emision.emitidos).toHaveLength(0);
  });

  it('acceso revocado desconecta al usuario de ESE tenant', async () => {
    const emision = new Emision();
    await new EmitirEventosEnVivo(new Lectura(null), emision).atender(
      evento(TIPO_ACCESO_REVOCADO, { usuarioId: USUARIO }),
    );
    expect(emision.desconectados).toEqual([[TENANT, USUARIO]]);
  });

  it('una carga de acceso revocado malformada no desconecta a nadie', async () => {
    const emision = new Emision();
    await new EmitirEventosEnVivo(new Lectura(null), emision).atender(
      evento(TIPO_ACCESO_REVOCADO, { usuarioId: 'todos' }),
    );
    expect(emision.desconectados).toHaveLength(0);
  });

  it('un tipo desconocido se ignora', async () => {
    const lectura = new Lectura(mensaje);
    const emision = new Emision();
    await new EmitirEventosEnVivo(lectura, emision).atender(evento('otro.contexto.cosa'));
    expect(lectura.consultas).toHaveLength(0);
    expect(emision.emitidos).toHaveLength(0);
  });
});
