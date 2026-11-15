import { describe, expect, it } from 'vitest';
import { decidirSiSePuedeSembrarLaDemoCifrada } from './guardia-de-demo-cifrada.js';

const base = {
  appEnv: 'local',
  anfitrion: 'localhost',
  permitirRemoto: undefined,
  agenciasAjenas: 0,
} as const;

describe('guardia de la demo cifrada', () => {
  it('exige APP_ENV=local', () => {
    expect(decidirSiSePuedeSembrarLaDemoCifrada({ ...base, appEnv: 'production' }).permitido).toBe(
      false,
    );
    expect(decidirSiSePuedeSembrarLaDemoCifrada({ ...base, appEnv: undefined }).permitido).toBe(
      false,
    );
  });

  it('permite el anfitrión local', () => {
    expect(decidirSiSePuedeSembrarLaDemoCifrada(base)).toEqual({ permitido: true, remoto: false });
  });

  it('niega un anfitrión remoto sin opt-in exacto', () => {
    for (const permitirRemoto of [undefined, 'true', 'SI', '1']) {
      const d = decidirSiSePuedeSembrarLaDemoCifrada({
        ...base,
        anfitrion: 'db.ejemplo.neon.tech',
        permitirRemoto,
      });
      expect(d.permitido).toBe(false);
    }
  });

  it('niega un remoto con agencias ajenas aunque haya opt-in', () => {
    const d = decidirSiSePuedeSembrarLaDemoCifrada({
      ...base,
      anfitrion: 'db.ejemplo.neon.tech',
      permitirRemoto: 'si',
      agenciasAjenas: 2,
    });
    expect(d.permitido).toBe(false);
    if (!d.permitido) expect(d.motivo).toContain('2 agencia(s)');
  });

  it('permite un remoto con opt-in y sin agencias ajenas', () => {
    expect(
      decidirSiSePuedeSembrarLaDemoCifrada({
        ...base,
        anfitrion: 'db.ejemplo.neon.tech',
        permitirRemoto: 'si',
      }),
    ).toEqual({ permitido: true, remoto: true });
  });

  it('el motivo no filtra valores del entorno', () => {
    const d = decidirSiSePuedeSembrarLaDemoCifrada({
      ...base,
      anfitrion: 'db.ejemplo.neon.tech',
    });
    if (!d.permitido) expect(d.motivo).not.toMatch(/postgres(ql)?:\/\//);
  });
});
