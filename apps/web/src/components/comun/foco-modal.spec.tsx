import React, { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useFocoModal } from '../../lib/use-foco-modal';
import { ModalPlantillas } from '../bandeja/modal-plantillas';
import { ModalGuardarCotizacion } from '../cotizador/modal-guardar-cotizacion';
import { ModalMotivoPerdida } from '../pipeline/modal-motivo-perdida';
import { ModalBusquedaGlobal } from '../busqueda/modal-busqueda-global';
import type { Oportunidad } from '@viajapro/contracts';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/bandeja',
}));

// Componente arnés de prueba para useFocoModal
function ArnesModalPrueba({
  abiertoInicial = false,
  desactivarTrap = false,
  abierto: abiertoProp,
  alCerrar: alCerrarProp,
}: {
  abiertoInicial?: boolean;
  desactivarTrap?: boolean;
  abierto?: boolean;
  alCerrar?: () => void;
}) {
  const [abiertoInterno, setAbiertoInterno] = useState(abiertoInicial);
  const abierto = abiertoProp !== undefined ? abiertoProp : abiertoInterno;
  const botonAbrirRef = useRef<HTMLButtonElement>(null);
  const primerInputRef = useRef<HTMLInputElement>(null);

  const alCerrar = () => {
    if (alCerrarProp) {
      alCerrarProp();
    } else {
      setAbiertoInterno(false);
    }
  };

  const contenedorRef = useFocoModal<HTMLDivElement>({
    abierto,
    alCerrar,
    elementoInicialRef: primerInputRef,
    desactivarTrap,
  });

  return (
    <div>
      <button ref={botonAbrirRef} onClick={() => setAbiertoInterno(true)}>
        Abrir Modal Prueba
      </button>

      {abierto && (
        <div role="dialog" aria-modal="true" ref={contenedorRef}>
          <h2>Título Modal</h2>
          <input ref={primerInputRef} placeholder="Primer campo" data-testid="input-uno" />
          <input placeholder="Segundo campo" data-testid="input-dos" />
          <button data-testid="btn-guardar">Guardar</button>
          <button data-testid="btn-cerrar" onClick={alCerrar}>
            Cerrar
          </button>
        </div>
      )}
    </div>
  );
}

describe('0c.32: Gestión Accesible de Teclado y Foco en Modales (WCAG AA)', () => {
  describe('Hook useFocoModal (Aislamiento)', () => {
    it('1. Foco dentro: posiciona el foco en el elemento inicial configurado al abrir', async () => {
      render(<ArnesModalPrueba />);
      const btnAbrir = screen.getByRole('button', { name: 'Abrir Modal Prueba' });

      btnAbrir.focus();
      expect(document.activeElement).toBe(btnAbrir);

      fireEvent.click(btnAbrir);

      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });

      const primerInput = screen.getByTestId('input-uno');
      expect(document.activeElement).toBe(primerInput);
    });

    it('2. Cierra con Esc: presionar la tecla Escape cierra el modal', () => {
      render(<ArnesModalPrueba abiertoInicial={true} />);

      expect(screen.getByRole('dialog')).toBeDefined();

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('3. Foco de vuelta: devuelve el foco al elemento que disparó la apertura al cerrar', async () => {
      render(<ArnesModalPrueba />);
      const btnAbrir = screen.getByRole('button', { name: 'Abrir Modal Prueba' });

      btnAbrir.focus();
      fireEvent.click(btnAbrir);

      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });

      // Cerrar presionando Escape
      fireEvent.keyDown(document, { key: 'Escape' });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 30));
      });

      expect(document.activeElement).toBe(btnAbrir);
    });

    it('4. Focus Trap: cicla el foco del último elemento al primero con Tab', () => {
      render(<ArnesModalPrueba abiertoInicial={true} />);
      const primerInput = screen.getByTestId('input-uno');
      const btnCerrar = screen.getByTestId('btn-cerrar');

      btnCerrar.focus();
      expect(document.activeElement).toBe(btnCerrar);

      // Tab en el último elemento interactivo debe ciclar al primero
      fireEvent.keyDown(document, { key: 'Tab', shiftKey: false });
      expect(document.activeElement).toBe(primerInput);
    });

    it('5. Focus Trap: cicla el foco del primer elemento al último con Shift+Tab', () => {
      render(<ArnesModalPrueba abiertoInicial={true} />);
      const primerInput = screen.getByTestId('input-uno');
      const btnCerrar = screen.getByTestId('btn-cerrar');

      primerInput.focus();
      expect(document.activeElement).toBe(primerInput);

      // Shift+Tab en el primer elemento debe ciclar al último
      fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(btnCerrar);
    });

    it('6. Re-renderizado del padre con alCerrar en línea no roba el foco ni reinicia timer (0c.32)', async () => {
      function ArnesConEstadoPadre() {
        const [abierto, setAbierto] = useState(false);
        const [contador, setContador] = useState(0);

        return (
          <div>
            <button data-testid="btn-abrir-re-render" onClick={() => setAbierto(true)}>
              Abrir Modal
            </button>
            <button data-testid="btn-forzar-re-render" onClick={() => setContador((c) => c + 1)}>
              Renderizar Padre: {contador}
            </button>
            <ArnesModalPrueba abierto={abierto} alCerrar={() => setAbierto(false)} />
          </div>
        );
      }

      render(<ArnesConEstadoPadre />);
      const btnAbrir = screen.getByTestId('btn-abrir-re-render');
      btnAbrir.focus();
      fireEvent.click(btnAbrir);

      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });

      const inputDos = screen.getByTestId('input-dos');
      inputDos.focus();
      expect(document.activeElement).toBe(inputDos);

      // Forzar re-renderizado del padre (que produce una nueva función alCerrar en línea)
      const btnReRender = screen.getByTestId('btn-forzar-re-render');
      fireEvent.click(btnReRender);

      // Esperar más de 30ms para verificar que el foco NO fue robado ni reseteado al primer input
      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });

      expect(document.activeElement).toBe(inputDos);

      // Al cerrar con Escape, el foco debe regresar limpiamente al disparador original
      fireEvent.keyDown(document, { key: 'Escape' });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 30));
      });

      expect(document.activeElement).toBe(btnAbrir);
    });
  });

  describe('Modal 1: ModalPlantillas', () => {
    it('posiciona foco dentro, cierra con Esc y devuelve foco al botón disparador', async () => {
      const onCerrarMock = vi.fn();
      const onEnviarMock = vi.fn();

      function ArnesPlantillas() {
        const [abierto, setAbierto] = useState(false);
        return (
          <div>
            <button data-testid="btn-disparador" onClick={() => setAbierto(true)}>
              Abrir Plantillas
            </button>
            <ModalPlantillas
              abierto={abierto}
              conversacionId="conv-123"
              onCerrar={() => {
                setAbierto(false);
                onCerrarMock();
              }}
              onEnviarPlantilla={onEnviarMock}
            />
          </div>
        );
      }

      render(<ArnesPlantillas />);
      const disparador = screen.getByTestId('btn-disparador');
      disparador.focus();

      fireEvent.click(disparador);

      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });

      const modal = screen.getByRole('dialog');
      expect(modal).toBeDefined();
      // Foco debe estar dentro del modal
      expect(modal.contains(document.activeElement)).toBe(true);

      // Presionar Escape
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onCerrarMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        await new Promise((r) => setTimeout(r, 30));
      });

      // Foco de vuelta al disparador
      expect(document.activeElement).toBe(disparador);
    });
  });

  describe('Modal 2: ModalGuardarCotizacion', () => {
    it('posiciona foco dentro, cierra con Esc y devuelve foco al botón disparador', async () => {
      const onCerrarMock = vi.fn();
      const onConfirmarMock = vi.fn();

      function ArnesCotizacion() {
        const [abierto, setAbierto] = useState(false);
        return (
          <div>
            <button data-testid="btn-disparador-cot" onClick={() => setAbierto(true)}>
              Guardar Cotización
            </button>
            <ModalGuardarCotizacion
              abierto={abierto}
              alCerrar={() => {
                setAbierto(false);
                onCerrarMock();
              }}
              alConfirmar={onConfirmarMock}
              guardando={false}
              error={null}
              tituloSugerido="Cotización Cancún"
              contactosDisponibles={[]}
              paqueteNombre="Cancún Mágico"
              fechaSalida="2026-11-01"
              adultos={2}
              ninos={0}
              infantes={0}
              totalEstimadoFormateado="$ 5.000.000"
            />
          </div>
        );
      }

      render(<ArnesCotizacion />);
      const disparador = screen.getByTestId('btn-disparador-cot');
      disparador.focus();

      fireEvent.click(disparador);

      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });

      const modal = screen.getByRole('dialog');
      expect(modal).toBeDefined();
      // Foco dentro del modal en el input de título
      const inputTitulo = screen.getByLabelText(/Título descriptivo/i);
      expect(document.activeElement).toBe(inputTitulo);

      // Presionar Escape
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onCerrarMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        await new Promise((r) => setTimeout(r, 30));
      });

      // Foco de vuelta
      expect(document.activeElement).toBe(disparador);
    });
  });

  describe('Modal 3: ModalMotivoPerdida', () => {
    it('posiciona foco dentro, cierra con Esc y devuelve foco al botón disparador', async () => {
      const onConfirmarMock = vi.fn();
      const onCancelarMock = vi.fn();

      const opMock: Oportunidad = {
        id: '00000000-0003-4000-8000-000000000001',
        contactoId: '00000000-0002-4000-8000-000000000001',
        contactoNombre: 'Laura Gómez',
        titulo: 'Paquete Punta Cana',
        destino: 'Punta Cana',
        paqueteId: null,
        fechaSalida: '2026-11-20',
        etapa: {
          id: '01a114b2-5314-75b1-91ad-3be0518a6a02',
          clave: 'EN_COTIZACION',
          nombre: 'En cotización',
          orden: 2,
          probabilidad: 40,
          esGanada: false,
          esPerdida: false,
        },
        valorEstimado: {
          unidades: '3500000',
          moneda: 'COP',
        },
        probabilidad: 40,
        asesorId: '00000000-0001-4000-8000-000000000001',
        asesorNombre: 'Carlos Asesor',
        proximaTarea: null,
        motivoPerdida: null,
        notaPerdida: null,
        creadaEn: '2026-10-10T10:00:00.000Z',
        ultimoContactoEn: '2026-10-10T10:00:00.000Z',
      };

      function ArnesPerdida() {
        const [abierto, setAbierto] = useState(false);
        return (
          <div>
            <button data-testid="btn-disparador-perdida" onClick={() => setAbierto(true)}>
              Marcar Pérdida
            </button>
            {abierto && (
              <ModalMotivoPerdida
                oportunidad={opMock}
                onConfirmar={onConfirmarMock}
                onCancelar={() => {
                  setAbierto(false);
                  onCancelarMock();
                }}
              />
            )}
          </div>
        );
      }

      render(<ArnesPerdida />);
      const disparador = screen.getByTestId('btn-disparador-perdida');
      disparador.focus();

      fireEvent.click(disparador);

      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });

      const modal = screen.getByRole('dialog');
      expect(modal).toBeDefined();
      expect(modal.contains(document.activeElement)).toBe(true);

      // Presionar Escape
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onCancelarMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        await new Promise((r) => setTimeout(r, 30));
      });

      expect(document.activeElement).toBe(disparador);
    });
  });

  describe('Modal 4: ModalBusquedaGlobal', () => {
    it('posiciona foco en input, cierra con Esc, devuelve foco y tiene aviso aria-live', async () => {
      const onCerrarMock = vi.fn();

      function ArnesBusqueda() {
        const [abierto, setAbierto] = useState(false);
        return (
          <div>
            <button data-testid="btn-disparador-busqueda" onClick={() => setAbierto(true)}>
              Buscar (Cmd+K)
            </button>
            <ModalBusquedaGlobal
              abierto={abierto}
              alCerrar={() => {
                setAbierto(false);
                onCerrarMock();
              }}
            />
          </div>
        );
      }

      render(<ArnesBusqueda />);
      const disparador = screen.getByTestId('btn-disparador-busqueda');
      disparador.focus();

      fireEvent.click(disparador);

      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });

      const input = screen.getByPlaceholderText(/Buscar contactos, chats/i);
      expect(document.activeElement).toBe(input);

      // Aviso dinámico aria-live presente
      const avisoLive = screen.getByText(/Búsqueda global abierta/i);
      expect(avisoLive.getAttribute('aria-live')).toBe('polite');

      // Presionar Escape
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onCerrarMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        await new Promise((r) => setTimeout(r, 30));
      });

      expect(document.activeElement).toBe(disparador);
    });
  });
});
