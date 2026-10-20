/**
 * Cuántos saltos de proxy son de confianza para deducir la IP del cliente (`req.ip`).
 *
 * `API_TRUST_PROXY`: un número de saltos (`1` = un balanceador propio delante) o una lista de
 * direcciones/CIDR separadas por comas. **Por defecto, ninguno**: `req.ip` es la dirección del
 * socket y `x-forwarded-for` se ignora, porque un cliente puede escribir esa cabecera a su gusto.
 * La IP alimenta el límite de intentos de inicio de sesión: confiar en ella sin proxy propio lo
 * deja esquivable rotando la cabecera.
 */
export function leerProxyDeConfianza(
  entorno: Record<string, string | undefined>,
): number | string[] | false {
  const crudo = entorno['API_TRUST_PROXY']?.trim();
  if (!crudo) return false;
  if (/^\d+$/.test(crudo)) {
    const saltos = Number(crudo);
    return saltos > 0 ? saltos : false;
  }
  const lista = crudo
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
  return lista.length > 0 ? lista : false;
}
