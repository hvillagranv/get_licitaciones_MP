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
  $ip = $_SERVER['REMOTE_ADDR'] ?? '';
  return substr(trim((string)$ip), 0, 45);
}

function validate_csrf() {
  $csrf_header = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? $_POST['csrf_token'] ?? '';
  return !empty($csrf_header) && hash_equals($_SESSION['csrf_token'], $csrf_header);
}

function rate_limit_scope_key($prefix, $value) {
  return $prefix . ':' . hash('sha256', strtolower(trim((string)$value)));
}

function rate_limit_get_status($mysqli, $action, $scopeKey) {
  $stmt = $mysqli->prepare('SELECT id, attempt_count, window_started_at, blocked_until FROM auth_rate_limits WHERE accion = ? AND scope_key = ? LIMIT 1');
  $stmt->bind_param('ss', $action, $scopeKey);
  $stmt->execute();
  $result = $stmt->get_result();
  return $result ? $result->fetch_assoc() : null;
}

function rate_limit_is_blocked($mysqli, $action, $scopeKey) {
  $status = rate_limit_get_status($mysqli, $action, $scopeKey);
  if (!$status || empty($status['blocked_until'])) {
    return false;
  }

  return strtotime($status['blocked_until']) > time();
}

function rate_limit_record_failure($mysqli, $action, $scopeKey, $maxAttempts, $windowSeconds, $blockSeconds) {
  $status = rate_limit_get_status($mysqli, $action, $scopeKey);
  $now = time();
  $windowStartedAt = $status ? strtotime($status['window_started_at']) : $now;
  $isSameWindow = $status && ($now - $windowStartedAt) < $windowSeconds;
  $attemptCount = $isSameWindow ? ((int)$status['attempt_count'] + 1) : 1;
  $newWindowStart = date('Y-m-d H:i:s', $isSameWindow ? $windowStartedAt : $now);
  $blockedUntil = $attemptCount >= $maxAttempts ? date('Y-m-d H:i:s', $now + $blockSeconds) : null;

  if ($status) {
    $stmt = $mysqli->prepare('UPDATE auth_rate_limits SET attempt_count = ?, window_started_at = ?, blocked_until = ? WHERE id = ?');
    $id = (int)$status['id'];
    $stmt->bind_param('issi', $attemptCount, $newWindowStart, $blockedUntil, $id);
    $stmt->execute();
    return;
  }

  $stmt = $mysqli->prepare('INSERT INTO auth_rate_limits (accion, scope_key, attempt_count, window_started_at, blocked_until) VALUES (?, ?, ?, ?, ?)');
  $stmt->bind_param('ssiss', $action, $scopeKey, $attemptCount, $newWindowStart, $blockedUntil);
  $stmt->execute();
}

function rate_limit_clear($mysqli, $action, $scopeKey) {
  $stmt = $mysqli->prepare('DELETE FROM auth_rate_limits WHERE accion = ? AND scope_key = ?');
  $stmt->bind_param('ss', $action, $scopeKey);
  $stmt->execute();
}

function ensure_not_rate_limited($mysqli, $action, $scopeKeys) {
  foreach ($scopeKeys as $scopeKey) {
    if (rate_limit_is_blocked($mysqli, $action, $scopeKey)) {
      json_response(['ok' => false, 'error' => 'Demasiados intentos. Intenta nuevamente en unos minutos.'], 429);
    }
  }
}

function record_rate_limited_failure($mysqli, $action, $scopeKeys, $config) {
  foreach ($scopeKeys as $scopeKey) {
    rate_limit_record_failure(
      $mysqli,
      $action,
      $scopeKey,
      $config['max_attempts'],
      $config['window_seconds'],
      $config['block_seconds']
    );
  }
}

function clear_rate_limited_success($mysqli, $action, $scopeKeys) {
  foreach ($scopeKeys as $scopeKey) {
    rate_limit_clear($mysqli, $action, $scopeKey);
  }
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

$rateLimits = [
  'login' => [
    'max_attempts' => 5,
    'window_seconds' => 900,
    'block_seconds' => 900
  ],
  'register' => [
    'max_attempts' => 3,
    'window_seconds' => 3600,
    'block_seconds' => 3600
  ]
];

$action = $_GET['action'] ?? 'status';
$method = $_SERVER['REQUEST_METHOD'];
$body = get_json_input();

if ($action === 'status' && $method === 'GET') {
  $userData = null;
  if (!empty($_SESSION['user_id'])) {
    $userData = [
      'id' => (int)$_SESSION['user_id'],
      'nombre' => $_SESSION['user_nombre'] ?? '',
      'email' => $_SESSION['user_email'] ?? '',
      'rol' => $_SESSION['user_rol'] ?? 'usuario'
    ];
  }

  json_response([
    'ok' => true,
    'logged_in' => !empty($_SESSION['user_id']),
    'user' => $userData,
    'csrf_token' => $_SESSION['csrf_token']
  ]);
}

if ($action === 'register' && $method === 'POST') {
  if (!validate_csrf()) {
    json_response(['ok' => false, 'error' => 'Token CSRF inválido'], 403);
  }

  $nombre = sanitize_text($body['nombre'] ?? $_POST['nombre'] ?? '');
  $email = strtolower(sanitize_text($body['email'] ?? $_POST['email'] ?? ''));
  $password = (string)($body['password'] ?? $_POST['password'] ?? '');
  $scopeKeys = [
    rate_limit_scope_key('ip', get_client_ip()),
    rate_limit_scope_key('email', $email)
  ];

  ensure_not_rate_limited($mysqli, 'register', $scopeKeys);

  if ($nombre === '' || $email === '' || $password === '') {
    json_response(['ok' => false, 'error' => 'Nombre, email y password son obligatorios'], 400);
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
  $resultCheck = $stmtCheck->get_result();
  if ($resultCheck && $resultCheck->num_rows > 0) {
    record_rate_limited_failure($mysqli, 'register', $scopeKeys, $rateLimits['register']);
    json_response(['ok' => false, 'error' => 'No se pudo completar el registro con los datos entregados'], 409);
  }

  $passwordHash = password_hash($password, PASSWORD_BCRYPT);
  $stmtInsert = $mysqli->prepare('INSERT INTO usuarios (nombre, email, password_hash) VALUES (?, ?, ?)');
  $stmtInsert->bind_param('sss', $nombre, $email, $passwordHash);

  if (!$stmtInsert->execute()) {
    record_rate_limited_failure($mysqli, 'register', $scopeKeys, $rateLimits['register']);
    json_response(['ok' => false, 'error' => 'No se pudo crear el usuario'], 500);
  }

  $userId = (int)$stmtInsert->insert_id;
  session_regenerate_id(true);
  $_SESSION['user_id'] = $userId;
  $_SESSION['user_nombre'] = $nombre;
  $_SESSION['user_email'] = $email;
  $_SESSION['user_rol'] = 'usuario';
  $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
  clear_rate_limited_success($mysqli, 'register', $scopeKeys);

  json_response([
    'ok' => true,
    'message' => 'Usuario creado correctamente',
    'user' => [
      'id' => $userId,
      'nombre' => $nombre,
      'email' => $email,
      'rol' => 'usuario'
    ]
  ], 201);
}

if ($action === 'login' && $method === 'POST') {
  if (!validate_csrf()) {
    json_response(['ok' => false, 'error' => 'Token CSRF inválido'], 403);
  }

  $email = strtolower(sanitize_text($body['email'] ?? $_POST['email'] ?? ''));
  $password = (string)($body['password'] ?? $_POST['password'] ?? '');
  $scopeKeys = [
    rate_limit_scope_key('ip', get_client_ip()),
    rate_limit_scope_key('email', $email)
  ];

  ensure_not_rate_limited($mysqli, 'login', $scopeKeys);

  if ($email === '' || $password === '') {
    json_response(['ok' => false, 'error' => 'Email y password son obligatorios'], 400);
  }

  $stmt = $mysqli->prepare('SELECT id, nombre, email, rol, password_hash, activo FROM usuarios WHERE email = ? LIMIT 1');
  $stmt->bind_param('s', $email);
  $stmt->execute();
  $result = $stmt->get_result();
  $userRow = $result ? $result->fetch_assoc() : null;

  if (!$userRow || (int)$userRow['activo'] !== 1 || !password_verify($password, $userRow['password_hash'])) {
    record_rate_limited_failure($mysqli, 'login', $scopeKeys, $rateLimits['login']);
    json_response(['ok' => false, 'error' => 'Credenciales inválidas'], 401);
  }

  session_regenerate_id(true);
  $_SESSION['user_id'] = (int)$userRow['id'];
  $_SESSION['user_nombre'] = $userRow['nombre'];
  $_SESSION['user_email'] = $userRow['email'];
  $_SESSION['user_rol'] = $userRow['rol'] ?? 'usuario';
  $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
  clear_rate_limited_success($mysqli, 'login', $scopeKeys);

  $stmtLogin = $mysqli->prepare('UPDATE usuarios SET ultimo_login_at = NOW() WHERE id = ?');
  $uid = (int)$userRow['id'];
  $stmtLogin->bind_param('i', $uid);
  $stmtLogin->execute();

  json_response([
    'ok' => true,
    'message' => 'Sesión iniciada',
    'user' => [
      'id' => (int)$userRow['id'],
      'nombre' => $userRow['nombre'],
      'email' => $userRow['email'],
      'rol' => $userRow['rol'] ?? 'usuario'
    ]
  ]);
}

if ($action === 'logout' && $method === 'POST') {
  if (!validate_csrf()) {
    json_response(['ok' => false, 'error' => 'Token CSRF inválido'], 403);
  }

  $_SESSION = [];
  if (ini_get('session.use_cookies')) {
    $params = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
  }
  session_destroy();

  session_start();
  $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
  header('X-CSRF-Token: ' . $_SESSION['csrf_token']);

  json_response(['ok' => true, 'message' => 'Sesión cerrada']);
}

json_response(['ok' => false, 'error' => 'Ruta no encontrada'], 404);
