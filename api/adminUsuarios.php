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

function sanitize_text($value) {
  return trim((string)$value);
}

function get_client_ip() {
  return substr(trim((string)($_SERVER['REMOTE_ADDR'] ?? '')), 0, 45);
}

function validate_csrf() {
  $csrf_header = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? $_POST['csrf_token'] ?? '';
  return !empty($csrf_header) && hash_equals($_SESSION['csrf_token'], $csrf_header);
}

if (empty($_SESSION['user_id'])) {
  json_response(['ok' => false, 'error' => 'No autenticado'], 401);
}

if (($_SESSION['user_rol'] ?? 'usuario') !== 'admin') {
  json_response(['ok' => false, 'error' => 'Acceso restringido a administradores'], 403);
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

function count_admins($mysqli) {
  $result = $mysqli->query("SELECT COUNT(*) AS total FROM usuarios WHERE rol = 'admin' AND activo = 1");
  $row = $result ? $result->fetch_assoc() : null;
  return (int)($row['total'] ?? 0);
}

function audit_admin_action($mysqli, $adminUserId, $accion, $targetUserId = null, $targetEmail = null, $detalle = null) {
  $ip = get_client_ip();
  $detalleJson = $detalle ? json_encode($detalle, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null;

  $stmt = $mysqli->prepare('INSERT INTO admin_auditoria_usuarios (admin_user_id, accion, target_user_id, target_email, detalle_json, ip_address) VALUES (?, ?, ?, ?, ?, ?)');
  $stmt->bind_param('isisss', $adminUserId, $accion, $targetUserId, $targetEmail, $detalleJson, $ip);
  $stmt->execute();
}

$action = $_GET['action'] ?? 'list';
$method = $_SERVER['REQUEST_METHOD'];
$body = get_json_input();
$currentUserId = (int)$_SESSION['user_id'];

if ($action === 'list' && $method === 'GET') {
  $sql = "
    SELECT id, nombre, email, rol, activo, ultimo_login_at, created_at
    FROM usuarios
    ORDER BY created_at DESC
  ";

  $result = $mysqli->query($sql);
  $usuarios = [];
  while ($row = $result->fetch_assoc()) {
    $row['id'] = (int)$row['id'];
    $row['activo'] = (int)$row['activo'];
    $usuarios[] = $row;
  }

  json_response(['ok' => true, 'usuarios' => $usuarios, 'total' => count($usuarios)]);
}

if ($action === 'audit' && $method === 'GET') {
  $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 100;
  if ($limit <= 0) $limit = 100;
  if ($limit > 300) $limit = 300;

  $sql = "
    SELECT
      a.id,
      a.accion,
      a.target_user_id,
      a.target_email,
      a.detalle_json,
      a.ip_address,
      a.created_at,
      u.nombre AS admin_nombre,
      u.email AS admin_email
    FROM admin_auditoria_usuarios a
    JOIN usuarios u ON u.id = a.admin_user_id
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT ?
  ";

  $stmt = $mysqli->prepare($sql);
  $stmt->bind_param('i', $limit);
  $stmt->execute();
  $result = $stmt->get_result();

  $auditoria = [];
  while ($row = $result->fetch_assoc()) {
    $row['id'] = (int)$row['id'];
    $row['target_user_id'] = $row['target_user_id'] !== null ? (int)$row['target_user_id'] : null;
    $auditoria[] = $row;
  }

  json_response(['ok' => true, 'auditoria' => $auditoria, 'total' => count($auditoria)]);
}

if ($action === 'create' && $method === 'POST') {
  if (!validate_csrf()) {
    json_response(['ok' => false, 'error' => 'Token CSRF inválido'], 403);
  }

  $nombre = sanitize_text($body['nombre'] ?? '');
  $email = strtolower(sanitize_text($body['email'] ?? ''));
  $password = (string)($body['password'] ?? '');
  $rol = sanitize_text($body['rol'] ?? 'usuario');

  if (!in_array($rol, ['admin', 'usuario'], true)) {
    $rol = 'usuario';
  }

  if ($nombre === '' || $email === '' || $password === '') {
    json_response(['ok' => false, 'error' => 'Nombre, email y contraseña son obligatorios'], 400);
  }

  if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_response(['ok' => false, 'error' => 'Email inválido'], 400);
  }

  if (
    strlen($password) < 10 ||
    strlen($password) > 72 ||
    !preg_match('/[A-Za-z]/', $password) ||
    !preg_match('/\d/', $password)
  ) {
    json_response(['ok' => false, 'error' => 'La contraseña debe tener entre 10 y 72 caracteres e incluir letras y números'], 400);
  }

  $stmtCheck = $mysqli->prepare('SELECT id FROM usuarios WHERE email = ? LIMIT 1');
  $stmtCheck->bind_param('s', $email);
  $stmtCheck->execute();
  $exists = $stmtCheck->get_result();
  if ($exists && $exists->num_rows > 0) {
    json_response(['ok' => false, 'error' => 'No se pudo crear el usuario con los datos entregados'], 409);
  }

  $passwordHash = password_hash($password, PASSWORD_BCRYPT);
  $stmt = $mysqli->prepare('INSERT INTO usuarios (nombre, email, rol, password_hash, activo) VALUES (?, ?, ?, ?, 1)');
  $stmt->bind_param('ssss', $nombre, $email, $rol, $passwordHash);

  if (!$stmt->execute()) {
    json_response(['ok' => false, 'error' => 'No se pudo crear el usuario'], 500);
  }

  $targetId = (int)$stmt->insert_id;
  audit_admin_action($mysqli, $currentUserId, 'create_user', $targetId, $email, [
    'nombre' => $nombre,
    'rol' => $rol,
    'activo' => 1
  ]);

  json_response(['ok' => true, 'message' => 'Usuario creado correctamente'], 201);
}

if ($action === 'update' && $method === 'POST') {
  if (!validate_csrf()) {
    json_response(['ok' => false, 'error' => 'Token CSRF inválido'], 403);
  }

  $id = (int)($body['id'] ?? 0);
  $nombre = sanitize_text($body['nombre'] ?? '');
  $email = strtolower(sanitize_text($body['email'] ?? ''));
  $rol = sanitize_text($body['rol'] ?? 'usuario');
  $activo = isset($body['activo']) ? (int)$body['activo'] : 1;

  if ($id <= 0 || $nombre === '' || $email === '') {
    json_response(['ok' => false, 'error' => 'Datos incompletos para actualizar'], 400);
  }

  if (!in_array($rol, ['admin', 'usuario'], true)) {
    $rol = 'usuario';
  }

  if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_response(['ok' => false, 'error' => 'Email inválido'], 400);
  }

  $stmtCurrent = $mysqli->prepare('SELECT id, rol, activo FROM usuarios WHERE id = ? LIMIT 1');
  $stmtCurrent->bind_param('i', $id);
  $stmtCurrent->execute();
  $current = $stmtCurrent->get_result()->fetch_assoc();
  if (!$current) {
    json_response(['ok' => false, 'error' => 'Usuario no encontrado'], 404);
  }

  $adminCount = count_admins($mysqli);
  $isDemotingLastAdmin = ($current['rol'] === 'admin') && (($rol !== 'admin') || ((int)$activo === 0)) && $adminCount <= 1;
  if ($isDemotingLastAdmin) {
    json_response(['ok' => false, 'error' => 'No puedes quitar o desactivar el último administrador activo'], 400);
  }

  if ($id === $currentUserId && ((int)$activo === 0 || $rol !== 'admin')) {
    json_response(['ok' => false, 'error' => 'No puedes quitarte privilegios de administrador ni desactivarte'], 400);
  }

  $stmtCheckEmail = $mysqli->prepare('SELECT id FROM usuarios WHERE email = ? AND id <> ? LIMIT 1');
  $stmtCheckEmail->bind_param('si', $email, $id);
  $stmtCheckEmail->execute();
  $emailUsed = $stmtCheckEmail->get_result();
  if ($emailUsed && $emailUsed->num_rows > 0) {
    json_response(['ok' => false, 'error' => 'No se pudo actualizar el usuario con los datos entregados'], 409);
  }

  $stmt = $mysqli->prepare('UPDATE usuarios SET nombre = ?, email = ?, rol = ?, activo = ? WHERE id = ?');
  $stmt->bind_param('sssii', $nombre, $email, $rol, $activo, $id);

  if (!$stmt->execute()) {
    json_response(['ok' => false, 'error' => 'No se pudo actualizar el usuario'], 500);
  }

  audit_admin_action($mysqli, $currentUserId, 'update_user', $id, $email, [
    'nombre' => $nombre,
    'rol' => $rol,
    'activo' => (int)$activo
  ]);

  json_response(['ok' => true, 'message' => 'Usuario actualizado correctamente']);
}

if ($action === 'set_password' && $method === 'POST') {
  if (!validate_csrf()) {
    json_response(['ok' => false, 'error' => 'Token CSRF inválido'], 403);
  }

  $id = (int)($body['id'] ?? 0);
  $password = (string)($body['password'] ?? '');

  if ($id <= 0 || $password === '') {
    json_response(['ok' => false, 'error' => 'Datos incompletos para cambiar contraseña'], 400);
  }

  if (
    strlen($password) < 10 ||
    strlen($password) > 72 ||
    !preg_match('/[A-Za-z]/', $password) ||
    !preg_match('/\d/', $password)
  ) {
    json_response(['ok' => false, 'error' => 'La contraseña debe tener entre 10 y 72 caracteres e incluir letras y números'], 400);
  }

  $passwordHash = password_hash($password, PASSWORD_BCRYPT);
  $stmt = $mysqli->prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?');
  $stmt->bind_param('si', $passwordHash, $id);

  if (!$stmt->execute()) {
    json_response(['ok' => false, 'error' => 'No se pudo cambiar la contraseña'], 500);
  }

  audit_admin_action($mysqli, $currentUserId, 'set_password', $id, null, [
    'password_changed' => true
  ]);

  json_response(['ok' => true, 'message' => 'Contraseña actualizada']);
}

if ($action === 'delete' && $method === 'POST') {
  if (!validate_csrf()) {
    json_response(['ok' => false, 'error' => 'Token CSRF inválido'], 403);
  }

  $id = (int)($body['id'] ?? 0);
  if ($id <= 0) {
    json_response(['ok' => false, 'error' => 'ID inválido'], 400);
  }

  if ($id === $currentUserId) {
    json_response(['ok' => false, 'error' => 'No puedes eliminar tu propio usuario administrador'], 400);
  }

  $stmtCurrent = $mysqli->prepare('SELECT rol, activo FROM usuarios WHERE id = ? LIMIT 1');
  $stmtCurrent->bind_param('i', $id);
  $stmtCurrent->execute();
  $current = $stmtCurrent->get_result()->fetch_assoc();
  if (!$current) {
    json_response(['ok' => false, 'error' => 'Usuario no encontrado'], 404);
  }

  $adminCount = count_admins($mysqli);
  if ($current['rol'] === 'admin' && (int)$current['activo'] === 1 && $adminCount <= 1) {
    json_response(['ok' => false, 'error' => 'No puedes eliminar el último administrador activo'], 400);
  }

  $stmtTargetInfo = $mysqli->prepare('SELECT email FROM usuarios WHERE id = ? LIMIT 1');
  $stmtTargetInfo->bind_param('i', $id);
  $stmtTargetInfo->execute();
  $targetInfo = $stmtTargetInfo->get_result()->fetch_assoc();
  $targetEmail = $targetInfo['email'] ?? null;

  $stmt = $mysqli->prepare('DELETE FROM usuarios WHERE id = ?');
  $stmt->bind_param('i', $id);

  if (!$stmt->execute()) {
    json_response(['ok' => false, 'error' => 'No se pudo eliminar el usuario'], 500);
  }

  audit_admin_action($mysqli, $currentUserId, 'delete_user', $id, $targetEmail, [
    'deleted' => true
  ]);

  json_response(['ok' => true, 'message' => 'Usuario eliminado']);
}

json_response(['ok' => false, 'error' => 'Ruta no encontrada'], 404);
