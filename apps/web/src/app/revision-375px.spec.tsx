import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PipelinePage from './pipeline/page';
import CatalogoPage from './catalogo/page';
import CotizadorPage from './cotizador/page';
import { ListaConversaciones } from '../components/bandeja/lista-conversaciones';
import {
  cumpleTamanoMinimoTactil,
  esViewportMovil,
  ANCHO_MINIMO_TEST_MOVIL_PX,
  TAMANO_MINIMO_TACTIL_PX,
} from '../lib/accesibilidad-logica';

vi.mock('next/navigation', () => ({
  usePathname: () => '/pipeline',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: 'conv-1' }),
}));

vi.mock('../lib/modo-demo', () => ({
  useModoDemo: () => ({ esDemo: true, setEsDemo: vi.fn() }),
  esModoDemo: () => true,
  activarModoDemo: vi.fn(),
  desactivarModoDemo: vi.fn(),
}));

vi.mock('../lib/permisos', () => ({
  usePermisos: () => ({
    cargando: false,
    esAdmin: true,
    puedeVerReportes: true,
    puedeGestionarEquipo: true,
    puedeAccederAjustes: true,
    puedeVerNetoYMargen: true,
    sesion: {
      usuario: { id: 'u1', nombre: 'Carlos Asesor', email: 'carlos@agencia.com', rol: 'ASESOR' },
      agencia: { id: 'ag-1', nombre: 'JD Tours Cartagena' },
      permisos: ['catalogo.ver', 'cotizaciones.crear', 'inbox.ver'],
    },
  }),
}));

vi.mock('../lib/inbox-socket', () => ({
  useInboxSocket: () => ({
    estadoSocket: 'conectado',
    ultimoEvento: null,
  }),
  inboxSocketManager: {
    conectar: vi.fn(),
    desconectar: vi.fn(),
    registrarConsumidor: vi.fn(),
    liberarConsumidor: vi.fn(),
    notificarEvento: vi.fn(),
    suscribir: vi.fn(() => () => {}),
  },
}));

describe('T-023: Revisión a 375 px de las 4 pantallas operativas (Bandeja, Pipeline, Cotizador, Catálogo)', () => {
  it('1. Constantes de diseño cumplen con el estándar WCAG AA de 375 px y 44 px', () => {
    expect(ANCHO_MINIMO_TEST_MOVIL_PX).toBe(375);
    expect(TAMANO_MINIMO_TACTIL_PX).toBe(44);
    expect(esViewportMovil(375)).toBe(true);
    expect(cumpleTamanoMinimoTactil(44, 44)).toBe(true);
  });

  it('2. Bandeja: Filtros de conversación tienen objetivo táctil >= 44 px en móvil', () => {
    render(<ListaConversaciones />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBeGreaterThan(0);
    for (const tab of tabs) {
      expect(tab.className).toContain('min-h-[44px]');
    }
  });

  it('3. Pipeline: Selector de vistas (Kanban/Tabla) y tabs de etapa móvil tienen touch targets >= 44 px', () => {
    render(<PipelinePage />);
    const btnKanban = screen.getByRole('button', { name: /kanban/i });
    const btnTabla = screen.getByRole('button', { name: /tabla/i });
    expect(btnKanban.className).toContain('min-h-[44px]');
    expect(btnTabla.className).toContain('min-h-[44px]');
    const tabsEtapas = screen.getAllByRole('tab');
    expect(tabsEtapas.length).toBeGreaterThan(0);
    for (const tab of tabsEtapas) {
      expect(tab.className).toContain('min-h-[44px]');
    }
    const segundaEtapa = tabsEtapas[1];
    if (segundaEtapa) {
      fireEvent.click(segundaEtapa);
      expect(segundaEtapa.getAttribute('aria-selected')).toBe('true');
    }
  });

  it('4. Cotizador: Controles de pasajeros (+/-) y acciones principales cumplen con >= 44 px', () => {
    render(<CotizadorPage />);
    const botonesMenos = screen.getAllByRole('button', { name: '-' });
    const botonesMas = screen.getAllByRole('button', { name: '+' });
    expect(botonesMenos.length).toBeGreaterThanOrEqual(1);
    expect(botonesMas.length).toBeGreaterThanOrEqual(1);
    for (const btn of [...botonesMenos, ...botonesMas]) {
      expect(btn.className).toContain('min-h-[44px]');
      expect(btn.className).toContain('min-w-[44px]');
    }
  });

  it('5. Catálogo: Enlaces de acción y filtros interactivos cumplen con el estándar táctil de 44 px', () => {
    render(<CatalogoPage />);
    const linkCotizador = screen.getByRole('link', { name: /ir al cotizador/i });
    expect(linkCotizador.className).toContain('min-h-[44px]');
    const selectores = screen.getAllByRole('combobox');
    for (const sel of selectores) {
      expect(sel.className).toContain('min-h-[44px]');
    }
  });
});
