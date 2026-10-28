import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BloqueAjustesCatalogo } from './bloque-ajustes-catalogo';
import * as api from '../../lib/catalogo-ajustes-api';

describe('BloqueAjustesCatalogo (T-028)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('carga la configuración inicial desde la API (GET /api/v1/catalogo/ajustes) y muestra OCULTAR por defecto', async () => {
    vi.spyOn(api, 'obtenerAjustesCatalogoApi').mockResolvedValue({ promoVencida: 'OCULTAR' });

    render(<BloqueAjustesCatalogo />);

    expect(screen.getByTestId('cargando-ajustes-catalogo')).toBeDefined();

    await waitFor(() => {
      expect(screen.getByTestId('seccion-ajustes-catalogo')).toBeDefined();
    });

    const radioOcultar = screen.getByTestId('radio-promo-ocultar');
    const radioTachar = screen.getByTestId('radio-promo-tachar');

    expect(radioOcultar.matches(':checked')).toBe(true);
    expect(radioTachar.matches(':checked')).toBe(false);

    // En modo OCULTAR no se enseña precio tachado ni badge en la previsualización
    expect(screen.queryByTestId('precio-tachado-previsualizacion')).toBeNull();
    expect(screen.queryByTestId('badge-promo-vencida-previsualizacion')).toBeNull();
  });

  it('al seleccionar TACHAR, la previsualización en vivo enseña el precio tachado y la insignia de promoción vencida', async () => {
    vi.spyOn(api, 'obtenerAjustesCatalogoApi').mockResolvedValue({ promoVencida: 'OCULTAR' });

    render(<BloqueAjustesCatalogo />);

    await waitFor(() => {
      expect(screen.getByTestId('seccion-ajustes-catalogo')).toBeDefined();
    });

    const radioTachar = screen.getByTestId('radio-promo-tachar');
    fireEvent.click(radioTachar);

    // La previsualización debe reaccionar en vivo
    expect(screen.getByTestId('precio-tachado-previsualizacion')).toBeDefined();
    expect(screen.getByTestId('badge-promo-vencida-previsualizacion')).toBeDefined();
  });

  it('al enviar el formulario, invoca actualizarAjustesCatalogoApi (PATCH) y muestra confirmación de éxito', async () => {
    vi.spyOn(api, 'obtenerAjustesCatalogoApi').mockResolvedValue({ promoVencida: 'OCULTAR' });
    const patchSpy = vi
      .spyOn(api, 'actualizarAjustesCatalogoApi')
      .mockResolvedValue({ promoVencida: 'TACHAR' });

    render(<BloqueAjustesCatalogo />);

    await waitFor(() => {
      expect(screen.getByTestId('seccion-ajustes-catalogo')).toBeDefined();
    });

    // Seleccionar TACHAR
    fireEvent.click(screen.getByTestId('radio-promo-tachar'));

    // Guardar
    const botonGuardar = screen.getByTestId('boton-guardar-ajustes-catalogo');
    fireEvent.click(botonGuardar);

    await waitFor(() => {
      expect(screen.getByTestId('mensaje-guardado-exitoso')).toBeDefined();
    });

    expect(patchSpy).toHaveBeenCalledTimes(1);
    expect(patchSpy).toHaveBeenCalledWith({ promoVencida: 'TACHAR' });
  });

  it('muestra mensaje de error amigable si el guardado por API falla', async () => {
    vi.spyOn(api, 'obtenerAjustesCatalogoApi').mockResolvedValue({ promoVencida: 'OCULTAR' });
    vi.spyOn(api, 'actualizarAjustesCatalogoApi').mockRejectedValue(new Error('Fallo de conexión'));

    render(<BloqueAjustesCatalogo />);

    await waitFor(() => {
      expect(screen.getByTestId('seccion-ajustes-catalogo')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('radio-promo-tachar'));
    fireEvent.click(screen.getByTestId('boton-guardar-ajustes-catalogo'));

    await waitFor(() => {
      expect(screen.getByTestId('error-ajustes-catalogo')).toBeDefined();
    });
    expect(screen.getByTestId('error-ajustes-catalogo').textContent).toContain('Fallo de conexión');
  });
});
