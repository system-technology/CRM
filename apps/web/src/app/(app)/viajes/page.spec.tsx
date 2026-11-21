import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ReservasPage from './page';
import * as api from '../../../lib/archivos-api';
import * as auth from '../../../lib/auth-api';
import type { Permiso, SesionActual } from '@viajapro/contracts';
import { MOCK_DETALLES_ARCHIVOS } from '../../../lib/mock-archivos';

let busqueda = '';
const replace = vi.fn();
const push = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/viajes',
  useRouter: () => ({ push, replace, prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(busqueda),
}));
vi.mock('../../../lib/archivos-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/archivos-api')>();
  return {
    ...actual,
    listarArchivos: vi.fn(),
    obtenerArchivo: vi.fn(),
    actualizarReserva: vi.fn(),
    reemplazarPasajeros: vi.fn(),
    cancelarArchivo: vi.fn(),
  };
});

vi.mock('../../../lib/auth-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/auth-api')>();
  return { ...actual, obtenerSesionActualApi: vi.fn() };
});

function sesionCon(permisos: Permiso[]): SesionActual {
  return {
    ...auth.MOCK_SESION_UNICA_AGENCIA,
    acceso: { ...auth.MOCK_SESION_UNICA_AGENCIA.acceso!, permisos },
  };
}
const conSesion = (permisos: Permiso[]) =>
  vi.mocked(auth.obtenerSesionActualApi).mockResolvedValue(sesionCon(permisos));

const archivo = () => structuredClone(MOCK_DETALLES_ARCHIVOS[0]!);

describe('Reservas (T-243)', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    busqueda = '';
    conSesion(['archivo.ver', 'archivo.operar']);
    vi.mocked(api.listarArchivos).mockResolvedValue(MOCK_DETALLES_ARCHIVOS);
    vi.mocked(api.obtenerArchivo).mockImplementation((id) => {
      const a = MOCK_DETALLES_ARCHIVOS.find((x) => x.id === id);
      return Promise.resolve(structuredClone(a ?? archivo()));
    });
  });

  it('lista: muestra qué reserva vence primero, con qué mayorista y su semáforo', async () => {
    render(<ReservasPage />);
    const lista = await screen.findByRole('list', { name: 'Archivos de viaje' });
    const primero = within(lista).getAllByRole('listitem')[0]!;
    expect(within(primero).getByText('File 1043')).toBeDefined();
    expect(within(primero).getByText('Mayorista Caribe Tours')).toBeDefined();
    expect(within(primero).getByTestId('semaforo-plazo').getAttribute('data-semaforo')).toBe(
      'MENOS_DE_24_H',
    );
    expect(within(primero).getByText(/vence en \d+ horas?/)).toBeDefined();
  });

  it('cargando: esqueleto, no un spinner', async () => {
    vi.mocked(api.listarArchivos).mockReturnValue(new Promise(() => {}));
    render(<ReservasPage />);
    expect((await screen.findByLabelText('Cargando registros')).getAttribute('aria-busy')).toBe(
      'true',
    );
  });

  it('vacío: explica de dónde nacen los archivos y ofrece ir a cotizaciones', async () => {
    vi.mocked(api.listarArchivos).mockResolvedValue([]);
    render(<ReservasPage />);
    expect(await screen.findByText('Todavía no hay archivos de viaje.')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Ir a cotizaciones' }).getAttribute('href')).toBe(
      '/cotizaciones',
    );
  });

  it('error: dice qué pasó y qué hacer, y reintenta', async () => {
    vi.mocked(api.listarArchivos).mockRejectedValueOnce(
      new api.ArchivosApiError('ERROR_CONEXION', 'x', 0),
    );
    render(<ReservasPage />);
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toMatch(/No hay conexión/);
    expect(alerta.textContent).toMatch(/Qué hacer/);
    fireEvent.click(within(alerta).getByRole('button', { name: /Reintentar/ }));
    expect(await screen.findByText('File 1043')).toBeDefined();
  });

  it('con 500 archivos la lista se pinta y se puede buscar', async () => {
    const muchos = Array.from({ length: 500 }, (_, i) => ({
      ...archivo(),
      id: `00000000-0030-4000-8000-${String(i).padStart(12, '0')}`,
      numero: 2000 + i,
    }));
    vi.mocked(api.listarArchivos).mockResolvedValue(muchos);
    render(<ReservasPage />);
    const lista = await screen.findByRole('list', { name: 'Archivos de viaje' });
    expect(within(lista).getAllByRole('listitem')).toHaveLength(500);
    fireEvent.change(screen.getByLabelText(/Buscar por file/), { target: { value: '2499' } });
    expect(
      within(screen.getByRole('list', { name: 'Archivos de viaje' })).getAllByRole('listitem'),
    ).toHaveLength(1);
  });

  it('elegir un archivo lo pone en la URL con push, para que Atrás vuelva (T-318)', async () => {
    render(<ReservasPage />);
    fireEvent.click(await screen.findByText('File 1044'));
    expect(push).toHaveBeenCalledWith(`/viajes?id=${MOCK_DETALLES_ARCHIVOS[1]!.id}`, {
      scroll: false,
    });
    expect(replace).not.toHaveBeenCalled();
  });

  it('elegir A y luego B hace dos push, uno por archivo (T-318)', async () => {
    render(<ReservasPage />);
    fireEvent.click(await screen.findByText('File 1043'));
    fireEvent.click(screen.getByText('File 1044'));
    expect(push).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenNthCalledWith(1, `/viajes?id=${MOCK_DETALLES_ARCHIVOS[0]!.id}`, {
      scroll: false,
    });
    expect(push).toHaveBeenNthCalledWith(2, `/viajes?id=${MOCK_DETALLES_ARCHIVOS[1]!.id}`, {
      scroll: false,
    });
    expect(replace).not.toHaveBeenCalled();
  });

  it('?id con un archivo que no existe: error claro, sin tumbar la lista ni console.error (T-318)', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});
    busqueda = 'id=01932000-0000-7000-8000-00000000dead';
    vi.mocked(api.obtenerArchivo).mockRejectedValue(
      new api.ArchivosApiError('ARCHIVO_NO_ENCONTRADO', 'x', 404),
    );
    render(<ReservasPage />);
    const alertas = await screen.findAllByRole('alert');
    expect(alertas.some((a) => /ya no existe/.test(a.textContent ?? ''))).toBe(true);
    expect(screen.getByRole('list', { name: 'Archivos de viaje' })).toBeDefined();
    expect(consola).not.toHaveBeenCalled();
    consola.mockRestore();
  });

  it('?id que no es un UUID: avisa y no llama a la API con él (T-318)', async () => {
    busqueda = "id=1043'; DROP";
    render(<ReservasPage />);
    expect((await screen.findByTestId('reservas-enlace-invalido')).textContent).toMatch(
      /no apunta a un archivo/,
    );
    expect(api.obtenerArchivo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Volver a la lista' }));
    expect(push).toHaveBeenCalledWith('/viajes', { scroll: false });
  });

  describe('detalle', () => {
    beforeEach(() => {
      busqueda = `id=${MOCK_DETALLES_ARCHIVOS[0]!.id}`;
    });

    it('el estado inicial sale de ?id: abre ese archivo al montar (T-318)', async () => {
      render(<ReservasPage />);
      expect(await screen.findByRole('heading', { name: /File 1043/ })).toBeDefined();
      expect(api.obtenerArchivo).toHaveBeenCalledWith(MOCK_DETALLES_ARCHIVOS[0]!.id);
      expect(push).not.toHaveBeenCalled();
      expect(replace).not.toHaveBeenCalled();
    });

    it('muestra reservas por mayorista y pasajeros, sin neto si no viene', async () => {
      render(<ReservasPage />);
      expect(await screen.findByRole('heading', { name: /File 1043/ })).toBeDefined();
      const reservas = screen.getAllByTestId('reserva');
      expect(reservas).toHaveLength(2);
      expect(within(reservas[0]!).getByText(/Localizador CT-48213/)).toBeDefined();
      expect(screen.queryByText('Neto del mayorista')).toBeNull();
      expect(screen.getByText('Felipe Morales')).toBeDefined();
      expect(screen.getByText(/\$ 6\.200\.000/)).toBeDefined();
    });

    it('muestra el neto en pesos enteros cuando el servidor lo manda (R8)', async () => {
      vi.mocked(api.obtenerArchivo).mockImplementation(() => {
        const a = archivo();
        a.reservas[0]!.netoUnidades = '3500000';
        return Promise.resolve(a);
      });
      render(<ReservasPage />);
      expect(await screen.findByText(/\$ 3\.500\.000/)).toBeDefined();
    });

    it('confirmar exige el time limit y lo manda en UTC (hora de Bogotá)', async () => {
      const confirmado = archivo();
      vi.mocked(api.actualizarReserva).mockResolvedValue(confirmado);
      render(<ReservasPage />);
      const reservaSolicitada = (await screen.findAllByTestId('reserva'))[1]!;
      fireEvent.click(within(reservaSolicitada).getByRole('button', { name: 'Confirmar' }));

      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
      expect((await screen.findByRole('alert')).textContent).toMatch(/time limit/i);
      expect(api.actualizarReserva).not.toHaveBeenCalled();

      fireEvent.change(screen.getByLabelText(/Time limit/), {
        target: { value: '2026-12-01T18:30' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
      await waitFor(() => expect(api.actualizarReserva).toHaveBeenCalledTimes(1));
      expect(api.actualizarReserva).toHaveBeenCalledWith(
        MOCK_DETALLES_ARCHIVOS[0]!.id,
        MOCK_DETALLES_ARCHIVOS[0]!.reservas[1]!.id,
        { estado: 'CONFIRMADA', timeLimit: '2026-12-01T23:30:00.000Z' },
      );
    });

    it('abonar pide la fecha de pago total y caer pide el motivo', async () => {
      render(<ReservasPage />);
      const confirmada = (await screen.findAllByTestId('reserva'))[0]!;
      fireEvent.click(within(confirmada).getByRole('button', { name: 'Registrar abono' }));
      expect(screen.getByLabelText(/Fecha límite de pago total/)).toBeDefined();
      fireEvent.click(screen.getByRole('button', { name: 'Volver' }));
      fireEvent.click(within(confirmada).getByRole('button', { name: 'Marcar como caída' }));
      expect(screen.getByLabelText(/Motivo de la caída/)).toBeDefined();
    });

    it('un 409 del dominio se muestra en lenguaje claro y el formulario sigue abierto', async () => {
      vi.mocked(api.actualizarReserva).mockRejectedValue(
        new api.ArchivosApiError(
          'TRANSICION_DE_RESERVA_INVALIDA',
          'Una reserva X no puede...',
          409,
        ),
      );
      render(<ReservasPage />);
      const reserva = (await screen.findAllByTestId('reserva'))[0]!;
      fireEvent.click(within(reserva).getByRole('button', { name: 'Marcar como caída' }));
      fireEvent.change(screen.getByLabelText(/Motivo de la caída/), {
        target: { value: 'SIN_CUPO' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
      const alerta = await screen.findByRole('alert');
      expect(alerta.textContent).toMatch(/no puede pasar a ese estado/);
      expect(alerta.textContent).not.toMatch(/Una reserva X/);
      expect(screen.getByRole('button', { name: 'Guardar' })).toBeDefined();
    });

    it('edita pasajeros y manda la lista completa', async () => {
      vi.mocked(api.reemplazarPasajeros).mockResolvedValue(archivo());
      render(<ReservasPage />);
      fireEvent.click(await screen.findByRole('button', { name: 'Editar pasajeros' }));
      fireEvent.change(screen.getByLabelText('Nombre del pasajero 1'), {
        target: { value: 'Felipe A. Morales' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar pasajeros' }));
      await waitFor(() => expect(api.reemplazarPasajeros).toHaveBeenCalledTimes(1));
      const cuerpo = vi.mocked(api.reemplazarPasajeros).mock.calls[0]![1];
      expect(cuerpo.pasajeros).toHaveLength(3);
      expect(cuerpo.pasajeros[0]).toMatchObject({ nombre: 'Felipe A. Morales', esTitular: true });
    });

    it('cancela el archivo con motivo; OTRO exige nota y un 409 se explica', async () => {
      vi.mocked(api.cancelarArchivo).mockRejectedValueOnce(
        new api.ArchivosApiError('ARCHIVO_CON_RESERVA_PAGADA', 'x', 409),
      );
      render(<ReservasPage />);
      fireEvent.click(await screen.findByRole('button', { name: /Cancelar archivo…/ }));
      const dialogo = screen.getByRole('dialog');

      fireEvent.change(within(dialogo).getByLabelText(/Motivo/), { target: { value: 'OTRO' } });
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar archivo' }));
      expect((await within(dialogo).findByRole('alert')).textContent).toMatch(/nota/);
      expect(api.cancelarArchivo).not.toHaveBeenCalled();

      fireEvent.change(within(dialogo).getByLabelText(/Nota/), { target: { value: 'Se enfermó' } });
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar archivo' }));
      await waitFor(() => expect(api.cancelarArchivo).toHaveBeenCalledTimes(1));
      expect(api.cancelarArchivo).toHaveBeenCalledWith(MOCK_DETALLES_ARCHIVOS[0]!.id, {
        motivo: 'OTRO',
        nota: 'Se enfermó',
      });
      expect((await within(dialogo).findByRole('alert')).textContent).toMatch(/penalidad/);
    });

    it('un archivo cancelado no ofrece acciones', async () => {
      vi.mocked(api.obtenerArchivo).mockImplementation(() =>
        Promise.resolve({
          ...archivo(),
          estado: 'CANCELADO' as const,
          avance: null,
          motivoCancelacion: 'CLIENTE_DESISTIO' as const,
        }),
      );
      render(<ReservasPage />);
      expect(await screen.findByText(/El cliente desistió/)).toBeDefined();
      expect(screen.queryByRole('button', { name: /Cancelar archivo…/ })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Editar pasajeros' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Confirmar' })).toBeNull();
    });

    it('error al abrir el archivo: mensaje accionable y vuelta a la lista', async () => {
      vi.mocked(api.obtenerArchivo).mockRejectedValue(
        new api.ArchivosApiError('ARCHIVO_NO_ENCONTRADO', 'x', 404),
      );
      render(<ReservasPage />);
      const alertas = await screen.findAllByRole('alert');
      expect(alertas.some((a) => /ya no existe/.test(a.textContent ?? ''))).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: 'Volver a la lista' }));
      expect(push).toHaveBeenCalledWith('/viajes', { scroll: false });
    });
  });

  describe('permisos (T-252, ADR-0024 §3.7)', () => {
    it('sin archivo.ver: estado de sin acceso y no pide nada a la API', async () => {
      conSesion(['archivo.operar']);
      render(<ReservasPage />);
      const aviso = await screen.findByTestId('reservas-sin-acceso');
      expect(aviso.textContent).toMatch(/No tienes acceso a las reservas/);
      expect(aviso.textContent).toMatch(/Ver archivos de viaje/);
      expect(screen.getByRole('link', { name: 'Ir a la bandeja' }).getAttribute('href')).toBe(
        '/bandeja',
      );
      expect(api.listarArchivos).not.toHaveBeenCalled();
      expect(api.obtenerArchivo).not.toHaveBeenCalled();
    });

    it('sin sesión (falla la consulta): sin acceso, no un error crudo', async () => {
      vi.mocked(auth.obtenerSesionActualApi).mockRejectedValue(new Error('x'));
      render(<ReservasPage />);
      expect(await screen.findByTestId('reservas-sin-acceso')).toBeDefined();
      expect(api.listarArchivos).not.toHaveBeenCalled();
    });

    it('mientras se conocen los permisos no parpadea el sin acceso ni llama a la API', () => {
      vi.mocked(auth.obtenerSesionActualApi).mockReturnValue(new Promise(() => {}));
      render(<ReservasPage />);
      expect(screen.queryByTestId('reservas-sin-acceso')).toBeNull();
      expect(api.listarArchivos).not.toHaveBeenCalled();
    });

    it('con archivo.ver sin archivo.operar: lista y detalle legibles, sin botones de mutación', async () => {
      conSesion(['archivo.ver']);
      busqueda = `id=${MOCK_DETALLES_ARCHIVOS[0]!.id}`;
      render(<ReservasPage />);
      expect(await screen.findByRole('heading', { name: /File 1043/ })).toBeDefined();
      expect(screen.getAllByTestId('reserva')).toHaveLength(2);
      expect(screen.getByText('Felipe Morales')).toBeDefined();
      expect(screen.getByTestId('aviso-solo-lectura').textContent).toMatch(
        /Operar archivos de viaje/,
      );
      for (const nombre of [
        'Confirmar',
        'Registrar abono',
        'Marcar como caída',
        'Editar pasajeros',
        /Corregir localizador/,
        /Cancelar archivo…/,
      ]) {
        expect(screen.queryByRole('button', { name: nombre })).toBeNull();
      }
    });

    it('con archivo.ver y archivo.operar: ofrece las mutaciones y no el aviso de solo lectura', async () => {
      busqueda = `id=${MOCK_DETALLES_ARCHIVOS[0]!.id}`;
      render(<ReservasPage />);
      expect(await screen.findByRole('button', { name: 'Editar pasajeros' })).toBeDefined();
      expect(screen.getByRole('button', { name: /Cancelar archivo…/ })).toBeDefined();
      expect(
        screen.getAllByRole('button', { name: /Corregir localizador/ }).length,
      ).toBeGreaterThan(0);
      expect(screen.queryByTestId('aviso-solo-lectura')).toBeNull();
    });
  });
});
