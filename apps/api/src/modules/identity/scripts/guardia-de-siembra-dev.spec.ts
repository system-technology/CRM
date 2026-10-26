import { describe, expect, it } from 'vitest';
import { decidirSiSePuedeSembrar, type EntradaGuardiaDeSiembra } from './guardia-de-siembra-dev.js';

const base: EntradaGuardiaDeSiembra = {
  appEnv: 'local',
  anfitrion: 'localhost',
  permitirRemoto: undefined,
  claveLongitud: 16,
  identidadesAjenas: 0,
};
const remoto: EntradaGuardiaDeSiembra = { ...base, anfitrion: 'ep-ejemplo.neon.tech' };

describe('decidirSiSePuedeSembrar', () => {
  it('permite un anfitrión local', () => {
    expect(decidirSiSePuedeSembrar(base)).toEqual({ permitido: true, remoto: false });
  });

  it('niega remoto sin opt-in', () => {
    expect(decidirSiSePuedeSembrar(remoto).permitido).toBe(false);
  });

  it('niega remoto con un opt-in que no es exactamente "si"', () => {
    for (const valor of ['SI', 'true', '1', 'yes', ' si', '']) {
      expect(decidirSiSePuedeSembrar({ ...remoto, permitirRemoto: valor }).permitido).toBe(false);
    }
  });

  it('permite remoto con opt-in y 0 identidades ajenas', () => {
    expect(decidirSiSePuedeSembrar({ ...remoto, permitirRemoto: 'si' })).toEqual({
      permitido: true,
      remoto: true,
    });
  });

  it('niega remoto con opt-in y 1 identidad ajena, diciendo solo el número', () => {
    const r = decidirSiSePuedeSembrar({ ...remoto, permitirRemoto: 'si', identidadesAjenas: 1 });
    expect(r.permitido).toBe(false);
    if (!r.permitido) {
      expect(r.motivo).toContain('tiene 1 identidad');
      expect(r.motivo).not.toMatch(/[\w.]+@[\w.]+/);
    }
  });

  it('niega APP_ENV distinto de local, incluso con opt-in', () => {
    for (const appEnv of ['production', 'staging', '', undefined]) {
      expect(decidirSiSePuedeSembrar({ ...remoto, appEnv, permitirRemoto: 'si' }).permitido).toBe(
        false,
      );
    }
  });

  it('niega una clave corta', () => {
    expect(decidirSiSePuedeSembrar({ ...base, claveLongitud: 11 }).permitido).toBe(false);
    expect(decidirSiSePuedeSembrar({ ...base, claveLongitud: 0 }).permitido).toBe(false);
  });

  it('el motivo nunca contiene la cadena de conexión', () => {
    const casos: EntradaGuardiaDeSiembra[] = [
      remoto,
      { ...remoto, permitirRemoto: 'si', identidadesAjenas: 2 },
      { ...remoto, appEnv: 'production' },
      { ...remoto, claveLongitud: 3 },
    ];
    for (const caso of casos) {
      const r = decidirSiSePuedeSembrar(caso);
      expect(r.permitido).toBe(false);
      if (!r.permitido) {
        expect(r.motivo).not.toContain('postgresql://');
        expect(r.motivo).not.toContain('secreto');
      }
    }
  });
});
