import { describe, expect, it } from 'vitest';
import type { SesionActual } from '@viajapro/contracts';
import { alcanceDeVista, TEXTO_REPORTES_SOLO_ADMINISTRACION } from './alcance-de-vista';

function sesion(permisos: string[]): SesionActual {
  return {
    identidad: { id: 'i', correo: 'a@b.co', nombre: 'A' },
    agencias: [],
    tenantActivoId: 't',
    acceso: { usuarioId: 'u', rol: 'Asesor', permisos },
  } as unknown as SesionActual;
}

describe('alcanceDeVista', () => {
  it('sin sesión no afirma nada', () => {
    expect(alcanceDeVista(null)).toBe('DESCONOCIDO');
  });
  it('con la llave de agencia ve la agencia; sin ella, lo propio', () => {
    expect(alcanceDeVista(sesion(['conversaciones.ver_todas']))).toBe('AGENCIA');
    expect(alcanceDeVista(sesion(['crm.escribir']))).toBe('PROPIO');
  });
  it('el texto de reportes explica y no nombra permisos ni claves', () => {
    const t = `${TEXTO_REPORTES_SOLO_ADMINISTRACION.titulo} ${TEXTO_REPORTES_SOLO_ADMINISTRACION.detalle}`;
    expect(t).toContain('Esta vista es de administración');
    expect(t).not.toMatch(/ver_todas|PERMISO_DENEGADO|reportes\./);
  });
});
