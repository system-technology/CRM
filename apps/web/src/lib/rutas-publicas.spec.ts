import { describe, it, expect } from 'vitest';
import { destinoDeIngreso, esRutaPublica } from './rutas-publicas';

describe('rutas públicas (T-126)', () => {
  it('el inicio y el dashboard exigen sesión', () => {
    for (const r of ['/', '/bandeja', '/bandeja/abc', '/pipeline', '/cotizador']) {
      expect(esRutaPublica(r)).toBe(false);
    }
  });
  it('ingresar y legales son públicas', () => {
    for (const r of ['/ingresar', '/aceptar-invitacion', '/privacidad', '/terminos']) {
      expect(esRutaPublica(r)).toBe(true);
    }
    expect(esRutaPublica('/ingresarx')).toBe(false);
  });
  it('conserva el destino salvo en la raíz', () => {
    expect(destinoDeIngreso('/')).toBe('/ingresar?motivo=sesion_requerida');
    expect(destinoDeIngreso('/pipeline')).toContain('redirigir=%2Fpipeline');
  });
});
