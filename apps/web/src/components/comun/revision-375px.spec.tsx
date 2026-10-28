import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BarraModulos } from '../bandeja/barra-modulos';
import { ListaConversaciones } from '../bandeja/lista-conversaciones';
import { DesgloseCotizacionSalida } from '../cotizador/desglose-cotizacion-salida';
import { TarjetaSalidaPublicada } from '../catalogo/tarjeta-salida-publicada';
import type { CotizacionDeSalida, SalidaPublicada } from '@viajapro/contracts';

// Mock de router y navegación
vi.mock('next/navigation', () => ({
  usePathname: () => '/bandeja',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../../lib/inbox-api', () => ({
  inboxApi: {
    consultarBandeja: vi.fn().mockResolvedValue({
      datos: [
        {
          id: 'conv-01',
          contactoId: 'ct-01',
          contactoNombre: 'María Pérez',
          contactoTelefono: '+573001234567',
          ultimoMensajeTexto: 'Hola, quiero cotizar',
          ultimoMensajeEn: '2026-10-28T10:00:00Z',
          ultimoMensajeDireccion: 'ENTRANTE',
          asignadoAId: null,
          asignadoANombre: null,
          sinLeer: true,
          slaVenceEn: null,
          ventana: { abierta: true, expiraEn: '2026-10-29T10:00:00Z', minutosRestantes: 1440 },
          etiquetas: [],
        },
      ],
      pageInfo: {
        nextCursor: null,
        hasMore: false,
      },
    }),
  },
}));

vi.mock('../../lib/inbox-socket', () => ({
  useInboxSocket: () => 'conectado',
  inboxSocketManager: {
    suscribir: vi.fn(() => () => {}),
  },
}));

const SALIDA_MOCK: SalidaPublicada = {
  vigenciaId: 'vig-01',
  paqueteId: 'paq-01',
  paqueteNombre: 'Pasadía Islas del Rosario VIP',
  destino: 'Cartagena',
  noches: 0,
  fecha: '2026-11-20',
  cupoTotal: 15,
  desde: { unidades: '250000', moneda: 'COP' },
  desdeEsDeGrupo: false,
  tarifas: 2,
};

const COTIZACION_SALIDA_MOCK: CotizacionDeSalida = {
  paqueteId: 'paq-01',
  paqueteNombre: 'Pasadía Barú & Islas del Rosario',
  destino: 'Cartagena',
  noches: 0,
  fecha: '2026-11-20',
  vigenciaId: 'vig-01',
  vigenciaDesde: '2026-10-01',
  vigenciaHasta: '2026-12-15',
  deSalidaProgramada: true,
  pasajeros: 2,
  adultos: 2,
  ninos: 0,
  infantes: 0,
  total: { unidades: '500000', moneda: 'COP' },
  lineas: [
    {
      tarifaId: 'tar-01',
      nombre: 'Tarifa General Pasadía',
      unidad: 'POR_PERSONA',
      cubrePasajeros: 1,
      veces: 2,
      precioUnitario: { unidades: '250000', moneda: 'COP' },
      total: { unidades: '500000', moneda: 'COP' },
      masBarata: true,
    },
  ],
  alternativas: [],
  noAplicables: [],
  suplementos: [],
  pideComposicion: false,
};

describe('Revisión a 375 px y objetivos táctiles >= 44px (T-023)', () => {
  it('1. BarraModulos: todos los enlaces de módulos y botones tienen touch targets >= 44px en móvil', async () => {
    await React.act(async () => {
      render(<BarraModulos />);
      await Promise.resolve();
    });

    // Enlaces de navegación de la barra colapsada
    const enlaces = screen.getAllByRole('link');
    expect(enlaces.length).toBeGreaterThan(0);

    enlaces.forEach((enlace) => {
      // Debe incluir min-h-[44px] y min-w-[44px]
      const clases = enlace.className;
      const cumpleTouchTarget =
        clases.includes('min-h-[44px]') || clases.includes('h-11') || clases.includes('h-12');
      expect(cumpleTouchTarget).toBe(true);
    });

    // Botón de notificaciones y tema
    const botonNotif = screen.getByLabelText(/Alertas operativas/i);
    expect(botonNotif.className).toContain('min-h-[44px]');
    expect(botonNotif.className).toContain('min-w-[44px]');

    const botonTema = screen.getByLabelText(/Cambiar a modo/i);
    expect(botonTema.className).toContain('min-h-[44px]');
    expect(botonTema.className).toContain('min-w-[44px]');
  });

  it('2. ListaConversaciones (Bandeja): los chips de filtro y selector de densidad tienen touch target >= 44px', async () => {
    await React.act(async () => {
      render(<ListaConversaciones />);
      await Promise.resolve();
    });

    // Selector de densidad
    const btnDensidad = screen.getByTitle(/Cambiar a vista/i);
    expect(btnDensidad.className).toContain('min-h-[44px]');

    // Chips de filtro
    const tabsFiltro = screen.getAllByRole('tab');
    expect(tabsFiltro.length).toBeGreaterThanOrEqual(4);
    tabsFiltro.forEach((tab) => {
      expect(tab.className).toContain('min-h-[44px]');
    });
  });

  it('3. DesgloseCotizacionSalida (Cotizador): los botones de acción se expanden con touch target >= 44px', () => {
    render(
      <DesgloseCotizacionSalida
        cotizacion={COTIZACION_SALIDA_MOCK}
        copiado={false}
        alCopiarWhatsApp={vi.fn()}
        alGuardarCotizacion={vi.fn()}
      />,
    );

    const btnGuardar = screen.getByText('Guardar Oficial').closest('button');
    expect(btnGuardar).not.toBeNull();
    expect(btnGuardar?.className).toContain('min-h-[44px]');
    expect(btnGuardar?.className).toContain('w-full');

    const btnWhatsApp = screen.getByText('Copiar Propuesta para WhatsApp').closest('button');
    expect(btnWhatsApp).not.toBeNull();
    expect(btnWhatsApp?.className).toContain('min-h-[44px]');
    expect(btnWhatsApp?.className).toContain('w-full');
  });

  it('4. TarjetaSalidaPublicada (Catálogo): el botón de cotizar salida y ver ficha tienen min-h-[44px] y textos adaptables', () => {
    render(
      <TarjetaSalidaPublicada salida={SALIDA_MOCK} onVerFicha={vi.fn()} onCotizar={vi.fn()} />,
    );

    const btnFicha = screen.getByTestId('btn-ver-ficha-salida');
    expect(btnFicha.className).toContain('min-h-[44px]');

    const btnCotizar = screen.getByTestId('btn-cotizar-salida');
    expect(btnCotizar.className).toContain('min-h-[44px]');
    expect(btnCotizar.textContent).toContain('Cotizar');
  });
});
