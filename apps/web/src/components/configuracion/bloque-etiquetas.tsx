'use client';

import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle,
  Pencil,
  Plus,
  Tag,
  Trash2,
} from 'lucide-react';
import {
  MAX_ETIQUETAS_POR_AGENCIA,
  LONGITUD_MAXIMA_DEL_NOMBRE_DE_ETIQUETA,
  normalizarNombreDeEtiqueta,
  type ColorDeEtiqueta,
  type Etiqueta,
} from '@viajapro/contracts';
import { etiquetasApi } from '../../lib/etiquetas-api';
import {
  cambiosDeOrdenAlMover,
  interpretarErrorDeEtiqueta,
  type AccionSobreEtiqueta,
} from '../../lib/etiquetas-logica';
import { useCatalogoDeEtiquetas } from '../../lib/use-catalogo-de-etiquetas';
import { useFocoModal } from '../../lib/use-foco-modal';
import { usePermisos } from '../../lib/permisos';
import { ChipDeEtiqueta } from '../etiquetas/chip-de-etiqueta';
import { SelectorDeColor } from '../etiquetas/selector-de-color';

/** Lo que dice el nombre escrito cuando no se puede guardar, sin repetirlo en ningún log. */
function mensajeDeNombre(nombre: string): string | null {
  const r = normalizarNombreDeEtiqueta(nombre);
  if (r.ok) return null;
  if (r.motivo === 'VACIO') return 'Escribe el nombre de la etiqueta.';
  if (r.motivo === 'LARGO') {
    return `El nombre admite hasta ${LONGITUD_MAXIMA_DEL_NOMBRE_DE_ETIQUETA} caracteres. Acórtalo.`;
  }
  return 'El nombre tiene caracteres que no se admiten. Escríbelo de nuevo a mano.';
}

/**
 * Configuración → Etiquetas (T-326, HU-inbox-1 §4.6). Solo se muestra con `etiquetas.administrar`
 * (la pestaña no existe sin él) y la API vuelve a exigirlo. Crear, renombrar, elegir color de la
 * paleta, subir y bajar con botones y borrar con confirmación.
 *
 * Las etiquetas son una ayuda visual del chat: ninguna calcula un saldo ni cambia un archivo de viaje.
 */
export function BloqueEtiquetas() {
  const { puedeAdministrarEtiquetas } = usePermisos();
  const catalogo = useCatalogoDeEtiquetas({ habilitado: puedeAdministrarEtiquetas });
  const { etiquetas, estado } = catalogo;

  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [colorNuevo, setColorNuevo] = useState<ColorDeEtiqueta>('azul');
  const [editando, setEditando] = useState<Etiqueta | null>(null);
  const [nombreEditado, setNombreEditado] = useState('');
  const [colorEditado, setColorEditado] = useState<ColorDeEtiqueta>('azul');
  const [porBorrar, setPorBorrar] = useState<Etiqueta | null>(null);
  const temporizadorExito = useRef<ReturnType<typeof setTimeout> | null>(null);

  const avisarExito = (mensaje: string) => {
    setExito(mensaje);
    if (temporizadorExito.current) clearTimeout(temporizadorExito.current);
    temporizadorExito.current = setTimeout(() => setExito(null), 4000);
  };

  /** Ejecuta una acción; si falla, dice qué pasó y qué hacer (sin el texto crudo del servidor). */
  const ejecutar = async (
    accion: () => Promise<void>,
    sobre: AccionSobreEtiqueta,
    nombre?: string,
  ): Promise<boolean> => {
    setOcupado(true);
    setError(null);
    try {
      await accion();
      return true;
    } catch (err) {
      const aviso = interpretarErrorDeEtiqueta(err, sobre, nombre);
      setError(aviso.mensaje);
      // Otra persona la borró o hubo un corte a medias: se vuelve a pedir lo que de verdad hay.
      if (aviso.siguiente === 'recargar' || sobre === 'borrar') void catalogo.recargar();
      return false;
    } finally {
      setOcupado(false);
    }
  };

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    const problema = mensajeDeNombre(nombreNuevo);
    if (problema) {
      setError(problema);
      return;
    }
    const normalizado = normalizarNombreDeEtiqueta(nombreNuevo);
    if (!normalizado.ok) return;
    const ok = await ejecutar(
      async () => {
        const creada = await etiquetasApi.crear({ nombre: normalizado.nombre, color: colorNuevo });
        catalogo.reemplazar([...etiquetas, creada].sort((a, b) => a.orden - b.orden));
      },
      'crear',
      normalizado.nombre,
    );
    if (ok) {
      setNombreNuevo('');
      avisarExito('Etiqueta creada.');
    }
  };

  const abrirEdicion = (e: Etiqueta) => {
    setEditando(e);
    setNombreEditado(e.nombre);
    setColorEditado(e.color);
    setError(null);
  };

  const guardarEdicion = async () => {
    if (!editando) return;
    const problema = mensajeDeNombre(nombreEditado);
    if (problema) {
      setError(problema);
      return;
    }
    const normalizado = normalizarNombreDeEtiqueta(nombreEditado);
    if (!normalizado.ok) return;
    const cambios: { nombre?: string; color?: ColorDeEtiqueta } = {};
    if (normalizado.nombre !== editando.nombre) cambios.nombre = normalizado.nombre;
    if (colorEditado !== editando.color) cambios.color = colorEditado;
    if (Object.keys(cambios).length === 0) {
      setEditando(null);
      return;
    }
    const objetivo = editando;
    const ok = await ejecutar(
      async () => {
        const actualizada = await etiquetasApi.actualizar(objetivo.id, cambios);
        catalogo.reemplazar(etiquetas.map((x) => (x.id === actualizada.id ? actualizada : x)));
      },
      'renombrar',
      normalizado.nombre,
    );
    if (ok) {
      setEditando(null);
      avisarExito('Etiqueta actualizada. Se ve igual en todas las conversaciones.');
    }
  };

  const mover = async (e: Etiqueta, direccion: 'subir' | 'bajar') => {
    const cambios = cambiosDeOrdenAlMover(etiquetas, e.id, direccion);
    if (cambios.length === 0) return;
    const ok = await ejecutar(async () => {
      // En serie: si una falla se recarga lo que de verdad quedó en el servidor.
      for (const c of cambios) await etiquetasApi.actualizar(c.id, { orden: c.orden });
      await catalogo.recargar();
    }, 'ordenar');
    if (ok) avisarExito('Orden actualizado.');
    else void catalogo.recargar();
  };

  const confirmarBorrado = async () => {
    if (!porBorrar) return;
    const objetivo = porBorrar;
    const ok = await ejecutar(
      async () => {
        await etiquetasApi.borrar(objetivo.id);
        catalogo.reemplazar(etiquetas.filter((x) => x.id !== objetivo.id));
      },
      'borrar',
      objetivo.nombre,
    );
    setPorBorrar(null);
    if (ok) avisarExito('Etiqueta borrada.');
  };

  if (!puedeAdministrarEtiquetas) {
    return (
      <div
        data-testid="etiquetas-sin-permiso"
        className="rounded-2xl border border-neutral-200 bg-white p-6 text-xs text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
      >
        <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">Etiquetas</h2>
        <p className="mt-1">
          Tu rol no puede gestionar las etiquetas. Pídele a quien administra la agencia el permiso
          «Administrar etiquetas».
        </p>
      </div>
    );
  }

  const llena = etiquetas.length >= MAX_ETIQUETAS_POR_AGENCIA;

  return (
    <div
      data-testid="bloque-etiquetas"
      className="min-w-0 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs sm:p-6 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="flex items-center gap-3">
        <div className="bg-acento-100 text-acento-800 dark:bg-acento-950 dark:text-acento-200 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
          <Tag aria-hidden="true" className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
            Etiquetas de conversación
          </h2>
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            Marcas de color para tus chats. Son una ayuda visual: no cambian ningún archivo de viaje
            ni su saldo.
          </p>
        </div>
      </div>

      {exito && (
        <div
          role="status"
          className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-300"
        >
          <CheckCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span>{exito}</span>
        </div>
      )}
      {error && (
        <div
          role="alert"
          data-testid="error-de-etiquetas"
          className="border-alerta-600/30 bg-alerta-50 text-alerta-700 dark:bg-alerta-950/40 dark:text-alerta-300 mt-4 flex items-start gap-2 rounded-xl border px-4 py-2.5 text-xs"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0">{error}</span>
        </div>
      )}

      {/* Alta */}
      <form onSubmit={(e) => void crear(e)} className="mt-5 space-y-3" aria-label="Crear etiqueta">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="min-w-0 flex-1">
            <label
              htmlFor="nombre-etiqueta-nueva"
              className="text-xs font-semibold text-neutral-800 dark:text-neutral-200"
            >
              Nombre de la etiqueta nueva
            </label>
            <input
              id="nombre-etiqueta-nueva"
              type="text"
              value={nombreNuevo}
              onChange={(e) => setNombreNuevo(e.target.value)}
              maxLength={LONGITUD_MAXIMA_DEL_NOMBRE_DE_ETIQUETA * 2}
              disabled={ocupado || llena}
              placeholder="Ej. Cotización enviada"
              className="mt-1 min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white px-3 text-base text-neutral-900 placeholder-neutral-500 sm:text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            />
          </div>
        </div>
        <SelectorDeColor
          valor={colorNuevo}
          onCambiar={setColorNuevo}
          nombre="Color de la etiqueta nueva"
          deshabilitado={ocupado || llena}
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={ocupado || llena}
            data-testid="crear-etiqueta"
            className="boton-primario focus-visible:ring-acento-600 flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            <span>Crear etiqueta</span>
          </button>
          <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
            {etiquetas.length} de {MAX_ETIQUETAS_POR_AGENCIA}
            {llena && ' · Borra una que no uses para crear otra.'}
          </p>
        </div>
      </form>

      {/* Lista */}
      {estado === 'cargando' ? (
        <div data-testid="etiquetas-cargando" role="status" className="mt-6 space-y-3">
          <span className="sr-only">Cargando etiquetas…</span>
          {[1, 2, 3].map((i) => (
            <div key={i} className="esqueleto-brillo h-14 rounded-xl" />
          ))}
        </div>
      ) : estado === 'error' ? (
        <div
          role="alert"
          data-testid="etiquetas-error-de-carga"
          className="border-alerta-600/30 bg-alerta-50 text-alerta-700 dark:bg-alerta-950/40 dark:text-alerta-300 mt-5 flex flex-col gap-3 rounded-xl border p-4 text-xs"
        >
          <span>No se pudieron cargar las etiquetas. Revisa tu conexión.</span>
          <button
            type="button"
            onClick={() => void catalogo.recargar()}
            className="focus-visible:ring-acento-600 min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white px-4 text-xs font-semibold text-neutral-900 focus-visible:ring-2 focus-visible:outline-none sm:w-auto sm:self-start"
          >
            Reintentar
          </button>
        </div>
      ) : etiquetas.length === 0 ? (
        <p
          data-testid="etiquetas-vacio"
          className="mt-5 rounded-xl border border-dashed border-neutral-300 p-6 text-center text-xs text-neutral-600 dark:border-neutral-700 dark:text-neutral-400"
        >
          Tu agencia no tiene etiquetas. Crea la primera arriba.
        </p>
      ) : (
        <ul className="mt-6 space-y-3" aria-label="Etiquetas de la agencia">
          {etiquetas.map((e, idx) => {
            const enEdicion = editando?.id === e.id;
            return (
              <li
                key={e.id}
                data-testid="fila-de-etiqueta"
                className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-3 dark:border-neutral-800 dark:bg-neutral-800/40"
              >
                {enEdicion ? (
                  <div className="space-y-3">
                    <div>
                      <label
                        htmlFor={`nombre-etiqueta-${e.id}`}
                        className="text-xs font-semibold text-neutral-800 dark:text-neutral-200"
                      >
                        Nombre de la etiqueta
                      </label>
                      <input
                        id={`nombre-etiqueta-${e.id}`}
                        type="text"
                        value={nombreEditado}
                        onChange={(ev) => setNombreEditado(ev.target.value)}
                        maxLength={LONGITUD_MAXIMA_DEL_NOMBRE_DE_ETIQUETA * 2}
                        disabled={ocupado}
                        className="mt-1 min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white px-3 text-base text-neutral-900 sm:text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                      />
                    </div>
                    <SelectorDeColor
                      valor={colorEditado}
                      onCambiar={setColorEditado}
                      nombre="Color de la etiqueta"
                      deshabilitado={ocupado}
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void guardarEdicion()}
                        disabled={ocupado}
                        data-testid="guardar-etiqueta"
                        className="boton-primario focus-visible:ring-acento-600 min-h-[44px] rounded-xl px-4 text-xs font-semibold focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditando(null)}
                        disabled={ocupado}
                        className="boton-secundario focus-visible:ring-acento-600 min-h-[44px] rounded-xl px-4 text-xs font-semibold focus-visible:ring-2 focus-visible:outline-none"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-0 flex-1 basis-40">
                      <ChipDeEtiqueta etiqueta={e} />
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void mover(e, 'subir')}
                        disabled={idx === 0 || ocupado}
                        aria-label={`Subir etiqueta ${e.nombre}`}
                        className="focus-visible:ring-acento-600 flex h-11 w-11 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-700 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-30 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                      >
                        <ArrowUp aria-hidden="true" className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void mover(e, 'bajar')}
                        disabled={idx === etiquetas.length - 1 || ocupado}
                        aria-label={`Bajar etiqueta ${e.nombre}`}
                        className="focus-visible:ring-acento-600 flex h-11 w-11 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-700 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-30 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                      >
                        <ArrowDown aria-hidden="true" className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => abrirEdicion(e)}
                        disabled={ocupado}
                        aria-label={`Editar etiqueta ${e.nombre}`}
                        data-testid="editar-etiqueta"
                        className="focus-visible:ring-acento-600 flex h-11 w-11 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-700 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                      >
                        <Pencil aria-hidden="true" className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPorBorrar(e)}
                        disabled={ocupado}
                        aria-label={`Borrar etiqueta ${e.nombre}`}
                        data-testid="borrar-etiqueta"
                        className="text-alerta-700 dark:text-alerta-300 focus-visible:ring-acento-600 flex h-11 w-11 items-center justify-center rounded-lg border border-neutral-200 bg-white focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800"
                      >
                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {porBorrar && (
        <ConfirmarBorradoDeEtiqueta
          etiqueta={porBorrar}
          ocupado={ocupado}
          onCancelar={() => setPorBorrar(null)}
          onConfirmar={() => void confirmarBorrado()}
        />
      )}
    </div>
  );
}

function ConfirmarBorradoDeEtiqueta({
  etiqueta,
  ocupado,
  onCancelar,
  onConfirmar,
}: {
  etiqueta: Etiqueta;
  ocupado: boolean;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  const ref = useFocoModal<HTMLDivElement>({ abierto: true, alCerrar: onCancelar });
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={onCancelar}
    >
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="titulo-borrar-etiqueta"
        aria-describedby="detalle-borrar-etiqueta"
        data-testid="confirmar-borrado-de-etiqueta"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl dark:bg-neutral-900"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle aria-hidden="true" className="text-alerta-600 mt-0.5 h-5 w-5 shrink-0" />
          <div className="min-w-0">
            <h3
              id="titulo-borrar-etiqueta"
              className="text-sm font-bold break-words text-neutral-900 dark:text-neutral-100"
            >
              ¿Borrar la etiqueta “{etiqueta.nombre}”?
            </h3>
            <p
              id="detalle-borrar-etiqueta"
              className="mt-1 text-xs text-neutral-700 dark:text-neutral-300"
            >
              Al borrarla se quita de todas las conversaciones donde está. No se puede deshacer.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancelar}
            disabled={ocupado}
            className="boton-secundario focus-visible:ring-acento-600 min-h-[44px] rounded-xl px-4 text-xs font-semibold focus-visible:ring-2 focus-visible:outline-none"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={ocupado}
            data-testid="confirmar-borrar-etiqueta"
            className="bg-alerta-700 focus-visible:ring-acento-600 min-h-[44px] rounded-xl px-4 text-xs font-semibold text-white focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
          >
            Borrar etiqueta
          </button>
        </div>
      </div>
    </div>
  );
}
