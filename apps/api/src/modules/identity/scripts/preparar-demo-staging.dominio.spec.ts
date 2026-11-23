import { describe, expect, it } from 'vitest';
import {
  type Conteos,
  decidirSiSePuedePrepararLaDemo,
  diagnosticoEnPalabras,
  motivoDeContrasenaInvalida,
  motivoDeCorreoInvalido,
  resumenDeLaPreparacion,
} from './preparar-demo-staging.dominio.js';

const vacio: Conteos = {
  agencias: 0,
  agenciaDemo: false,
  identidades: 0,
  usuarios: 0,
  credenciales: 0,
};

describe('decidirSiSePuedePrepararLaDemo', () => {
  const ok = { entorno: 'staging', anfitrion: 'ep-x.neon.tech', agenciasAjenas: 0 };
  it('permite staging remoto con solo la demo', () => {
    expect(decidirSiSePuedePrepararLaDemo(ok).permitido).toBe(true);
  });
  it.each([undefined, '', 'production', 'Staging'])('niega el entorno %s', (entorno) => {
    expect(decidirSiSePuedePrepararLaDemo({ ...ok, entorno }).permitido).toBe(false);
  });
  it('niega una base local', () => {
    expect(decidirSiSePuedePrepararLaDemo({ ...ok, anfitrion: 'localhost' }).permitido).toBe(false);
  });
  it('niega si hay agencias ajenas, con solo el número en el motivo', () => {
    const d = decidirSiSePuedePrepararLaDemo({ ...ok, agenciasAjenas: 2 });
    expect(d.permitido).toBe(false);
    if (!d.permitido) expect(d.motivo).toContain('2 agencia(s)');
  });
});

describe('credenciales', () => {
  it('mantiene el mínimo de 12 y el máximo de 128', () => {
    expect(motivoDeContrasenaInvalida('Demo2026')).not.toBeNull();
    expect(motivoDeContrasenaInvalida('x'.repeat(129))).not.toBeNull();
    expect(motivoDeContrasenaInvalida('Demo2026Viaja')).toBeNull();
  });
  it('valida la forma del correo y rechaza .invalid', () => {
    expect(motivoDeCorreoInvalido('demo@viajapro.app')).toBeNull();
    expect(motivoDeCorreoInvalido('demo')).not.toBeNull();
    expect(motivoDeCorreoInvalido('a b@c.co')).not.toBeNull();
    expect(motivoDeCorreoInvalido('x@y.invalid')).not.toBeNull();
  });
});

describe('diagnóstico y resumen', () => {
  it('distingue base vacía de agencia sin contraseñas', () => {
    expect(diagnosticoEnPalabras(vacio)).toContain('nunca corrió');
    const sinClave = { ...vacio, agencias: 1, agenciaDemo: true, usuarios: 3 };
    expect(diagnosticoEnPalabras(sinClave)).toContain('ningún usuario tenía contraseña');
  });
  it('el resumen NO contiene ni la contraseña ni el correo', () => {
    const datos = {
      antes: vacio,
      despues: { ...vacio, agencias: 1 },
      correo: 'demo@viajapro.app',
      contrasena: 'Demo2026Viaja',
      estado: 'creado' as const,
    };
    const texto = resumenDeLaPreparacion(datos);
    expect(texto).not.toContain('Demo2026Viaja');
    expect(texto).not.toContain('demo@viajapro.app');
    expect(texto).toContain('creado');
  });
});
