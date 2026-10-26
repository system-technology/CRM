import { describe, expect, it } from 'vitest';
import {
  decidirSiSePuedeRegistrarElCanalDePrueba,
  type EntradaGuardiaDeCanalDePrueba,
} from './guardia-de-canal-de-prueba.js';

const PN = '1468816839639661';
const WABA = '1152989873960143';

const base: EntradaGuardiaDeCanalDePrueba = {
  appEnv: 'local',
  anfitrion: 'localhost',
  permitirRemoto: undefined,
  phoneNumberId: PN,
  wabaId: WABA,
  agenciasAjenas: 0,
};
const decidir = (parcial: Partial<EntradaGuardiaDeCanalDePrueba>) =>
  decidirSiSePuedeRegistrarElCanalDePrueba({ ...base, ...parcial });

function motivoDe(parcial: Partial<EntradaGuardiaDeCanalDePrueba>): string {
  const d = decidir(parcial);
  if (d.permitido) throw new Error('se esperaba una negativa');
  return d.motivo;
}

describe('guardia del canal de prueba', () => {
  it('permite en local', () => {
    expect(decidir({})).toEqual({ permitido: true, remoto: false });
    expect(decidir({ anfitrion: '127.0.0.1' })).toEqual({ permitido: true, remoto: false });
  });

  it('niega si APP_ENV no es local, aunque el anfitrión lo sea', () => {
    expect(motivoDe({ appEnv: 'dev' })).toContain('APP_ENV=local');
    expect(motivoDe({ appEnv: undefined })).toContain('APP_ENV=local');
  });

  it('niega en remoto sin opt-in exacto', () => {
    const remoto = { anfitrion: 'ep-x.neon.tech' };
    expect(motivoDe(remoto)).toContain('CANAL_PRUEBA_PERMITIR_REMOTO=si');
    expect(motivoDe({ ...remoto, permitirRemoto: 'true' })).toContain(
      'CANAL_PRUEBA_PERMITIR_REMOTO',
    );
    expect(motivoDe({ ...remoto, permitirRemoto: 'SI' })).toContain('CANAL_PRUEBA_PERMITIR_REMOTO');
  });

  it('niega en remoto con opt-in si hay agencias ajenas, y dice cuántas', () => {
    const m = motivoDe({ anfitrion: 'ep-x.neon.tech', permitirRemoto: 'si', agenciasAjenas: 3 });
    expect(m).toContain('3 agencia(s)');
  });

  it('permite en remoto con opt-in y solo la agencia de la semilla', () => {
    expect(decidir({ anfitrion: 'ep-x.neon.tech', permitirRemoto: 'si' })).toEqual({
      permitido: true,
      remoto: true,
    });
  });

  it('niega IDs faltantes o no numéricos, nombrando la variable', () => {
    expect(motivoDe({ phoneNumberId: undefined })).toContain('META_PHONE_NUMBER_ID_PRUEBA');
    expect(motivoDe({ phoneNumberId: '' })).toContain('Falta META_PHONE_NUMBER_ID_PRUEBA');
    expect(motivoDe({ wabaId: undefined })).toContain('META_WABA_ID_PRUEBA');
    expect(motivoDe({ phoneNumberId: '12ab' })).toContain('no es un identificador numérico');
    expect(motivoDe({ wabaId: '12 34' })).toContain('no es un identificador numérico');
    expect(motivoDe({ wabaId: '1'.repeat(33) })).toContain('no es un identificador numérico');
  });

  it('ningún motivo contiene los valores del entorno', () => {
    const motivos = [
      motivoDe({ appEnv: 'dev' }),
      motivoDe({ phoneNumberId: `${PN}x` }),
      motivoDe({ wabaId: `${WABA}x` }),
      motivoDe({ anfitrion: 'ep-x.neon.tech' }),
      motivoDe({ anfitrion: 'ep-x.neon.tech', permitirRemoto: 'si', agenciasAjenas: 2 }),
    ];
    for (const m of motivos) {
      expect(m).not.toContain(PN);
      expect(m).not.toContain(WABA);
    }
  });
});
