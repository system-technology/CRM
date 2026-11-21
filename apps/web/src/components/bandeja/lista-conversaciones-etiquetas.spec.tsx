import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Etiqueta, EtiquetaDeConversacion, PaginaBandeja } from '@viajapro/contracts';
import { ListaConversaciones } from './lista-conversaciones';
import { inboxApi } from '../../lib/inbox-api';
import { etiquetasApi } from '../../lib/etiquetas-api';
import { publicarEtiquetasDeConversacion } from '../../lib/etiquetas-eventos';

let busqueda = '';
const push = vi.fn();
const replace = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/bandeja',
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams(busqueda),
}));

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
const c = (e: Etiqueta): EtiquetaDeConversacion => ({ id: e.id, nombre: e.nombre, color: e.color });

function fila(n: number, nombre: string, etiquetas: EtiquetaDeConversacion[]) {
  return {
    id: `00000000-0000-4000-8000-00000000090${n}`,
    contactoId: `cnt-90${n}`,
    contactoNombre: nombre,
    contactoTelefono: `+57300000090${n}`,
    estado: 'ABIERTA' as const,
    ventana: { abierta: true, expiraEn: null, minutosRestantes: 1440 },
    asignadoAId: null,
    asignadoANombre: null,
    ultimoMensajeTexto: `Mensaje de ${nombre}`,
    ultimoMensajeEn: new Date().toISOString(),
    ultimoMensajeDireccion: 'ENTRANTE' as const,
    mensajesSinLeer: 0,
    slaVenceEn: null,
    etiquetas,
  };
}

const PAGINA: PaginaBandeja = {
  datos: [
    fila(1, 'Con tres', [c(PAGADO), c(PENDIENTE), c(SEGUIMIENTO)]),
    fila(2, 'Con una', [c(SEGUIMIENTO)]),
    fila(3, 'Sin etiquetas', []),
  ],
  pageInfo: { nextCursor: null, hasMore: false },
};

async function montar() {
  await act(async () => {
    render(<ListaConversaciones />);
    await new Promise((r) => setTimeout(r, 20));
  });
}

describe('ListaConversaciones: etiquetas (T-326)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    push.mockClear();
    replace.mockClear();
    busqueda = '';
    window.localStorage.clear();
    vi.spyOn(etiquetasApi, 'listar').mockResolvedValue(CAT);
  });
  afterEach(cleanup);

  describe('chips en la fila', () => {
    beforeEach(() => {
      vi.spyOn(inboxApi, 'consultarBandeja').mockResolvedValue(PAGINA);
    });

    it('muestra 2 chips con el nombre y «+1» cuando hay tres; sin etiquetas no reserva la línea', async () => {
      await montar();
      const filas = screen.getAllByRole('link');
      const conTres = within(filas[0] as HTMLElement);
      expect(conTres.getAllByTestId('chip-de-etiqueta')).toHaveLength(2);
      expect(conTres.getByText('Pagado')).toBeDefined();
      expect(conTres.getByTestId('etiquetas-ocultas').textContent).toContain('+1');
      expect(within(filas[1] as HTMLElement).getAllByTestId('chip-de-etiqueta')).toHaveLength(1);
      expect(within(filas[2] as HTMLElement).queryByTestId('etiquetas-de-fila')).toBeNull();
    });

    it('un cambio hecho en el chat se ve en la fila al instante', async () => {
      await montar();
      const sin = within(screen.getAllByRole('link')[2] as HTMLElement);
      expect(sin.queryByText('Pagado')).toBeNull();
      act(() =>
        publicarEtiquetasDeConversacion('00000000-0000-4000-8000-000000000903', [c(PAGADO)]),
      );
      expect(
        within(screen.getAllByRole('link')[2] as HTMLElement).getByText('Pagado'),
      ).toBeDefined();
    });

    it('sin filtro no hay fila de chips quitables ni se manda `etiquetas` a la API', async () => {
      await montar();
      expect(screen.queryByTestId('barra-filtro-etiquetas')).toBeNull();
      const consulta = vi.mocked(inboxApi.consultarBandeja).mock.calls[0]?.[0];
      expect(consulta).not.toHaveProperty('etiquetas');
      expect(consulta).not.toHaveProperty('modo');
    });

    it('el esqueleto de carga reserva la tercera línea de chips', () => {
      vi.mocked(inboxApi.consultarBandeja).mockReturnValue(new Promise(() => undefined));
      render(<ListaConversaciones />);
      const feed = screen.getByRole('feed');
      expect(feed.getAttribute('aria-busy')).toBe('true');
      expect(feed.querySelectorAll('.esqueleto-brillo').length).toBeGreaterThan(0);
      expect(feed.querySelector('.esqueleto-brillo .w-1\\/3')).not.toBeNull();
    });
  });

  describe('filtro en la URL', () => {
    beforeEach(() => {
      vi.spyOn(inboxApi, 'consultarBandeja').mockResolvedValue(PAGINA);
    });

    it('lee las etiquetas y el modo de la URL y los manda a la API', async () => {
      busqueda = `etiquetas=${PENDIENTE.id},${SEGUIMIENTO.id}&modo=todas`;
      await montar();
      expect(inboxApi.consultarBandeja).toHaveBeenCalledWith(
        expect.objectContaining({ etiquetas: [PENDIENTE.id, SEGUIMIENTO.id], modo: 'todas' }),
      );
      const barra = screen.getByTestId('barra-filtro-etiquetas');
      expect(within(barra).getByText('Pago pendiente')).toBeDefined();
      expect(within(barra).getByText('Seguimiento')).toBeDefined();
      expect(screen.getByTestId('cuenta-filtro-etiquetas').textContent).toContain('2');
    });

    it('un valor que no es UUID nunca llega a la consulta y la URL se limpia con replace', async () => {
      busqueda = `etiquetas=${PENDIENTE.id},no-es-uuid,'; drop table x`;
      await montar();
      expect(inboxApi.consultarBandeja).toHaveBeenCalledWith(
        expect.objectContaining({ etiquetas: [PENDIENTE.id] }),
      );
      for (const [consulta] of vi.mocked(inboxApi.consultarBandeja).mock.calls) {
        expect(JSON.stringify(consulta)).not.toContain('drop table');
      }
      await waitFor(() => expect(replace).toHaveBeenCalled());
      expect(replace.mock.calls[0]?.[0]).toBe(
        `/bandeja?etiquetas=${PENDIENTE.id.replace(/,/g, '%2C')}`,
      );
      expect(push).not.toHaveBeenCalled();
    });

    it('abrir un chat conserva el filtro en la URL: volver atrás lo mantiene', async () => {
      busqueda = `etiquetas=${SEGUIMIENTO.id}`;
      await montar();
      const href = screen.getAllByRole('link')[0]?.getAttribute('href');
      expect(href).toBe(
        `/bandeja/00000000-0000-4000-8000-000000000901?etiquetas=${SEGUIMIENTO.id}`,
      );
    });

    it('sin filtro los enlaces de las filas siguen siendo /bandeja/:id', async () => {
      await montar();
      expect(screen.getAllByRole('link')[0]?.getAttribute('href')).toBe(
        '/bandeja/00000000-0000-4000-8000-000000000901',
      );
    });

    it('empezar a filtrar usa push; ajustar un filtro que ya existe usa replace', async () => {
      await montar();
      fireEvent.click(screen.getByTestId('boton-filtro-etiquetas'));
      let selector = await screen.findByTestId('selector-de-filtro-de-etiquetas');
      fireEvent.click(
        await within(selector).findByRole('menuitemcheckbox', { name: /Pago pendiente/ }),
      );
      expect(push).toHaveBeenCalledTimes(1);
      expect(push.mock.calls[0]?.[0]).toContain(`etiquetas=${PENDIENTE.id}`);
      expect(replace).not.toHaveBeenCalled();

      cleanup();
      push.mockClear();
      busqueda = `etiquetas=${PENDIENTE.id}`;
      await montar();
      fireEvent.click(screen.getByTestId('boton-filtro-etiquetas'));
      selector = await screen.findByTestId('selector-de-filtro-de-etiquetas');
      fireEvent.click(
        await within(selector).findByRole('menuitemcheckbox', { name: /Seguimiento/ }),
      );
      expect(push).not.toHaveBeenCalled();
      expect(decodeURIComponent(replace.mock.calls.at(-1)?.[0] as string)).toContain(
        `etiquetas=${PENDIENTE.id},${SEGUIMIENTO.id}`,
      );
    });

    it('dos toques seguidos, antes de que la URL cambie, no pierden ninguna casilla', async () => {
      await montar();
      fireEvent.click(screen.getByTestId('boton-filtro-etiquetas'));
      const selector = await screen.findByTestId('selector-de-filtro-de-etiquetas');
      const filas = await within(selector).findAllByRole('menuitemcheckbox');
      fireEvent.click(filas[1] as HTMLElement);
      fireEvent.click(filas[2] as HTMLElement);
      const ultima = decodeURIComponent(
        [...push.mock.calls, ...replace.mock.calls].at(-1)?.[0] as string,
      );
      expect(ultima).toContain(`etiquetas=${PENDIENTE.id},${SEGUIMIENTO.id}`);
    });

    it('con dos o más etiquetas ofrece «Cualquiera de estas» / «Todas estas»; cualquiera es el valor por defecto', async () => {
      busqueda = `etiquetas=${PENDIENTE.id},${SEGUIMIENTO.id}`;
      await montar();
      fireEvent.click(screen.getByTestId('boton-filtro-etiquetas'));
      const grupo = await screen.findByRole('radiogroup', { name: 'Cómo combinar las etiquetas' });
      const cualquiera = within(grupo).getByRole('radio', { name: 'Cualquiera de estas' });
      const todas = within(grupo).getByRole('radio', { name: 'Todas estas' });
      expect(cualquiera.getAttribute('aria-checked')).toBe('true');
      expect(todas.getAttribute('aria-checked')).toBe('false');
      fireEvent.click(todas);
      expect(decodeURIComponent(replace.mock.calls.at(-1)?.[0] as string)).toContain('modo=todas');
    });

    it('con una sola etiqueta no ofrece el modo', async () => {
      busqueda = `etiquetas=${PENDIENTE.id}`;
      await montar();
      fireEvent.click(screen.getByTestId('boton-filtro-etiquetas'));
      await screen.findByTestId('selector-de-filtro-de-etiquetas');
      expect(screen.queryByRole('radiogroup')).toBeNull();
    });

    it('la «×» de un chip del filtro lo quita; «Quitar filtro» limpia todo', async () => {
      busqueda = `etiquetas=${PENDIENTE.id},${SEGUIMIENTO.id}`;
      await montar();
      fireEvent.click(screen.getByRole('button', { name: 'Quitar etiqueta Pago pendiente' }));
      expect(replace.mock.calls.at(-1)?.[0]).toBe(`/bandeja?etiquetas=${SEGUIMIENTO.id}`);
      fireEvent.click(screen.getByTestId('quitar-filtro-etiquetas'));
      expect(replace.mock.calls.at(-1)?.[0]).toBe('/bandeja');
    });
  });

  describe('estados', () => {
    it('filtro sin resultados: lo dice con el nombre y ofrece quitar el filtro', async () => {
      busqueda = `etiquetas=${PAGADO.id}`;
      vi.spyOn(inboxApi, 'consultarBandeja').mockResolvedValue({
        datos: [],
        pageInfo: { nextCursor: null, hasMore: false },
      });
      await montar();
      const vacio = await screen.findByTestId('filtro-etiquetas-sin-resultados');
      expect(vacio.textContent).toContain('Ninguna conversación tiene “Pagado”.');
      fireEvent.click(within(vacio).getByRole('button', { name: 'Quitar filtro' }));
      expect(replace.mock.calls.at(-1)?.[0]).toBe('/bandeja');
    });

    it('etiqueta borrada por otra persona mientras se filtra: sale del filtro con aviso', async () => {
      vi.spyOn(inboxApi, 'consultarBandeja').mockResolvedValue(PAGINA);
      const borrada = '00000000-0004-4000-8000-0000000000aa';
      busqueda = `etiquetas=${borrada},${SEGUIMIENTO.id}`;
      await montar();
      const aviso = await screen.findByTestId('aviso-etiqueta-borrada');
      expect(aviso.textContent).toContain('Una etiqueta del filtro ya no existe');
      await waitFor(() => expect(replace).toHaveBeenCalled());
      expect(replace.mock.calls.at(-1)?.[0]).toBe(`/bandeja?etiquetas=${SEGUIMIENTO.id}`);
      fireEvent.click(within(aviso).getByRole('button', { name: 'Cerrar aviso' }));
      expect(screen.queryByTestId('aviso-etiqueta-borrada')).toBeNull();
    });

    it('error al cargar las etiquetas: lo dice en el selector y la bandeja sigue usable', async () => {
      vi.spyOn(inboxApi, 'consultarBandeja').mockResolvedValue(PAGINA);
      vi.mocked(etiquetasApi.listar).mockRejectedValue(new Error('sin red'));
      await montar();
      // La lista de conversaciones se ve igual.
      expect(screen.getByText('Con tres')).toBeDefined();
      fireEvent.click(screen.getByTestId('boton-filtro-etiquetas'));
      expect(
        await screen.findByText('No se pudieron cargar las etiquetas. Revisa tu conexión.'),
      ).toBeDefined();
      vi.mocked(etiquetasApi.listar).mockResolvedValue(CAT);
      fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
      await screen.findAllByRole('menuitemcheckbox');
    });

    it('catálogo vacío en el selector del filtro', async () => {
      vi.spyOn(inboxApi, 'consultarBandeja').mockResolvedValue(PAGINA);
      vi.mocked(etiquetasApi.listar).mockResolvedValue([]);
      await montar();
      fireEvent.click(screen.getByTestId('boton-filtro-etiquetas'));
      expect(await screen.findByText('Tu agencia no tiene etiquetas.')).toBeDefined();
    });
  });
});
