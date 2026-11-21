import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ConversacionResumen, Etiqueta, EtiquetaDeConversacion } from '@viajapro/contracts';
import { EtiquetasDelChat } from './etiquetas-del-chat';
import { ProveedorDeEtiquetas } from '../../lib/use-catalogo-de-etiquetas';
import { etiquetasApi } from '../../lib/etiquetas-api';
import { InboxErrorApi } from '../../lib/inbox-api';
import { escucharEtiquetasDeConversacion } from '../../lib/etiquetas-eventos';

const ID_CONV = '00000000-0001-4000-8000-000000000001';
const CAT: Etiqueta[] = [
  { id: '00000000-0004-4000-8000-000000000001', nombre: 'Pagado', color: 'verde', orden: 0 },
  {
    id: '00000000-0004-4000-8000-000000000002',
    nombre: 'Pago pendiente',
    color: 'ambar',
    orden: 1,
  },
  { id: '00000000-0004-4000-8000-000000000003', nombre: 'Seguimiento', color: 'azul', orden: 2 },
];
const [PAGADO, PENDIENTE, SEGUIMIENTO] = CAT as [Etiqueta, Etiqueta, Etiqueta];
const conv = (e: Etiqueta): EtiquetaDeConversacion => ({
  id: e.id,
  nombre: e.nombre,
  color: e.color,
});

function resumenCon(etiquetas: EtiquetaDeConversacion[]): ConversacionResumen {
  return {
    id: ID_CONV,
    contactoId: '00000000-0002-4000-8000-000000000001',
    contactoNombre: 'Contacto Demo A',
    contactoTelefono: '+573000000001',
    estado: 'ABIERTA',
    ventana: { abierta: true, expiraEn: null, minutosRestantes: 1440 },
    asignadoAId: null,
    asignadoANombre: null,
    ultimoMensajeTexto: null,
    ultimoMensajeEn: null,
    ultimoMensajeDireccion: null,
    mensajesSinLeer: 0,
    slaVenceEn: null,
    etiquetas,
  };
}

/** Quien posee las etiquetas del detalle, como la página del chat. */
function Arnes({
  inicial = [],
  puedeOperar = true,
  puedeAdministrar = false,
  abiertoInicial = false,
}: {
  inicial?: EtiquetaDeConversacion[];
  puedeOperar?: boolean;
  puedeAdministrar?: boolean;
  abiertoInicial?: boolean;
}) {
  const [etiquetas, setEtiquetas] = useState(inicial);
  const [abierto, setAbierto] = useState(abiertoInicial);
  return (
    <ProveedorDeEtiquetas>
      <EtiquetasDelChat
        conversacionId={ID_CONV}
        etiquetas={etiquetas}
        alCambiar={setEtiquetas}
        puedeOperar={puedeOperar}
        puedeAdministrar={puedeAdministrar}
        abierto={abierto}
        alCambiarAbierto={setAbierto}
      />
    </ProveedorDeEtiquetas>
  );
}

const chips = () => screen.queryAllByTestId('chip-de-etiqueta').map((c) => c.textContent?.trim());

describe('EtiquetasDelChat: poner y quitar, optimista y con camino de error', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(etiquetasApi, 'listar').mockResolvedValue(CAT);
  });
  afterEach(cleanup);

  it('«+ Etiqueta» abre el selector con las de la agencia; el chip aparece ANTES de la respuesta del servidor', async () => {
    let resolver: (r: ConversacionResumen) => void = () => undefined;
    const poner = vi
      .spyOn(etiquetasApi, 'ponerEnConversacion')
      .mockReturnValue(new Promise((r) => (resolver = r)));
    render(<Arnes />);
    expect(chips()).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Agregar etiqueta' }));
    const selector = await screen.findByTestId('selector-de-etiquetas');
    await within(selector).findAllByRole('menuitemcheckbox');
    fireEvent.click(within(selector).getByRole('menuitemcheckbox', { name: /Pago pendiente/ }));

    // El servidor aún no contestó: el chip ya está, y la fila del selector marcada.
    expect(chips()).toEqual(['Pago pendiente']);
    expect(
      within(selector)
        .getByRole('menuitemcheckbox', { name: /Pago pendiente/ })
        .getAttribute('aria-checked'),
    ).toBe('true');
    expect(poner).toHaveBeenCalledWith(ID_CONV, PENDIENTE.id);

    await act(() => Promise.resolve(resolver(resumenCon([conv(PENDIENTE)]))));
    expect(chips()).toEqual(['Pago pendiente']);
  });

  it('el selector se queda abierto para marcar varias y las deja en el orden del catálogo', async () => {
    vi.spyOn(etiquetasApi, 'ponerEnConversacion').mockImplementation((_c, etiquetaId) =>
      Promise.resolve(
        resumenCon(
          etiquetaId === SEGUIMIENTO.id ? [conv(SEGUIMIENTO)] : [conv(PAGADO), conv(SEGUIMIENTO)],
        ),
      ),
    );
    render(<Arnes abiertoInicial />);
    const selector = await screen.findByTestId('selector-de-etiquetas');
    await within(selector).findAllByRole('menuitemcheckbox');
    fireEvent.click(within(selector).getByRole('menuitemcheckbox', { name: /Seguimiento/ }));
    fireEvent.click(within(selector).getByRole('menuitemcheckbox', { name: /Pagado/ }));
    await waitFor(() => expect(chips()).toEqual(['Pagado', 'Seguimiento']));
    expect(screen.getByTestId('selector-de-etiquetas')).toBeDefined();
  });

  it('quitar con la «×» del chip: un toque, optimista', async () => {
    let resolver: (r: ConversacionResumen) => void = () => undefined;
    const quitar = vi
      .spyOn(etiquetasApi, 'quitarDeConversacion')
      .mockReturnValue(new Promise((r) => (resolver = r)));
    render(<Arnes inicial={[conv(PAGADO), conv(SEGUIMIENTO)]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Quitar etiqueta Pagado' }));
    expect(chips()).toEqual(['Seguimiento']);
    expect(quitar).toHaveBeenCalledWith(ID_CONV, PAGADO.id);
    await act(() => Promise.resolve(resolver(resumenCon([conv(SEGUIMIENTO)]))));
    expect(chips()).toEqual(['Seguimiento']);
  });

  it('si el servidor rechaza por conexión: el chip vuelve, el aviso dice qué pasó y «Reintentar» lo intenta de nuevo', async () => {
    const poner = vi
      .spyOn(etiquetasApi, 'ponerEnConversacion')
      .mockRejectedValueOnce(new InboxErrorApi('ERROR_CONEXION', 'x'))
      .mockResolvedValueOnce(resumenCon([conv(PAGADO)]));
    render(<Arnes abiertoInicial />);
    const selector = await screen.findByTestId('selector-de-etiquetas');
    await within(selector).findAllByRole('menuitemcheckbox');
    fireEvent.click(within(selector).getByRole('menuitemcheckbox', { name: /Pagado/ }));

    const aviso = await screen.findByTestId('aviso-de-etiqueta');
    expect(aviso.textContent).toContain(
      'No se pudo poner “Pagado”: sin conexión. Toca para reintentar.',
    );
    expect(chips()).toEqual([]);

    fireEvent.click(screen.getByTestId('reintentar-etiqueta'));
    await waitFor(() => expect(chips()).toEqual(['Pagado']));
    expect(poner).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('aviso-de-etiqueta')).toBeNull();
  });

  it('si el servidor rechaza al quitar, la etiqueta vuelve a su sitio', async () => {
    vi.spyOn(etiquetasApi, 'quitarDeConversacion').mockRejectedValue(
      new InboxErrorApi('ERROR_CONEXION', 'x'),
    );
    render(<Arnes inicial={[conv(PAGADO), conv(SEGUIMIENTO)]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Quitar etiqueta Pagado' }));
    await screen.findByTestId('aviso-de-etiqueta');
    expect(chips()).toEqual(['Pagado', 'Seguimiento']);
    expect(screen.getByTestId('aviso-de-etiqueta').textContent).toContain(
      'No se pudo quitar “Pagado”',
    );
  });

  it('etiqueta borrada por otra persona: vuelve el chip, avisa y vuelve a pedir el catálogo', async () => {
    vi.spyOn(etiquetasApi, 'ponerEnConversacion').mockRejectedValue(
      new InboxErrorApi('ETIQUETA_NO_ENCONTRADA', 'x'),
    );
    const listar = vi.mocked(etiquetasApi.listar);
    render(<Arnes abiertoInicial />);
    const selector = await screen.findByTestId('selector-de-etiquetas');
    await within(selector).findAllByRole('menuitemcheckbox');
    const antes = listar.mock.calls.length;
    fireEvent.click(within(selector).getByRole('menuitemcheckbox', { name: /Pagado/ }));

    const aviso = await screen.findByTestId('aviso-de-etiqueta');
    expect(aviso.textContent).toContain('“Pagado” ya no existe');
    expect(chips()).toEqual([]);
    // Sin «Reintentar»: reintentar no arregla una etiqueta que ya no existe.
    expect(screen.queryByTestId('reintentar-etiqueta')).toBeNull();
    await waitFor(() => expect(listar.mock.calls.length).toBeGreaterThan(antes));
  });

  it('tope de 10: lo dice sin llamar al servidor cuando ya se ve que está lleno', async () => {
    const llenas: EtiquetaDeConversacion[] = Array.from({ length: 10 }, (_, i) => ({
      id: `00000000-0004-4000-8000-0000000001${i.toString().padStart(2, '0')}`,
      nombre: `Extra ${i}`,
      color: 'gris' as const,
    }));
    const poner = vi.spyOn(etiquetasApi, 'ponerEnConversacion');
    render(<Arnes inicial={llenas} abiertoInicial />);
    const selector = await screen.findByTestId('selector-de-etiquetas');
    await within(selector).findAllByRole('menuitemcheckbox');
    fireEvent.click(within(selector).getByRole('menuitemcheckbox', { name: /Pagado/ }));
    const aviso = await screen.findByTestId('aviso-de-etiqueta');
    expect(aviso.textContent).toContain(
      'Una conversación admite hasta 10 etiquetas. Quita una para poner “Pagado”.',
    );
    expect(poner).not.toHaveBeenCalled();
    expect(chips()).toHaveLength(10);
  });

  it('tope de 10 que responde el servidor (otra persona llenó la conversación): revierte y avisa', async () => {
    vi.spyOn(etiquetasApi, 'ponerEnConversacion').mockRejectedValue(
      new InboxErrorApi('TOPE_DE_ETIQUETAS_DE_LA_CONVERSACION', 'x'),
    );
    render(<Arnes abiertoInicial />);
    const selector = await screen.findByTestId('selector-de-etiquetas');
    await within(selector).findAllByRole('menuitemcheckbox');
    fireEvent.click(within(selector).getByRole('menuitemcheckbox', { name: /Pagado/ }));
    const aviso = await screen.findByTestId('aviso-de-etiqueta');
    expect(aviso.textContent).toContain('hasta 10 etiquetas');
    expect(chips()).toEqual([]);
  });

  it('conversación que ya no se ve (404): «Ya no tienes acceso a esta conversación»', async () => {
    vi.spyOn(etiquetasApi, 'quitarDeConversacion').mockRejectedValue(
      new InboxErrorApi('CONVERSACION_NO_ENCONTRADA', 'x'),
    );
    render(<Arnes inicial={[conv(PAGADO)]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Quitar etiqueta Pagado' }));
    const aviso = await screen.findByTestId('aviso-de-etiqueta');
    expect(aviso.textContent).toContain('Ya no tienes acceso a esta conversación.');
  });

  it('idempotente: dos toques seguidos sobre la misma etiqueta hacen UNA petición', async () => {
    let resolver: (r: ConversacionResumen) => void = () => undefined;
    const quitar = vi
      .spyOn(etiquetasApi, 'quitarDeConversacion')
      .mockReturnValue(new Promise((r) => (resolver = r)));
    render(<Arnes inicial={[conv(PAGADO)]} abiertoInicial />);
    const selector = await screen.findByTestId('selector-de-etiquetas');
    const fila = await within(selector).findByRole('menuitemcheckbox', { name: /Pagado/ });
    fireEvent.click(fila);
    fireEvent.click(fila);
    expect(quitar).toHaveBeenCalledTimes(1);
    await act(() => Promise.resolve(resolver(resumenCon([]))));
    expect(chips()).toEqual([]);
  });

  it('avisa a la lista de la bandeja al instante, sin esperar al servidor', async () => {
    vi.spyOn(etiquetasApi, 'ponerEnConversacion').mockReturnValue(new Promise(() => undefined));
    const oyente = vi.fn();
    const baja = escucharEtiquetasDeConversacion(oyente);
    render(<Arnes abiertoInicial />);
    const selector = await screen.findByTestId('selector-de-etiquetas');
    await within(selector).findAllByRole('menuitemcheckbox');
    fireEvent.click(within(selector).getByRole('menuitemcheckbox', { name: /Seguimiento/ }));
    expect(oyente).toHaveBeenCalledWith(ID_CONV, [
      expect.objectContaining({ nombre: 'Seguimiento' }),
    ]);
    baja();
  });

  it('el aviso no escribe el nombre de la etiqueta en la consola (R10)', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(etiquetasApi, 'quitarDeConversacion').mockRejectedValue(
      new InboxErrorApi('ERROR_CONEXION', 'x'),
    );
    render(<Arnes inicial={[conv(PAGADO)]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Quitar etiqueta Pagado' }));
    await screen.findByTestId('aviso-de-etiqueta');
    for (const espia of [consola, aviso, log]) {
      expect(JSON.stringify(espia.mock.calls)).not.toContain('Pagado');
    }
  });
});

describe('EtiquetasDelChat: permisos y catálogo', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(etiquetasApi, 'listar').mockResolvedValue(CAT);
  });
  afterEach(cleanup);

  it('sin bandeja.operar los chips se ven sin «×» ni «+ Etiqueta»', () => {
    render(<Arnes inicial={[conv(PAGADO)]} puedeOperar={false} />);
    expect(chips()).toEqual(['Pagado']);
    expect(screen.queryByRole('button', { name: /Quitar etiqueta/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Agregar etiqueta' })).toBeNull();
    expect(screen.getByText('Solo lectura')).toBeDefined();
  });

  it('sin permiso y sin etiquetas no reserva la tira', () => {
    const { container } = render(<Arnes puedeOperar={false} />);
    expect(container.querySelector('[data-testid="etiquetas-del-chat"]')).toBeNull();
  });

  it('«Gestionar etiquetas» solo con etiquetas.administrar', async () => {
    const { unmount } = render(<Arnes abiertoInicial puedeAdministrar />);
    await screen.findByRole('link', { name: 'Gestionar etiquetas' });
    unmount();
    render(<Arnes abiertoInicial puedeAdministrar={false} />);
    await screen.findByTestId('selector-de-etiquetas');
    expect(screen.queryByRole('link', { name: 'Gestionar etiquetas' })).toBeNull();
  });

  it('catálogo con error: el selector lo dice, reintenta y la tira de chips sigue usable', async () => {
    vi.mocked(etiquetasApi.listar).mockRejectedValue(new Error('sin red'));
    render(<Arnes inicial={[conv(PAGADO)]} abiertoInicial />);
    expect(
      await screen.findByText('No se pudieron cargar las etiquetas. Revisa tu conexión.'),
    ).toBeDefined();
    expect(chips()).toEqual(['Pagado']);
    vi.mocked(etiquetasApi.listar).mockResolvedValue(CAT);
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    await screen.findAllByRole('menuitemcheckbox');
  });

  it('catálogo vacío: «Tu agencia no tiene etiquetas.»', async () => {
    vi.mocked(etiquetasApi.listar).mockResolvedValue([]);
    render(<Arnes abiertoInicial puedeAdministrar />);
    expect(await screen.findByText('Tu agencia no tiene etiquetas.')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Crear etiqueta' })).toBeDefined();
  });

  it('Esc cierra el selector', async () => {
    render(<Arnes abiertoInicial />);
    const selector = await screen.findByTestId('selector-de-etiquetas');
    await within(selector).findAllByRole('menuitemcheckbox');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('selector-de-etiquetas')).toBeNull());
  });
});
