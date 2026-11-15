import { describe, expect, it, vi } from 'vitest';
import { destinoIngresoDesdeAlias } from './redirigir-a-ingreso';
import { sanitizarRutaRedireccion } from './errores-sistema';
import { esRutaPublica } from './rutas-publicas';

const redirect = vi.fn<(url: string) => void>();
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    redirect(url);
  },
}));

describe('alias de acceso hacia /ingresar (H-4, T-174)', () => {
  it('sin consulta lleva a /ingresar', () => {
    expect(destinoIngresoDesdeAlias(undefined)).toBe('/ingresar');
    expect(destinoIngresoDesdeAlias({})).toBe('/ingresar');
  });

  it('conserva redirigir y motivo', () => {
    expect(destinoIngresoDesdeAlias({ redirigir: '/bandeja?x=1', motivo: 'sesion_expirada' })).toBe(
      '/ingresar?redirigir=%2Fbandeja%3Fx%3D1&motivo=sesion_expirada',
    );
  });

  it('/login y /iniciar-sesion redirigen al mismo destino', async () => {
    const { default: LoginPage } = await import('../app/login/page');
    const { default: IniciarSesionPage } = await import('../app/iniciar-sesion/page');
    const consulta = Promise.resolve({ redirigir: '/contactos' });
    await LoginPage({ searchParams: consulta });
    await IniciarSesionPage({ searchParams: consulta });
    expect(redirect).toHaveBeenNthCalledWith(1, '/ingresar?redirigir=%2Fcontactos');
    expect(redirect).toHaveBeenNthCalledWith(2, '/ingresar?redirigir=%2Fcontactos');
  });

  it('/login es pública y nunca es destino tras ingresar (evita bucles)', () => {
    expect(esRutaPublica('/login')).toBe(true);
    expect(sanitizarRutaRedireccion('/login')).toBe('/bandeja');
  });
});
