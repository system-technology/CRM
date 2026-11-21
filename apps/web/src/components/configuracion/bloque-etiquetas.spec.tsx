import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Etiqueta } from '@viajapro/contracts';
import { BloqueEtiquetas } from './bloque-etiquetas';
import { etiquetasApi } from '../../lib/etiquetas-api';
import { InboxErrorApi } from '../../lib/inbox-api';

let puedeAdministrarEtiquetas = true;
vi.mock('../../lib/permisos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/permisos')>();
  return { ...actual, usePermisos: () => ({ puedeAdministrarEtiquetas }) };
});

const E = (n: number, nombre: string, color: Etiqueta['color'], orden = n - 1): Etiqueta => ({
  id: `00000000-0004-4000-8000-00000000000${n}`,
  nombre,
  color,
  orden,
});
const LISTA = [
  E(1, 'Pagado', 'verde'),
  E(2, 'Pago pendiente', 'ambar'),
  E(3, 'Seguimiento', 'azul'),
];
const nombres = () =>
  screen
    .queryAllByTestId('fila-de-etiqueta')
    .map((f) => within(f).getByTestId('chip-de-etiqueta').textContent?.trim());

describe('BloqueEtiquetas: Configuración → Etiquetas (T-326)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    puedeAdministrarEtiquetas = true;
    vi.spyOn(etiquetasApi, 'listar').mockResolvedValue(LISTA);
  });
  afterEach(cleanup);

  describe('estados', () => {
    it('cargando: esqueleto', () => {
      vi.mocked(etiquetasApi.listar).mockReturnValue(new Promise(() => undefined));
      render(<BloqueEtiquetas />);
      expect(screen.getByTestId('etiquetas-cargando')).toBeDefined();
    });

    it('lista las etiquetas con su chip de muestra y el contador de 50', async () => {
      render(<BloqueEtiquetas />);
      await waitFor(() => expect(nombres()).toEqual(['Pagado', 'Pago pendiente', 'Seguimiento']));
      expect(screen.getByText(/3 de 50/)).toBeDefined();
    });

    it('vacío: dice que no hay y qué hacer', async () => {
      vi.mocked(etiquetasApi.listar).mockResolvedValue([]);
      render(<BloqueEtiquetas />);
      expect(await screen.findByTestId('etiquetas-vacio')).toBeDefined();
      expect(screen.getByTestId('etiquetas-vacio').textContent).toContain(
        'Tu agencia no tiene etiquetas. Crea la primera arriba.',
      );
    });

    it('error de carga: qué pasó y «Reintentar»', async () => {
      vi.mocked(etiquetasApi.listar).mockRejectedValueOnce(new Error('x'));
      render(<BloqueEtiquetas />);
      const error = await screen.findByTestId('etiquetas-error-de-carga');
      expect(error.textContent).toContain(
        'No se pudieron cargar las etiquetas. Revisa tu conexión.',
      );
      fireEvent.click(within(error).getByRole('button', { name: 'Reintentar' }));
      await waitFor(() => expect(nombres()).toHaveLength(3));
    });

    it('sin etiquetas.administrar no hay gestión y explica por qué', () => {
      puedeAdministrarEtiquetas = false;
      render(<BloqueEtiquetas />);
      expect(screen.getByTestId('etiquetas-sin-permiso').textContent).toContain(
        'Administrar etiquetas',
      );
      expect(screen.queryByTestId('crear-etiqueta')).toBeNull();
      expect(etiquetasApi.listar).not.toHaveBeenCalled();
    });
  });

  describe('crear', () => {
    it('crea con nombre y color, y la ve en la lista', async () => {
      const crear = vi
        .spyOn(etiquetasApi, 'crear')
        .mockResolvedValue(E(4, 'Cotización enviada', 'rosa'));
      render(<BloqueEtiquetas />);
      await waitFor(() => expect(nombres()).toHaveLength(3));
      fireEvent.change(screen.getByLabelText('Nombre de la etiqueta nueva'), {
        target: { value: '  Cotización   enviada ' },
      });
      fireEvent.click(
        within(screen.getByRole('radiogroup', { name: 'Color de la etiqueta nueva' })).getByRole(
          'radio',
          { name: 'Rosa' },
        ),
      );
      fireEvent.click(screen.getByTestId('crear-etiqueta'));
      await waitFor(() => expect(nombres()).toContain('Cotización enviada'));
      // El nombre llega ya normalizado (espacios) y con el color elegido.
      expect(crear).toHaveBeenCalledWith({ nombre: 'Cotización enviada', color: 'rosa' });
      expect(screen.getByRole('status').textContent).toContain('Etiqueta creada.');
      expect(screen.getByLabelText('Nombre de la etiqueta nueva')).toHaveProperty('value', '');
    });

    it('el color elegido se ve con palomita y su nombre escrito, no solo con el color', async () => {
      render(<BloqueEtiquetas />);
      await waitFor(() => expect(nombres()).toHaveLength(3));
      const grupo = screen.getByRole('radiogroup', { name: 'Color de la etiqueta nueva' });
      const radios = within(grupo).getAllByRole('radio');
      expect(radios).toHaveLength(8);
      expect(radios.map((r) => r.getAttribute('aria-label'))).toContain('Verde');
      expect(radios.some((r) => r.getAttribute('aria-label') === 'Rojo')).toBe(false);
      // 44 px de zona táctil.
      for (const r of radios) expect(r.className).toContain('h-11 w-11');
      expect(screen.getByText('Azul', { selector: 'span' })).toBeDefined();
    });

    it('nombre vacío o demasiado largo: dice qué corregir sin llamar a la API', async () => {
      const crear = vi.spyOn(etiquetasApi, 'crear');
      render(<BloqueEtiquetas />);
      await waitFor(() => expect(nombres()).toHaveLength(3));
      fireEvent.click(screen.getByTestId('crear-etiqueta'));
      expect((await screen.findByTestId('error-de-etiquetas')).textContent).toContain(
        'Escribe el nombre de la etiqueta.',
      );
      fireEvent.change(screen.getByLabelText('Nombre de la etiqueta nueva'), {
        target: { value: 'x'.repeat(31) },
      });
      fireEvent.click(screen.getByTestId('crear-etiqueta'));
      await waitFor(() =>
        expect(screen.getByTestId('error-de-etiquetas').textContent).toContain(
          'hasta 30 caracteres',
        ),
      );
      expect(crear).not.toHaveBeenCalled();
    });

    it('duplicada: «Ya existe “Pagado”. Usa otro nombre.» y no se guarda nada', async () => {
      vi.spyOn(etiquetasApi, 'crear').mockRejectedValue(
        new InboxErrorApi('ETIQUETA_DUPLICADA', 'x'),
      );
      render(<BloqueEtiquetas />);
      await waitFor(() => expect(nombres()).toHaveLength(3));
      fireEvent.change(screen.getByLabelText('Nombre de la etiqueta nueva'), {
        target: { value: ' pagado ' },
      });
      fireEvent.click(screen.getByTestId('crear-etiqueta'));
      const error = await screen.findByTestId('error-de-etiquetas');
      expect(error.textContent).toContain('Ya existe “pagado”. Usa otro nombre.');
      expect(nombres()).toHaveLength(3);
    });

    it('tope de 50 de la agencia: lo dice y qué hacer', async () => {
      vi.spyOn(etiquetasApi, 'crear').mockRejectedValue(
        new InboxErrorApi('TOPE_DE_ETIQUETAS_DE_LA_AGENCIA', 'x'),
      );
      render(<BloqueEtiquetas />);
      await waitFor(() => expect(nombres()).toHaveLength(3));
      fireEvent.change(screen.getByLabelText('Nombre de la etiqueta nueva'), {
        target: { value: 'Una más' },
      });
      fireEvent.click(screen.getByTestId('crear-etiqueta'));
      expect((await screen.findByTestId('error-de-etiquetas')).textContent).toContain(
        'La agencia ya tiene 50 etiquetas. Borra una que no uses para crear otra.',
      );
    });

    it('con 50 etiquetas deshabilita el alta y lo explica', async () => {
      vi.mocked(etiquetasApi.listar).mockResolvedValue(
        Array.from({ length: 50 }, (_, i) => ({
          id: `00000000-0004-4000-8000-0000000002${i.toString().padStart(2, '0')}`,
          nombre: `E ${i}`,
          color: 'gris' as const,
          orden: i,
        })),
      );
      render(<BloqueEtiquetas />);
      await waitFor(() => expect(nombres()).toHaveLength(50));
      expect(screen.getByTestId('crear-etiqueta')).toHaveProperty('disabled', true);
      expect(screen.getByText(/50 de 50/).textContent).toContain('Borra una que no uses');
    });

    it('un nombre con caracteres invisibles se rechaza con un mensaje claro', async () => {
      render(<BloqueEtiquetas />);
      await waitFor(() => expect(nombres()).toHaveLength(3));
      fireEvent.change(screen.getByLabelText('Nombre de la etiqueta nueva'), {
        target: { value: 'Pag​ado' },
      });
      fireEvent.click(screen.getByTestId('crear-etiqueta'));
      expect((await screen.findByTestId('error-de-etiquetas')).textContent).toContain(
        'caracteres que no se admiten',
      );
    });
  });

  describe('renombrar y recolorear', () => {
    it('edita nombre y color; se conserva la asignación porque va por id', async () => {
      const actualizar = vi
        .spyOn(etiquetasApi, 'actualizar')
        .mockResolvedValue(E(3, 'Hacer seguimiento', 'rosa', 2));
      render(<BloqueEtiquetas />);
      await waitFor(() => expect(nombres()).toHaveLength(3));
      fireEvent.click(screen.getByRole('button', { name: 'Editar etiqueta Seguimiento' }));
      fireEvent.change(screen.getByLabelText('Nombre de la etiqueta'), {
        target: { value: 'Hacer seguimiento' },
      });
      fireEvent.click(
        within(screen.getByRole('radiogroup', { name: 'Color de la etiqueta' })).getByRole(
          'radio',
          {
            name: 'Rosa',
          },
        ),
      );
      fireEvent.click(screen.getByTestId('guardar-etiqueta'));
      await waitFor(() => expect(nombres()).toContain('Hacer seguimiento'));
      expect(actualizar).toHaveBeenCalledWith(LISTA[2]?.id, {
        nombre: 'Hacer seguimiento',
        color: 'rosa',
      });
    });

    it('si no cambió nada, cierra sin llamar a la API', async () => {
      const actualizar = vi.spyOn(etiquetasApi, 'actualizar');
      render(<BloqueEtiquetas />);
      await waitFor(() => expect(nombres()).toHaveLength(3));
      fireEvent.click(screen.getByRole('button', { name: 'Editar etiqueta Pagado' }));
      fireEvent.click(screen.getByTestId('guardar-etiqueta'));
      expect(actualizar).not.toHaveBeenCalled();
      expect(screen.queryByTestId('guardar-etiqueta')).toBeNull();
    });

    it('«etiqueta borrada por otra persona» al guardar: avisa y vuelve a pedir la lista', async () => {
      vi.spyOn(etiquetasApi, 'actualizar').mockRejectedValue(
        new InboxErrorApi('ETIQUETA_NO_ENCONTRADA', 'x'),
      );
      render(<BloqueEtiquetas />);
      await waitFor(() => expect(nombres()).toHaveLength(3));
      const antes = vi.mocked(etiquetasApi.listar).mock.calls.length;
      fireEvent.click(screen.getByRole('button', { name: 'Editar etiqueta Pagado' }));
      fireEvent.change(screen.getByLabelText('Nombre de la etiqueta'), {
        target: { value: 'Cobrado' },
      });
      fireEvent.click(screen.getByTestId('guardar-etiqueta'));
      expect((await screen.findByTestId('error-de-etiquetas')).textContent).toContain(
        'ya no existe',
      );
      await waitFor(() =>
        expect(vi.mocked(etiquetasApi.listar).mock.calls.length).toBeGreaterThan(antes),
      );
    });
  });

  describe('subir y bajar con botones (no solo arrastrar)', () => {
    it('baja una etiqueta renumerando solo lo que cambia y vuelve a pedir la lista', async () => {
      const actualizar = vi
        .spyOn(etiquetasApi, 'actualizar')
        .mockResolvedValue(LISTA[0] as Etiqueta);
      render(<BloqueEtiquetas />);
      await waitFor(() => expect(nombres()).toHaveLength(3));
      fireEvent.click(screen.getByRole('button', { name: 'Bajar etiqueta Pagado' }));
      await waitFor(() => expect(actualizar).toHaveBeenCalledTimes(2));
      expect(actualizar.mock.calls.map(([, c]) => c)).toEqual([{ orden: 0 }, { orden: 1 }]);
    });

    it('la primera no se puede subir ni la última bajar', async () => {
      render(<BloqueEtiquetas />);
      await waitFor(() => expect(nombres()).toHaveLength(3));
      expect(screen.getByRole('button', { name: 'Subir etiqueta Pagado' })).toHaveProperty(
        'disabled',
        true,
      );
      expect(screen.getByRole('button', { name: 'Bajar etiqueta Seguimiento' })).toHaveProperty(
        'disabled',
        true,
      );
    });
  });

  describe('borrar con confirmación', () => {
    it('sin confirmar no pasa nada: cancelar deja todo igual', async () => {
      const borrar = vi.spyOn(etiquetasApi, 'borrar');
      render(<BloqueEtiquetas />);
      await waitFor(() => expect(nombres()).toHaveLength(3));
      fireEvent.click(screen.getByRole('button', { name: 'Borrar etiqueta Seguimiento' }));
      const dialogo = screen.getByRole('alertdialog');
      expect(dialogo.textContent).toContain('¿Borrar la etiqueta “Seguimiento”?');
      expect(dialogo.textContent).toContain('se quita de todas las conversaciones');
      expect(dialogo.textContent).toContain('No se puede deshacer');
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(borrar).not.toHaveBeenCalled();
      expect(nombres()).toHaveLength(3);
    });

    it('al confirmar la borra de la lista', async () => {
      const borrar = vi.spyOn(etiquetasApi, 'borrar').mockResolvedValue(undefined);
      render(<BloqueEtiquetas />);
      await waitFor(() => expect(nombres()).toHaveLength(3));
      fireEvent.click(screen.getByRole('button', { name: 'Borrar etiqueta Seguimiento' }));
      fireEvent.click(screen.getByTestId('confirmar-borrar-etiqueta'));
      await waitFor(() => expect(nombres()).toEqual(['Pagado', 'Pago pendiente']));
      expect(borrar).toHaveBeenCalledWith(LISTA[2]?.id);
      expect(screen.getByRole('status').textContent).toContain('Etiqueta borrada.');
    });

    it('Esc cancela la confirmación', async () => {
      render(<BloqueEtiquetas />);
      await waitFor(() => expect(nombres()).toHaveLength(3));
      fireEvent.click(screen.getByRole('button', { name: 'Borrar etiqueta Pagado' }));
      fireEvent.keyDown(document, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    });

    it('si otra persona ya la había borrado (404): avisa y refresca la lista', async () => {
      vi.spyOn(etiquetasApi, 'borrar').mockRejectedValue(
        new InboxErrorApi('ETIQUETA_NO_ENCONTRADA', 'x'),
      );
      vi.mocked(etiquetasApi.listar)
        .mockResolvedValueOnce(LISTA)
        .mockResolvedValue([LISTA[0] as Etiqueta, LISTA[1] as Etiqueta]);
      render(<BloqueEtiquetas />);
      await waitFor(() => expect(nombres()).toHaveLength(3));
      fireEvent.click(screen.getByRole('button', { name: 'Borrar etiqueta Seguimiento' }));
      fireEvent.click(screen.getByTestId('confirmar-borrar-etiqueta'));
      expect((await screen.findByTestId('error-de-etiquetas')).textContent).toContain(
        'ya no existe',
      );
      await waitFor(() => expect(nombres()).toHaveLength(2));
    });
  });

  it('el nombre de la etiqueta no se escribe en la consola (R10)', async () => {
    const espias = [
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      vi.spyOn(console, 'log').mockImplementation(() => undefined),
    ];
    vi.spyOn(etiquetasApi, 'crear').mockRejectedValue(new InboxErrorApi('ETIQUETA_DUPLICADA', 'x'));
    render(<BloqueEtiquetas />);
    await waitFor(() => expect(nombres()).toHaveLength(3));
    fireEvent.change(screen.getByLabelText('Nombre de la etiqueta nueva'), {
      target: { value: 'María Pérez' },
    });
    fireEvent.click(screen.getByTestId('crear-etiqueta'));
    await screen.findByTestId('error-de-etiquetas');
    for (const e of espias) expect(JSON.stringify(e.mock.calls)).not.toContain('María');
  });
});
