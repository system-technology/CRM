import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Shield, FileText, AlertCircle, Lock, Eye, Building2 } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Política de Privacidad y Tratamiento de Datos | ViajaPro CRM',
  description:
    'Política de tratamiento de datos personales de ViajaPro CRM conforme a la Ley 1581 de 2012 (Colombia), Decreto 1074 de 2015 y circulares de la SIC.',
};

export default function PoliticaPrivacidadPage() {
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
            <span className="hidden rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-bold text-blue-900 sm:inline dark:bg-blue-950 dark:text-blue-300">
              Ley 1581 / SIC
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
              <Shield className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              <span>Transparencia y Protección de Datos Personales</span>
            </div>
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-neutral-900 sm:text-3xl dark:text-neutral-50">
              Política de Privacidad y Tratamiento de Datos
            </h1>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              Versión vigente: 28 de octubre de 2026 · Marco regulatorio: Ley 1581 de 2012 y Decreto
              1074 de 2015 (República de Colombia).
            </p>
          </div>

          {/* Aviso de Borrador */}
          <div
            role="alert"
            className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50/80 p-5 dark:border-amber-900/60 dark:bg-amber-950/30"
          >
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="text-xs text-amber-900 dark:text-amber-200">
              <p className="font-bold">Aviso legal — Documento en fase de revisión:</p>
              <p className="mt-1 leading-relaxed">
                Este texto corresponde al borrador operativo de privacidad de ViajaPro CRM. Antes
                del despliegue en producción con agencias reales, debe ser refrendado por asesoría
                jurídica especializada en derecho de protección de datos en Colombia (Tarea T-093).
              </p>
            </div>
          </div>

          {/* 1. Roles en el Tratamiento de Datos */}
          <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="flex items-center gap-2 text-base font-bold text-neutral-900 dark:text-white">
              <Building2 className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              <span>1. Roles en el Tratamiento de Datos Personales</span>
            </h2>
            <div className="mt-4 space-y-3 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
              <p>
                En estricto cumplimiento del régimen general de protección de datos personales de
                Colombia (Ley 1581 de 2012 y Decreto 1074 de 2015):
              </p>
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  <strong className="text-neutral-900 dark:text-white">
                    La Agencia de Turismo:
                  </strong>{' '}
                  Es el <strong>Responsable del Tratamiento</strong> de los datos personales de sus
                  viajeros, clientes y cotizantes. Es quien decide sobre las finalidades,
                  recolección del consentimiento y atención de solicitudes de Habeas Data.
                </li>
                <li>
                  <strong className="text-neutral-900 dark:text-white">
                    ViajaPro (Plataforma):
                  </strong>{' '}
                  Actúa exclusivamente como <strong>Encargado del Tratamiento</strong>, prestando la
                  infraestructura tecnológica SaaS para la administración de cotizaciones,
                  comunicaciones por WhatsApp Cloud API y expedientes de viaje por cuenta y orden de
                  la agencia.
                </li>
              </ul>
            </div>
          </section>

          {/* 2. Categorías de Datos Tratados */}
          <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="flex items-center gap-2 text-base font-bold text-neutral-900 dark:text-white">
              <Eye className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              <span>2. Datos que se Custodian en la Plataforma</span>
            </h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-neutral-200 bg-neutral-50 font-semibold text-neutral-700 dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-300">
                  <tr>
                    <th className="px-4 py-3">Categoría</th>
                    <th className="px-4 py-3">Ejemplos</th>
                    <th className="px-4 py-3">Nivel de Sensibilidad</th>
                    <th className="px-4 py-3">Medidas de Custodia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  <tr>
                    <td className="px-4 py-3 font-semibold text-neutral-900 dark:text-white">
                      Identificación
                    </td>
                    <td className="px-4 py-3">Nombre, correo electrónico, teléfono móvil</td>
                    <td className="px-4 py-3">Media</td>
                    <td className="px-4 py-3">Aislamiento por Tenant (RLS R1)</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-semibold text-neutral-900 dark:text-white">
                      Documentos de Viaje
                    </td>
                    <td className="px-4 py-3">Cédula, pasaporte, visa, fecha de nacimiento</td>
                    <td className="px-4 py-3 font-semibold text-red-600 dark:text-red-400">
                      Alta (PII sensible)
                    </td>
                    <td className="px-4 py-3">Cifrado AES-256-GCM y auditoría de lecturas (R10)</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-semibold text-neutral-900 dark:text-white">
                      Menores de Edad
                    </td>
                    <td className="px-4 py-3">Pasajeros niños (CHD) e infantes (INF)</td>
                    <td className="px-4 py-3 font-bold text-red-700 dark:text-red-300">Muy Alta</td>
                    <td className="px-4 py-3">
                      Consentimiento del representante legal y protección reforzada
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-semibold text-neutral-900 dark:text-white">
                      Comunicaciones
                    </td>
                    <td className="px-4 py-3">Mensajes y archivos de WhatsApp Cloud API</td>
                    <td className="px-4 py-3 font-semibold text-amber-600 dark:text-amber-400">
                      Alta
                    </td>
                    <td className="px-4 py-3">
                      API Oficial Meta, sin almacenamiento de secretos en frontend (R6)
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 3. Derechos del Titular (Habeas Data) */}
          <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="flex items-center gap-2 text-base font-bold text-neutral-900 dark:text-white">
              <FileText className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              <span>3. Derechos de los Titulares (Artículo 8, Ley 1581 de 2012)</span>
            </h2>
            <div className="mt-4 space-y-3 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
              <p>Los titulares de la información tienen derecho en todo momento a:</p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>
                  <strong>Conocer, actualizar y rectificar</strong> sus datos personales frente a
                  los Responsables del Tratamiento o Encargados del Tratamiento.
                </li>
                <li>
                  <strong>Solicitar prueba de la autorización</strong> otorgada para el tratamiento.
                </li>
                <li>
                  <strong>Ser informado</strong> respecto del uso que se le ha dado a sus datos.
                </li>
                <li>
                  <strong>Presentar quejas ante la Superintendencia de Industria y Comercio</strong>{' '}
                  (SIC) por infracciones a la ley.
                </li>
                <li>
                  <strong>Revocar la autorización o solicitar la supresión</strong> del dato cuando
                  en el tratamiento no se respeten los principios, derechos y garantías
                  constitucionales y legales.
                </li>
              </ul>
            </div>
          </section>

          {/* 4. Seguridad de la Información (Reglas R1, R2, R6, R10) */}
          <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="flex items-center gap-2 text-base font-bold text-neutral-900 dark:text-white">
              <Lock className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              <span>4. Garantías Técnicas y Seguridad de la Infraestructura</span>
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-4 text-xs text-neutral-600 sm:grid-cols-2 dark:text-neutral-300">
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-800/40">
                <p className="font-bold text-neutral-900 dark:text-white">
                  Aislamiento Multi-tenant R1/R2
                </p>
                <p className="mt-1 leading-relaxed">
                  Cada consulta a la base de datos está protegida por Row-Level Security (RLS) en
                  PostgreSQL. Ninguna agencia puede acceder a los contactos o expedientes de otra.
                </p>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-800/40">
                <p className="font-bold text-neutral-900 dark:text-white">
                  Cero Secretos en Frontend (R6)
                </p>
                <p className="mt-1 leading-relaxed">
                  Tokens de Meta WhatsApp Cloud API y credenciales de acceso se gestionan
                  estrictamente en el servidor y están cifradas con AES-256-GCM.
                </p>
              </div>
            </div>
          </section>

          {/* 5. Contacto para Consultas y Reclamos */}
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6 text-xs text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900/40 dark:text-neutral-400">
            <p className="font-bold text-neutral-900 dark:text-white">
              Canal de Atención de Habeas Data:
            </p>
            <p className="mt-1">
              Para ejercer sus derechos de consulta, rectificación o supresión de datos, los
              viajeros pueden comunicarse con la agencia contratante o escribir a{' '}
              <span className="font-semibold text-neutral-900 dark:text-white">
                privacidad@viajapro.com
              </span>
              . Las solicitudes se resuelven en un término máximo de quince (15) días hábiles según
              la ley colombiana.
            </p>
          </div>
        </article>
      </main>
    </div>
  );
}
