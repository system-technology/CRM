// Sonda de vida para el balanceador (Render). Sin base de datos ni llamadas a la API: solo
// responde que el proceso de Next atiende. Que la API este viva lo comprueba su propia sonda.
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json({ estado: 'ok' });
}
