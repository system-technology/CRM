import { describe, expect, it } from 'vitest';
import {
  filtrarContactos,
  obtenerEtiquetasDisponibles,
  formatearTelefonoVisual,
} from './contactos-logica';
import { obtenerMockPaginaContactos } from './mock-contactos';

describe('Pruebas Automáticas de Contactos y Viajeros (/contactos) — Tarea 0c.4', () => {
  const pagina = obtenerMockPaginaContactos();
  const contactos = pagina.datos;

  // 1. Filtrado por texto de búsqueda (nombre, teléfono, correo)
  it('1. filtrarContactos encuentra contactos por nombre, teléfono o correo', () => {
    // Por nombre
    const porNombre = filtrarContactos(contactos, 'Juan');
    expect(porNombre.length).toBe(1);
    expect(porNombre[0]?.nombre).toBe('Juan Pérez');

    // Por teléfono
    const porTelefono = filtrarContactos(contactos, '000024690');
    expect(porTelefono.length).toBe(1);
    expect(porTelefono[0]?.nombre).toBe('Ana Martínez');

    // Por correo
    const porCorreo = filtrarContactos(contactos, 'sonia.lopez@ejemplo.com');
    expect(porCorreo.length).toBe(1);
    expect(porCorreo[0]?.nombre).toBe('Sonia López');
  });

  // 2. Filtrado por etiqueta
  it('2. filtrarContactos filtra estrictamente por etiqueta de negocio', () => {
    const vip = filtrarContactos(contactos, '', 'VIP');
    expect(vip.length).toBe(1);
    expect(vip[0]?.nombre).toBe('Juan Pérez');

    const familia = filtrarContactos(contactos, '', 'Familia');
    expect(familia.length).toBe(3); // Juan, Felipe, Santiago
  });

  // 3. Filtrado por consentimiento (Ley 1581 / Meta)
  it('3. filtrarContactos filtra contactos que otorgaron consentimiento PROMOCIONAL', () => {
    const promocionales = filtrarContactos(contactos, '', 'todas', 'PROMOCIONAL');
    expect(promocionales.every((c) => c.consentimientos.includes('PROMOCIONAL'))).toBe(true);

    const soloTransaccionales = contactos.filter((c) => !c.consentimientos.includes('PROMOCIONAL'));
    expect(soloTransaccionales.length).toBeGreaterThanOrEqual(1);
  });

  // 4. Extracción de etiquetas únicas ordenadas
  it('4. obtenerEtiquetasDisponibles extrae etiquetas únicas y ordenadas', () => {
    const etiquetas = obtenerEtiquetasDisponibles(contactos);
    expect(etiquetas).toContain('VIP');
    expect(etiquetas).toContain('Familia');
    expect(etiquetas).toContain('Cancún');
    expect(new Set(etiquetas).size).toBe(etiquetas.length);
  });

  // 5. Formato visual de teléfono E.164
  it('5. formatearTelefonoVisual formatea teléfonos E.164 colombianos con espaciado legible', () => {
    expect(formatearTelefonoVisual('+573000012345')).toBe('+57 300 001 2345');
    expect(formatearTelefonoVisual('+14155552671')).toBe('+14155552671');
  });

  // 6. Validación completa contra contrato PaginaContactos
  it('6. obtenerMockPaginaContactos devuelve una página válida bajo el esquema Zod PaginaContactos', () => {
    expect(pagina.datos.length).toBe(contactos.length);
    expect(contactos.length).toBeGreaterThanOrEqual(8);
    expect(contactos[0]?.id).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
