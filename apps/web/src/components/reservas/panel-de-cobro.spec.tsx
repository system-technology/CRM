import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';
import type { CobroDelArchivo, Permiso } from '@viajapro/contracts';
import { MOCK_COBROS } from '../../lib/mock-cobros';
import { PanelDeCobro } from './panel-de-cobro';

const obtenerCobroDelArchivo = vi.fn();
const registrarPago = vi.fn();
vi.mock('../../lib/cobros-api', () => ({
  obtenerCobroDelArchivo: (...a: unknown[]): unknown => obtenerCobroDelArchivo(...a),
  registrarPago: (...a: unknown[]): unknown => registrarPago(...a),
}));

let permisos: Permiso[] = [];
vi.mock('../../lib/permisos', async (original) => ({
  ...(await original<typeof import('../../lib/permisos')>()),
  usePermisos: () => ({
    sesion: null,
    cargando: false,
    tienePermiso: (p: Permiso) => permisos.includes(p),
  }),
}));

const CON_PAGOS = MOCK_COBROS[0]!;
const SIN_PAGOS = MOCK_COBROS[1]!;

const pintar = () =>
  render(<PanelDeCobro archivoId={CON_PAGOS.archivoId} numero={1043} zona="America/Bogota" />);

describe('PanelDeCobro', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permisos = ['cobro.ver', 'cobro.registrar'];
    obtenerCobroDelArchivo.mockResolvedValue(CON_PAGOS);
  });

  describe('lo que se ve', () => {
    it('muestra total, pagado y saldo tal como los derivó el servidor', async () => {
      pintar();
      expect(await screen.findByText('$ 2.700.000')).toBeTruthy();
      expect(screen.getByText('$ 6.200.000')).toBeTruthy();
      expect(screen.getByText('$ 3.500.000')).toBeTruthy();
      expect(screen.getByText('Falta por cobrar')).toBeTruthy();
    });

    it('lista el historial, del pago más reciente al más antiguo', async () => {
      pintar();
      const historial = await screen.findByTestId('historial-de-pagos');
      const filas = historial.querySelectorAll('li');
      expect(filas).toHaveLength(2);
      // El más reciente es el de efectivo (hace 3 días), no el de transferencia (hace 12).
      expect(filas[0]!.textContent).toContain('Efectivo');
      expect(filas[1]!.textContent).toContain('Transferencia');
    });

    it('con saldo a favor enseña el importe EN POSITIVO: el signo se dice con palabras', async () => {
      const aFavor: CobroDelArchivo = {
        ...CON_PAGOS,
        situacion: 'SALDO_A_FAVOR',
        // El dominio devuelve el saldo con signo: negativo = saldo a favor.
        saldo: { unidades: '-100000', moneda: 'COP' },
      };
      obtenerCobroDelArchivo.mockResolvedValue(aFavor);
      pintar();
      expect(await screen.findByText('Saldo a favor')).toBeTruthy();
      // Lo que falla si se pasa el saldo crudo a formatearDinero: «Saldo a favor −$ 100.000»,
      // que se lee como una deuda con el signo al revés.
      expect(screen.getByText('$ 100.000')).toBeTruthy();
      expect(screen.getByTestId('panel-de-cobro').textContent).not.toMatch(/[-−]\s*\$/);
      expect(screen.queryByText('Falta por cobrar')).toBeNull();
    });
  });

  describe('estado vacío', () => {
    it('sin pagos invita a registrar el primero', async () => {
      obtenerCobroDelArchivo.mockResolvedValue(SIN_PAGOS);
      pintar();
      expect(await screen.findByTestId('historial-vacio')).toBeTruthy();
      expect(screen.queryByTestId('historial-de-pagos')).toBeNull();
      expect(screen.getByTestId('historial-vacio').textContent).toContain('regístralo aquí');
    });

    it('sin permiso de registrar, el vacío no promete una acción que no se puede hacer', async () => {
      permisos = ['cobro.ver'];
      obtenerCobroDelArchivo.mockResolvedValue(SIN_PAGOS);
      pintar();
      const vacio = await screen.findByTestId('historial-vacio');
      expect(vacio.textContent).not.toContain('regístralo aquí');
    });
  });

  describe('estado de error', () => {
    it('explica qué pasó y ofrece reintentar, sin el texto crudo del servidor', async () => {
      obtenerCobroDelArchivo.mockRejectedValue({ status: 500, message: 'pg_error 42501' });
      pintar();
      const alerta = await screen.findByRole('alert');
      expect(alerta.textContent).toContain('No se pudo cargar el cobro');
      expect(alerta.textContent).not.toContain('pg_error');
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
    });

    it('reintentar vuelve a pedir el cobro', async () => {
      obtenerCobroDelArchivo.mockRejectedValueOnce({ status: 500 }).mockResolvedValue(CON_PAGOS);
      pintar();
      fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
      expect(await screen.findByText('$ 2.700.000')).toBeTruthy();
      expect(obtenerCobroDelArchivo).toHaveBeenCalledTimes(2);
    });
  });

  describe('sin permiso (ADR-0034 §6)', () => {
    it('sin «cobro.ver» no se pide nada a la API y se explica por qué', async () => {
      permisos = [];
      pintar();
      expect(await screen.findByTestId('cobro-sin-permiso')).toBeTruthy();
      expect(obtenerCobroDelArchivo).not.toHaveBeenCalled();
    });

    it('sin «cobro.registrar» se ve el saldo pero no se ofrece registrar', async () => {
      permisos = ['cobro.ver'];
      pintar();
      expect(await screen.findByText('$ 2.700.000')).toBeTruthy();
      expect(screen.queryByTestId('abrir-registrar-pago')).toBeNull();
      expect(screen.getByTestId('cobro-sin-permiso-registrar').textContent).toContain(
        'Registrar pagos',
      );
    });

    it('sin «cobro.corregir» no se ofrece corregir ni reversar: eso es del dueño', async () => {
      permisos = ['cobro.ver', 'cobro.registrar'];
      pintar();
      await screen.findByTestId('historial-de-pagos');
      expect(
        screen.queryByRole('button', { name: /Reversar|Corregir|Devolver|Ajustar/i }),
      ).toBeNull();
      expect(screen.getByTestId('cobro-sin-permiso-corregir')).toBeTruthy();
    });

    it('un archivo cancelado no ofrece registrar aunque haya permiso', async () => {
      obtenerCobroDelArchivo.mockResolvedValue({
        ...CON_PAGOS,
        estadoDelArchivo: 'CANCELADO',
        estadoDeCobro: 'CANCELADO',
      });
      pintar();
      await screen.findByText('$ 2.700.000');
      expect(screen.queryByTestId('abrir-registrar-pago')).toBeNull();
    });
  });

  describe('registrar un pago', () => {
    /** Abre el diálogo, llena monto y medio, y devuelve el botón que confirma DENTRO de él. */
    const abrirYLlenar = async (monto: string): Promise<HTMLElement> => {
      fireEvent.click(await screen.findByTestId('abrir-registrar-pago'));
      const dialogo = within(screen.getByRole('dialog'));
      fireEvent.change(dialogo.getByLabelText('Cuánto pagó *'), { target: { value: monto } });
      fireEvent.change(dialogo.getByLabelText('Cómo pagó *'), {
        target: { value: 'TRANSFERENCIA' },
      });
      return dialogo.getByRole('button', { name: 'Registrar pago' });
    };

    it('el verbo del botón y el de su confirmación son el mismo: registrar', async () => {
      registrarPago.mockResolvedValue({
        movimiento: { ...CON_PAGOS.movimientos[0]!, monto: { unidades: '500000', moneda: 'COP' } },
        cobro: { ...CON_PAGOS, saldo: { unidades: '2200000', moneda: 'COP' } },
      });
      pintar();
      const confirmar = await abrirYLlenar('500.000');

      // Ni «Guardar» ni ningún otro verbo: el que abre y el que confirma dicen lo mismo.
      expect(screen.queryByRole('button', { name: /^Guardar/ })).toBeNull();
      expect(screen.getAllByRole('button', { name: 'Registrar pago' })).toHaveLength(2);
      fireEvent.click(confirmar);

      const aviso = await screen.findByTestId('pago-registrado');
      expect(aviso.textContent).toContain('Pago registrado');
      expect(aviso.textContent).toContain('$ 500.000');
      // El saldo que se pinta es el que devolvió el servidor.
      expect(aviso.textContent).toContain('$ 2.200.000');
    });

    it('envía el monto en la unidad mínima de COP, que es el peso (R8)', async () => {
      registrarPago.mockResolvedValue({
        movimiento: CON_PAGOS.movimientos[0]!,
        cobro: CON_PAGOS,
      });
      pintar();
      fireEvent.click(await abrirYLlenar('1.250.000'));

      await waitFor(() => expect(registrarPago).toHaveBeenCalled());
      const [, cuerpo] = registrarPago.mock.calls[0] as [string, Record<string, unknown>];
      expect(cuerpo['monto']).toEqual({ unidades: '1250000', moneda: 'COP' });
      expect(cuerpo['tipo']).toBe('PAGO');
      expect(cuerpo['medio']).toBe('TRANSFERENCIA');
      expect(cuerpo['pagadoEl']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(cuerpo['claveIdempotencia']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('tras un fallo de red, reintentar NO cobra dos veces aunque se cierre el diálogo', async () => {
      // El POST llegó y se guardó; la respuesta se perdió. La asesora ve un error de conexión.
      registrarPago.mockRejectedValueOnce({ code: 'ERROR_CONEXION', status: 0 });
      pintar();
      fireEvent.click(await abrirYLlenar('500.000'));
      expect((await screen.findByTestId('error-registrar-pago')).textContent).toContain(
        'No se pudo conectar',
      );

      // Cierra el diálogo —convencida de que no se guardó— y vuelve a registrar el mismo pago.
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Volver' }));
      registrarPago.mockResolvedValue({
        movimiento: { ...CON_PAGOS.movimientos[0]!, monto: { unidades: '500000', moneda: 'COP' } },
        cobro: CON_PAGOS,
      });
      fireEvent.click(await abrirYLlenar('500.000'));

      await waitFor(() => expect(registrarPago).toHaveBeenCalledTimes(2));
      const primera = registrarPago.mock.calls[0]![1] as Record<string, unknown>;
      const segunda = registrarPago.mock.calls[1]![1] as Record<string, unknown>;
      // Misma clave ⇒ el servidor devuelve la fila que ya existe en vez de crear otra (R5).
      // El asesor no podría deshacerlo: reversar es de `cobro.corregir` (ADR-0034 §6).
      expect(segunda['claveIdempotencia']).toBe(primera['claveIdempotencia']);
    });

    it('tras un alta confirmada, el siguiente pago lleva una clave NUEVA', async () => {
      registrarPago.mockResolvedValue({
        movimiento: { ...CON_PAGOS.movimientos[0]!, monto: { unidades: '500000', moneda: 'COP' } },
        cobro: CON_PAGOS,
      });
      pintar();
      fireEvent.click(await abrirYLlenar('500.000'));
      await screen.findByTestId('pago-registrado');
      fireEvent.click(await abrirYLlenar('300.000'));

      await waitFor(() => expect(registrarPago).toHaveBeenCalledTimes(2));
      const primera = registrarPago.mock.calls[0]![1] as Record<string, unknown>;
      const segunda = registrarPago.mock.calls[1]![1] as Record<string, unknown>;
      expect(segunda['claveIdempotencia']).not.toBe(primera['claveIdempotencia']);
    });

    it('tras un fallo relee el cobro, para no dejar en pantalla un saldo que ya cambió', async () => {
      registrarPago.mockRejectedValueOnce({ code: 'ERROR_CONEXION', status: 0 });
      obtenerCobroDelArchivo.mockResolvedValueOnce(CON_PAGOS).mockResolvedValue({
        ...CON_PAGOS,
        pagado: { unidades: '4000000', moneda: 'COP' },
        saldo: { unidades: '2200000', moneda: 'COP' },
      });
      pintar();
      fireEvent.click(await abrirYLlenar('500.000'));

      // Se pidió otra vez: el pago pudo haberse guardado aunque la respuesta se perdiera.
      await waitFor(() => expect(obtenerCobroDelArchivo).toHaveBeenCalledTimes(2));
      // Y el diálogo sigue abierto, con el error a la vista y lo escrito sin perderse.
      expect(screen.getByRole('dialog')).toBeTruthy();
      expect(screen.getByTestId('error-registrar-pago')).toBeTruthy();
    });

    it('un monto mal escrito ni siquiera llega a la API', async () => {
      pintar();
      fireEvent.click(await abrirYLlenar('1.250,50')); // centavos en pesos

      expect(await screen.findByTestId('error-registrar-pago')).toBeTruthy();
      expect(registrarPago).not.toHaveBeenCalled();
    });

    it('el sobrepago se ofrece confirmar en vez de bloquear, y reintenta con la MISMA clave', async () => {
      registrarPago.mockRejectedValueOnce({ code: 'SOBREPAGO_SIN_CONFIRMAR' }).mockResolvedValue({
        movimiento: { ...CON_PAGOS.movimientos[0]!, monto: { unidades: '9000000', moneda: 'COP' } },
        cobro: { ...CON_PAGOS, situacion: 'SALDO_A_FAVOR' },
      });
      pintar();
      fireEvent.click(await abrirYLlenar('9.000.000'));

      expect((await screen.findByTestId('error-registrar-pago')).textContent).toContain(
        'saldo a favor',
      );
      const dialogo = within(screen.getByRole('dialog'));
      fireEvent.click(dialogo.getByRole('checkbox'));
      fireEvent.click(dialogo.getByRole('button', { name: 'Registrar pago' }));

      await waitFor(() => expect(registrarPago).toHaveBeenCalledTimes(2));
      const primera = registrarPago.mock.calls[0]![1] as Record<string, unknown>;
      const segunda = registrarPago.mock.calls[1]![1] as Record<string, unknown>;
      // R5: reintentar el mismo pago no puede cobrar dos veces.
      expect(segunda['claveIdempotencia']).toBe(primera['claveIdempotencia']);
      expect(segunda['confirmarSobrepago']).toBe(true);
    });
  });
});
