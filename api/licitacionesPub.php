<?php
// ✅ CONFIGURACIÓN SEGURA
error_reporting(E_ALL);
ini_set('display_errors', 0);  // ✅ No mostrar errores en producción
ini_set('log_errors', 1);
ini_set('error_log', '/var/log/php_errors.log');

// Cargar .env manualmente (cPanel no lo carga por defecto)
$envPath = __DIR__ . '/../.env';
if (file_exists($envPath)) {
  foreach (file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
    $line = trim($line);
    if ($line === '' || strpos($line, '#') === 0 || strpos($line, '=') === false) {
      continue;
    }
    [$key, $value] = array_map('trim', explode('=', $line, 2));
    $value = trim($value, "\"'");
    if (!isset($_ENV[$key])) {
      $_ENV[$key] = $value;
      putenv("$key=$value");
    }
  }
}

function request_is_https() {
  if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
    return true;
  }

  return (($_SERVER['SERVER_PORT'] ?? '') === '443') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}

// CSRF PROTECTION
session_set_cookie_params([
  'lifetime' => 0,
  'path' => '/',
  'domain' => '',
  'secure' => request_is_https(),
  'httponly' => true,
  'samesite' => 'Lax'
]);

session_start();
// Generar token CSRF si no existe
if (empty($_SESSION['csrf_token'])) {
  $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

// Función para sanitizar entrada
function sanitizar_input($data) {
  return htmlspecialchars(strip_tags($data), ENT_QUOTES, 'UTF-8');
}

// Validar CSRF token para POST/PUT/DELETE
if (in_array($_SERVER['REQUEST_METHOD'], ['POST', 'PUT', 'DELETE'])) {
  $csrf_header = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? $_POST['csrf_token'] ?? '';
  if (empty($csrf_header) || !hash_equals($_SESSION['csrf_token'], $csrf_header)) {
    http_response_code(403);
    echo json_encode(['error' => 'Token CSRF inválido']);
    exit;
  }
}

// Headers de seguridad
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('X-XSS-Protection: 1; mode=block');
header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
header('X-CSRF-Token: ' . $_SESSION['csrf_token']);

// CORS restrictivo
$allowed_origins = [
  'https://www.hvillagranv.com',
  'https://hvillagranv.com',
  'http://localhost:3000'
];
$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
if (in_array($origin, $allowed_origins)) {
  header("Access-Control-Allow-Origin: {$origin}");
  header('Access-Control-Allow-Credentials: true');
  header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type, Authorization, X-CSRF-Token');
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(200);
  exit;
}

// ⏱️ Medir inicio
$inicio = microtime(true);

// Activar compresión si el navegador lo permite
if (!ob_start("ob_gzhandler")) ob_start();

// Credenciales desde variables de entorno
$host = getenv('DB_HOST');
$user = getenv('DB_USER');
$pass = getenv('DB_PASSWORD');
$dbname = getenv('DB_NAME');

if (!$host || !$user || !$pass || !$dbname) {
  http_response_code(500);
  echo json_encode(['error' => 'Configuración incompleta']);
  exit;
}

$mysqli = new mysqli($host, $user, $pass, $dbname);

// Verificar conexión
if ($mysqli->connect_errno) {
    http_response_code(500);
    echo json_encode(["error" => "Error interno del servidor"]);
    exit;
}

// UTF-8 para evitar problemas de caracteres
$mysqli->set_charset("utf8mb4");

// Filtro por estado (whitelist)
$estadosValidos = ['Publicada', 'Adjudicada', 'Desierta (o art. 3 ó 9 Ley 19.886)', 'Cerrada', 'Revocada', 'Suspendida'];
$estadoParam = $_GET['estado'] ?? 'Publicada';
$filtrarPorEstado = $estadoParam !== '' && in_array($estadoParam, $estadosValidos, true);
if ($estadoParam !== '' && !$filtrarPorEstado) {
    $estadoParam = 'Publicada';
    $filtrarPorEstado = true;
}

// Paginación
$pagina    = max(1, intval($_GET['pagina'] ?? 1));
$porPagina = 10;
$offset    = ($pagina - 1) * $porPagina;
$cursorMode = ($_GET['cursor_mode'] ?? '') === '1';
$cursorRaw  = isset($_GET['cursor']) ? trim((string)$_GET['cursor']) : '';
$includeTotal = ($_GET['include_total'] ?? '') === '1';

if ($cursorMode) {
    $porPagina = max(1, min(50, intval($_GET['limit'] ?? $porPagina)));
}

// Filtros de servidor
$texto     = isset($_GET['texto'])     ? trim(strip_tags($_GET['texto']))     : '';
$comprador = isset($_GET['comprador']) ? trim(strip_tags($_GET['comprador'])) : '';
$excluirBV = ($_GET['excluir_bajo_valor'] ?? '') === '1';

$tiposPermitidos = ['L1','LE','LP','LS','A1','B1','J1','F1','E1','E2','CO','B2','A2','D1','C2','F2','G2','C1','F3','G1','R1','CA','SE'];
$tipo = (isset($_GET['tipo']) && in_array($_GET['tipo'], $tiposPermitidos, true))
    ? $_GET['tipo'] : '';

$cierreDesdeFecha = (isset($_GET['cierre_desde']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $_GET['cierre_desde']))
    ? $_GET['cierre_desde'] : '';
$cierreHastaFecha = (isset($_GET['cierre_hasta']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $_GET['cierre_hasta']))
    ? $_GET['cierre_hasta'] : '';

$periodoParam = isset($_GET['periodo']) ? trim((string)$_GET['periodo']) : '';
$periodosValidos = ['1m', '3m', '6m', '1y', '2y', '3y', '5y', 'gt5y'];
if (!in_array($periodoParam, $periodosValidos, true)) {
    $periodoParam = '';
}

$institucionesFiltro = [];

if (isset($_GET['institucion'])) {
    $institucionParam = $_GET['institucion'];
    $institucionesFiltro = is_array($institucionParam)
        ? array_filter(array_map('trim', $institucionParam))
        : array_filter([trim((string)$institucionParam)]);
} else {
    $institucionesStr = isset($_GET['instituciones']) ? trim($_GET['instituciones']) : '';
    $institucionesFiltro = $institucionesStr !== ''
        ? array_filter(array_map('trim', explode(',', $institucionesStr)))
        : [];
}

// Construir WHERE dinámico
$conditions = [];
$params     = [];
$types      = '';

if ($filtrarPorEstado) {
    $conditions[] = 'l.estado = ?';
    $params[]      = $estadoParam;
    $types        .= 's';
}
if ($texto !== '') {
    $like          = '%' . $texto . '%';
    $conditions[]  = '(l.codigo_externo LIKE ? OR l.nombre LIKE ? OR l.descripcion LIKE ? OR c.nombre_organismo LIKE ?)';
    array_push($params, $like, $like, $like, $like);
    $types        .= 'ssss';
}
// Filtro por variantes de palabras clave (pipe-separated)
$palabrasRaw = isset($_GET['palabras']) ? trim($_GET['palabras']) : '';
if ($palabrasRaw !== '') {
    $orClauses = [];
    foreach (explode('|', $palabrasRaw) as $v) {
        $v = mb_substr(trim(strip_tags($v)), 0, 100);
        if ($v === '') continue;
        $like = '%' . $v . '%';
        $orClauses[] = '(l.nombre LIKE ? OR l.descripcion LIKE ? OR l.codigo_externo LIKE ?)';
        array_push($params, $like, $like, $like);
        $types .= 'sss';
    }
    if (!empty($orClauses)) {
        $conditions[] = '(' . implode(' OR ', $orClauses) . ')';
    }
}
if ($tipo !== '') {
    $conditions[] = 'l.tipo = ?';
    $params[]      = $tipo;
    $types        .= 's';
}
if ($comprador !== '') {
    $conditions[] = 'c.nombre_organismo = ?';
    $params[]      = $comprador;
    $types        .= 's';
}
if ($excluirBV) {
    $conditions[] = "l.tipo NOT IN ('L1','E2')";
}
if ($cierreDesdeFecha !== '') {
    $conditions[] = 'l.fecha_cierre >= ?';
    $params[]      = $cierreDesdeFecha . ' 00:00:00';
    $types        .= 's';
}
if ($cierreHastaFecha !== '') {
    $conditions[] = 'l.fecha_cierre <= ?';
    $params[]      = $cierreHastaFecha . ' 23:59:59';
    $types        .= 's';
}

if ($periodoParam !== '') {
    $ahora = new DateTimeImmutable('now');

    if ($periodoParam === 'gt5y') {
        $limiteAntiguo = $ahora->sub(new DateInterval('P5Y'))->format('Y-m-d H:i:s');
        $conditions[] = 'l.fecha_publicacion < ?';
        $params[] = $limiteAntiguo;
        $types .= 's';
    } else {
        $intervalMap = [
            '1m' => 'P1M',
            '3m' => 'P3M',
            '6m' => 'P6M',
            '1y' => 'P1Y',
            '2y' => 'P2Y',
            '3y' => 'P3Y',
            '5y' => 'P5Y'
        ];

        $intervalSpec = $intervalMap[$periodoParam] ?? null;
        if ($intervalSpec !== null) {
            $desdePublicacion = $ahora->sub(new DateInterval($intervalSpec))->format('Y-m-d H:i:s');
            $conditions[] = 'l.fecha_publicacion >= ?';
            $params[] = $desdePublicacion;
            $types .= 's';
        }
    }
}

if (!empty($institucionesFiltro)) {
    $ph            = implode(',', array_fill(0, count($institucionesFiltro), '?'));
    $conditions[]  = "c.nombre_organismo IN ($ph)";
    foreach ($institucionesFiltro as $inst) {
        $params[] = $inst;
        $types   .= 's';
    }
}

$whereSQL = !empty($conditions) ? 'WHERE ' . implode(' AND ', $conditions) : '';

$downloadMode = ($_GET['download'] ?? '') === 'csv';
if ($downloadMode) {
    $sqlCsv = "
        SELECT
            l.codigo_externo AS codigo,
            l.nombre,
            l.descripcion,
            COALESCE(c.nombre_organismo, '') AS institucion_nombre,
            l.monto_estimado,
            l.moneda AS unidad_monetaria,
            l.fecha_publicacion AS fecha_inicio,
            l.fecha_cierre AS fecha_final,
            l.estado,
            l.tipo
        FROM licitaciones l
        LEFT JOIN compradores c ON l.codigo_externo = c.codigo_externo
        $whereSQL
        ORDER BY l.fecha_publicacion DESC, l.codigo_externo DESC
    ";

    $stmtCsv = $mysqli->prepare($sqlCsv);
    if (!$stmtCsv) {
        http_response_code(500);
        echo json_encode(['error' => 'Error interno al preparar CSV']);
        exit;
    }
    if (!empty($params)) {
        $stmtCsv->bind_param($types, ...$params);
    }
    $stmtCsv->execute();
    $resultCsv = $stmtCsv->get_result();
    if (!$resultCsv) {
        http_response_code(500);
        echo json_encode(['error' => 'Error al generar CSV']);
        exit;
    }

    while (ob_get_level() > 0) {
        ob_end_clean();
    }

    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="licitaciones.csv"');
    header('Pragma: no-cache');
    header('Expires: 0');

    $output = fopen('php://output', 'w');
    fwrite($output, "\xEF\xBB\xBF");

    fputcsv($output, [
        'ID',
        'Nombre',
        'Descripción',
        'Institución',
        'Monto',
        'Fecha Publicación',
        'Fecha Cierre',
        'Estado',
        'Tipo de licitación'
    ], ';');

    while ($row = $resultCsv->fetch_assoc()) {
        $monto = '';
        if ($row['monto_estimado'] !== null && $row['monto_estimado'] !== '') {
            $monto = (string)$row['monto_estimado'];
            if (!empty($row['unidad_monetaria']) && $row['unidad_monetaria'] !== 'CLP') {
                $monto .= ' ' . $row['unidad_monetaria'];
            }
        }

        fputcsv($output, [
            $row['codigo'] ?? '',
            $row['nombre'] ?? '',
            $row['descripcion'] ?? '',
            $row['institucion_nombre'] ?? '',
            $monto,
            $row['fecha_inicio'] ?? '',
            $row['fecha_final'] ?? '',
            $row['estado'] ?? '',
            $row['tipo'] ?? ''
        ], ';');
    }

    fclose($output);
    $stmtCsv->close();
    exit;
}

$total = null;
$totalPaginas = null;
$nextCursor = null;
$hasMore = false;

$cursorFecha = null;
$cursorCodigo = null;
if ($cursorMode && $cursorRaw !== '') {
    $decoded = json_decode(base64_decode(strtr($cursorRaw, '-_', '+/')), true);
    if (
        !is_array($decoded) ||
        empty($decoded['fecha']) ||
        empty($decoded['codigo'])
    ) {
        http_response_code(400);
        echo json_encode(['error' => 'Cursor invalido']);
        exit;
    }
    $cursorFecha = (string)$decoded['fecha'];
    $cursorCodigo = (string)$decoded['codigo'];
}

if ($cursorMode) {
    $cursorWhere = '';
    $cursorParams = $params;
    $cursorTypes = $types;

    if ($cursorFecha !== null && $cursorCodigo !== null) {
        $cursorWhere = ($whereSQL === '' ? 'WHERE ' : ' AND ') . '(l.fecha_publicacion < ? OR (l.fecha_publicacion = ? AND l.codigo_externo < ?))';
        array_push($cursorParams, $cursorFecha, $cursorFecha, $cursorCodigo);
        $cursorTypes .= 'sss';
    }

    $sql = "
        SELECT
            l.codigo_externo AS codigo,
            l.nombre,
            l.descripcion,
            COALESCE(c.nombre_organismo, '') AS institucion_nombre,
            l.monto_estimado,
            l.moneda AS unidad_monetaria,
            l.fecha_publicacion AS fecha_inicio,
            l.fecha_cierre AS fecha_final,
            l.estado,
            l.tipo,
            l.fecha_publicacion AS fecha_cursor
        FROM licitaciones l
        LEFT JOIN compradores c ON l.codigo_externo = c.codigo_externo
        $whereSQL
        $cursorWhere
        ORDER BY l.fecha_publicacion DESC, l.codigo_externo DESC
        LIMIT ?
    ";

    $limitConExtra = $porPagina + 1;
    $cursorParams[] = $limitConExtra;
    $cursorTypes .= 'i';

    $stmt = $mysqli->prepare($sql);
    if (!$stmt) {
        http_response_code(500);
        echo json_encode(['error' => 'Error interno']);
        exit;
    }
    if (!empty($cursorParams)) $stmt->bind_param($cursorTypes, ...$cursorParams);
    $stmt->execute();
    $result = $stmt->get_result();
    if (!$result) {
        http_response_code(500);
        echo json_encode(['error' => 'Error al obtener resultados']);
        exit;
    }

    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $rows[] = $row;
    }
    $stmt->close();

    $hasMore = count($rows) > $porPagina;
    if ($hasMore) {
        array_pop($rows);
    }

    $licitaciones = [];
    foreach ($rows as $row) {
        $row['fecha_cursor'] = (string)($row['fecha_cursor'] ?? '');
        $licitaciones[] = $row;
    }

    if (!empty($licitaciones)) {
        $last = end($licitaciones);
        if (!empty($last['fecha_cursor']) && !empty($last['codigo'])) {
            $nextPayload = json_encode([
                'fecha' => $last['fecha_cursor'],
                'codigo' => $last['codigo']
            ]);
            $nextCursor = rtrim(strtr(base64_encode($nextPayload), '+/', '-_'), '=');
        }
    }

    foreach ($licitaciones as &$item) {
        unset($item['fecha_cursor']);
    }
    unset($item);

    if ($includeTotal) {
        $countSql  = "SELECT COUNT(*) AS total FROM licitaciones l LEFT JOIN compradores c ON l.codigo_externo = c.codigo_externo $whereSQL";
        $countStmt = $mysqli->prepare($countSql);
        if ($countStmt) {
            if (!empty($params)) $countStmt->bind_param($types, ...$params);
            $countStmt->execute();
            $total = intval($countStmt->get_result()->fetch_assoc()['total'] ?? 0);
            $totalPaginas = $total > 0 ? (int)ceil($total / $porPagina) : 1;
            $countStmt->close();
        }
    }
} else {
    // Modo legado con paginación por página/offset
    $countSql  = "SELECT COUNT(*) AS total FROM licitaciones l LEFT JOIN compradores c ON l.codigo_externo = c.codigo_externo $whereSQL";
    $countStmt = $mysqli->prepare($countSql);
    if (!$countStmt) {
        http_response_code(500);
        echo json_encode(['error' => 'Error interno (count)']);
        exit;
    }
    if (!empty($params)) $countStmt->bind_param($types, ...$params);
    $countStmt->execute();
    $total       = intval($countStmt->get_result()->fetch_assoc()['total'] ?? 0);
    $totalPaginas = $total > 0 ? (int)ceil($total / $porPagina) : 1;
    $countStmt->close();

    $dataParams = array_merge($params, [$porPagina, $offset]);
    $dataTypes  = $types . 'ii';

    $sql = "
        SELECT
            l.codigo_externo AS codigo,
            l.nombre,
            l.descripcion,
            COALESCE(c.nombre_organismo, '') AS institucion_nombre,
            l.monto_estimado,
            l.moneda AS unidad_monetaria,
            l.fecha_publicacion AS fecha_inicio,
            l.fecha_cierre AS fecha_final,
            l.estado,
            l.tipo
        FROM licitaciones l
        LEFT JOIN compradores c ON l.codigo_externo = c.codigo_externo
        $whereSQL
        ORDER BY l.fecha_publicacion DESC
        LIMIT ? OFFSET ?
    ";

    $stmt = $mysqli->prepare($sql);
    if (!$stmt) {
        http_response_code(500);
        echo json_encode(['error' => 'Error interno']);
        exit;
    }
    if (!empty($dataParams)) $stmt->bind_param($dataTypes, ...$dataParams);
    $stmt->execute();
    $result = $stmt->get_result();
    if (!$result) {
        http_response_code(500);
        echo json_encode(['error' => 'Error al obtener resultados']);
        exit;
    }
    $licitaciones = [];
    while ($row = $result->fetch_assoc()) {
        $licitaciones[] = $row;
    }
    $stmt->close();
}

// Leer instituciones desde BD solo si hay sesión activa
$instituciones = [];
if (!empty($_SESSION['user_id'])) {
  try {
    // Verificar si proveedor_id existe en usuarios (migración 005)
    $colUsuarios = $mysqli->query(
        "SELECT COUNT(*) AS total FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = 'usuarios' AND column_name = 'proveedor_id'"
    );
    $tieneProveedorEnUsuarios = $colUsuarios && ($colUsuarios->fetch_assoc()['total'] ?? 0) > 0;

    $user_proveedor_id = null;
    if ($tieneProveedorEnUsuarios) {
        $stmtProv = $mysqli->prepare('SELECT proveedor_id FROM usuarios WHERE id = ? LIMIT 1');
        $stmtProv->bind_param('i', $_SESSION['user_id']);
        $stmtProv->execute();
        $rowProv = $stmtProv->get_result()->fetch_assoc();
        $user_proveedor_id = $rowProv ? $rowProv['proveedor_id'] : null;
        $stmtProv->close();
    }

    $tablaExiste = $mysqli->query(
        "SELECT COUNT(*) AS total FROM information_schema.tables
         WHERE table_schema = DATABASE() AND table_name = 'instituciones'"
    );
    $usarBD = $tablaExiste && ($tablaExiste->fetch_assoc()['total'] ?? 0) > 0;

    if ($usarBD) {
        // Verificar si proveedor_id existe en instituciones (migración 006)
        $colInst = $mysqli->query(
            "SELECT COUNT(*) AS total FROM information_schema.columns
             WHERE table_schema = DATABASE() AND table_name = 'instituciones' AND column_name = 'proveedor_id'"
        );
        $tieneProveedorEnInst = $colInst && ($colInst->fetch_assoc()['total'] ?? 0) > 0;

        if (!$tieneProveedorEnInst || $user_proveedor_id === null) {
            // Sin filtro por proveedor
            $resInst = $mysqli->query("SELECT nombre AS id, alias FROM instituciones WHERE activo=1 ORDER BY alias");
            if ($resInst) {
                while ($row = $resInst->fetch_assoc()) {
                    $instituciones[] = ["id" => $row['id'], "alias" => $row['alias']];
                }
            }
        } else {
            $stmtInst = $mysqli->prepare("SELECT nombre AS id, alias FROM instituciones WHERE activo=1 AND proveedor_id = ? ORDER BY alias");
            $stmtInst->bind_param('i', $user_proveedor_id);
            $stmtInst->execute();
            $resInst = $stmtInst->get_result();
            while ($row = $resInst->fetch_assoc()) {
                $instituciones[] = ["id" => $row['id'], "alias" => $row['alias']];
            }
            $stmtInst->close();
        }
    } else {
        // Fallback CSV legado
        $csvPath = __DIR__ . "/../data/csv/instituciones.csv";
        if (file_exists($csvPath) && ($handle = fopen($csvPath, "r")) !== false) {
            $headers = fgetcsv($handle, 1000, ";");
            while (($data = fgetcsv($handle, 1000, ";")) !== false) {
                $fila = array_combine($headers, $data);
                if (isset($fila['nombre'], $fila['alias'])) {
                    $instituciones[] = ["id" => $fila['nombre'], "alias" => $fila['alias']];
                }
            }
            fclose($handle);
        }
    }
  } catch (\Throwable $e) {
      // No bloquear la respuesta principal si las instituciones fallan
      error_log('licitacionesPub instituciones error: ' . $e->getMessage());
      $instituciones = [];
  }
}

// Todos los compradores únicos: solo cuando se solicita explícitamente (?compradores=1)
// para evitar un SELECT DISTINCT costoso en cada paginación
$todosCompradores = [];
if (($_GET['compradores'] ?? '') === '1') {
  $resComp = $mysqli->query("SELECT DISTINCT nombre_organismo FROM compradores WHERE nombre_organismo IS NOT NULL AND nombre_organismo != '' ORDER BY nombre_organismo");
  if ($resComp) {
    while ($row = $resComp->fetch_assoc()) {
        $todosCompradores[] = $row['nombre_organismo'];
    }
  }
}

// Entregar JSON
echo json_encode([
    "licitaciones"  => $licitaciones,
    "instituciones" => $instituciones,
    "compradores"   => $todosCompradores,
    "total"         => $total,
    "paginas"       => $totalPaginas,
    "pagina"        => $cursorMode ? null : $pagina,
    "has_more"      => $cursorMode ? $hasMore : ($pagina < ($totalPaginas ?? 1)),
    "next_cursor"   => $cursorMode ? $nextCursor : null,
    "cursor_mode"   => $cursorMode
]);