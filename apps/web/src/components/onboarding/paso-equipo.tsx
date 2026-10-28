'use client';

import React, { useState } from 'react';
import {
  Users,
  UserPlus,
  Mail,
  ShieldCheck,
  Trash2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import {
  type DatosEquipoOnboarding,
  type MiembroInvitadoOnboarding,
  validarCorreoEquipo,
} from '../../lib/onboarding-logica';

export interface PasoEquipoProps {
  datos: DatosEquipoOnboarding;
  alGuardar: (datos: DatosEquipoOnboarding) => void;
  alOmitir: () => void;
}

export function PasoEquipo({ datos, alGuardar, alOmitir }: PasoEquipoProps) {
  const [miembros, setMiembros] = useState<MiembroInvitadoOnboarding[]>(
    datos.miembrosInvitados ?? [],
  );
  const [nuevoCorreo, setNuevoCorreo] = useState('');
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoRol, setNuevoRol] = useState<'ASESOR' | 'ADMIN_AGENCIA' | 'OPERATIVO'>('ASESOR');
  const [errorCorreo, setErrorCorreo] = useState<string | null>(null);

  const handleAgregarMiembro = (e: React.FormEvent) => {
    e.preventDefault();
    const validacion = validarCorreoEquipo(nuevoCorreo);
    if (!validacion.valido) {
      setErrorCorreo(validacion.error ?? 'Correo inválido');
      return;
    }

    if (miembros.some((m) => m.correo.toLowerCase() === nuevoCorreo.trim().toLowerCase())) {
      setErrorCorreo('Este correo electrónico ya fue agregado a la lista de invitaciones.');
      return;
    }

    setErrorCorreo(null);
    setMiembros((prev) => [
      ...prev,
      {
        correo: nuevoCorreo.trim().toLowerCase(),
        nombre: nuevoNombre.trim() || undefined,
        rol: nuevoRol,
      },
    ]);
    setNuevoCorreo('');
    setNuevoNombre('');
  };

  const handleEliminarMiembro = (correo: string) => {
    setMiembros((prev) => prev.filter((m) => m.correo !== correo));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alGuardar({ miembrosInvitados: miembros });
  };

  return (
    <form onSubmit={handleSubmit} data-testid="paso-equipo-form" className="space-y-6">
      {/* Explicación de Roles (T-027) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center gap-2 text-xs font-bold text-neutral-900 dark:text-white">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
              <Users className="h-3.5 w-3.5" />
            </span>
            <span>Asesor de Viajes</span>
          </div>
          <p className="mt-2 text-[11px] text-neutral-500 dark:text-neutral-400">
            Atiende chats en la bandeja de WhatsApp, genera cotizaciones y gestiona su pipeline
            personal.
          </p>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center gap-2 text-xs font-bold text-neutral-900 dark:text-white">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
              <ShieldCheck className="h-3.5 w-3.5" />
            </span>
            <span>Admin de Agencia</span>
          </div>
          <p className="mt-2 text-[11px] text-neutral-500 dark:text-neutral-400">
            Administra catálogo, miembros del equipo, tarifas y políticas sin acceso a facturación
            global.
          </p>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center gap-2 text-xs font-bold text-neutral-900 dark:text-white">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </span>
            <span>Coordinador Operativo</span>
          </div>
          <p className="mt-2 text-[11px] text-neutral-500 dark:text-neutral-400">
            Supervisa manifiestos de pasajeros, salidas de excursiones y asignación de proveedores.
          </p>
        </div>
      </div>

      {/* Formulario de Adición de Miembro */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <h3 className="flex items-center gap-2 text-sm font-bold text-neutral-900 dark:text-white">
          <UserPlus className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          <span>Invitar un Compañero de Equipo</span>
        </h3>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Recibirá un correo con su enlace seguro de acceso y bienvenida a la agencia.
        </p>

        {errorCorreo && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorCorreo}</span>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-12">
          <div className="sm:col-span-5">
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Correo Electrónico *
            </label>
            <div className="relative mt-1">
              <input
                type="email"
                value={nuevoCorreo}
                onChange={(e) => setNuevoCorreo(e.target.value)}
                placeholder="asesor@miagencia.com"
                className="min-h-[44px] w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 pl-9 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-purple-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
              <Mail className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-neutral-400" />
            </div>
          </div>

          <div className="sm:col-span-4">
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Nombre Completo (Opcional)
            </label>
            <input
              type="text"
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
              placeholder="Ej. Juan Pérez"
              className="mt-1 min-h-[44px] w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-purple-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            />
          </div>

          <div className="sm:col-span-3">
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Rol Asignado
            </label>
            <select
              value={nuevoRol}
              onChange={(e) =>
                setNuevoRol(e.target.value as 'ASESOR' | 'ADMIN_AGENCIA' | 'OPERATIVO')
              }
              className="mt-1 min-h-[44px] w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-xs text-neutral-900 focus:border-purple-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            >
              <option value="ASESOR">Asesor de Viajes</option>
              <option value="ADMIN_AGENCIA">Admin Agencia</option>
              <option value="OPERATIVO">Coordinador Operativo</option>
            </select>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleAgregarMiembro}
            data-testid="btn-agregar-miembro-onboarding"
            className="flex min-h-[44px] items-center gap-2 rounded-xl bg-purple-700 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-purple-800 dark:bg-purple-600 dark:hover:bg-purple-700"
          >
            <UserPlus className="h-4 w-4" />
            <span>Agregar a la Invitación</span>
          </button>
        </div>
      </div>

      {/* Lista de Miembros por Invitar */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3 dark:border-neutral-800">
          <h3 className="text-xs font-bold text-neutral-900 dark:text-white">
            Equipo a incorporar ({miembros.length + 1})
          </h3>
          <span className="text-[11px] text-neutral-500">
            Tú (Dueño de Agencia) + {miembros.length} invitados
          </span>
        </div>

        <div className="mt-3 space-y-2">
          {/* El usuario actual / Dueño */}
          <div className="flex items-center justify-between rounded-xl bg-neutral-50 p-3 dark:bg-neutral-800/50">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                TÚ
              </span>
              <div>
                <p className="text-xs font-bold text-neutral-900 dark:text-white">
                  Tú (Administrador Principal)
                </p>
                <p className="text-[11px] text-neutral-500">Sesión activa del tenant</p>
              </div>
            </div>
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              DUENO
            </span>
          </div>

          {/* Invitados */}
          {miembros.map((m) => (
            <div
              key={m.correo}
              className="flex items-center justify-between rounded-xl border border-neutral-100 bg-white p-3 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 text-xs font-bold text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                  {m.nombre ? m.nombre.slice(0, 2).toUpperCase() : 'AS'}
                </span>
                <div>
                  <p className="text-xs font-bold text-neutral-900 dark:text-white">
                    {m.nombre || m.correo}
                  </p>
                  <p className="text-[11px] text-neutral-500">{m.correo}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-bold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                  {m.rol}
                </span>
                <button
                  type="button"
                  onClick={() => handleEliminarMiembro(m.correo)}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-rose-600 dark:hover:bg-neutral-800"
                  aria-label={`Eliminar a ${m.correo}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Barra de Acciones del Paso */}
      <div className="flex flex-col-reverse items-center justify-between gap-3 border-t border-neutral-200 pt-5 sm:flex-row dark:border-neutral-800">
        <button
          type="button"
          onClick={alOmitir}
          data-testid="btn-omitir-paso-equipo"
          className="min-h-[44px] w-full rounded-xl px-5 py-2.5 text-xs font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 sm:w-auto dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
        >
          Omitir por ahora (trabajo solo)
        </button>

        <button
          type="submit"
          data-testid="btn-guardar-paso-equipo"
          className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 px-6 py-2.5 text-xs font-bold text-white shadow-md hover:bg-neutral-800 active:scale-98 sm:w-auto dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
        >
          <span>Guardar y Continuar a WhatsApp</span>
        </button>
      </div>
    </form>
  );
}
