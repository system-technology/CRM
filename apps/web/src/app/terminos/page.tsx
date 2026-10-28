import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowLeft,
  FileCheck,
  AlertCircle,
  ShieldAlert,
  Scale,
  Handshake,
  CheckCircle2,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Términos del Servicio | ViajaPro CRM',
  description:
    'Condiciones y términos del servicio de la plataforma SaaS ViajaPro CRM para agencias de turismo en Colombia.',
};

export default function TerminosServicioPage() {
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-800 dark:bg-neutral-950 dark:text-neutral-200">
      {/* Barra superior de navegación */}
      <header className="sticky top-0 z-20 border-b border-neutral-200/80 bg-white/90 backdrop-blur-md dark:border-neutral-800/80 dark:bg-neutral-900/90">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl text-xs font-semibold text-neutral-600 transition hover:text-teal-700 dark:text-neutral-300 dark:hover:text-teal-400"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Volver al inicio</span>
          </Link>

          <div className="flex items-center gap-2">
            <span
              data-testid="badge-borrador"
              className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-900 dark:bg-amber-950/80 dark:text-amber-300"
            >
              Borrador en revisión jurídica (T-093 / T-108)
            </span>
            <span className="hidden rounded-full bg-teal-100 px-2.5 py-0.5 text-[11px] font-bold text-teal-800 sm:inline dark:bg-teal-950 dark:text-teal-300">
              SaaS B2B Turismo
            </span>
          </div>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <article className="space-y-8 text-left">
          {/* Encabezado */}
          <div>
            <div className="inline-flex items-center gap-2 rounded-lg bg-teal-50 px-3 py-1 text-xs font-bold text-teal-800 ring-1 ring-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:ring-teal-800">
              <FileCheck className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              <span>Contrato de Términos y Condiciones del Servicio</span>
            </div>
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-neutral-900 sm:text-3xl dark:text-neutral-50">
              Términos del Servicio
            </h1>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              Versión 1.0 (Borrador técnico) · Última actualización: 28 de octubre de 2026 ·
              República de Colombia.
            </p>
          </div>

          {/* Aviso de Borrador */}
          <div
            role="alert"
            className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50/80 p-5 dark:border-amber-900/60 dark:bg-amber-950/30"
          >
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="text-xs text-amber-900 dark:text-amber-200">
              <p className="font-bold">Aviso legal — Términos en proceso de aprobación:</p>
              <p className="mt-1 leading-relaxed">
                El presente clausulado define las bases operativas de ViajaPro. El documento
                definitivo será firmado por cada agencia asociada en su proceso de vinculación
                comercial formal una vez completada la revisión jurídica (Tarea T-093).
              </p>
            </div>
          </div>

          {/* 1. Descripción del Servicio */}
          <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="flex items-center gap-2 text-base font-bold text-neutral-900 dark:text-white">
              <Handshake className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              <span>1. Objeto y Alcance de la Plataforma</span>
            </h2>
            <div className="mt-4 space-y-3 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
              <p>
                ViajaPro proporciona una solución de software como servicio (SaaS) multi-tenant
                especializada para agencias de viajes y mayoristas de turismo. El servicio
                comprende:
              </p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>
                  Gestión omnicanal de bandeja de entrada integrada con Meta WhatsApp Cloud API
                  oficial.
                </li>
                <li>
                  Motor de cotización de excursiones y paquetes turísticos en moneda local (COP) con
                  reglas de margen.
                </li>
                <li>
                  Seguimiento comercial de oportunidades y administración de catálogo de salidas
                  programadas.
                </li>
                <li>Control de acceso basado en roles (Dueño, Asesor Comercial, Operaciones).</li>
              </ul>
            </div>
          </section>

          {/* 2. Normas de Uso de WhatsApp y Prevención de Abuso */}
          <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="flex items-center gap-2 text-base font-bold text-neutral-900 dark:text-white">
              <CheckCircle2 className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              <span>2. Uso de Canales de Mensajería y Políticas de Meta</span>
            </h2>
            <div className="mt-4 space-y-3 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
              <p>
                La agencia usuaria se compromete a cumplir de forma estricta las políticas
                comerciales y de mensajería de Meta Platforms, Inc., incluyendo:
              </p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>
                  Respetar la <strong>ventana de conversación de 24 horas</strong> iniciada por el
                  cliente para mensajes libres.
                </li>
                <li>
                  Utilizar exclusivamente <strong>plantillas pre-aprobadas</strong> para
                  notificaciones o mensajes de reactivación comercial saliente.
                </li>
                <li>
                  Prohibición absoluta del envío masivo no solicitado (SPAM) o comercialización de
                  bases de datos sin autorización previa.
                </li>
              </ul>
            </div>
          </section>

          {/* 3. Prevención de ESCNNA (Obligación Legal Colombia) */}
          <section className="rounded-2xl border border-red-200 bg-red-50/40 p-6 shadow-sm dark:border-red-900/50 dark:bg-red-950/20">
            <h2 className="flex items-center gap-2 text-base font-bold text-red-900 dark:text-red-300">
              <ShieldAlert className="h-4 w-4 text-red-600 dark:text-red-400" />
              <span>
                3. Prevención de la Explotación Sexual Comercial de Niños, Niñas y Adolescentes
                (ESCNNA)
              </span>
            </h2>
            <div className="mt-4 space-y-2 text-xs leading-relaxed text-red-800 dark:text-red-200">
              <p>
                En cumplimiento de las <strong>Leyes 679 de 2001</strong> y{' '}
                <strong>1336 de 2009</strong> de la República de Colombia:
              </p>
              <p>
                ViajaPro y todas las agencias vinculadas rechazan y combaten categóricamente la
                explotación, la pornografía y el turismo sexual con menores de edad. Cualquier
                usuario o agencia que utilice la plataforma para promover o facilitar conductas
                asociadas a ESCNNA será inmediatamente suspendido y denunciado formalmente ante la
                Fiscalía General de la Nación y la Policía de Turismo.
              </p>
            </div>
          </section>

          {/* 4. Propiedad de la Información y Seguridad */}
          <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="flex items-center gap-2 text-base font-bold text-neutral-900 dark:text-white">
              <Scale className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              <span>4. Custodia y Titularidad de los Datos</span>
            </h2>
            <div className="mt-4 space-y-3 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
              <p>
                Todos los datos generados por la agencia (contactos, oportunidades, tarifas y
                cotizaciones) son de exclusiva propiedad de la agencia. ViajaPro garantiza:
              </p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>
                  No vender ni explotar comercialmente las listas de viajeros ni los contactos de
                  las agencias.
                </li>
                <li>
                  Aislamiento criptográfico y lógico de la información mediante políticas RLS en
                  PostgreSQL.
                </li>
                <li>
                  Posibilidad de exportar la base de datos de contactos y cotizaciones en caso de
                  terminación del servicio.
                </li>
              </ul>
            </div>
          </section>

          {/* 5. Ley Aplicable */}
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6 text-xs text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900/40 dark:text-neutral-400">
            <p className="font-bold text-neutral-900 dark:text-white">
              Legislación Aplicable y Jurisdicción:
            </p>
            <p className="mt-1">
              Estos términos se rigen e interpretan de conformidad con las leyes de la República de
              Colombia, en particular la Ley 300 de 1996 (Ley General de Turismo), la Ley 2068 de
              2020 y la normatividad de comercio electrónico de la Ley 527 de 1999. Cualquier
              controversia se someterá a los jueces de la República de Colombia.
            </p>
          </div>
        </article>
      </main>
    </div>
  );
}
