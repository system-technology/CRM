import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EnlacesDelViaje } from './enlaces-del-viaje';
import {
  enlaceDeArchivo,
  enlaceDeContacto,
  enlaceDeConversacion,
  enlaceDeCotizacion,
} from '../../lib/enlaces-viaje-logica';

describe('EnlacesDelViaje', () => {
  it('pinta un enlace por pieza hacia su pantalla', () => {
    render(
      <EnlacesDelViaje
        enlaces={[
          enlaceDeConversacion({ tipo: 'listo', valor: 'conv-1' }),
          enlaceDeContacto('contacto-1', 'Felipe Morales'),
          enlaceDeCotizacion('cot-1', 2),
          enlaceDeArchivo({ tipo: 'listo', valor: { id: 'file-1', numero: 1043 } }),
        ]}
      />,
    );
    expect(screen.getByRole('link', { name: 'Abrir conversación' }).getAttribute('href')).toBe(
      '/bandeja/conv-1',
    );
    expect(
      screen.getByRole('link', { name: 'Contacto: Felipe Morales' }).getAttribute('href'),
    ).toBe('/contactos/contacto-1');
    expect(screen.getByRole('link', { name: 'Cotización v2' }).getAttribute('href')).toBe(
      '/cotizaciones/cot-1',
    );
    expect(screen.getByRole('link', { name: 'File 1043' }).getAttribute('href')).toBe(
      '/viajes?id=file-1',
    );
  });

  it('dice qué falta en vez de ocultar la pieza, y no inventa un enlace', () => {
    render(
      <EnlacesDelViaje
        enlaces={[
          enlaceDeConversacion({ tipo: 'listo', valor: null }),
          enlaceDeArchivo({ tipo: 'listo', valor: null }),
        ]}
      />,
    );
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.getByText('Sin conversación en la bandeja')).toBeDefined();
    expect(screen.getByText('Sin archivo de viaje todavía')).toBeDefined();
  });

  it('mientras carga muestra un esqueleto, no un enlace roto', () => {
    render(<EnlacesDelViaje enlaces={[enlaceDeConversacion({ tipo: 'cargando' })]} />);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.queryByText('Sin conversación en la bandeja')).toBeNull();
  });
});
