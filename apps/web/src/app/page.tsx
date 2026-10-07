import Link from 'next/link';

export default function Inicio() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-lg font-semibold">ViajaPro</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Rebanada vertical de paquetes. Lo que ya funciona:
      </p>
      <ul className="mt-4 space-y-2">
        <li>
          <Link href="/cotizador" className="text-acento-700 underline">
            Cotizador de paquetes
          </Link>
          <span className="ml-2 text-sm text-neutral-500">
            contra la API real, con margen en vivo
          </span>
        </li>
      </ul>
    </main>
  );
}
