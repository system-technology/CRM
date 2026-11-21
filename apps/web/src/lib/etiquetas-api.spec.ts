import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { inboxApi, InboxErrorApi } from './inbox-api';
import { etiquetasApi } from './etiquetas-api';
import { listarEtiquetasMock } from './mock-etiquetas';

/**
 * El cliente de etiquetas contra la API REAL (fetch simulado) y su separación del modo demo:
 * una fuente o la otra, nunca las dos (HU-inbox-1, T-326).
 */
const ID_CONV = '01932000-0000-7000-8000-000000000001';
const ID_ETQ = '01932000-0000-7000-8000-0000000000e1';

const respuesta = (cuerpo: unknown, estado = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(cuerpo), {
      status: estado,
      headers: { 'content-type': 'application/json' },
    }),
  );

const ETQ = { id: ID_ETQ, nombre: 'Pagado', color: 'verde', orden: 0 };
const RESUMEN = {
  id: ID_CONV,
  contactoId: '01932000-0000-7000-8000-0000000000c1',
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
  etiquetas: [{ id: ID_ETQ, nombre: 'Pagado', color: 'verde' }],
};

describe('etiquetasApi con la API real', () => {
  const fetchOriginal = globalThis.fetch;
  const envOriginal = process.env['NEXT_PUBLIC_USE_REAL_INBOX'];
  let fetchEspia: Mock<typeof fetch>;

  beforeEach(() => {
    process.env['NEXT_PUBLIC_USE_REAL_INBOX'] = 'true';
    fetchEspia = vi.fn<typeof fetch>();
    globalThis.fetch = fetchEspia;
  });
  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    if (envOriginal === undefined) delete process.env['NEXT_PUBLIC_USE_REAL_INBOX'];
    else process.env['NEXT_PUBLIC_USE_REAL_INBOX'] = envOriginal;
  });

  const ultimaLlamada = () => {
    const [url, init] = fetchEspia.mock.calls.at(-1) as [string, RequestInit | undefined];
    return { url, metodo: init?.method ?? 'GET', cuerpo: init?.body as string | undefined };
  };

  it('lista el catálogo: GET /api/v1/etiquetas, validado con el contrato', async () => {
    fetchEspia.mockImplementation(() => respuesta({ datos: [ETQ] }));
    await expect(etiquetasApi.listar()).resolves.toEqual([ETQ]);
    expect(ultimaLlamada()).toMatchObject({ url: expect.stringMatching(/\/api\/v1\/etiquetas$/) });
  });

  it('una respuesta que no cumple el contrato es un error, no datos a medias', async () => {
    fetchEspia.mockImplementation(() =>
      respuesta({ datos: [{ id: 'x', nombre: '', color: 'rojo' }] }),
    );
    await expect(etiquetasApi.listar()).rejects.toThrow();
  });

  it('crear: POST con nombre normalizado y color de la paleta', async () => {
    fetchEspia.mockImplementation(() => respuesta(ETQ, 201));
    await etiquetasApi.crear({ nombre: '  Pagado ', color: 'verde' });
    const { metodo, cuerpo } = ultimaLlamada();
    expect(metodo).toBe('POST');
    expect(JSON.parse(cuerpo ?? '{}')).toEqual({ nombre: 'Pagado', color: 'verde' });
  });

  it('crear con un color fuera de la paleta (p. ej. rojo) ni siquiera sale del navegador', async () => {
    await expect(
      etiquetasApi.crear({ nombre: 'Urgente', color: 'rojo' as never }),
    ).rejects.toThrow();
    expect(fetchEspia).not.toHaveBeenCalled();
  });

  it('actualizar: PATCH; borrar: DELETE', async () => {
    fetchEspia.mockImplementation(() => respuesta({ ...ETQ, nombre: 'Cobrado' }));
    await etiquetasApi.actualizar(ID_ETQ, { nombre: 'Cobrado' });
    expect(ultimaLlamada()).toMatchObject({
      metodo: 'PATCH',
      url: expect.stringContaining(`/api/v1/etiquetas/${ID_ETQ}`),
    });
    fetchEspia.mockImplementation(() => respuesta({ ok: true }));
    await etiquetasApi.borrar(ID_ETQ);
    expect(ultimaLlamada()).toMatchObject({ metodo: 'DELETE' });
  });

  it('poner y quitar en la conversación: PUT y DELETE sobre /conversaciones/:id/etiquetas/:etiquetaId', async () => {
    fetchEspia.mockImplementation(() => respuesta(RESUMEN));
    const r = await etiquetasApi.ponerEnConversacion(ID_CONV, ID_ETQ);
    expect(r.etiquetas).toHaveLength(1);
    expect(ultimaLlamada()).toMatchObject({
      metodo: 'PUT',
      url: expect.stringContaining(`/api/v1/conversaciones/${ID_CONV}/etiquetas/${ID_ETQ}`),
    });
    await etiquetasApi.quitarDeConversacion(ID_CONV, ID_ETQ);
    expect(ultimaLlamada()).toMatchObject({ metodo: 'DELETE' });
  });

  it('los errores tipados llegan con su código: duplicada 409, tope 422, etiqueta 404', async () => {
    const error = (code: string, estado: number) =>
      respuesta({ error: { code, message: 'texto del servidor' } }, estado);

    fetchEspia.mockImplementation(() => error('ETIQUETA_DUPLICADA', 409));
    await expect(etiquetasApi.crear({ nombre: 'Pagado', color: 'verde' })).rejects.toMatchObject({
      name: 'InboxErrorApi',
      code: 'ETIQUETA_DUPLICADA',
    });

    fetchEspia.mockImplementation(() => error('TOPE_DE_ETIQUETAS_DE_LA_CONVERSACION', 422));
    await expect(etiquetasApi.ponerEnConversacion(ID_CONV, ID_ETQ)).rejects.toMatchObject({
      code: 'TOPE_DE_ETIQUETAS_DE_LA_CONVERSACION',
    });

    // Una etiqueta que no existe NO se disfraza de «la conversación no existe».
    fetchEspia.mockImplementation(() => error('ETIQUETA_NO_ENCONTRADA', 404));
    await expect(etiquetasApi.ponerEnConversacion(ID_CONV, ID_ETQ)).rejects.toMatchObject({
      code: 'ETIQUETA_NO_ENCONTRADA',
    });

    fetchEspia.mockImplementation(() => error('CONVERSACION_NO_ENCONTRADA', 404));
    await expect(etiquetasApi.ponerEnConversacion(ID_CONV, ID_ETQ)).rejects.toMatchObject({
      code: 'CONVERSACION_NO_ENCONTRADA',
    });
  });

  it('sin conexión: ERROR_CONEXION', async () => {
    fetchEspia.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(etiquetasApi.listar()).rejects.toMatchObject({ code: 'ERROR_CONEXION' });
    expect(InboxErrorApi).toBeDefined();
  });

  it('el filtro de la bandeja manda `etiquetas` y `modo` solo cuando hay etiquetas', async () => {
    const vacia = { datos: [], pageInfo: { nextCursor: null, hasMore: false } };
    fetchEspia.mockImplementation(() => respuesta(vacia));
    await inboxApi.consultarBandeja({
      filtro: 'TODAS',
      etiquetas: [ID_ETQ, '01932000-0000-7000-8000-0000000000e2'],
      modo: 'todas',
      limite: 30,
    });
    const url = new URL(ultimaLlamada().url, 'http://x');
    expect(url.searchParams.get('etiquetas')).toBe(
      `${ID_ETQ},01932000-0000-7000-8000-0000000000e2`,
    );
    expect(url.searchParams.get('modo')).toBe('todas');

    await inboxApi.consultarBandeja({ filtro: 'TODAS', limite: 30 });
    const sin = new URL(ultimaLlamada().url, 'http://x');
    expect(sin.searchParams.has('etiquetas')).toBe(false);
    expect(sin.searchParams.has('modo')).toBe(false);
  });
});

describe('modo demo: ninguna llamada de red y las mismas etiquetas que la API', () => {
  const fetchOriginal = globalThis.fetch;
  const env = {
    real: process.env['NEXT_PUBLIC_USE_REAL_INBOX'],
    mock: process.env['NEXT_PUBLIC_USE_MOCK_INBOX'],
  };
  beforeEach(() => {
    delete process.env['NEXT_PUBLIC_USE_REAL_INBOX'];
    process.env['NEXT_PUBLIC_USE_MOCK_INBOX'] = 'true';
  });
  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    if (env.real === undefined) delete process.env['NEXT_PUBLIC_USE_REAL_INBOX'];
    else process.env['NEXT_PUBLIC_USE_REAL_INBOX'] = env.real;
    if (env.mock === undefined) delete process.env['NEXT_PUBLIC_USE_MOCK_INBOX'];
    else process.env['NEXT_PUBLIC_USE_MOCK_INBOX'] = env.mock;
  });

  it('listar, poner y filtrar no tocan la red y usan el catálogo de demo', async () => {
    const espia = vi.fn<typeof fetch>();
    globalThis.fetch = espia;
    const lista = await etiquetasApi.listar();
    expect(lista.map((e) => e.nombre)).toEqual(listarEtiquetasMock().map((e) => e.nombre));
    expect(lista.map((e) => e.nombre)).toEqual(['Pagado', 'Pago pendiente', 'Seguimiento']);
    const pagina = await inboxApi.consultarBandeja({
      filtro: 'TODAS',
      etiquetas: [lista[2]?.id ?? ''],
      modo: 'cualquiera',
      limite: 5,
    });
    expect(pagina.datos.length).toBeGreaterThan(0);
    expect(espia).not.toHaveBeenCalled();
  });
});
