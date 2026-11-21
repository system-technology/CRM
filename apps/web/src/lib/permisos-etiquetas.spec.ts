import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Permiso, SesionActual } from '@viajapro/contracts';
import { puedeAdministrarEtiquetas, puedeOperarBandeja } from './permisos';

const sesion = (rol: string, permisos: Permiso[]): SesionActual =>
  ({
    identidad: { id: '01932000-0000-7000-8000-000000000001', correo: 'a@b.co', nombre: 'A' },
    agencias: [],
    tenantActivoId: null,
    acceso: { usuarioId: '01932000-0000-7000-8000-000000000011', rol, permisos },
  }) satisfies SesionActual;

describe('permisos de etiquetas (T-326)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('gestionar exige etiquetas.administrar; poner y quitar, bandeja.operar', () => {
    const dueno = sesion('Dueño', ['etiquetas.administrar', 'bandeja.operar']);
    const asesor = sesion('Asesor', ['bandeja.operar']);
    expect(puedeAdministrarEtiquetas(dueno)).toBe(true);
    expect(puedeAdministrarEtiquetas(asesor)).toBe(false);
    expect(puedeOperarBandeja(asesor)).toBe(true);
  });

  it('sin sesión y sin demo no hay permiso (la API vuelve a exigirlo de todos modos)', () => {
    expect(puedeAdministrarEtiquetas(null)).toBe(false);
  });

  it('el rol de solo lectura nunca gestiona, aunque la lista de permisos lo traiga', () => {
    expect(puedeAdministrarEtiquetas(sesion('OPERACIONES', ['etiquetas.administrar']))).toBe(false);
  });

  it('en el modo demo (datos simulados) se puede explorar la gestión', () => {
    vi.stubEnv('NEXT_PUBLIC_FORCE_DEMO', 'true');
    expect(puedeAdministrarEtiquetas(null)).toBe(true);
    expect(puedeAdministrarEtiquetas(sesion('Asesor', ['bandeja.operar']))).toBe(true);
    expect(puedeAdministrarEtiquetas(sesion('OPERACIONES', []))).toBe(false);
  });
});
