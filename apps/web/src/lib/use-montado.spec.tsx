import React from 'react';
import { renderToString } from 'react-dom/server';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useMontado } from './use-montado';
import { esModoDemoDelEntorno } from './modo-demo';

function Sonda() {
  return <span data-testid="sonda">{useMontado() ? 'montado' : 'primera'}</span>;
}

describe('useMontado (T-607)', () => {
  it('el servidor pinta la primera versión', () => {
    expect(renderToString(<Sonda />)).toContain('primera');
  });

  it('el cliente pasa a montado tras el primer efecto', () => {
    render(<Sonda />);
    expect(screen.getByTestId('sonda').textContent).toBe('montado');
  });
});

describe('esModoDemoDelEntorno', () => {
  it('ignora ?demo= y localStorage: solo mira el entorno', () => {
    window.localStorage.setItem('viajapro_modo_demo', 'true');
    window.history.pushState({}, '', '/?demo=1');
    expect(esModoDemoDelEntorno()).toBe(false);
    window.localStorage.removeItem('viajapro_modo_demo');
    window.history.pushState({}, '', '/');
  });
});
