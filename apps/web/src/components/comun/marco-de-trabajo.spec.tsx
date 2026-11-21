import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

let ruta = '/viajes';
vi.mock('next/navigation', () => ({ usePathname: () => ruta }));
vi.mock('../bandeja/barra-modulos', () => ({ BarraModulos: () => <nav data-testid="barra" /> }));

import { MarcoDeTrabajo } from './marco-de-trabajo';

/**
 * Un solo desplazamiento en las pantallas privadas: el de `main#contenido`. El pie legal vive
 * dentro de `main` (no debajo de la región fija, donde desplazaba el documento).
 */
describe('MarcoDeTrabajo: un solo desplazamiento', () => {
  beforeEach(() => {
    ruta = '/viajes';
  });

  it('pone el pie legal dentro de main, después del contenido', () => {
    render(
      <MarcoDeTrabajo>
        <p data-testid="pagina">contenido</p>
      </MarcoDeTrabajo>,
    );
    const main = document.querySelector('main#contenido')!;
    const pie = screen.getByTestId('pie-de-pagina-privacidad');
    const pagina = screen.getByTestId('pagina');
    expect(main.contains(pie)).toBe(true);
    expect(pagina.compareDocumentPosition(pie) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('mantiene la página a la altura de la región (basis-full) y no deja scroll al documento', () => {
    render(
      <MarcoDeTrabajo>
        <p data-testid="pagina">contenido</p>
      </MarcoDeTrabajo>,
    );
    expect(screen.getByTestId('pagina').parentElement?.className).toContain('basis-full');
    const region = document.querySelector('[data-marco]') as HTMLElement;
    expect(region.className).toContain('overflow-hidden');
    expect(region.className).toContain('100dvh');
  });

  it('en la bandeja (pantalla completa) no monta pie ni envoltorio', () => {
    ruta = '/bandeja/abc';
    render(
      <MarcoDeTrabajo>
        <p data-testid="pagina">contenido</p>
      </MarcoDeTrabajo>,
    );
    expect(screen.queryByTestId('pie-de-pagina-privacidad')).toBeNull();
    expect(screen.getByTestId('pagina').parentElement?.id).toBe('contenido');
  });
});
