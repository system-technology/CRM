import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { HojaMas } from './hoja-mas';
import { entradasDeHojaMas } from '../../lib/navegacion';

afterEach(cleanup);

function pintar(propiedades: Partial<React.ComponentProps<typeof HojaMas>> = {}) {
  const manejadores = {
    alCerrar: vi.fn(),
    alAbrirNotificaciones: vi.fn(),
    alAbrirPerfil: vi.fn(),
  };
  render(
    <HojaMas
      abierta
      modulos={entradasDeHojaMas()}
      idActivo={null}
      seguimientosVencidos={null}
      noLeidas={0}
      nombreUsuario="Carlos Asesor"
      iniciales="CA"
      {...manejadores}
      {...propiedades}
    />,
  );
  return { ...manejadores, hoja: screen.queryByRole('dialog', { name: 'Más opciones' }) };
}

describe('HojaMas (T-320)', () => {
  it('cerrada no pinta nada', () => {
    const { hoja } = pintar({ abierta: false });
    expect(hoja).toBeNull();
    expect(screen.queryByTestId('telon-hoja-mas')).toBeNull();
  });

  it('abierta es un diálogo modal con los 8 módulos restantes, en el orden de la tabla', () => {
    const { hoja } = pintar();
    expect(hoja?.getAttribute('aria-modal')).toBe('true');
    const modulos = within(screen.getByRole('navigation', { name: 'Módulos' })).getAllByRole(
      'link',
    );
    expect(modulos.map((e) => e.textContent)).toEqual([
      'Oportunidades',
      'Cotizaciones',
      'Cobros',
      'Seguimientos',
      'Contactos',
      'Catálogo',
      'Reportes de la agencia',
      'Configuración',
    ]);
    expect(modulos.map((e) => e.getAttribute('href'))).toEqual([
      '/pipeline',
      '/cotizaciones',
      '/cobros',
      '/seguimientos',
      '/contactos',
      '/catalogo',
      '/reportes',
      '/configuracion',
    ]);
  });

  it('refleja el filtrado por permiso: solo pinta los módulos que recibe', () => {
    pintar({ modulos: entradasDeHojaMas().filter((m) => m.id !== 'configuracion') });
    expect(screen.queryByText('Configuración')).toBeNull();
    expect(screen.getByText('Reportes de la agencia')).toBeDefined();
  });

  it('todos los objetivos táctiles miden al menos 44 px de alto', () => {
    pintar();
    const hoja = screen.getByTestId('hoja-mas');
    const objetivos = [...hoja.querySelectorAll('a'), ...hoja.querySelectorAll('button')];
    // 8 módulos + campana + perfil + 3 enlaces legales + la X de cerrar
    expect(objetivos.length).toBe(8 + 2 + 3 + 1);
    for (const el of objetivos) {
      expect(el.className).toMatch(/min-h-\[(44|48)px\]/);
    }
  });

  it('marca el módulo actual con aria-current', () => {
    pintar({ idActivo: 'contactos' });
    const actuales = screen.getByTestId('hoja-mas').querySelectorAll('[aria-current="page"]');
    expect(actuales).toHaveLength(1);
    expect(actuales[0]?.textContent).toBe('Contactos');
  });

  it('Seguimientos lleva el contador de vencidos, con nombre accesible', () => {
    pintar({ seguimientosVencidos: 3 });
    expect(screen.getByRole('link', { name: 'Seguimientos, 3 vencidos' })).toBeDefined();
  });

  it('la campana muestra su contador y abre el panel de notificaciones', () => {
    const { alAbrirNotificaciones } = pintar({ noLeidas: 5 });
    expect(screen.getByTestId('contador-campana-mas').textContent).toBe('5');
    fireEvent.click(screen.getByRole('button', { name: 'Notificaciones, 5 sin leer' }));
    expect(alAbrirNotificaciones).toHaveBeenCalledTimes(1);
  });

  it('sin no leídas no hay contador de campana', () => {
    pintar({ noLeidas: 0 });
    expect(screen.queryByTestId('contador-campana-mas')).toBeNull();
    expect(screen.getByRole('button', { name: 'Notificaciones' })).toBeDefined();
  });

  it('el perfil muestra el nombre y abre el diálogo de sesión', () => {
    const { alAbrirPerfil } = pintar();
    const perfil = screen.getByRole('button', { name: 'Perfil y sesión (Carlos Asesor)' });
    expect(perfil.textContent).toContain('Carlos Asesor');
    fireEvent.click(perfil);
    expect(alAbrirPerfil).toHaveBeenCalledTimes(1);
  });

  it('lleva los enlaces legales (la bandeja no tiene pie)', () => {
    pintar();
    const legales = within(screen.getByRole('navigation', { name: 'Enlaces legales' }));
    expect(legales.getByRole('link', { name: 'Privacidad' }).getAttribute('href')).toBe(
      '/privacidad',
    );
    expect(legales.getByRole('link', { name: 'Términos' }).getAttribute('href')).toBe('/terminos');
    expect(legales.getByRole('link', { name: 'Cookies' }).getAttribute('href')).toBe('/cookies');
  });

  it('se cierra con la X, con el telón y con Esc', () => {
    const { alCerrar } = pintar();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    fireEvent.click(screen.getByTestId('telon-hoja-mas'));
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    expect(alCerrar).toHaveBeenCalledTimes(3);
  });
});
