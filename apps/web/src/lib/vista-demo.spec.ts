import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CLAVE_LOCALSTORAGE_VISTA_DEMO,
  EVENTO_CAMBIO_VISTA_DEMO,
  PERMISOS_ASESOR_DEMO,
  fijarVistaDemo,
  vistaDemo,
} from './vista-demo';
import { CLAVE_LOCALSTORAGE_MODO_DEMO } from './modo-demo';
import { tienePermiso } from './permisos';

describe('vista-demo (T-566): ver la demostración con los ojos de un asesor', () => {
  const entorno = { ...process.env };

  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, '', '/');
    delete process.env['NEXT_PUBLIC_FORCE_DEMO'];
    delete process.env['NEXT_PUBLIC_USE_MOCK_INBOX'];
    delete process.env['NEXT_PUBLIC_USE_REAL_CRM'];
  });
  afterEach(() => {
    process.env = { ...entorno };
    window.history.replaceState({}, '', '/');
  });

  it('por defecto la demostración es la vista del dueño', () => {
    window.localStorage.setItem(CLAVE_LOCALSTORAGE_MODO_DEMO, 'true');
    expect(vistaDemo()).toBe('dueno');
  });

  it('con la demostración activa, la preferencia guardada manda', () => {
    window.localStorage.setItem(CLAVE_LOCALSTORAGE_MODO_DEMO, 'true');
    window.localStorage.setItem(CLAVE_LOCALSTORAGE_VISTA_DEMO, 'asesor');
    expect(vistaDemo()).toBe('asesor');
  });

  it('?vista=asesor la fija desde el enlace; ?vista=dueno la quita', () => {
    window.localStorage.setItem(CLAVE_LOCALSTORAGE_MODO_DEMO, 'true');
    window.history.replaceState({}, '', '/reportes?vista=asesor');
    expect(vistaDemo()).toBe('asesor');
    window.localStorage.setItem(CLAVE_LOCALSTORAGE_VISTA_DEMO, 'asesor');
    window.history.replaceState({}, '', '/reportes?vista=dueno');
    expect(vistaDemo()).toBe('dueno');
  });

  it('el alias anterior ?alcanceDemo=propio sigue dando la vista de asesor', () => {
    window.localStorage.setItem(CLAVE_LOCALSTORAGE_MODO_DEMO, 'true');
    window.history.replaceState({}, '', '/reportes?alcanceDemo=propio');
    expect(vistaDemo()).toBe('asesor');
  });

  it('FUERA de la demostración nunca hay vista de asesor: no es un atajo ni un cambio de rol', () => {
    window.localStorage.setItem(CLAVE_LOCALSTORAGE_MODO_DEMO, 'false');
    window.localStorage.setItem(CLAVE_LOCALSTORAGE_VISTA_DEMO, 'asesor');
    window.history.replaceState({}, '', '/?vista=asesor');
    expect(vistaDemo()).toBe('dueno');
  });

  it('fijarVistaDemo guarda y avisa a quien escucha', () => {
    window.localStorage.setItem(CLAVE_LOCALSTORAGE_MODO_DEMO, 'true');
    const oyente = vi.fn();
    window.addEventListener(EVENTO_CAMBIO_VISTA_DEMO, oyente);
    fijarVistaDemo('asesor');
    expect(window.localStorage.getItem(CLAVE_LOCALSTORAGE_VISTA_DEMO)).toBe('asesor');
    expect(oyente).toHaveBeenCalledTimes(1);
    window.removeEventListener(EVENTO_CAMBIO_VISTA_DEMO, oyente);
  });

  it('el asesor de muestra no lleva ningún permiso de administración ni de agencia', () => {
    for (const p of [
      'reportes.ver_agencia',
      'usuarios.administrar',
      'roles.administrar',
      'catalogo.administrar',
      'cotizacion.ver_neto_y_margen',
      'conversaciones.ver_todas',
    ] as const) {
      expect(PERMISOS_ASESOR_DEMO).not.toContain(p);
    }
  });

  it('NO toca los permisos reales: tienePermiso responde igual con la vista de asesor puesta', () => {
    window.localStorage.setItem(CLAVE_LOCALSTORAGE_MODO_DEMO, 'true');
    const antes = tienePermiso(null, 'reportes.ver_agencia');
    const antesMutacion = tienePermiso(null, 'crm.escribir');
    fijarVistaDemo('asesor');
    expect(tienePermiso(null, 'reportes.ver_agencia')).toBe(antes);
    expect(tienePermiso(null, 'crm.escribir')).toBe(antesMutacion);
  });
});
