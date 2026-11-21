import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ReportesPage from './page';

let busqueda = '';
vi.mock('next/navigation', () => ({
  usePathname: () => '/reportes',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(busqueda),
}));
vi.mock('../../../components/dashboard-admin/dashboard-admin', () => ({
  DashboardAdmin: () => <div data-testid="dashboard-admin-montado" />,
}));

describe('Reportes en la demostración (T-566)', () => {
  beforeEach(() => {
    busqueda = '';
    window.localStorage.clear();
    window.localStorage.setItem('viajapro_modo_demo', 'true');
  });

  it('con la vista de dueño (por defecto) se ve la agencia entera', async () => {
    render(<ReportesPage />);
    await waitFor(() => expect(screen.getByTestId('reportes-reales')).toBeDefined());
    expect(screen.getByTestId('reportes-ambito')).toBeDefined();
    expect(screen.getByTestId('dashboard-admin-montado')).toBeDefined();
  });

  it('con la vista de asesor guardada (sin parámetros en la URL) se ve «Mis números», sin comparar asesores', async () => {
    window.localStorage.setItem('viajapro_vista_demo', 'asesor');
    render(<ReportesPage />);
    await waitFor(() => expect(screen.getByTestId('mis-numeros')).toBeDefined());
    expect(screen.queryByTestId('reportes-reales')).toBeNull();
    expect(screen.queryByTestId('reportes-ambito')).toBeNull();
    expect(screen.queryByTestId('dashboard-admin-montado')).toBeNull();
  });
});
