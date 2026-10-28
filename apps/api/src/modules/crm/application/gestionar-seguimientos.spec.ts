import { beforeEach, describe, expect, it } from 'vitest';
import type { Oportunidad } from '@viajapro/contracts';
import {
  type ConversacionParaCrm,
  PuertoConversacionesVisibles,
} from '../../../shared/puertos/puertos-hacia-inbox.js';
import {
  ConversacionNoEncontradaError,
  OportunidadNoEncontradaError,
  SeguimientoNoEncontradoError,
  SeguimientoYaCompletadoError,
} from '../domain/errors.js';
import { SeguimientosEnMemoria } from '../infrastructure/seguimientos-en-memoria.js';
import { GestionarSeguimientos } from './gestionar-seguimientos.js';
import { PuertoCrm } from './puerto-crm.js';

const ACTOR = '11111111-1111-4111-8111-111111111111';
const OTRO = '22222222-2222-4222-8222-222222222222';
const OPORTUNIDAD_ID = '33333333-3333-4333-8333-333333333333';
const CONVERSACION_ID = '44444444-4444-4444-8444-444444444444';

class CrmDoble extends PuertoCrm {
  oportunidad: Oportunidad | null = {
    id: OPORTUNIDAD_ID,
    asesorId: OTRO,
  } as unknown as Oportunidad;
  listarEtapas = () => Promise.resolve([]);
  tableroPorEtapa = () => Promise.resolve(new Map());
  buscarEtapa = () => Promise.resolve(null);
  buscarOportunidad = () => Promise.resolve(this.oportunidad);
  moverOportunidad = (): Promise<Oportunidad> => Promise.reject(new Error('no se usa'));
  fichaDeContacto = () => Promise.resolve(null);
  listarContactos = () => Promise.resolve([]);
}

class ConversacionesDoble extends PuertoConversacionesVisibles {
  conversacion: ConversacionParaCrm | null = {
    id: CONVERSACION_ID,
    contactoId: '55555555-5555-4555-8555-555555555555',
    asignadoAId: null,
  };
  resolver = () => Promise.resolve(this.conversacion);
}

describe('GestionarSeguimientos', () => {
  let seguimientos: SeguimientosEnMemoria;
  let crm: CrmDoble;
  let conversaciones: ConversacionesDoble;
  let uc: GestionarSeguimientos;

  beforeEach(() => {
    seguimientos = new SeguimientosEnMemoria();
    crm = new CrmDoble();
    conversaciones = new ConversacionesDoble();
    uc = new GestionarSeguimientos(seguimientos, crm, conversaciones);
  });

  describe('crear', () => {
    it('sobre una oportunidad toma al asesor de la oportunidad', async () => {
      const s = await uc.crear(
        {
          descripcion: 'Llamar',
          venceEn: '2026-10-28T15:00:00.000Z',
          oportunidadId: OPORTUNIDAD_ID,
        },
        ACTOR,
      );
      expect(s.asesorId).toBe(OTRO);
      expect(s.oportunidadId).toBe(OPORTUNIDAD_ID);
      expect(s.completadoEn).toBeNull();
    });

    it('si la oportunidad no tiene asesor, queda para quien lo crea', async () => {
      crm.oportunidad = { id: OPORTUNIDAD_ID, asesorId: null } as unknown as Oportunidad;
      const s = await uc.crear(
        {
          descripcion: 'Llamar',
          venceEn: '2026-10-28T15:00:00.000Z',
          oportunidadId: OPORTUNIDAD_ID,
        },
        ACTOR,
      );
      expect(s.asesorId).toBe(ACTOR);
    });

    it('sobre una conversación guarda el contacto de la conversación', async () => {
      const s = await uc.crear(
        {
          descripcion: 'Escribir',
          venceEn: '2026-10-28T15:00:00.000Z',
          conversacionId: CONVERSACION_ID,
        },
        ACTOR,
      );
      expect(s.conversacionId).toBe(CONVERSACION_ID);
      expect(s.contactoId).toBe('55555555-5555-4555-8555-555555555555');
      expect(s.asesorId).toBe(ACTOR);
    });

    it('oportunidad inexistente: 404 tipado y no escribe nada', async () => {
      crm.oportunidad = null;
      await expect(
        uc.crear(
          { descripcion: 'x', venceEn: '2026-10-28T15:00:00.000Z', oportunidadId: OPORTUNIDAD_ID },
          ACTOR,
        ),
      ).rejects.toBeInstanceOf(OportunidadNoEncontradaError);
      expect(seguimientos.filas.size).toBe(0);
    });

    it('conversación que no se ve: 404 tipado', async () => {
      conversaciones.conversacion = null;
      await expect(
        uc.crear(
          {
            descripcion: 'x',
            venceEn: '2026-10-28T15:00:00.000Z',
            conversacionId: CONVERSACION_ID,
          },
          ACTOR,
        ),
      ).rejects.toBeInstanceOf(ConversacionNoEncontradaError);
    });
  });

  describe('completar', () => {
    it('marca la fecha y no se puede completar dos veces', async () => {
      const s = await uc.crear(
        {
          descripcion: 'Llamar',
          venceEn: '2026-10-28T15:00:00.000Z',
          oportunidadId: OPORTUNIDAD_ID,
        },
        ACTOR,
      );
      const ahora = new Date('2026-10-28T16:00:00.000Z');
      const hecho = await uc.completar(s.id, ahora);
      expect(hecho.completadoEn).toBe(ahora.toISOString());
      await expect(uc.completar(s.id, ahora)).rejects.toBeInstanceOf(SeguimientoYaCompletadoError);
    });

    it('inexistente: 404 tipado', async () => {
      await expect(uc.completar('nada', new Date())).rejects.toBeInstanceOf(
        SeguimientoNoEncontradoError,
      );
    });
  });

  describe('listar', () => {
    it('«yo» se resuelve al usuario en sesión y filtra por asesor y estado', async () => {
      crm.oportunidad = { id: OPORTUNIDAD_ID, asesorId: ACTOR } as unknown as Oportunidad;
      const mio = await uc.crear(
        { descripcion: 'mío', venceEn: '2026-10-28T15:00:00.000Z', oportunidadId: OPORTUNIDAD_ID },
        ACTOR,
      );
      crm.oportunidad = { id: OPORTUNIDAD_ID, asesorId: OTRO } as unknown as Oportunidad;
      await uc.crear(
        {
          descripcion: 'ajeno',
          venceEn: '2026-10-28T15:00:00.000Z',
          oportunidadId: OPORTUNIDAD_ID,
        },
        ACTOR,
      );

      const lista = await uc.listar({ asesorId: 'yo', estado: 'PENDIENTE' }, ACTOR);
      expect(lista.map((s) => s.id)).toEqual([mio.id]);

      await uc.completar(mio.id, new Date());
      expect(await uc.listar({ asesorId: 'yo', estado: 'PENDIENTE' }, ACTOR)).toHaveLength(0);
      expect(await uc.listar({ asesorId: 'yo', estado: 'COMPLETADO' }, ACTOR)).toHaveLength(1);
    });
  });

  describe('pendientesDelDia', () => {
    it('separa vencidos de hoy, deja fuera mañana y completados, en la zona de la agencia', async () => {
      crm.oportunidad = { id: OPORTUNIDAD_ID, asesorId: ACTOR } as unknown as Oportunidad;
      // «Ahora» = 2026-10-27 15:00 en Bogotá (20:00Z). Hoy local = [05:00Z del 27, 05:00Z del 28).
      const ahora = new Date('2026-10-27T20:00:00.000Z');
      const mk = (descripcion: string, venceEn: string) =>
        uc.crear({ descripcion, venceEn, oportunidadId: OPORTUNIDAD_ID }, ACTOR);

      await mk('ayer', '2026-10-26T20:00:00.000Z');
      // 02:00Z del 27 son las 21:00 del 26 en Bogotá: sigue siendo AYER, no hoy.
      await mk('anoche', '2026-10-27T02:00:00.000Z');
      await mk('hoy temprano', '2026-10-27T13:00:00.000Z');
      await mk('hoy tarde', '2026-10-28T03:00:00.000Z'); // 22:00 del 27 local
      await mk('mañana', '2026-10-28T05:00:00.000Z'); // 00:00 del 28 local
      const hecho = await mk('ya hecho', '2026-10-27T14:00:00.000Z');
      await uc.completar(hecho.id, ahora);

      const r = await uc.pendientesDelDia(ACTOR, ahora);
      expect(r.fecha).toBe('2026-10-27');
      expect(r.vencidos.map((s) => s.descripcion)).toEqual(['ayer', 'anoche']);
      expect(r.deHoy.map((s) => s.descripcion)).toEqual(['hoy temprano', 'hoy tarde']);
    });

    it('solo trae los del asesor pedido', async () => {
      await uc.crear(
        {
          descripcion: 'de otro',
          venceEn: '2026-10-27T13:00:00.000Z',
          oportunidadId: OPORTUNIDAD_ID,
        },
        ACTOR,
      );
      const r = await uc.pendientesDelDia(ACTOR, new Date('2026-10-27T20:00:00.000Z'));
      expect(r.vencidos).toHaveLength(0);
      expect(r.deHoy).toHaveLength(0);
    });
  });
});
