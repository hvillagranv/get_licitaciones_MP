<?php
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);
ini_set('error_log', '/var/log/php_errors.log');

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

session_set_cookie_params([
  'lifetime' => 0,
  'path' => '/',
  'domain' => '',
  'secure' => request_is_https(),
  'httponly' => true,
  'samesite' => 'Lax'
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
  header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type, Authorization, X-CSRF-Token');
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(200);
  exit;
}

function json_response($data, $status = 200) {
  http_response_code($status);
  echo json_encode($data);
  exit;
}

function get_json_input() {
  $raw = file_get_contents('php://input');
  if (!$raw) return [];
  $decoded = json_decode($raw, true);
  return is_array($decoded) ? $decoded : [];
}

function validate_csrf() {
  $csrf_header = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? $_POST['csrf_token'] ?? '';
  return !empty($csrf_header) && hash_equals($_SESSION['csrf_token'], $csrf_header);
}

if (empty($_SESSION['user_id'])) {
  json_response(['ok' => false, 'error' => 'No autenticado'], 401);
}

$host = getenv('DB_HOST');
$user = getenv('DB_USER');
$pass = getenv('DB_PASSWORD');
$dbname = getenv('DB_NAME');
if (!$host || !$user || !$pass || !$dbname) {
  json_response(['ok' => false, 'error' => 'Configuración incompleta'], 500);
}

$mysqli = new mysqli($host, $user, $pass, $dbname);
if ($mysqli->connect_errno) {
  json_response(['ok' => false, 'error' => 'Error interno del servidor'], 500);
}
$mysqli->set_charset('utf8mb4');

$userId = (int)$_SESSION['user_id'];
$action = $_GET['action'] ?? 'list';
$method = $_SERVER['REQUEST_METHOD'];
$body = get_json_input();

if ($action === 'list' && $method === 'GET') {
  $sql = "
    SELECT
      ulg.codigo_externo AS codigo,
      l.nombre,
      l.descripcion,
      c.nombre_organismo AS institucion_nombre,
      l.monto_estimado,
      l.moneda AS unidad_monetaria,
      l.fecha_publicacion AS fecha_inicio,
      l.fecha_cierre AS fecha_final,
      l.fecha_adjudicacion,
      l.estado,
      l.tipo,
      ulg.created_at AS fecha_guardado
    FROM usuarios_licitaciones_guardadas ulg
    JOIN licitaciones l ON l.codigo_externo = ulg.codigo_externo
    LEFT JOIN compradores c ON c.codigo_externo = l.codigo_externo
    WHERE ulg.usuario_id = ?
    ORDER BY ulg.created_at DESC
  ";

  $stmt = $mysqli->prepare($sql);
  $stmt->bind_param('i', $userId);
  $stmt->execute();
  $result = $stmt->get_result();

  $guardadas = [];
  while ($row = $result->fetch_assoc()) {
    $guardadas[] = $row;
  }

  json_response(['ok' => true, 'guardadas' => $guardadas, 'total' => count($guardadas)]);
}

if ($action === 'add' && $method === 'POST') {
  if (!validate_csrf()) {
    json_response(['ok' => false, 'error' => 'Token CSRF inválido'], 403);
  }

  $codigo = trim((string)($body['codigo'] ?? $_POST['codigo'] ?? ''));
  if ($codigo === '') {
    json_response(['ok' => false, 'error' => 'Código de licitación requerido'], 400);
  }

  $stmt = $mysqli->prepare('INSERT INTO usuarios_licitaciones_guardadas (usuario_id, codigo_externo) VALUES (?, ?) ON DUPLICATE KEY UPDATE created_at = created_at');
  $stmt->bind_param('is', $userId, $codigo);

  if (!$stmt->execute()) {
    json_response(['ok' => false, 'error' => 'No se pudo guardar la licitación'], 500);
  }

  json_response(['ok' => true, 'message' => 'Licitación guardada', 'codigo' => $codigo]);
}

if ($action === 'remove' && $method === 'POST') {
  if (!validate_csrf()) {
    json_response(['ok' => false, 'error' => 'Token CSRF inválido'], 403);
  }

  $codigo = trim((string)($body['codigo'] ?? $_POST['codigo'] ?? ''));
  if ($codigo === '') {
    json_response(['ok' => false, 'error' => 'Código de licitación requerido'], 400);
  }

  $stmt = $mysqli->prepare('DELETE FROM usuarios_licitaciones_guardadas WHERE usuario_id = ? AND codigo_externo = ?');
  $stmt->bind_param('is', $userId, $codigo);

  if (!$stmt->execute()) {
    json_response(['ok' => false, 'error' => 'No se pudo eliminar la licitación guardada'], 500);
  }

  json_response(['ok' => true, 'message' => 'Licitación eliminada de guardadas', 'codigo' => $codigo]);
}

json_response(['ok' => false, 'error' => 'Ruta no encontrada'], 404);
