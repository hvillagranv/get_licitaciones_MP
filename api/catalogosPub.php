<?php
// api/catalogosPub.php
// GET público: instituciones activas
// GET autenticado: palabras clave activas

ob_start();
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);
ini_set('error_log', '/var/log/php_errors.log');

$envPath = __DIR__ . '/../.env';
if (file_exists($envPath)) {
  foreach (file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
    $line = trim($line);
    if ($line === '' || strpos($line, '#') === 0 || strpos($line, '=') === false) continue;
    [$key, $value] = array_map('trim', explode('=', $line, 2));
    $value = trim($value, "\"'");
    if (!isset($_ENV[$key])) { $_ENV[$key] = $value; putenv("$key=$value"); }
  }
}

function request_is_https() {
  if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') return true;
  return (($_SERVER['SERVER_PORT'] ?? '') === '443') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}

session_set_cookie_params([
  'lifetime' => 0, 'path' => '/', 'domain' => '',
  'secure' => request_is_https(), 'httponly' => true, 'samesite' => 'Lax'
]);
session_start();
if (empty($_SESSION['csrf_token'])) {
  $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('X-XSS-Protection: 1; mode=block');
header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
header('X-CSRF-Token: ' . $_SESSION['csrf_token']);

$allowed_origins = [
  'https://www.hvillagranv.com',
  'https://hvillagranv.com',
  'http://localhost:3000'
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowed_origins, true)) {
  header("Access-Control-Allow-Origin: {$origin}");
  header('Access-Control-Allow-Credentials: true');
  header('Access-Control-Allow-Methods: GET, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type, Authorization, X-CSRF-Token');
}
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
  http_response_code(405);
  echo json_encode(['error' => 'Método no permitido']);
  exit;
}

function json_response($data, $status = 200) {
  if (ob_get_level()) ob_end_clean();
  http_response_code($status);
  echo json_encode($data, JSON_UNESCAPED_UNICODE);
  exit;
}

function connect_db() {
  $dbHost = $_ENV['DB_HOST'] ?? getenv('DB_HOST') ?: 'localhost';
  $dbUser = $_ENV['DB_USER'] ?? getenv('DB_USER') ?: '';
  $dbPass = $_ENV['DB_PASSWORD'] ?? $_ENV['DB_PASS'] ?? getenv('DB_PASSWORD') ?: getenv('DB_PASS') ?: '';
  $dbName = $_ENV['DB_NAME'] ?? getenv('DB_NAME') ?: '';

  $mysqli = new mysqli($dbHost, $dbUser, $dbPass, $dbName);
  if ($mysqli->connect_error) {
    json_response(['error' => 'Error de conexión: ' . $mysqli->connect_error], 500);
  }
  $mysqli->set_charset('utf8mb4');
  return $mysqli;
}

// Verifica si una columna existe en una tabla (para compatibilidad pre-migración)
function column_exists_pub($db, $table, $column) {
  $res = $db->query("SELECT COUNT(*) AS c FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = '$table' AND column_name = '$column'");
  return $res && ($res->fetch_assoc()['c'] ?? 0) > 0;
}

$catalogo = $_GET['catalogo'] ?? '';

// -----------------------------------------------------------------
// Instituciones: requiere autenticación
// -----------------------------------------------------------------
if ($catalogo === 'instituciones') {
  if (empty($_SESSION['user_id'])) {
    json_response(['error' => 'Autenticación requerida para acceder a instituciones'], 401);
  }
  $db = connect_db();
  $hasProv = column_exists_pub($db, 'instituciones', 'proveedor_id');
  $proveedorId = null;
  if ($hasProv) {
    $stmtU = $db->prepare('SELECT proveedor_id FROM usuarios WHERE id = ? LIMIT 1');
    if ($stmtU) {
      $stmtU->bind_param('i', $_SESSION['user_id']);
      $stmtU->execute();
      $rowU = $stmtU->get_result()->fetch_assoc();
      $proveedorId = $rowU['proveedor_id'] ?? null;
      $stmtU->close();
    }
  }
  try {
    if ($hasProv && $proveedorId !== null) {
      $stmt = $db->prepare('SELECT nombre, alias FROM instituciones WHERE activo=1 AND proveedor_id=? ORDER BY alias');
      $stmt->bind_param('i', $proveedorId);
    } elseif ($hasProv) {
      $stmt = $db->prepare('SELECT nombre, alias FROM instituciones WHERE activo=1 AND proveedor_id IS NULL ORDER BY alias');
    } else {
      $stmt = $db->prepare('SELECT nombre, alias FROM instituciones WHERE activo=1 ORDER BY alias');
    }
    $stmt->execute();
    $res = $stmt->get_result();
    $rows = [];
    while ($row = $res->fetch_assoc()) $rows[] = $row;
    $stmt->close();
  } catch (Throwable $e) {
    // Fallback sin filtro proveedor_id
    $rows = [];
    $res2 = $db->query('SELECT nombre, alias FROM instituciones WHERE activo=1 ORDER BY alias');
    if ($res2) while ($row = $res2->fetch_assoc()) $rows[] = $row;
  }
  json_response(['instituciones' => $rows]);
}

// -----------------------------------------------------------------
// Palabras clave: requiere autenticación
// -----------------------------------------------------------------
if ($catalogo === 'palabras_clave') {
  if (empty($_SESSION['user_id'])) {
    json_response(['error' => 'Autenticación requerida para acceder a palabras clave'], 401);
  }
  $db = connect_db();
  $hasProv = column_exists_pub($db, 'palabras_clave', 'proveedor_id');
  $proveedorId = null;
  if ($hasProv) {
    $stmtU = $db->prepare('SELECT proveedor_id FROM usuarios WHERE id = ? LIMIT 1');
    if ($stmtU) {
      $stmtU->bind_param('i', $_SESSION['user_id']);
      $stmtU->execute();
      $rowU = $stmtU->get_result()->fetch_assoc();
      $proveedorId = $rowU['proveedor_id'] ?? null;
      $stmtU->close();
    }
  }
  try {
    if ($hasProv && $proveedorId !== null) {
      $stmt = $db->prepare('SELECT palabra, variantes FROM palabras_clave WHERE activo=1 AND proveedor_id=? ORDER BY palabra');
      $stmt->bind_param('i', $proveedorId);
    } elseif ($hasProv) {
      $stmt = $db->prepare('SELECT palabra, variantes FROM palabras_clave WHERE activo=1 AND proveedor_id IS NULL ORDER BY palabra');
    } else {
      $stmt = $db->prepare('SELECT palabra, variantes FROM palabras_clave WHERE activo=1 ORDER BY palabra');
    }
    $stmt->execute();
    $res = $stmt->get_result();
    $rows = [];
    while ($row = $res->fetch_assoc()) {
      $rows[] = [
        'palabra'   => $row['palabra'],
        'variantes' => $row['variantes'] ? json_decode($row['variantes'], true) : []
      ];
    }
    $stmt->close();
  } catch (Throwable $e) {
    // Fallback sin filtro proveedor_id
    $rows = [];
    $res2 = $db->query('SELECT palabra, variantes FROM palabras_clave WHERE activo=1 ORDER BY palabra');
    if ($res2) while ($row = $res2->fetch_assoc()) {
      $rows[] = [
        'palabra'   => $row['palabra'],
        'variantes' => $row['variantes'] ? json_decode($row['variantes'], true) : []
      ];
    }
  }
  json_response(['palabras_clave' => $rows]);
}

json_response(['error' => 'Catálogo inválido. Use ?catalogo=instituciones o ?catalogo=palabras_clave'], 400);
