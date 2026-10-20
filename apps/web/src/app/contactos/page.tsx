'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { type Contacto } from '@viajapro/contracts';
import {
  Users,
  Search,
  Filter,
  MessageSquare,
  ShieldCheck,
  Tag,
  ChevronRight,
  UserCheck,
} from 'lucide-react';
import { BarraModulos } from '../../components/bandeja/barra-modulos';
import { DistintivoDatosDemo } from '../../components/comun/distintivo-datos-demo';
import { EsqueletoTabla, AvisoErrorAccionable } from '../../components/comun/esqueletos';
import { formatearErrorAmigable } from '../../lib/estados-ui-logica';
import { construirMensajeErrorAccionable } from '../../lib/estados-ui-logica';
import { FichaDetalleContacto } from '../../components/contactos/ficha-detalle-contacto';
import { obtenerMockPaginaContactos } from '../../lib/mock-contactos';
import { listarContactos } from '../../lib/crm-api';
import {
  filtrarContactos,
  formatearTelefonoVisual,
  obtenerEtiquetasDisponibles,
} from '../../lib/contactos-logica';
import { generarColorAvatar, obtenerIniciales } from '../../lib/bandeja-logica';

export default function ContactosPage() {
  const [pagina, setPagina] = useState(() => obtenerMockPaginaContactos());
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargarContactos = () => {
    setCargando(true);
    setError(null);
    listarContactos()
      .then((datos) => {
        setPagina(datos);
        setError(null);
      })
      .catch((err) => {
        console.warn('Error al cargar contactos de CRM API:', err);
        setError(
          formatearErrorAmigable(err, 'No fue posible consultar el directorio de contactos.'),
        );
      })
      .finally(() => {
        setCargando(false);
      });
  };

  useEffect(() => {
    cargarContactos();
  }, []);
  const [busqueda, setBusqueda] = useState('');
  const [etiquetaFiltro, setEtiquetaFiltro] = useState('todas');
  const [consentimientoFiltro, setConsentimientoFiltro] = useState('todos');

  // Contacto seleccionado para la ficha lateral
  const [contactoSeleccionado, setContactoSeleccionado] = useState<Contacto | null>(null);

  // Lista de etiquetas únicas para el selector
  const etiquetasDisponibles = useMemo(
    () => obtenerEtiquetasDisponibles(pagina.datos),
    [pagina.datos],
  );

  // Filtrado de contactos
  const contactosFiltrados = useMemo(
    () => filtrarContactos(pagina.datos, busqueda, etiquetaFiltro, consentimientoFiltro),
    [pagina.datos, busqueda, etiquetaFiltro, consentimientoFiltro],
  );

  // Métricas rápidas
  const totalPromocionales = pagina.datos.filter((c) =>
    c.consentimientos.includes('PROMOCIONAL'),
  ).length;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-neutral-100 text-neutral-900 select-none dark:bg-neutral-950 dark:text-neutral-100">
      {/* Barra de Módulos (56px) */}
      <BarraModulos />

      {/* Contenido Principal */}
      <main className="flex flex-1 flex-col overflow-hidden pb-14 md:pb-0">
        {/* Cabecera */}
        <header className="flex flex-col border-b border-neutral-200 bg-white px-6 py-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2.5">
                <div className="bg-acento-50 text-acento-700 dark:bg-acento-950/60 dark:text-acento-400 flex h-8 w-8 items-center justify-center rounded-xl">
                  <Users className="h-4 w-4" />
                </div>
                <h1 className="text-base font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
                  Contactos y Viajeros
                </h1>
                <DistintivoDatosDemo />
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                  {pagina.datos.length} contactos
                </span>
              </div>
              <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                Directorio comercial, preferencias de viaje y consentimientos (Ley 1581 / Meta)
              </p>
            </div>

            {/* Métricas rápidas de cabecera */}
            <div className="flex items-center space-x-3 text-xs">
              <div className="flex items-center space-x-1.5 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 dark:border-neutral-800 dark:bg-neutral-800/60">
                <ShieldCheck className="text-ok-600 dark:text-ok-400 h-4 w-4" />
                <span className="text-neutral-600 dark:text-neutral-300">
                  Opt-In Marketing: <strong>{totalPromocionales}</strong>
                </span>
              </div>
              <div className="flex items-center space-x-1.5 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 dark:border-neutral-800 dark:bg-neutral-800/60">
                <Tag className="h-4 w-4 text-neutral-400" />
                <span className="text-neutral-600 dark:text-neutral-300">
                  Segmentos: <strong>{etiquetasDisponibles.length}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Filtros y Búsqueda */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-3 dark:border-neutral-800/70">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              {/* Input de Búsqueda */}
              <div className="relative max-w-sm min-w-[240px] flex-1">
                <Search className="absolute top-2.5 left-3 h-3.5 w-3.5 text-neutral-400" />
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por nombre, teléfono o correo..."
                  className="focus:border-acento-500 w-full rounded-xl border border-neutral-200 bg-neutral-50 py-1.5 pr-3 pl-8 text-xs text-neutral-900 placeholder-neutral-400 focus:bg-white focus:outline-hidden dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-100"
                />
              </div>

              {/* Selector de Etiqueta */}
              <div className="flex items-center space-x-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                <Tag className="h-3.5 w-3.5" />
                <select
                  value={etiquetaFiltro}
                  onChange={(e) => setEtiquetaFiltro(e.target.value)}
                  className="focus:border-acento-500 rounded-xl border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-700 focus:outline-hidden dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-200"
                >
                  <option value="todas">Todas las etiquetas</option>
                  {etiquetasDisponibles.map((et) => (
                    <option key={et} value={et}>
                      {et}
                    </option>
                  ))}
                </select>
              </div>

              {/* Selector de Consentimiento */}
              <div className="flex items-center space-x-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                <Filter className="h-3.5 w-3.5" />
                <select
                  value={consentimientoFiltro}
                  onChange={(e) => setConsentimientoFiltro(e.target.value)}
                  className="focus:border-acento-500 rounded-xl border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-700 focus:outline-hidden dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-200"
                >
                  <option value="todos">Todos los consentimientos</option>
                  <option value="PROMOCIONAL">Con permiso de Marketing</option>
                  <option value="TRANSACCIONAL">Solo transaccional</option>
                </select>
              </div>
            </div>

            <div className="text-[11px] text-neutral-400">
              Mostrando {contactosFiltrados.length} de {pagina.datos.length}
            </div>
          </div>
        </header>

        {/* Tabla de Contactos con Estados (0c.25) */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <AvisoErrorAccionable
              error={construirMensajeErrorAccionable(error, 'CONTACTOS_LISTA')}
              onReintentar={cargarContactos}
            />
          )}

          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xs dark:border-neutral-800 dark:bg-neutral-900">
            {cargando ? (
              <EsqueletoTabla filas={6} />
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-400">
                  <tr>
                    <th className="px-5 py-3">Contacto / Viajero</th>
                    <th className="px-4 py-3">Teléfono WhatsApp</th>
                    <th className="px-4 py-3">Correo</th>
                    <th className="px-4 py-3">Etiquetas</th>
                    <th className="px-4 py-3">Consentimiento</th>
                    <th className="px-4 py-3">Último Contacto</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {contactosFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center">
                        <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                          No se encontraron contactos que coincidan con los filtros aplicados.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setBusqueda('');
                            setEtiquetaFiltro('todas');
                            setConsentimientoFiltro('todos');
                          }}
                          className="text-acento-600 hover:text-acento-700 mt-2 text-xs font-semibold"
                        >
                          Restablecer filtros
                        </button>
                      </td>
                    </tr>
                  ) : (
                    contactosFiltrados.map((c) => {
                      const avatarColores = generarColorAvatar(c.id);
                      const iniciales = obtenerIniciales(c.nombre, c.telefono);
                      const tienePromocional = c.consentimientos.includes('PROMOCIONAL');

                      return (
                        <tr
                          key={c.id}
                          onClick={() => setContactoSeleccionado(c)}
                          className="cursor-pointer transition-colors hover:bg-neutral-50/80 dark:hover:bg-neutral-800/40"
                        >
                          {/* Nombre + Avatar */}
                          <td className="px-5 py-3">
                            <div className="flex items-center space-x-3">
                              <div
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-[10px] font-bold select-none"
                                style={{
                                  backgroundColor: avatarColores.bg,
                                  color: avatarColores.text,
                                }}
                              >
                                {iniciales}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-neutral-900 dark:text-neutral-100">
                                  {c.nombre || 'Sin nombre registrado'}
                                </p>
                                <p className="truncate text-[10px] text-neutral-400">
                                  ID: {c.id.slice(0, 8)}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Teléfono */}
                          <td className="cifra px-4 py-3 font-medium text-neutral-700 dark:text-neutral-300">
                            {formatearTelefonoVisual(c.telefono)}
                          </td>

                          {/* Correo */}
                          <td className="max-w-[160px] truncate px-4 py-3 text-neutral-500 dark:text-neutral-400">
                            {c.correo || '—'}
                          </td>

                          {/* Etiquetas */}
                          <td className="px-4 py-3">
                            <div className="flex max-w-xs flex-wrap gap-1">
                              {c.etiquetas.slice(0, 2).map((et) => (
                                <span
                                  key={et}
                                  className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                                >
                                  {et}
                                </span>
                              ))}
                              {c.etiquetas.length > 2 && (
                                <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[9px] font-bold text-neutral-500 dark:bg-neutral-800">
                                  +{c.etiquetas.length - 2}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Consentimiento */}
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center space-x-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                tienePromocional
                                  ? 'bg-ok-50 text-ok-800 dark:bg-ok-950/60 dark:text-ok-300'
                                  : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                              }`}
                            >
                              <UserCheck className="h-3 w-3" />
                              <span>
                                {tienePromocional ? 'Transaccional + Mkt' : 'Transaccional'}
                              </span>
                            </span>
                          </td>

                          {/* Último contacto */}
                          <td className="px-4 py-3 text-[11px] text-neutral-500 dark:text-neutral-400">
                            {c.ultimoContactoEn
                              ? new Date(c.ultimoContactoEn).toLocaleDateString('es-CO')
                              : '—'}
                          </td>

                          {/* Acciones */}
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end space-x-2">
                              <Link
                                href="/bandeja"
                                onClick={(e) => e.stopPropagation()}
                                title="Abrir chat en bandeja"
                                className="hover:text-acento-600 dark:hover:text-acento-400 rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                              >
                                <MessageSquare className="h-4 w-4" />
                              </Link>
                              <ChevronRight className="h-4 w-4 text-neutral-300 dark:text-neutral-600" />
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>

      {/* Drawer de Detalle de Contacto */}
      {contactoSeleccionado && (
        <FichaDetalleContacto
          contacto={contactoSeleccionado}
          onCerrar={() => setContactoSeleccionado(null)}
        />
      )}
    </div>
  );
}
