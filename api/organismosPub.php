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

// Organismo seleccionado
$organismo = isset($_GET['organismo']) ? trim($_GET['organismo']) : '';

// Lista de organismos (distinct)
$organismos = [];
$resultOrganismos = $mysqli->query("SELECT DISTINCT nombre_organismo FROM compradores WHERE nombre_organismo IS NOT NULL AND nombre_organismo <> '' ORDER BY nombre_organismo ASC");
if ($resultOrganismos) {
    while ($row = $resultOrganismos->fetch_assoc()) {
        $organismos[] = $row['nombre_organismo'];
    }
}

// Licitaciones filtradas por organismo (solo si hay selección)
$licitaciones = [];
if ($organismo !== '') {
    $sql = "
        SELECT
            l.codigo_externo AS codigo,
            l.nombre,
            l.descripcion,
            c.nombre_organismo AS institucion_nombre,
            l.monto_estimado,
            l.moneda AS unidad_monetaria,
            l.fecha_publicacion AS fecha_inicio,
            l.fecha_cierre AS fecha_final,
            l.estado,
            l.tipo,
            l.fecha_adjudicacion,
            COALESCE((
                SELECT GROUP_CONCAT(DISTINCT ai.nombre_proveedor ORDER BY ai.nombre_proveedor SEPARATOR ', ')
                FROM items i
                JOIN adjudicaciones_item ai ON ai.item_id = i.id
                WHERE i.codigo_externo = l.codigo_externo
            ), '') AS proveedores_adjudicados,
            COALESCE((
                SELECT SUM(ai.monto_unitario * ai.cantidad)
                FROM items i
                JOIN adjudicaciones_item ai ON ai.item_id = i.id
                WHERE i.codigo_externo = l.codigo_externo
            ), 0) AS monto_adjudicado_total
        FROM licitaciones l
        JOIN compradores c ON l.codigo_externo = c.codigo_externo
        WHERE l.codigo_externo IS NOT NULL
          AND c.nombre_organismo = ?
        ORDER BY l.fecha_publicacion DESC
    ";

    $stmt = $mysqli->prepare($sql);
    if (!$stmt) {
        http_response_code(500);
        echo json_encode(["error" => $mysqli->error]);
        exit;
    }
    $stmt->bind_param("s", $organismo);
    $stmt->execute();
    $result = $stmt->get_result();
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $licitaciones[] = $row;
        }
    }
    $stmt->close();
}

// Filtros desde BD
$anios = [];
$estados = [];
$tipos = [];

$resultAnios = $mysqli->query("SELECT DISTINCT YEAR(fecha_publicacion) AS anio FROM licitaciones WHERE fecha_publicacion IS NOT NULL ORDER BY anio DESC");
if ($resultAnios) {
    while ($row = $resultAnios->fetch_assoc()) {
        if (!is_null($row['anio'])) {
            $anios[] = (int)$row['anio'];
        }
    }
}

$resultEstados = $mysqli->query("SELECT DISTINCT estado FROM licitaciones WHERE estado IS NOT NULL AND estado <> '' ORDER BY estado ASC");
if ($resultEstados) {
    while ($row = $resultEstados->fetch_assoc()) {
        $estados[] = $row['estado'];
    }
}

$resultTipos = $mysqli->query("SELECT DISTINCT tipo FROM licitaciones WHERE tipo IS NOT NULL AND tipo <> '' ORDER BY tipo ASC");
if ($resultTipos) {
    while ($row = $resultTipos->fetch_assoc()) {
        $tipos[] = $row['tipo'];
    }
}

// Obtener proveedores de las licitaciones adjudicadas
$proveedores = [];
if (!empty($licitaciones) && $organismo !== '') {
    // Licitaciones adjudicadas -> items -> adjudicaciones_item
    $datosSQL = "
        SELECT 
            l.codigo_externo,
            l.nombre as nombre_licitacion,
            l.estado,
            i.id as item_id,
            i.categoria,
            i.cantidad as cantidad_item,
            ai.id as adjudicacion_id,
            ai.rut_proveedor,
            ai.nombre_proveedor,
            ai.cantidad as cantidad_adjudicada,
            ai.monto_unitario
        FROM licitaciones l
        JOIN compradores c ON l.codigo_externo = c.codigo_externo
        JOIN items i ON i.codigo_externo = l.codigo_externo
        JOIN adjudicaciones_item ai ON ai.item_id = i.id
        WHERE c.nombre_organismo = ?
          AND l.estado = 'Adjudicada'
        ORDER BY l.codigo_externo, i.id, ai.id
    ";
    
    $datosStmt = $mysqli->prepare($datosSQL);
    if ($datosStmt) {
        $datosStmt->bind_param("s", $organismo);
        $datosStmt->execute();
        $datosResult = $datosStmt->get_result();
        
        while ($row = $datosResult->fetch_assoc()) {
            $proveedores[] = $row;
        }
        
        $datosStmt->close();
    }
}

// Entregar JSON
echo json_encode([
    "licitaciones" => $licitaciones,
    "proveedores" => $proveedores,
    "organismos" => $organismos,
    "filtros" => [
        "anios" => $anios,
        "estados" => $estados,
        "tipos" => $tipos
    ],
    "total" => count($licitaciones)
]);
