import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AvisoSinCatalogo } from './aviso-sin-catalogo';

describe('AvisoSinCatalogo Component (T-019)', () => {
  it('1. Renderiza el estado vacío con las dos acciones obligatorias: Importar catálogo y Crear excursión', () => {
    render(<AvisoSinCatalogo pantalla="catalogo" />);

    expect(screen.getByTestId('estado-sin-catalogo')).toBeDefined();
    expect(
      screen.getByText('No hay excursiones ni salidas registradas en esta agencia'),
    ).toBeDefined();

    const btnImportar = screen.getByTestId('accion-importar-catalogo');
    const btnCrear = screen.getByTestId('accion-crear-excursion');

    expect(btnImportar).toBeDefined();
    expect(btnImportar.textContent).toContain('Importar catálogo');

    expect(btnCrear).toBeDefined();
    expect(btnCrear.textContent).toContain('Crear excursión');
  });

  it('2. Al presionar Importar catálogo muestra aviso accesible de carga masiva en preparación', () => {
    render(<AvisoSinCatalogo pantalla="catalogo" />);

    const btnImportar = screen.getByTestId('accion-importar-catalogo');
    fireEvent.click(btnImportar);

    const aviso = screen.getByTestId('aviso-accion-catalogo');
    expect(aviso).toBeDefined();
    expect(aviso.textContent).toContain('carga masiva de excursiones desde archivo Excel o CSV');
  });

  it('3. Al presionar Crear excursión muestra aviso accesible de alta manual en preparación', () => {
    render(<AvisoSinCatalogo pantalla="cotizador" />);

    const btnCrear = screen.getByTestId('accion-crear-excursion');
    fireEvent.click(btnCrear);

    const aviso = screen.getByTestId('aviso-accion-catalogo');
    expect(aviso).toBeDefined();
    expect(aviso.textContent).toContain('formulario de alta manual de excursiones');
  });

  it('4. Permite activar modo de demostración cuando se proporciona el callback onVerDemo', () => {
    const onVerDemo = vi.fn();
    render(<AvisoSinCatalogo pantalla="cotizador" onVerDemo={onVerDemo} />);

    const btnDemo = screen.getByTestId('accion-ver-demo');
    expect(btnDemo).toBeDefined();
    expect(btnDemo.textContent).toContain('Ver excursiones de demostración');

    fireEvent.click(btnDemo);
    expect(onVerDemo).toHaveBeenCalledTimes(1);
  });

  it('5. Renderiza enlaces de Next.js cuando se proporcionan rutas directas', () => {
    render(
      <AvisoSinCatalogo
        pantalla="catalogo"
        rutaImportar="/catalogo/importar"
        rutaCrear="/catalogo/nuevo"
      />,
    );

    const linkImportar = screen.getByRole('link', { name: /importar catálogo/i });
    expect(linkImportar.getAttribute('href')).toBe('/catalogo/importar');

    const linkCrear = screen.getByRole('link', { name: /crear excursión/i });
    expect(linkCrear.getAttribute('href')).toBe('/catalogo/nuevo');
  });
});
