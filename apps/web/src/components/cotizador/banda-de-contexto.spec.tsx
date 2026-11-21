import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BandaDeContexto } from './banda-de-contexto';

describe('BandaDeContexto (T-321)', () => {
  it('dice para quién se cotiza y desde la conversación, con la salida al chat', () => {
    render(<BandaDeContexto nombre="Laura Gómez" conversacionId="conv-1" />);
    expect(screen.getByTestId('contexto-texto').textContent).toBe(
      'Cotizando para Laura Gómez · desde la conversación',
    );
    const volver = screen.getByTestId('volver-al-chat');
    expect(volver.getAttribute('href')).toBe('/bandeja/conv-1');
    expect(volver.className).toContain('min-h-[44px]');
  });

  it('sin conversación no promete volver al chat', () => {
    render(<BandaDeContexto nombre="Laura Gómez" conversacionId={null} />);
    expect(screen.getByTestId('contexto-texto').textContent).toBe('Cotizando para Laura Gómez');
    expect(screen.queryByTestId('volver-al-chat')).toBeNull();
  });

  it('mientras llega el nombre pinta un esqueleto, no un hueco ni «null»', () => {
    render(<BandaDeContexto nombre={null} cargandoNombre conversacionId="conv-1" />);
    expect(screen.queryByTestId('contexto-texto')).toBeNull();
    expect(screen.getByLabelText('Cargando el nombre del cliente')).toBeDefined();
    expect(screen.getByTestId('volver-al-chat')).toBeDefined();
  });

  it('sin contacto ni conversación no pinta nada', () => {
    const { container } = render(<BandaDeContexto nombre={null} conversacionId={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('con la conversación pero sin nombre conocido no inventa a nadie', () => {
    render(<BandaDeContexto nombre={null} conversacionId="conv-1" />);
    expect(screen.getByTestId('contexto-texto').textContent).toBe(
      'Cotizando · desde la conversación',
    );
  });
});
