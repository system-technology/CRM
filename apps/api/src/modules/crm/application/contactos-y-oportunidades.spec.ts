import { beforeEach, describe, expect, it } from 'vitest';
import type { Contacto, Oportunidad } from '@viajapro/contracts';
import { MonedaInvalidaError, TelefonoInvalidoError } from '@viajapro/domain';
import {
  type ConversacionParaCrm,
  PuertoConversacionesVisibles,
} from '../../../shared/puertos/puertos-hacia-inbox.js';
import {
  AsesorNoEncontradoError,
  ContactoNoEncontradoError,
  ConversacionNoEncontradaError,
  PaqueteNoEncontradoError,
  SinEtapaInicialError,
  TelefonoYaRegistradoError,
} from '../domain/errors.js';
import { CrearOportunidadUseCase } from './crear-oportunidad.js';
import { GestionarContactos } from './gestionar-contactos.js';
import {
  type CambiosDeContacto,
  type NuevaOportunidad,
  type NuevoContacto,
  PuertoEscrituraCrm,
} from './puerto-escritura-crm.js';

const ACTOR = '11111111-1111-4111-8111-111111111111';
const CONTACTO = '55555555-5555-4555-8555-555555555555';
const CONVERSACION = '44444444-4444-4444-8444-444444444444';

class EscrituraDoble extends PuertoEscrituraCrm {
  contactos = new Map<string, NuevoContacto & { id: string }>();
  oportunidades: NuevaOportunidad[] = [];
  asesores = new Set<string>([ACTOR]);
  paquetes = new Set<string>();
  etapa: { id: string } | null = { id: 'etapa-lead' };

  private aContacto(c: NuevoContacto & { id: string }): Contacto {
    return {
      id: c.id,
      nombre: c.nombre,
      telefono: c.telefonoE164,
      correo: c.correo,
      etiquetas: c.etiquetas,
      preferencias: c.preferencias,
      consentimientos: [],
      creadoEn: '2026-10-27T00:00:00.000Z',
      ultimoContactoEn: null,
    };
  }

  crearContacto(d: NuevoContacto): Promise<Contacto> {
    for (const c of this.contactos.values()) {
      if (c.telefonoE164 === d.telefonoE164) {
        return Promise.reject(new TelefonoYaRegistradoError(d.telefonoE164));
      }
    }
    const c = { ...d, id: `c-${this.contactos.size + 1}` };
    this.contactos.set(c.id, c);
    return Promise.resolve(this.aContacto(c));
  }

  editarContacto(id: string, cambios: CambiosDeContacto): Promise<Contacto | null> {
    const c = this.contactos.get(id);
    if (!c) return Promise.resolve(null);
    const nuevo = { ...c, ...cambios };
    this.contactos.set(id, nuevo);
    return Promise.resolve(this.aContacto(nuevo));
  }

  existeContacto = (id: string) => Promise.resolve(id === CONTACTO || this.contactos.has(id));
  existeAsesor = (id: string) => Promise.resolve(this.asesores.has(id));
  existePaquete = (id: string) => Promise.resolve(this.paquetes.has(id));
  etapaInicial = () => Promise.resolve(this.etapa);

  crearOportunidad(d: NuevaOportunidad): Promise<Oportunidad> {
    this.oportunidades.push(d);
    return Promise.resolve({ id: 'o-1' } as unknown as Oportunidad);
  }
}

class ConversacionesDoble extends PuertoConversacionesVisibles {
  conversacion: ConversacionParaCrm | null = {
    id: CONVERSACION,
    contactoId: CONTACTO,
    asignadoAId: null,
  };
  resolver = () => Promise.resolve(this.conversacion);
}

describe('GestionarContactos', () => {
  let escritura: EscrituraDoble;
  let uc: GestionarContactos;
  beforeEach(() => {
    escritura = new EscrituraDoble();
    uc = new GestionarContactos(escritura);
  });

  it('normaliza el teléfono a E.164 y quita etiquetas repetidas', async () => {
    const c = await uc.crear(
      { telefono: '0057 (300) 123-4567', etiquetas: ['VIP', 'vip', 'Luna de miel'] },
      ACTOR,
    );
    expect(c.telefono).toBe('+573001234567');
    expect(c.etiquetas).toEqual(['VIP', 'Luna de miel']);
  });

  it('rechaza un teléfono sin código de país', async () => {
    await expect(uc.crear({ telefono: '3001234567', etiquetas: [] }, ACTOR)).rejects.toBeInstanceOf(
      TelefonoInvalidoError,
    );
  });

  it('el mismo número escrito de otra forma es duplicado, no un contacto nuevo', async () => {
    await uc.crear({ telefono: '+57 300 123 4567', etiquetas: [] }, ACTOR);
    await expect(
      uc.crear({ telefono: '+573001234567', etiquetas: [] }, ACTOR),
    ).rejects.toBeInstanceOf(TelefonoYaRegistradoError);
  });

  it('editar: solo cambia lo que viene, y null borra', async () => {
    const c = await uc.crear(
      { telefono: '+573001234567', nombre: 'Ana', correo: 'a@x.co', etiquetas: [] },
      ACTOR,
    );
    const e = await uc.editar(c.id, { nombre: 'Ana María', correo: null }, ACTOR);
    expect(e.nombre).toBe('Ana María');
    expect(e.correo).toBeNull();
    expect(e.telefono).toBe('+573001234567');
  });

  it('editar el teléfono lo normaliza', async () => {
    const c = await uc.crear({ telefono: '+573001234567', etiquetas: [] }, ACTOR);
    const e = await uc.editar(c.id, { telefono: '+57 311 000 0000' }, ACTOR);
    expect(e.telefono).toBe('+573110000000');
  });

  it('editar un contacto inexistente: 404 tipado', async () => {
    await expect(uc.editar('nada', { nombre: 'X' }, ACTOR)).rejects.toBeInstanceOf(
      ContactoNoEncontradoError,
    );
  });
});

describe('CrearOportunidadUseCase', () => {
  let escritura: EscrituraDoble;
  let conversaciones: ConversacionesDoble;
  let uc: CrearOportunidadUseCase;
  beforeEach(() => {
    escritura = new EscrituraDoble();
    conversaciones = new ConversacionesDoble();
    uc = new CrearOportunidadUseCase(escritura, conversaciones);
  });

  it('desde una conversación toma el contacto de ella, la etapa inicial y asigna a quien la crea', async () => {
    await uc.paraConversacion(CONVERSACION, { titulo: 'San Andrés familia' }, ACTOR);
    expect(escritura.oportunidades[0]).toMatchObject({
      contactoId: CONTACTO,
      etapaId: 'etapa-lead',
      asesorId: ACTOR,
      creadoPorId: ACTOR,
    });
  });

  it('hereda al asesor de la conversación asignada', async () => {
    const otro = '22222222-2222-4222-8222-222222222222';
    escritura.asesores.add(otro);
    conversaciones.conversacion = { id: CONVERSACION, contactoId: CONTACTO, asignadoAId: otro };
    await uc.paraConversacion(CONVERSACION, { titulo: 'X' }, ACTOR);
    expect(escritura.oportunidades[0]?.asesorId).toBe(otro);
  });

  it('conversación que no se ve: 404 y no escribe', async () => {
    conversaciones.conversacion = null;
    await expect(uc.paraConversacion(CONVERSACION, { titulo: 'X' }, ACTOR)).rejects.toBeInstanceOf(
      ConversacionNoEncontradaError,
    );
    expect(escritura.oportunidades).toHaveLength(0);
  });

  it('sobre un contacto que no existe: 404', async () => {
    await expect(
      uc.paraContacto({ contactoId: '99999999-9999-4999-8999-999999999999', titulo: 'X' }, ACTOR),
    ).rejects.toBeInstanceOf(ContactoNoEncontradoError);
  });

  it('asesor o paquete de otra agencia (no existen aquí): error tipado', async () => {
    await expect(
      uc.paraContacto(
        { contactoId: CONTACTO, titulo: 'X', asesorId: '22222222-2222-4222-8222-222222222222' },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(AsesorNoEncontradoError);
    await expect(
      uc.paraContacto(
        { contactoId: CONTACTO, titulo: 'X', paqueteId: '66666666-6666-4666-8666-666666666666' },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(PaqueteNoEncontradoError);
  });

  it('sin etapa inicial configurada: error tipado', async () => {
    escritura.etapa = null;
    await expect(
      uc.paraContacto({ contactoId: CONTACTO, titulo: 'X' }, ACTOR),
    ).rejects.toBeInstanceOf(SinEtapaInicialError);
  });

  it('valida el valor estimado con Money (R8)', async () => {
    await uc.paraContacto(
      { contactoId: CONTACTO, titulo: 'X', valorEstimado: { unidades: '5000000', moneda: 'COP' } },
      ACTOR,
    );
    expect(escritura.oportunidades[0]?.valorEstimado).toEqual({
      unidades: '5000000',
      moneda: 'COP',
    });
    // Una moneda fuera de la lista no pasa aunque el esquema Zod la dejara pasar.
    await expect(
      uc.paraContacto(
        {
          contactoId: CONTACTO,
          titulo: 'X',
          valorEstimado: { unidades: '1', moneda: 'XXX' as 'COP' },
        },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(MonedaInvalidaError);
  });
});
