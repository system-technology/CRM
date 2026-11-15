/**
 * Pruebas del caso de uso que heredó la regla de pérdida.
 *
 * Lo que se comprueba no es que la regla funcione —eso está en `regla-de-perdida.spec.ts`— sino
 * que este caso de uso la aplique **antes de escribir**, y en el orden correcto.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type {
  Contacto,
  EtapaDefinida,
  FichaDeContacto,
  MotivoDePerdida,
  Oportunidad,
} from '@viajapro/contracts';
import {
  MotivoDePerdidaContradictorioError,
  MotivoDePerdidaInactivoError,
  MotivoDePerdidaNoEncontradoError,
  MotivoEnEtapaViva,
  NotaDePerdidaObligatoriaError,
} from '../domain/errors.js';
import { PuertoMotivosDePerdida } from './puerto-motivos-de-perdida.js';
import { MoverOportunidadUseCase } from './mover-oportunidad.js';
import {
  PuertoCrm,
  type EtapaResumida,
  type MovimientoDeOportunidad,
  type TotalesDeEtapa,
} from './puerto-crm.js';

const VIVA: EtapaResumida = { id: 'e-viva', nombre: 'En negociación', esPerdida: false };
const PERDIDA: EtapaResumida = { id: 'e-perdida', nombre: 'Se fue con otra', esPerdida: true };

const ACTOR = 'u-asesora';

const OPORTUNIDAD = {
  id: 'o-1',
  etapa: { id: 'e-viva', nombre: 'En negociación' } as unknown as EtapaDefinida,
} as unknown as Oportunidad;

class PuertoEspia extends PuertoCrm {
  escrituras: MovimientoDeOportunidad[] = [];
  etapas = new Map<string, EtapaResumida>([
    [VIVA.id, VIVA],
    [PERDIDA.id, PERDIDA],
  ]);
  oportunidad: Oportunidad | null = OPORTUNIDAD;

  listarEtapas(): Promise<EtapaDefinida[]> {
    return Promise.resolve([]);
  }
  tableroPorEtapa(): Promise<Map<string, TotalesDeEtapa>> {
    return Promise.resolve(new Map<string, TotalesDeEtapa>());
  }
  buscarEtapa(id: string): Promise<EtapaResumida | null> {
    return Promise.resolve(this.etapas.get(id) ?? null);
  }
  buscarOportunidad(): Promise<Oportunidad | null> {
    return Promise.resolve(this.oportunidad);
  }
  moverOportunidad(m: MovimientoDeOportunidad): Promise<Oportunidad> {
    this.escrituras.push(m);
    return Promise.resolve(OPORTUNIDAD);
  }
  fichaDeContacto(): Promise<FichaDeContacto | null> {
    return Promise.resolve(null);
  }
  listarContactos(): Promise<Contacto[]> {
    return Promise.resolve([]);
  }
}

class MotivosEspia extends PuertoMotivosDePerdida {
  fijos = new Map<string, MotivoDePerdida>();
  listar(): Promise<MotivoDePerdida[]> {
    return Promise.resolve([...this.fijos.values()]);
  }
  buscar(id: string): Promise<MotivoDePerdida | null> {
    return Promise.resolve(this.fijos.get(id) ?? null);
  }
  crear(): Promise<MotivoDePerdida> {
    return Promise.reject(new Error('no se usa'));
  }
  actualizar(): Promise<MotivoDePerdida | null> {
    return Promise.resolve(null);
  }
}

const motivo = (p: Partial<MotivoDePerdida> & { id: string }): MotivoDePerdida => ({
  clave: null,
  etiqueta: 'X',
  orden: 0,
  activo: true,
  exigeNota: false,
  ...p,
});

describe('MoverOportunidadUseCase', () => {
  let puerto: PuertoEspia;
  let caso: MoverOportunidadUseCase;
  let motivos: MotivosEspia;

  beforeEach(() => {
    puerto = new PuertoEspia();
    motivos = new MotivosEspia();
    caso = new MoverOportunidadUseCase(puerto, motivos);
  });

  it('mueve a una etapa viva sin motivo', async () => {
    await caso.ejecutar('o-1', { etapaId: VIVA.id, motivoPerdida: null, notaPerdida: null }, ACTOR);
    expect(puerto.escrituras).toHaveLength(1);
  });

  it('NO escribe si mueve a pérdida sin motivo', async () => {
    // La aserción que importa: ni una escritura. Validar después de escribir sería dejar la
    // oportunidad perdida y sin motivo, que es el estado que la regla existe para impedir.
    await expect(
      caso.ejecutar('o-1', { etapaId: PERDIDA.id, motivoPerdida: null, notaPerdida: null }, ACTOR),
    ).rejects.toThrow(/motivo/i);
    expect(puerto.escrituras).toHaveLength(0);
  });

  it('mueve a pérdida con motivo', async () => {
    await caso.ejecutar(
      'o-1',
      {
        etapaId: PERDIDA.id,
        motivoPerdida: 'PRECIO',
        notaPerdida: null,
      },
      ACTOR,
    );
    expect(puerto.escrituras[0]?.motivoPerdida).toBe('PRECIO');
  });

  it('pasa al puerto QUIÉN mueve, para el historial de etapas (T-131)', async () => {
    await caso.ejecutar('o-1', { etapaId: VIVA.id, motivoPerdida: null, notaPerdida: null }, ACTOR);
    await caso.ejecutar('o-1', { etapaId: VIVA.id, motivoPerdida: null, notaPerdida: null }, null);
    expect(puerto.escrituras.map((e) => e.actorId)).toEqual([ACTOR, null]);
  });

  it('NO escribe si lleva motivo a una etapa viva', async () => {
    await expect(
      caso.ejecutar('o-1', { etapaId: VIVA.id, motivoPerdida: 'PRECIO', notaPerdida: null }, ACTOR),
    ).rejects.toThrow();
    expect(puerto.escrituras).toHaveLength(0);
  });

  it('juzga por esPerdida, no por el nombre ni por la clave', async () => {
    // «Se fue con otra» no es ninguna clave canónica y aun así exige motivo.
    await expect(
      caso.ejecutar('o-1', { etapaId: PERDIDA.id, motivoPerdida: null, notaPerdida: null }, ACTOR),
    ).rejects.toThrow(/Se fue con otra/);
  });

  it('una etapa de otra agencia no existe, y se dice así', async () => {
    // Con RLS puesto, el id de otra agencia simplemente no se ve. El error no debe insinuar
    // que existe en algún sitio.
    await expect(
      caso.ejecutar('o-1', { etapaId: 'e-de-otra', motivoPerdida: null, notaPerdida: null }, ACTOR),
    ).rejects.toThrow(/ETAPA_NO_ENCONTRADA|No existe la etapa/);
    expect(puerto.escrituras).toHaveLength(0);
  });

  it('comprueba la etapa ANTES de juzgar el motivo', async () => {
    // Si se juzgara primero el motivo, un id inexistente con motivo daría «motivo sobrante»,
    // que manda a buscar el problema al sitio equivocado.
    await expect(
      caso.ejecutar(
        'o-1',
        { etapaId: 'e-de-otra', motivoPerdida: 'PRECIO', notaPerdida: null },
        ACTOR,
      ),
    ).rejects.toThrow(/No existe la etapa/);
  });

  it('no busca la etapa si la oportunidad no existe', async () => {
    puerto.oportunidad = null;
    await expect(
      caso.ejecutar('o-404', { etapaId: VIVA.id, motivoPerdida: null, notaPerdida: null }, ACTOR),
    ).rejects.toThrow(/No existe la oportunidad/);
    expect(puerto.escrituras).toHaveLength(0);
  });

  describe('motivoPerdidaId (T-229)', () => {
    const cierre = (extra: Record<string, unknown>) => ({
      etapaId: PERDIDA.id,
      motivoPerdida: null,
      notaPerdida: null,
      ...extra,
    });

    it('con el id de un motivo de sistema, deriva el enum de su clave', async () => {
      motivos.fijos.set('m-1', motivo({ id: 'm-1', clave: 'PRECIO' }));
      await caso.ejecutar('o-1', cierre({ motivoPerdidaId: 'm-1' }), ACTOR);
      expect(puerto.escrituras[0]).toMatchObject({
        motivoPerdida: 'PRECIO',
        motivoPerdidaId: 'm-1',
      });
    });

    it('un id que no es de esta agencia es MOTIVO_DE_PERDIDA_NO_ENCONTRADO y no escribe', async () => {
      await expect(
        caso.ejecutar('o-1', cierre({ motivoPerdidaId: 'm-de-otra' }), ACTOR),
      ).rejects.toBeInstanceOf(MotivoDePerdidaNoEncontradoError);
      expect(puerto.escrituras).toHaveLength(0);
    });

    it('un motivo desactivado no se elige', async () => {
      motivos.fijos.set('m-1', motivo({ id: 'm-1', clave: 'PRECIO', activo: false }));
      await expect(
        caso.ejecutar('o-1', cierre({ motivoPerdidaId: 'm-1' }), ACTOR),
      ).rejects.toBeInstanceOf(MotivoDePerdidaInactivoError);
    });

    it('si exige nota y no llega, falla; con nota pasa', async () => {
      motivos.fijos.set('m-1', motivo({ id: 'm-1', clave: 'PRECIO', exigeNota: true }));
      await expect(
        caso.ejecutar('o-1', cierre({ motivoPerdidaId: 'm-1', notaPerdida: '  ' }), ACTOR),
      ).rejects.toBeInstanceOf(NotaDePerdidaObligatoriaError);
      await caso.ejecutar('o-1', cierre({ motivoPerdidaId: 'm-1', notaPerdida: 'Caro' }), ACTOR);
      expect(puerto.escrituras).toHaveLength(1);
    });

    it('enum e id contradictorios se rechazan', async () => {
      motivos.fijos.set('m-1', motivo({ id: 'm-1', clave: 'PRECIO' }));
      await expect(
        caso.ejecutar('o-1', cierre({ motivoPerdidaId: 'm-1', motivoPerdida: 'OTRO' }), ACTOR),
      ).rejects.toBeInstanceOf(MotivoDePerdidaContradictorioError);
    });

    it('un motivo propio (sin clave) pasa con enum OTRO, su id y su nota', async () => {
      motivos.fijos.set('m-1', motivo({ id: 'm-1', clave: null, etiqueta: 'Visa negada' }));
      await caso.ejecutar(
        'o-1',
        cierre({ motivoPerdidaId: 'm-1', notaPerdida: 'Consulado negó la visa' }),
        ACTOR,
      );
      expect(puerto.escrituras[0]).toMatchObject({
        motivoPerdida: 'OTRO',
        motivoPerdidaId: 'm-1',
        notaPerdida: 'Consulado negó la visa',
      });
    });

    it('un motivo propio sin nota falla aunque no la exija: se guarda como OTRO', async () => {
      motivos.fijos.set('m-1', motivo({ id: 'm-1', clave: null, etiqueta: 'Visa negada' }));
      await expect(
        caso.ejecutar('o-1', cierre({ motivoPerdidaId: 'm-1' }), ACTOR),
      ).rejects.toBeInstanceOf(NotaDePerdidaObligatoriaError);
      expect(puerto.escrituras).toHaveLength(0);
    });

    it('un motivo propio con el enum OTRO al lado no es contradictorio; con otro enum sí', async () => {
      motivos.fijos.set('m-1', motivo({ id: 'm-1', clave: null, etiqueta: 'Visa negada' }));
      await caso.ejecutar(
        'o-1',
        cierre({ motivoPerdidaId: 'm-1', motivoPerdida: 'OTRO', notaPerdida: 'Visa negada' }),
        ACTOR,
      );
      expect(puerto.escrituras).toHaveLength(1);
      await expect(
        caso.ejecutar('o-1', cierre({ motivoPerdidaId: 'm-1', motivoPerdida: 'PRECIO' }), ACTOR),
      ).rejects.toBeInstanceOf(MotivoDePerdidaContradictorioError);
    });

    it('un motivo propio que exige nota, sin nota, falla', async () => {
      motivos.fijos.set(
        'm-1',
        motivo({ id: 'm-1', clave: null, etiqueta: 'Visa negada', exigeNota: true }),
      );
      await expect(
        caso.ejecutar('o-1', cierre({ motivoPerdidaId: 'm-1' }), ACTOR),
      ).rejects.toBeInstanceOf(NotaDePerdidaObligatoriaError);
      expect(puerto.escrituras).toHaveLength(0);
    });

    it('un id de motivo hacia una etapa viva es MOTIVO_EN_ETAPA_VIVA', async () => {
      motivos.fijos.set('m-1', motivo({ id: 'm-1', clave: 'PRECIO' }));
      await expect(
        caso.ejecutar('o-1', cierre({ etapaId: VIVA.id, motivoPerdidaId: 'm-1' }), ACTOR),
      ).rejects.toBeInstanceOf(MotivoEnEtapaViva);
    });
  });
});
