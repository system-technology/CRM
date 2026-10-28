import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PieDePaginaPrivacidad } from './pie-de-pagina-privacidad';
import { EVENTO_ABRIR_MODAL_COOKIES } from '../../lib/privacidad-cookies';

describe('PieDePaginaPrivacidad (T-108) - Enlaces en el pie de página', () => {
  it('1. Renderiza los enlaces a /privacidad, /terminos y /cookies con data-testid', () => {
    render(<PieDePaginaPrivacidad />);

    const linkPrivacidad = screen.getByTestId('enlace-pie-privacidad');
    const linkTerminos = screen.getByTestId('enlace-pie-terminos');
    const linkCookies = screen.getByTestId('enlace-pie-cookies');

    expect(linkPrivacidad.getAttribute('href')).toBe('/privacidad');
    expect(linkTerminos.getAttribute('href')).toBe('/terminos');
    expect(linkCookies.getAttribute('href')).toBe('/cookies');
  });

  it('2. Todos los enlaces y botones interactivos tienen touch target mínimo de 44 px para 375 px', () => {
    render(<PieDePaginaPrivacidad />);

    const linkPrivacidad = screen.getByTestId('enlace-pie-privacidad');
    const linkTerminos = screen.getByTestId('enlace-pie-terminos');
    const linkCookies = screen.getByTestId('enlace-pie-cookies');
    const btnPreferencias = screen.getByTestId('enlace-preferencias-cookies');

    expect(linkPrivacidad.className).toContain('min-h-[44px]');
    expect(linkTerminos.className).toContain('min-h-[44px]');
    expect(linkCookies.className).toContain('min-h-[44px]');
    expect(btnPreferencias.className).toContain('min-h-[44px]');
  });

  it('3. El botón de preferencias de cookies emite el evento global al hacer click', () => {
    const spyEvento = vi.fn();
    window.addEventListener(EVENTO_ABRIR_MODAL_COOKIES, spyEvento);

    render(<PieDePaginaPrivacidad />);
    const btnPreferencias = screen.getByTestId('enlace-preferencias-cookies');

    act(() => {
      fireEvent.click(btnPreferencias);
    });

    expect(spyEvento).toHaveBeenCalled();
    window.removeEventListener(EVENTO_ABRIR_MODAL_COOKIES, spyEvento);
  });
});
