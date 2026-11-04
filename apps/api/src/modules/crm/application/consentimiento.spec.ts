import { describe, expect, it } from 'vitest';
import type { Contacto } from '@viajapro/contracts';
import { ContactoNoEncontradoError } from '../domain/errors.js';
import { GestionarContactos } from './gestionar-contactos.js';
import { PuertoEscrituraCrm, type NuevoConsentimiento } from './puerto-escritura-crm.js';

const CONTACTO = {
  id: '11111111-1111-4111-8111-111111111111',
  consentimientos: [],
} as unknown as Contacto;

class EscrituraDoble extends PuertoEscrituraCrm {
  existe = true;
  otorgado: NuevoConsentimiento | null = null;
  revocada: string | null = null;
  otorgarConsentimiento = (_id: string, d: NuevoConsentimiento) => {
    this.otorgado = d;
    return Promise.resolve(this.existe ? CONTACTO : null);
  };
  revocarConsentimiento = (_id: string, f: string) => {
    this.revocada = f;
    return Promise.resolve(this.existe ? CONTACTO : null);
  };
  crearContacto = () => Promise.reject(new Error('no se usa'));
  editarContacto = () => Promise.reject(new Error('no se usa'));
  existeContacto = () => Promise.resolve(true);
  existeAsesor = () => Promise.resolve(true);
  existePaquete = () => Promise.resolve(true);
  etapaInicial = () => Promise.resolve(null);
  crearOportunidad = () => Promise.reject(new Error('no se usa'));
}

const entrada = {
  finalidad: 'TRANSACCIONAL' as const,
  canal: 'whatsapp',
  prueba: 'whatsapp:wamid.1',
  textoMostrado: 'Autorizo el tratamiento de mis datos.',
  versionAviso: 'v1',
};

describe('consentimiento del contacto (T-096)', () => {
  it('otorgar pasa la prueba completa y quién lo registró', async () => {
    const escritura = new EscrituraDoble();
    await new GestionarContactos(escritura).otorgarConsentimiento(CONTACTO.id, entrada, 'u1');
    expect(escritura.otorgado).toEqual({ ...entrada, registradoPorId: 'u1' });
  });

  it('revocar delega la finalidad', async () => {
    const escritura = new EscrituraDoble();
    await new GestionarContactos(escritura).revocarConsentimiento(CONTACTO.id, {
      finalidad: 'PROMOCIONAL',
    });
    expect(escritura.revocada).toBe('PROMOCIONAL');
  });

  it('un contacto que no es de esta agencia es ContactoNoEncontradoError', async () => {
    const escritura = new EscrituraDoble();
    escritura.existe = false;
    const uc = new GestionarContactos(escritura);
    await expect(uc.otorgarConsentimiento(CONTACTO.id, entrada, null)).rejects.toBeInstanceOf(
      ContactoNoEncontradoError,
    );
    await expect(
      uc.revocarConsentimiento(CONTACTO.id, { finalidad: 'TRANSACCIONAL' }),
    ).rejects.toBeInstanceOf(ContactoNoEncontradoError);
  });
});
