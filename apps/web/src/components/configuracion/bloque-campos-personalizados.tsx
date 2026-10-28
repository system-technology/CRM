'use client';

import React, { useState, useEffect } from 'react';
import {
  FormInput,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Hash,
  Calendar,
  List,
  Type,
  Users,
  Kanban,
} from 'lucide-react';
import {
  obtenerCamposDefinidosStorage,
  guardarCamposDefinidosStorage,
  normalizarClaveCampo,
  type DefinicionCampoPersonalizado,
  type TipoCampoPersonalizado,
} from '../../lib/campos-personalizados-logica';
import { useFocoModal } from '../../lib/use-foco-modal';

export function BloqueCamposPersonalizados() {
  const [campos, setCampos] = useState<DefinicionCampoPersonalizado[]>([]);
  const [entidadActiva, setEntidadActiva] = useState<'contacto' | 'oportunidad'>('contacto');
  const [modalNuevo, setModalNuevo] = useState(false);

  // Formulario nuevo campo
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoTipo, setNuevoTipo] = useState<TipoCampoPersonalizado>('texto');
  const [nuevasOpciones, setNuevasOpciones] = useState('');
  const [nuevoRequerido, setNuevoRequerido] = useState(false);
  const [nuevaDescripcion, setNuevaDescripcion] = useState('');
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);

  const modalRef = useFocoModal<HTMLDivElement>({
    abierto: modalNuevo,
    alCerrar: () => setModalNuevo(false),
  });

  useEffect(() => {
    setCampos(obtenerCamposDefinidosStorage());
  }, []);

  const camposFiltrados = campos.filter((c) => c.entidad === entidadActiva);

  const eliminarCampo = (id: string) => {
    const filtrados = campos.filter((c) => c.id !== id);
    setCampos(filtrados);
    guardarCamposDefinidosStorage(filtrados);
    setMensajeExito('Campo personalizado eliminado.');
    setTimeout(() => setMensajeExito(null), 3000);
  };

  const handleCrearCampo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoNombre.trim()) {
      setErrorForm('El nombre del campo es obligatorio.');
      return;
    }

    const clave = normalizarClaveCampo(nuevoNombre);
    const existe = campos.some((c) => c.entidad === entidadActiva && c.clave === clave);
    if (existe) {
      setErrorForm('Ya existe un campo con este nombre o clave.');
      return;
    }

    let opcionesParsed: string[] | undefined = undefined;
    if (nuevoTipo === 'lista') {
      opcionesParsed = nuevasOpciones
        .split(',')
        .map((o) => o.trim())
        .filter((o) => o.length > 0);
      if (opcionesParsed.length === 0) {
        setErrorForm('Debes ingresar al menos una opción para el campo de tipo lista.');
        return;
      }
    }

    const nuevo: DefinicionCampoPersonalizado = {
      id: `campo-${Date.now()}`,
      entidad: entidadActiva,
      nombre: nuevoNombre.trim(),
      clave,
      tipo: nuevoTipo,
      requerido: nuevoRequerido,
      ...(opcionesParsed ? { opciones: opcionesParsed } : {}),
      ...(nuevaDescripcion.trim() ? { descripcion: nuevaDescripcion.trim() } : {}),
    };

    const actualizados = [...campos, nuevo];
    setCampos(actualizados);
    guardarCamposDefinidosStorage(actualizados);

    // Resetear formulario
    setNuevoNombre('');
    setNuevoTipo('texto');
    setNuevasOpciones('');
    setNuevoRequerido(false);
    setNuevaDescripcion('');
    setErrorForm(null);
    setModalNuevo(false);

    setMensajeExito(`Campo "${nuevo.nombre}" creado exitosamente.`);
    setTimeout(() => setMensajeExito(null), 3000);
  };

  const iconoTipo = (tipo: TipoCampoPersonalizado) => {
    switch (tipo) {
      case 'numero':
        return <Hash className="h-3.5 w-3.5" />;
      case 'fecha':
        return <Calendar className="h-3.5 w-3.5" />;
      case 'lista':
        return <List className="h-3.5 w-3.5" />;
      case 'texto':
      default:
        return <Type className="h-3.5 w-3.5" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabecera del Módulo */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
              <FormInput className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-neutral-900 dark:text-white">
                Campos Personalizados del CRM (T-026)
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Extiende los atributos de viajeros (contactos) y cotizaciones (oportunidades) según
                el modelo de tu agencia.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setModalNuevo(true)}
            data-testid="btn-crear-campo-personalizado"
            className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-purple-700 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-purple-800 focus:outline-hidden"
          >
            <Plus className="h-4 w-4" />
            <span>Crear Campo</span>
          </button>
        </div>

        {mensajeExito && (
          <div
            role="status"
            className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>{mensajeExito}</span>
          </div>
        )}

        {/* Selector de Entidad */}
        <div className="mt-5 flex border-b border-neutral-200 dark:border-neutral-800">
          <button
            type="button"
            onClick={() => setEntidadActiva('contacto')}
            className={`flex min-h-[44px] items-center gap-2 border-b-2 px-4 py-2 text-xs font-bold transition-colors ${
              entidadActiva === 'contacto'
                ? 'border-purple-600 text-purple-700 dark:border-purple-400 dark:text-purple-300'
                : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>Viajeros / Contactos</span>
            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] text-purple-800 dark:bg-purple-950 dark:text-purple-300">
              {campos.filter((c) => c.entidad === 'contacto').length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setEntidadActiva('oportunidad')}
            className={`flex min-h-[44px] items-center gap-2 border-b-2 px-4 py-2 text-xs font-bold transition-colors ${
              entidadActiva === 'oportunidad'
                ? 'border-purple-600 text-purple-700 dark:border-purple-400 dark:text-purple-300'
                : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
            }`}
          >
            <Kanban className="h-4 w-4" />
            <span>Oportunidades Comerciales</span>
            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] text-purple-800 dark:bg-purple-950 dark:text-purple-300">
              {campos.filter((c) => c.entidad === 'oportunidad').length}
            </span>
          </button>
        </div>

        {/* Lista de Campos de la Entidad */}
        {camposFiltrados.length === 0 ? (
          <div className="py-8 text-center text-xs text-neutral-400">
            No hay campos configurados para esta entidad. Haz clic en «Crear Campo» para agregar
            uno.
          </div>
        ) : (
          <div className="mt-4 divide-y divide-neutral-100 dark:divide-neutral-800">
            {camposFiltrados.map((campo) => (
              <div
                key={campo.id}
                className="flex flex-col gap-2 py-3.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-neutral-900 dark:text-white">
                      {campo.nombre}
                    </span>
                    <span className="flex items-center gap-1 rounded bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                      {iconoTipo(campo.tipo)}
                      <span className="capitalize">{campo.tipo}</span>
                    </span>
                    {campo.requerido && (
                      <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                        Obligatorio
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                    Clave:{' '}
                    <code className="rounded bg-neutral-200/60 px-1 py-0.5 dark:bg-neutral-700">
                      {campo.clave}
                    </code>
                    {campo.descripcion && ` • ${campo.descripcion}`}
                  </p>
                  {campo.opciones && campo.opciones.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {campo.opciones.map((opt) => (
                        <span
                          key={opt}
                          className="rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[10px] text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                        >
                          {opt}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center sm:justify-end">
                  <button
                    type="button"
                    onClick={() => eliminarCampo(campo.id)}
                    aria-label={`Eliminar campo "${campo.nombre}"`}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-neutral-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal para Crear Nuevo Campo */}
      {modalNuevo && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-modal-nuevo-campo"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs"
        >
          <div
            ref={modalRef}
            className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900"
          >
            <h3
              id="titulo-modal-nuevo-campo"
              className="text-base font-bold text-neutral-900 dark:text-white"
            >
              Nuevo Campo Personalizado ({entidadActiva === 'contacto' ? 'Viajero' : 'Oportunidad'})
            </h3>
            <p className="mt-1 text-xs text-neutral-500">
              Define el tipo de dato y restricciones para este atributo.
            </p>

            {errorForm && (
              <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 p-2.5 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorForm}</span>
              </div>
            )}

            <form onSubmit={handleCrearCampo} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Nombre del Campo *
                </label>
                <input
                  type="text"
                  value={nuevoNombre}
                  onChange={(e) => setNuevoNombre(e.target.value)}
                  placeholder="Ej: Número de Pasaporte"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-purple-600 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Tipo de Dato
                </label>
                <select
                  value={nuevoTipo}
                  onChange={(e) => setNuevoTipo(e.target.value as TipoCampoPersonalizado)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-purple-600 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                >
                  <option value="texto">Texto (letras o alfanumérico)</option>
                  <option value="numero">Número (cifras o importes)</option>
                  <option value="fecha">Fecha (AAAA-MM-DD)</option>
                  <option value="lista">Lista de Opciones predefinidas</option>
                </select>
              </div>

              {nuevoTipo === 'lista' && (
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Opciones de la Lista (separadas por coma) *
                  </label>
                  <input
                    type="text"
                    value={nuevasOpciones}
                    onChange={(e) => setNuevasOpciones(e.target.value)}
                    placeholder="Opción 1, Opción 2, Opción 3"
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-purple-600 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Descripción u Orientación (opcional)
                </label>
                <input
                  type="text"
                  value={nuevaDescripcion}
                  onChange={(e) => setNuevaDescripcion(e.target.value)}
                  placeholder="Guía breve para el asesor que llena el dato"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-purple-600 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="chk-requerido"
                  checked={nuevoRequerido}
                  onChange={(e) => setNuevoRequerido(e.target.checked)}
                  className="h-4 w-4 rounded border-neutral-300 text-purple-600 focus:ring-purple-500"
                />
                <label
                  htmlFor="chk-requerido"
                  className="text-xs font-medium text-neutral-700 dark:text-neutral-300"
                >
                  Campo obligatorio para el asesor
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setModalNuevo(false)}
                  className="min-h-[44px] rounded-xl border border-neutral-200 px-4 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] rounded-xl bg-purple-700 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-purple-800"
                >
                  Guardar Campo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
