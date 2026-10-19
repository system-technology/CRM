import Link from 'next/link';

/**
 * La puerta de entrada.
 *
 * Existe por una razón concreta: durante un día entero esta página solo enlazaba el cotizador,
 * así que todo lo construido en la bandeja —lista, hilo, tiempo real, atajos— era invisible
 * para quien abría `localhost:3000`. Un trabajo que no se puede encontrar no está entregado.
 *
 * Regla: **lo que se termina, se enlaza aquí el mismo día.** Y lo que está a medias se dice,
 * no se esconde.
 */

interface Destino {
  href: string;
  titulo: string;
  descripcion: string;
  estado: 'LISTO' | 'EN CONSTRUCCIÓN';
}

const DESTINOS: Destino[] = [
  {
    href: '/bandeja',
    titulo: 'Bandeja de conversaciones',
    descripcion:
      'Lista con filtros, búsqueda y ventana de 24 h. Abre una conversación para ver el hilo, ' +
      'escribir con envío optimista y comprobar que un reintento reutiliza la clave de ' +
      'idempotencia. Navegación con teclado y modo oscuro.',
    estado: 'EN CONSTRUCCIÓN',
  },
  {
    href: '/cotizador',
    titulo: 'Cotizador de paquetes',
    descripcion:
      'Contra la API real y PostgreSQL. Temporadas, acomodación, markup y margen en vivo. ' +
      'Avisa cuando una plaza queda sin usar y se paga igual.',
    estado: 'LISTO',
  },
];

export default function Inicio() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
          ViajaPro
        </h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          CRM para agencias de turismo, con WhatsApp como canal nativo.
        </p>
      </header>

      <ul className="mt-10 space-y-3">
        {DESTINOS.map((d) => (
          <li key={d.href}>
            <Link
              href={d.href}
              className="group block rounded-lg border border-neutral-200 bg-white p-5 transition hover:border-neutral-300 hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-base font-medium text-neutral-900 group-hover:underline dark:text-neutral-100">
                  {d.titulo}
                </span>
                <span
                  className={
                    d.estado === 'LISTO'
                      ? 'shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                  }
                >
                  {d.estado}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                {d.descripcion}
              </p>
            </Link>
          </li>
        ))}
      </ul>

      <section className="mt-10 rounded-lg border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-900/50">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Lo que funciona y no tiene pantalla
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          El webhook de WhatsApp recibe mensajes firmados por Meta, los guarda cifrados antes de
          responder, y un reintento cae en la misma fila en vez de duplicar. Las agencias están
          aisladas entre sí en la base de datos por política, no por un <code>WHERE</code>. Nada de
          eso se ve aquí todavía: la bandeja sigue contra datos simulados hasta que el trabajador
          que resuelve a qué agencia pertenece cada mensaje esté terminado.
        </p>
      </section>
    </main>
  );
}
