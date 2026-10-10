<#
.SYNOPSIS
  Rota las contrasenas de los tres roles de aplicacion y actualiza los .env de todos los
  arboles de trabajo, sin mostrar las credenciales por pantalla.

.DESCRIPTION
  `pnpm db:setup` imprime las tres cadenas de conexion para que alguien las copie a mano. Eso
  tiene dos problemas:

    1. Con varios worktrees hay varios .env, y copiarlas a mano en tres sitios invita a que uno
       quede desfasado. Un .env desfasado no da un error claro: da "autenticacion fallida" en un
       proceso y no en otro.
    2. Las credenciales quedan en el historial de la consola. En este proyecto ya se han
       expuesto tres por caminos parecidos.

  Este script ejecuta la rotacion, captura la salida, escribe los valores en cada .env y
  **solo informa de que lo hizo**. Las contrasenas no pasan por la pantalla ni por el portapapeles.

  Las contrasenas no se guardan en ningun otro sitio: si se pierden, se vuelve a ejecutar esto.

.EXAMPLE
  pwsh -File scripts/rotar-roles-y-actualizar-env.ps1
#>

[CmdletBinding()]
param(
    # Carpetas cuyo .env hay que actualizar. Por omision, todos los worktrees del repositorio.
    [string[]] $Arboles
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# 1. Localizar los arboles de trabajo
# ---------------------------------------------------------------------------
$raiz = (git rev-parse --show-toplevel 2>$null)
if (-not $raiz) { throw 'Esto no es un repositorio git.' }
$raiz = $raiz -replace '/', '\'

if (-not $Arboles) {
    # `git worktree list` da una linea por arbol: "<ruta> <sha> [<rama>]"
    $Arboles = git worktree list --porcelain |
        Where-Object { $_ -like 'worktree *' } |
        ForEach-Object { ($_ -replace '^worktree ', '') -replace '/', '\' }
}

Write-Host "Arboles de trabajo encontrados:" -ForegroundColor Cyan
$Arboles | ForEach-Object { Write-Host "  $_" }

$sinEnv = $Arboles | Where-Object { -not (Test-Path (Join-Path $_ '.env')) }
if ($sinEnv) {
    Write-Host ''
    Write-Host 'Aviso: estos arboles no tienen .env y se omitiran:' -ForegroundColor Yellow
    $sinEnv | ForEach-Object { Write-Host "  $_" }
    $Arboles = $Arboles | Where-Object { Test-Path (Join-Path $_ '.env') }
}
if (-not $Arboles) { throw 'Ningun arbol tiene .env. Copia uno antes de rotar.' }

# ---------------------------------------------------------------------------
# 2. Rotar. La salida se captura: NO se muestra.
# ---------------------------------------------------------------------------
Write-Host ''
Write-Host 'Rotando contrasenas de los tres roles...' -ForegroundColor Cyan

Push-Location $raiz
try {
    # `$ErrorActionPreference = 'Stop'` convierte en error fatal CUALQUIER linea que un
    # programa externo escriba en stderr. El driver de Postgres emite un aviso sobre los
    # modos SSL, asi que sin esto el script muere antes de rotar nada — y parece un fallo
    # de la rotacion cuando solo era un aviso. Se baja a 'Continue' solo aqui y se decide
    # por el codigo de salida, que es lo que de verdad dice si funciono.
    $anterior = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $salida = & corepack pnpm --filter '@viajapro/database' run rol:crear 2>&1 | Out-String
    $codigo = $LASTEXITCODE
    $ErrorActionPreference = $anterior

    if ($codigo -ne 0) {
        Write-Host ''
        Write-Host "La rotacion fallo (codigo $codigo). Los .env NO se han tocado." -ForegroundColor Red
        Write-Host 'Ultimas lineas, sin las de credenciales:' -ForegroundColor Yellow
        ($salida -split "`r?`n" |
            Where-Object { $_ -notmatch 'DATABASE_(APP|ALTAS|WEBHOOK)_URL=' }) |
            Select-Object -Last 15 |
            ForEach-Object { Write-Host "  $_" }
        exit 1
    }
} finally {
    Pop-Location
}

# Las lineas utiles tienen la forma  VARIABLE=<cadena>   # proposito
# Se buscan por NOMBRE DE VARIABLE, nunca por el esquema de la URL, para no escribir
# en este archivo nada que parezca una cadena de conexion.
$variables = @('DATABASE_APP_URL', 'DATABASE_ALTAS_URL', 'DATABASE_WEBHOOK_URL')
$nuevos = @{}

foreach ($linea in ($salida -split "`r?`n")) {
    $recortada = $linea.Trim()
    foreach ($v in $variables) {
        if ($recortada.StartsWith("$v=")) {
            # Fuera el comentario final, si lo hay.
            $valor = $recortada.Substring($v.Length + 1)
            $corte = $valor.IndexOf('   #')
            if ($corte -ge 0) { $valor = $valor.Substring(0, $corte) }
            $nuevos[$v] = $valor.Trim()
        }
    }
}

$faltan = $variables | Where-Object { -not $nuevos.ContainsKey($_) }
if ($faltan) {
    Write-Host ''
    Write-Host 'La rotacion no produjo todas las cadenas esperadas. Faltan:' -ForegroundColor Red
    $faltan | ForEach-Object { Write-Host "  $_" }
    Write-Host ''
    Write-Host 'Salida del script (sin las lineas de credenciales):' -ForegroundColor Yellow
    ($salida -split "`r?`n" |
        Where-Object { $n = $_; -not ($variables | Where-Object { $n -match $_ }) }) |
        Select-Object -Last 20 |
        ForEach-Object { Write-Host "  $_" }
    throw 'Rotacion incompleta. Los .env NO se han tocado.'
}

Write-Host "  Rotados: $($nuevos.Count) roles." -ForegroundColor Green

# ---------------------------------------------------------------------------
# 3. Escribir en cada .env, conservando todo lo demas
# ---------------------------------------------------------------------------
foreach ($arbol in $Arboles) {
    $ruta = Join-Path $arbol '.env'

    # Copia de seguridad: un .env roto deja la maquina sin base de datos, y el contenido
    # anterior no esta en ningun otro sitio.
    $respaldo = "$ruta.bak"
    Copy-Item -LiteralPath $ruta -Destination $respaldo -Force

    $lineas = [System.Collections.Generic.List[string]](Get-Content -LiteralPath $ruta)
    $cambios = 0

    foreach ($v in $variables) {
        $indice = -1
        for ($i = 0; $i -lt $lineas.Count; $i++) {
            if ($lineas[$i].TrimStart().StartsWith("$v=")) { $indice = $i; break }
        }

        if ($indice -ge 0) {
            $lineas[$indice] = "$v=$($nuevos[$v])"
        } else {
            $lineas.Add("$v=$($nuevos[$v])")
        }
        $cambios++
    }

    Set-Content -LiteralPath $ruta -Value $lineas -Encoding utf8
    Write-Host "  $ruta  ->  $cambios variables actualizadas (respaldo en .env.bak)" -ForegroundColor Green
}

# ---------------------------------------------------------------------------
# 4. Comprobar, no afirmar
# ---------------------------------------------------------------------------
Write-Host ''
Write-Host 'Comprobando que cada .env quedo completo...' -ForegroundColor Cyan
$problemas = 0
foreach ($arbol in $Arboles) {
    $ruta = Join-Path $arbol '.env'
    $texto = Get-Content -LiteralPath $ruta -Raw
    foreach ($v in $variables) {
        if ($texto -notmatch "(?m)^$v=.+$") {
            Write-Host "  FALTA $v en $ruta" -ForegroundColor Red
            $problemas++
        }
    }
    # Una variable repetida gana la ultima y el desfase es invisible. Ya nos paso.
    foreach ($v in $variables) {
        $veces = ([regex]::Matches($texto, "(?m)^$v=")).Count
        if ($veces -gt 1) {
            Write-Host "  $v aparece $veces veces en $ruta (gana la ultima)" -ForegroundColor Red
            $problemas++
        }
    }
}

if ($problemas -gt 0) {
    Write-Host ''
    Write-Host "$problemas problemas. Los respaldos estan en <arbol>\.env.bak" -ForegroundColor Red
    exit 1
}

Write-Host '  Los tres .env estan completos y sin duplicados.' -ForegroundColor Green
Write-Host ''
Write-Host 'Siguiente paso, para comprobar que la base acepta las credenciales nuevas:' -ForegroundColor Cyan
Write-Host '  pnpm db:aislamiento'
Write-Host ''
Write-Host 'Las contrasenas no se han mostrado ni se guardan en ningun otro sitio.'
Write-Host 'Si hace falta volver atras, cada .env tiene su .env.bak al lado.'
