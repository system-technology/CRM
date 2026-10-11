/**
 * Pruebas del caso de uso que heredó la regla de pérdida.
 *
 * Lo que se comprueba no es que la regla funcione —eso está en `regla-de-perdida.spec.ts`— sino
 * que este caso de uso la aplique **antes de escribir**, y en el orden correcto.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { Contacto, EtapaDefinida, FichaDeContacto, Oportunidad } from '@viajapro/contracts';
import { MoverOportunidadUseCase } from './mover-oportunidad.js';
import { PuertoCrm, type EtapaResumida, type MovimientoDeOportunidad } from './puerto-crm.js';

const VIVA: EtapaResumida = { id: 'e-viva', nombre: 'En negociación', esPerdida: false };
const PERDIDA: EtapaResumida = { id: 'e-perdida', nombre: 'Se fue con otra', esPerdida: true };

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
  tableroPorEtapa(): Promise<
    Map<string, { total: number; valorUnidades: bigint | null; oportunidades: Oportunidad[] }>
  > {
    return Promise.resolve(
      new Map<
        string,
        { total: number; valorUnidades: bigint | null; oportunidades: Oportunidad[] }
      >(),
    );
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

describe('MoverOportunidadUseCase', () => {
  let puerto: PuertoEspia;
  let caso: MoverOportunidadUseCase;

  beforeEach(() => {
    puerto = new PuertoEspia();
    caso = new MoverOportunidadUseCase(puerto);
  });

  it('mueve a una etapa viva sin motivo', async () => {
    await caso.ejecutar('o-1', { etapaId: VIVA.id, motivoPerdida: null, notaPerdida: null });
    expect(puerto.escrituras).toHaveLength(1);
  });

  it('NO escribe si mueve a pérdida sin motivo', async () => {
    // La aserción que importa: ni una escritura. Validar después de escribir sería dejar la
    // oportunidad perdida y sin motivo, que es el estado que la regla existe para impedir.
    await expect(
      caso.ejecutar('o-1', { etapaId: PERDIDA.id, motivoPerdida: null, notaPerdida: null }),
    ).rejects.toThrow(/motivo/i);
    expect(puerto.escrituras).toHaveLength(0);
  });

  it('mueve a pérdida con motivo', async () => {
    await caso.ejecutar('o-1', {
      etapaId: PERDIDA.id,
      motivoPerdida: 'PRECIO',
      notaPerdida: null,
    });
    expect(puerto.escrituras[0]?.motivoPerdida).toBe('PRECIO');
  });

  it('NO escribe si lleva motivo a una etapa viva', async () => {
    await expect(
      caso.ejecutar('o-1', { etapaId: VIVA.id, motivoPerdida: 'PRECIO', notaPerdida: null }),
    ).rejects.toThrow();
    expect(puerto.escrituras).toHaveLength(0);
  });

  it('juzga por esPerdida, no por el nombre ni por la clave', async () => {
    // «Se fue con otra» no es ninguna clave canónica y aun así exige motivo.
    await expect(
      caso.ejecutar('o-1', { etapaId: PERDIDA.id, motivoPerdida: null, notaPerdida: null }),
    ).rejects.toThrow(/Se fue con otra/);
  });

  it('una etapa de otra agencia no existe, y se dice así', async () => {
    // Con RLS puesto, el id de otra agencia simplemente no se ve. El error no debe insinuar
    // que existe en algún sitio.
    await expect(
      caso.ejecutar('o-1', { etapaId: 'e-de-otra', motivoPerdida: null, notaPerdida: null }),
    ).rejects.toThrow(/ETAPA_NO_ENCONTRADA|No existe la etapa/);
    expect(puerto.escrituras).toHaveLength(0);
  });

  it('comprueba la etapa ANTES de juzgar el motivo', async () => {
    // Si se juzgara primero el motivo, un id inexistente con motivo daría «motivo sobrante»,
    // que manda a buscar el problema al sitio equivocado.
    await expect(
      caso.ejecutar('o-1', { etapaId: 'e-de-otra', motivoPerdida: 'PRECIO', notaPerdida: null }),
    ).rejects.toThrow(/No existe la etapa/);
  });

  it('no busca la etapa si la oportunidad no existe', async () => {
    puerto.oportunidad = null;
    await expect(
      caso.ejecutar('o-404', { etapaId: VIVA.id, motivoPerdida: null, notaPerdida: null }),
    ).rejects.toThrow(/No existe la oportunidad/);
    expect(puerto.escrituras).toHaveLength(0);
  });
});
