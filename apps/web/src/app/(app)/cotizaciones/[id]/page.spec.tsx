import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PaginaCotizacionGuardada from './page';
import * as cotizacionesApi from '../../../../lib/cotizaciones-api';
import * as authApi from '../../../../lib/auth-api';
import * as crmApi from '../../../../lib/crm-api';
import * as archivosApi from '../../../../lib/archivos-api';
import type {
  CotizacionGuardada,
  EstadoCotizacion,
  ResumenDeArchivo,
  SesionActual,
} from '@viajapro/contracts';

// Los parámetros de la URL que cada prueba quiere ver (p. ej. `?conversacion=`).
const parametrosDeUrl = vi.hoisted(() => ({ actuales: new URLSearchParams() }));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '01932000-0000-7000-8000-000000000001' }),
  useSearchParams: () => parametrosDeUrl.actuales,
  usePathname: () => '/cotizaciones/01932000-0000-7000-8000-000000000001',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

describe('PaginaCotizacionGuardada (Detalle T-107)', () => {
  const cotizacionPrueba: CotizacionGuardada = {
    id: '01932000-0000-7000-8000-000000000001',
    contactoId: '00000000-0002-4000-8000-000000000001',
    oportunidadId: null,
    titulo: 'Cotización San Andrés Todo Incluido',
    estado: 'BORRADOR',
    versionEnviada: null,
    enviadaEn: null,
    creadaEn: '2026-10-25T10:00:00.000Z',
    actualizadaEn: '2026-10-25T10:00:00.000Z',
    versiones: [
      {
        id: '01932000-0000-7000-8000-000000000011',
        numero: 1,
        creadaEn: '2026-10-25T10:00:00.000Z',
        paqueteId: '01932000-0000-7000-8000-000000000001',
        paqueteNombre: 'Escape Caribeño San Andrés',
        destino: 'San Andrés',
        noches: 4,
        fechaSalida: '2026-11-10',
        vigenciaId: '01932000-0000-7000-8000-000000000001',
        vigenciaDesde: '2026-11-01',
        vigenciaHasta: '2026-11-30',
        deSalidaProgramada: true,
        adultos: 2,
        ninos: 0,
        infantes: 0,
        acomodacion: 'DOBLE',
        lineas: [
          {
            tarifaId: '01932000-0000-7000-8000-000000000091',
            nombre: 'Adulto en acomodación DOBLE',
            unidad: 'POR_PERSONA',
            cubrePasajeros: 1,
            veces: 2,
            precioUnitario: { unidades: '2500000', moneda: 'COP' },
            total: { unidades: '5000000', moneda: 'COP' },
            masBarata: false,
            margen: { unidades: '750000', moneda: 'COP' },
          },
        ],
        venta: { unidades: '5000000', moneda: 'COP' },
        vigenteHasta: '2026-10-31',
        neto: { unidades: '4250000', moneda: 'COP' },
        margen: { unidades: '750000', moneda: 'COP' },
        politica: {
          porcentaje: 17.6,
          base: 'SOBRE_EL_NETO',
          origenDeLaVenta: 'DERIVADA_DEL_NETO',
          redondeoVenta: 1000,
        },
      },
    ],
  };

  const sesionSinPermisoNeto: SesionActual = {
    identidad: {
      id: '01932000-0000-7000-8000-000000000002',
      correo: 'asesor@agencia.com',
      nombre: 'Asesor Comercial',
    },
    agencias: [
      {
        id: '01932000-0000-7000-8000-00000000000a',
        slug: 'agencia-demo',
        nombre: 'Agencia Demo',
      },
    ],
    tenantActivoId: '01932000-0000-7000-8000-00000000000a',
    acceso: {
      usuarioId: '01932000-0000-7000-8000-000000000002',
      rol: 'asesor',
      permisos: ['conversaciones.ver_todas'],
    },
  };

  const sesionConPermisoNeto: SesionActual = {
    identidad: {
      id: '01932000-0000-7000-8000-000000000001',
      correo: 'dueno@agencia.com',
      nombre: 'Dueño Agencia',
    },
    agencias: [
      {
        id: '01932000-0000-7000-8000-00000000000a',
        slug: 'agencia-demo',
        nombre: 'Agencia Demo',
      },
    ],
    tenantActivoId: '01932000-0000-7000-8000-00000000000a',
    acceso: {
      usuarioId: '01932000-0000-7000-8000-000000000001',
      rol: 'dueno',
      permisos: ['cotizacion.ver_neto_y_margen'],
    },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    parametrosDeUrl.actuales = new URLSearchParams();
    vi.spyOn(cotizacionesApi, 'obtenerCotizacionGuardadaApi').mockResolvedValue(cotizacionPrueba);
    vi.spyOn(crmApi, 'listarContactos').mockResolvedValue({
      datos: [],
      pageInfo: { hasMore: false, nextCursor: null },
    });
  });

  it('oculta totalmente el panel de auditoría de margen y columnas de neto a quien no tiene el permiso (R10 / ADR-0011)', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(sesionSinPermisoNeto);

    render(<PaginaCotizacionGuardada />);

    await waitFor(() => {
      const h1 = screen.getByRole('heading', { level: 1 });
      expect(h1.textContent).toContain('Cotización San Andrés Todo Incluido');
    });

    // Panel de auditoría de margen NO debe existir en el DOM
    expect(screen.queryByTestId('panel-auditoria-margen')).toBeNull();
    expect(screen.queryByText(/Auditoría de Margen/i)).toBeNull();
    expect(screen.queryByText(/Neto Unit\./i)).toBeNull();
    expect(screen.queryByText(/Margen Unit\./i)).toBeNull();
  });

  it('muestra el panel de auditoría de margen y desglose a usuarios con permiso cotizacion.ver_neto_y_margen', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(sesionConPermisoNeto);

    render(<PaginaCotizacionGuardada />);

    await waitFor(() => {
      expect(screen.getByTestId('panel-auditoria-margen')).toBeDefined();
      expect(screen.getByText(/Auditoría de Margen \(ADR-0011\)/i)).toBeDefined();
      expect(screen.getByText(/Neto Unit\./i)).toBeDefined();
      expect(screen.getByText(/Margen Unit\./i)).toBeDefined();
    });
  });

  it('abre el diálogo «Abrir en la app de WhatsApp» y NO marca la cotización como enviada (T-347)', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(sesionSinPermisoNeto);
    const cambiarEstado = vi.spyOn(cotizacionesApi, 'cambiarEstadoCotizacionApi');
    const abrir = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<PaginaCotizacionGuardada />);

    await waitFor(() => {
      expect(screen.getByTestId('btn-abrir-modal-whatsapp')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('btn-abrir-modal-whatsapp'));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined();
      expect(screen.getByRole('heading', { name: /Abrir en la app de WhatsApp/i })).toBeDefined();
    });

    // Aunque se abra wa.me, la cotización sigue como Borrador: nada salió por el canal.
    fireEvent.change(screen.getByLabelText(/Número de WhatsApp/i), {
      target: { value: '+573105559876' },
    });
    fireEvent.click(screen.getByTestId('btn-abrir-whatsapp-directo'));
    expect(abrir).toHaveBeenCalled();
    expect(cambiarEstado).not.toHaveBeenCalled();
    expect(screen.getByText('BORRADOR')).toBeDefined();
  });

  it('con la conversación en la URL, la acción principal es «Enviar en esta conversación» hacia el chat', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(sesionSinPermisoNeto);
    parametrosDeUrl.actuales = new URLSearchParams({ conversacion: 'conv-123' });

    render(<PaginaCotizacionGuardada />);

    const enlace = await screen.findByTestId('btn-enviar-en-conversacion');
    expect(enlace.textContent).toContain('Enviar en esta conversación');
    expect(enlace.getAttribute('href')).toBe(
      `/bandeja/conv-123?enviarCotizacion=${cotizacionPrueba.id}`,
    );
    // Y la salida de vuelta al chat, en las migas.
    expect(screen.getByTestId('boton-volver-migas').getAttribute('href')).toBe('/bandeja/conv-123');
    // El texto de la acción principal no menciona wa.me: nunca sale del canal de la agencia.
    expect(enlace.getAttribute('href')).not.toContain('whatsapp');
  });

  it('sin conversación con el viajero no ofrece el envío por el canal y lo explica', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(sesionSinPermisoNeto);

    render(<PaginaCotizacionGuardada />);

    await waitFor(() => {
      expect(screen.getByTestId('aviso-sin-conversacion')).toBeDefined();
    });
    expect(screen.queryByTestId('btn-enviar-en-conversacion')).toBeNull();
  });

  it('duplica la versión actual creando la versión 2 al hacer clic en Duplicar versión', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(sesionSinPermisoNeto);

    const cotizacionConV2: CotizacionGuardada = {
      ...cotizacionPrueba,
      versiones: [
        cotizacionPrueba.versiones[0]!,
        {
          ...cotizacionPrueba.versiones[0]!,
          id: '01932000-0000-7000-8000-000000000012',
          numero: 2,
        },
      ],
    };

    vi.spyOn(cotizacionesApi, 'duplicarVersionCotizacionApi').mockResolvedValue(cotizacionConV2);

    render(<PaginaCotizacionGuardada />);

    await waitFor(() => {
      expect(screen.getByTestId('btn-duplicar-version')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('btn-duplicar-version'));

    await waitFor(() => {
      expect(cotizacionesApi.duplicarVersionCotizacionApi).toHaveBeenCalledWith(
        '01932000-0000-7000-8000-000000000001',
        1,
      );
      expect(screen.getAllByText('Versión 2').length).toBeGreaterThan(0);
    });
  });

  it('deshabilita el botón de comparar si solo existe una versión', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(sesionSinPermisoNeto);

    render(<PaginaCotizacionGuardada />);

    await waitFor(() => {
      const btn = screen.getByTestId<HTMLButtonElement>('btn-comparar-versiones');
      expect(btn).toBeDefined();
      expect(btn.disabled).toBe(true);
    });
  });

  it('habilita y abre el modal de comparación lado a lado cuando hay múltiples versiones', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(sesionSinPermisoNeto);

    const cotizacionConMultiplesVersiones: CotizacionGuardada = {
      ...cotizacionPrueba,
      versiones: [
        cotizacionPrueba.versiones[0]!,
        {
          ...cotizacionPrueba.versiones[0]!,
          id: '01932000-0000-7000-8000-000000000012',
          numero: 2,
          adultos: 3,
          venta: { unidades: '7500000', moneda: 'COP' },
        },
      ],
    };

    vi.spyOn(cotizacionesApi, 'obtenerCotizacionGuardadaApi').mockResolvedValue(
      cotizacionConMultiplesVersiones,
    );

    render(<PaginaCotizacionGuardada />);

    await waitFor(() => {
      const btn = screen.getByTestId<HTMLButtonElement>('btn-comparar-versiones');
      expect(btn).toBeDefined();
      expect(btn.disabled).toBe(false);
    });

    fireEvent.click(screen.getByTestId('btn-comparar-versiones'));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined();
      expect(screen.getByText('Comparar Versiones Lado a Lado')).toBeDefined();
    });
  });

  // ===========================================================================
  // T-563 — marcar aceptada desde el detalle
  // ===========================================================================

  /** Una cotización que el viajero ya recibió: la única que puede aceptarse. */
  const cotizacionEnviada: CotizacionGuardada = {
    ...cotizacionPrueba,
    estado: 'ENVIADA',
    versionEnviada: 1,
    enviadaEn: '2026-10-26T09:00:00.000Z',
  };

  /** El archivo de viaje que abre el consumidor del evento de aceptación (ADR-0024 §1). */
  const archivoDeLaCotizacion: ResumenDeArchivo = {
    id: '01932000-0000-7000-8000-0000000000f1',
    numero: 1043,
    contactoId: cotizacionPrueba.contactoId,
    oportunidadId: null,
    cotizacionId: cotizacionPrueba.id,
    versionCotizacion: 1,
    paqueteNombre: 'Escape Caribeño San Andrés',
    destino: 'San Andrés',
    fechaSalida: '2026-11-10',
    noches: 4,
    adultos: 2,
    ninos: 0,
    infantes: 0,
    venta: { unidades: '5000000', moneda: 'COP' },
    trm: null,
    estado: 'ABIERTO',
    avance: null,
    motivoCancelacion: null,
    notaCancelacion: null,
    canceladoEn: null,
    proximoPlazo: null,
    semaforo: null,
    reservas: [],
    creadoEn: '2026-10-26T12:00:00.000Z',
  };

  const sesionQueEscribeCotizaciones: SesionActual = {
    ...sesionSinPermisoNeto,
    acceso: {
      usuarioId: '01932000-0000-7000-8000-000000000002',
      rol: 'asesor',
      permisos: ['cotizacion.escribir'],
    },
  };

  /** Sin `cotizacion.escribir`: es el permiso que exige `POST /cotizaciones/:id/estado`. */
  const sesionSinEscribirCotizaciones: SesionActual = {
    ...sesionSinPermisoNeto,
    acceso: {
      usuarioId: '01932000-0000-7000-8000-000000000002',
      rol: 'asesor',
      permisos: ['conversaciones.ver_todas'],
    },
  };

  const prepararAceptacion = (opciones: {
    cotizacion: CotizacionGuardada;
    sesion: SesionActual;
    archivos?: ResumenDeArchivo[];
  }) => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(opciones.sesion);
    vi.spyOn(cotizacionesApi, 'obtenerCotizacionGuardadaApi').mockResolvedValue(
      opciones.cotizacion,
    );
    vi.spyOn(archivosApi, 'listarArchivos').mockResolvedValue(opciones.archivos ?? []);
    return vi
      .spyOn(cotizacionesApi, 'cambiarEstadoCotizacionApi')
      .mockResolvedValue({ ...opciones.cotizacion, estado: 'ACEPTADA' });
  };

  it('T-563: ofrece marcar aceptada sobre una cotización ENVIADA, y solo tras confirmar llama al servidor', async () => {
    const cambiarEstado = prepararAceptacion({
      cotizacion: cotizacionEnviada,
      sesion: sesionQueEscribeCotizaciones,
      archivos: [archivoDeLaCotizacion],
    });

    render(<PaginaCotizacionGuardada />);

    const boton = await screen.findByTestId<HTMLButtonElement>('btn-marcar-aceptada');
    expect(boton.disabled).toBe(false);

    fireEvent.click(boton);

    // Abrir el diálogo no cambia nada todavía: confirmar es un acto aparte.
    const dialogo = await screen.findByTestId('dialogo-aceptar-cotizacion');
    expect(cambiarEstado).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('btn-confirmar-aceptada'));

    await waitFor(() => {
      expect(cambiarEstado).toHaveBeenCalledWith(cotizacionPrueba.id, 'ACEPTADA');
    });

    // Y la pantalla lo refleja: estado nuevo y la acción ya no se ofrece.
    await waitFor(() => {
      expect(screen.getByText('ACEPTADA')).toBeDefined();
    });
    expect(screen.queryByTestId('btn-marcar-aceptada')).toBeNull();
    expect(dialogo.isConnected).toBe(false);
  });

  it('T-563: la confirmación avisa de que se abre el archivo de viaje, en lenguaje de agencia', async () => {
    prepararAceptacion({
      cotizacion: cotizacionEnviada,
      sesion: sesionQueEscribeCotizaciones,
    });

    render(<PaginaCotizacionGuardada />);
    fireEvent.click(await screen.findByTestId('btn-marcar-aceptada'));

    const dialogo = await screen.findByTestId('dialogo-aceptar-cotizacion');
    const texto = dialogo.textContent ?? '';

    // Lo que de verdad va a pasar, dicho antes de pulsar.
    expect(texto).toMatch(/archivo de viaje/i);
    // Y que la cotización queda cerrada: no admite más versiones ni otro estado.
    expect(texto).toMatch(/no admite|queda cerrada|última palabra/i);
    // En el idioma de la agencia: nada de la tubería de adentro.
    expect(texto).not.toMatch(/outbox|evento de dominio|endpoint|payload|consumidor/i);
  });

  it('T-563: cancelar la confirmación no cambia el estado', async () => {
    const cambiarEstado = prepararAceptacion({
      cotizacion: cotizacionEnviada,
      sesion: sesionQueEscribeCotizaciones,
    });

    render(<PaginaCotizacionGuardada />);
    fireEvent.click(await screen.findByTestId('btn-marcar-aceptada'));
    fireEvent.click(await screen.findByTestId('btn-cancelar-aceptada'));

    await waitFor(() => {
      expect(screen.queryByTestId('dialogo-aceptar-cotizacion')).toBeNull();
    });
    expect(cambiarEstado).not.toHaveBeenCalled();
    expect(screen.getByText('ENVIADA')).toBeDefined();
  });

  it('T-563: sin el permiso «cotizacion.escribir» el botón está deshabilitado y no llega al servidor', async () => {
    const cambiarEstado = prepararAceptacion({
      cotizacion: cotizacionEnviada,
      sesion: sesionSinEscribirCotizaciones,
    });

    render(<PaginaCotizacionGuardada />);

    const boton = await screen.findByTestId<HTMLButtonElement>('btn-marcar-aceptada');
    expect(boton.disabled).toBe(true);
    expect(boton.getAttribute('title') ?? '').toContain('cotizacion.escribir');

    fireEvent.click(boton);

    expect(screen.queryByTestId('dialogo-aceptar-cotizacion')).toBeNull();
    expect(cambiarEstado).not.toHaveBeenCalled();
  });

  /**
   * Una prueba «no aparece el botón» pasa en verde contra una pantalla que no tiene el botón en
   * ningún estado: contra el código de hoy, las cuatro pasaban sin demostrar nada. Por eso cada
   * una lleva su **control positivo** delante: en la MISMA prueba se comprueba primero que sobre
   * una ENVIADA el botón sí está. Si la acción desapareciera de la pantalla, o dejara de mirar el
   * estado, estas pruebas se ponen rojas.
   */
  const soloSeOfreceSobreEnviada = async (estado: EstadoCotizacion) => {
    prepararAceptacion({ cotizacion: cotizacionEnviada, sesion: sesionQueEscribeCotizaciones });
    const control = render(<PaginaCotizacionGuardada />);
    await screen.findByTestId('btn-marcar-aceptada');
    control.unmount();

    prepararAceptacion({
      cotizacion: { ...cotizacionEnviada, estado },
      sesion: sesionQueEscribeCotizaciones,
    });
    render(<PaginaCotizacionGuardada />);

    await waitFor(() => {
      expect(screen.getByText(estado)).toBeDefined();
    });
    expect(screen.queryByTestId('btn-marcar-aceptada')).toBeNull();
  };

  it('T-563: no se ofrece aceptar un BORRADOR: lo que no se envió, el viajero no pudo aceptarlo', async () => {
    await soloSeOfreceSobreEnviada('BORRADOR');
  });

  it.each<EstadoCotizacion>(['ACEPTADA', 'RECHAZADA', 'VENCIDA'])(
    'T-563: no se ofrece aceptar una cotización ya cerrada (%s)',
    async (estado) => {
      await soloSeOfreceSobreEnviada(estado);
    },
  );

  it('T-563: tras aceptar, lleva al archivo de viaje que se acaba de abrir', async () => {
    prepararAceptacion({
      cotizacion: cotizacionEnviada,
      sesion: sesionQueEscribeCotizaciones,
      archivos: [archivoDeLaCotizacion],
    });

    render(<PaginaCotizacionGuardada />);
    fireEvent.click(await screen.findByTestId('btn-marcar-aceptada'));
    fireEvent.click(await screen.findByTestId('btn-confirmar-aceptada'));

    const enlace = await screen.findByTestId('enlace-archivo-recien-abierto');
    expect(enlace.getAttribute('href')).toBe(`/viajes?id=${archivoDeLaCotizacion.id}`);
    expect(enlace.textContent).toContain('1043');
  });

  it('T-563: si el archivo de viaje todavía no existe, lo dice y NO pinta un enlace falso', async () => {
    prepararAceptacion({
      cotizacion: cotizacionEnviada,
      sesion: sesionQueEscribeCotizaciones,
      archivos: [],
    });

    render(<PaginaCotizacionGuardada />);
    fireEvent.click(await screen.findByTestId('btn-marcar-aceptada'));
    fireEvent.click(await screen.findByTestId('btn-confirmar-aceptada'));

    const aviso = await screen.findByTestId('aviso-cotizacion-aceptada');
    await waitFor(() => {
      expect(aviso.textContent ?? '').toMatch(/abriendo|unos segundos|todav/i);
    });
    expect(screen.queryByTestId('enlace-archivo-recien-abierto')).toBeNull();
  });
});
