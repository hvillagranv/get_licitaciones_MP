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

function provider_feature_available($mysqli) {
  static $available = null;
  if ($available !== null) {
    return $available;
  }

  $tableResult = $mysqli->query("SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'proveedores'");
  $columnResult = $mysqli->query("SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios' AND column_name = 'proveedor_id'");

  $tableExists = (int)(($tableResult ? $tableResult->fetch_assoc()['total'] : 0) ?? 0) === 1;
  $columnExists = (int)(($columnResult ? $columnResult->fetch_assoc()['total'] : 0) ?? 0) === 1;
  $available = $tableExists && $columnExists;

  return $available;
}

function build_user_payload($row) {
  if (!$row) {
    return null;
  }

  return [
    'id' => (int)$row['id'],
    'nombre' => $row['nombre'],
    'email' => $row['email'],
    'rol' => $row['rol'] ?? 'usuario',
    'proveedor' => !empty($row['proveedor_id']) ? [
      'id' => (int)$row['proveedor_id'],
      'nombre' => $row['proveedor_nombre'],
      'rut' => $row['proveedor_rut'] ?: null
    ] : null
  ];
}

function normalize_provider_name($value) {
  $value = preg_replace('/\s+/u', ' ', trim((string)$value));
  if ($value === '') {
    return '';
  }

  return function_exists('mb_strtolower') ? mb_strtolower($value, 'UTF-8') : strtolower($value);
}

function normalize_provider_rut($value) {
  $value = strtoupper(trim((string)$value));
  $value = str_replace(['.', '-', ' '], '', $value);
  return $value !== '' ? $value : null;
}

function get_provider_payload($row) {
  if (!$row || empty($row['id'])) {
    return null;
  }

  return [
    'id' => (int)$row['id'],
    'nombre' => $row['nombre'],
    'rut' => $row['rut'] ?: null
  ];
}

function find_provider_by_id($mysqli, $providerId) {
  $stmt = $mysqli->prepare('SELECT id, nombre, rut FROM proveedores WHERE id = ? LIMIT 1');
  $stmt->bind_param('i', $providerId);
  $stmt->execute();
  $result = $stmt->get_result();
  return $result ? $result->fetch_assoc() : null;
}

function resolve_provider($mysqli, $providerIdRaw, $providerNameRaw, $providerRutRaw) {
  $providerId = (int)$providerIdRaw;
  $providerName = preg_replace('/\s+/u', ' ', sanitize_text($providerNameRaw));
  $providerRut = sanitize_text($providerRutRaw);
  $providerRut = $providerRut !== '' ? $providerRut : null;

  if (!provider_feature_available($mysqli)) {
    if ($providerId > 0 || $providerName !== '' || $providerRut !== null) {
      json_response(['ok' => false, 'error' => 'La asociación de proveedores requiere ejecutar la migración 005_usuarios_proveedores.sql'], 500);
    }

    return null;
  }

  if ($providerId > 0) {
    $provider = find_provider_by_id($mysqli, $providerId);
    if (!$provider) {
      json_response(['ok' => false, 'error' => 'Proveedor no encontrado'], 404);
    }

    return get_provider_payload($provider);
  }

  if ($providerName === '') {
    return null;
  }

  $normalizedName = normalize_provider_name($providerName);
  $normalizedRut = normalize_provider_rut($providerRut);

  if ($normalizedRut !== null) {
    $stmtRut = $mysqli->prepare('SELECT id, nombre, rut FROM proveedores WHERE rut_normalizado = ? LIMIT 1');
    $stmtRut->bind_param('s', $normalizedRut);
    $stmtRut->execute();
    $resultRut = $stmtRut->get_result();
    $providerByRut = $resultRut ? $resultRut->fetch_assoc() : null;
    if ($providerByRut) {
      if ((empty($providerByRut['rut']) || $providerByRut['rut'] === '') && $providerRut !== null) {
        $stmtUpdateRut = $mysqli->prepare('UPDATE proveedores SET rut = ?, rut_normalizado = ? WHERE id = ?');
        $providerIdToUpdate = (int)$providerByRut['id'];
        $stmtUpdateRut->bind_param('ssi', $providerRut, $normalizedRut, $providerIdToUpdate);
        $stmtUpdateRut->execute();
        $providerByRut['rut'] = $providerRut;
      }

      return get_provider_payload($providerByRut);
    }
  }

  $stmtName = $mysqli->prepare('SELECT id, nombre, rut FROM proveedores WHERE nombre_normalizado = ? LIMIT 1');
  $stmtName->bind_param('s', $normalizedName);
  $stmtName->execute();
  $resultName = $stmtName->get_result();
  $providerByName = $resultName ? $resultName->fetch_assoc() : null;
  if ($providerByName) {
    if ((empty($providerByName['rut']) || $providerByName['rut'] === '') && $providerRut !== null) {
      $stmtUpdateRut = $mysqli->prepare('UPDATE proveedores SET rut = ?, rut_normalizado = ? WHERE id = ?');
      $providerIdToUpdate = (int)$providerByName['id'];
      $stmtUpdateRut->bind_param('ssi', $providerRut, $normalizedRut, $providerIdToUpdate);
      $stmtUpdateRut->execute();
      $providerByName['rut'] = $providerRut;
    }

    return get_provider_payload($providerByName);
  }

  $stmtInsert = $mysqli->prepare('INSERT INTO proveedores (nombre, nombre_normalizado, rut, rut_normalizado, origen) VALUES (?, ?, ?, ?, \'manual\')');
  $stmtInsert->bind_param('ssss', $providerName, $normalizedName, $providerRut, $normalizedRut);

  if (!$stmtInsert->execute()) {
    json_response(['ok' => false, 'error' => 'No se pudo crear el proveedor asociado'], 500);
  }

  return [
    'id' => (int)$stmtInsert->insert_id,
    'nombre' => $providerName,
    'rut' => $providerRut
  ];
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
    if (provider_feature_available($mysqli)) {
      $stmtStatus = $mysqli->prepare('
        SELECT
          u.id,
          u.nombre,
          u.email,
          u.rol,
          u.proveedor_id,
          p.nombre AS proveedor_nombre,
          p.rut AS proveedor_rut
        FROM usuarios u
        LEFT JOIN proveedores p ON p.id = u.proveedor_id
        WHERE u.id = ?
        LIMIT 1
      ');
    } else {
      $stmtStatus = $mysqli->prepare('
        SELECT
          u.id,
          u.nombre,
          u.email,
          u.rol,
          NULL AS proveedor_id,
          NULL AS proveedor_nombre,
          NULL AS proveedor_rut
        FROM usuarios u
        WHERE u.id = ?
        LIMIT 1
      ');
    }

    $statusUserId = (int)$_SESSION['user_id'];
    $stmtStatus->bind_param('i', $statusUserId);
    $stmtStatus->execute();
    $userData = build_user_payload($stmtStatus->get_result()->fetch_assoc());
  }

  json_response([
    'ok' => true,
    'logged_in' => !empty($_SESSION['user_id']),
    'user' => $userData,
    'csrf_token' => $_SESSION['csrf_token']
  ]);
}

if ($action === 'providers' && $method === 'GET') {
  if (!provider_feature_available($mysqli)) {
    json_response([
      'ok' => true,
      'feature_available' => false,
      'message' => 'La asociación de proveedores requiere ejecutar la migración 005_usuarios_proveedores.sql',
      'proveedores' => [],
      'total' => 0
    ]);
  }

  $query = sanitize_text($_GET['q'] ?? '');
  $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 100;
  if ($limit <= 0) $limit = 100;
  if ($limit > 500) $limit = 500;

  if ($query !== '') {
    $like = '%' . $query . '%';
    $stmt = $mysqli->prepare('SELECT id, nombre, rut FROM proveedores WHERE nombre LIKE ? OR rut LIKE ? ORDER BY nombre ASC LIMIT ?');
    $stmt->bind_param('ssi', $like, $like, $limit);
    $stmt->execute();
    $result = $stmt->get_result();
  } else {
    $stmt = $mysqli->prepare('SELECT id, nombre, rut FROM proveedores ORDER BY nombre ASC LIMIT ?');
    $stmt->bind_param('i', $limit);
    $stmt->execute();
    $result = $stmt->get_result();
  }

  $providers = [];
  while ($row = $result->fetch_assoc()) {
    $providers[] = get_provider_payload($row);
  }

  json_response([
    'ok' => true,
    'feature_available' => true,
    'proveedores' => $providers,
    'total' => count($providers)
  ]);
}

if ($action === 'register' && $method === 'POST') {
  if (!validate_csrf()) {
    json_response(['ok' => false, 'error' => 'Token CSRF inválido'], 403);
  }

  $nombre = sanitize_text($body['nombre'] ?? $_POST['nombre'] ?? '');
  $email = strtolower(sanitize_text($body['email'] ?? $_POST['email'] ?? ''));
  $password = (string)($body['password'] ?? $_POST['password'] ?? '');
  $provider = resolve_provider(
    $mysqli,
    $body['proveedor_id'] ?? $_POST['proveedor_id'] ?? 0,
    $body['proveedor_nombre'] ?? $_POST['proveedor_nombre'] ?? '',
    $body['proveedor_rut'] ?? $_POST['proveedor_rut'] ?? ''
  );
  $providerId = $provider['id'] ?? null;
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
  if (provider_feature_available($mysqli)) {
    $stmtInsert = $mysqli->prepare('INSERT INTO usuarios (nombre, email, password_hash, proveedor_id) VALUES (?, ?, ?, ?)');
    $stmtInsert->bind_param('sssi', $nombre, $email, $passwordHash, $providerId);
  } else {
    $stmtInsert = $mysqli->prepare('INSERT INTO usuarios (nombre, email, password_hash) VALUES (?, ?, ?)');
    $stmtInsert->bind_param('sss', $nombre, $email, $passwordHash);
  }

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
      'rol' => 'usuario',
      'proveedor' => $provider
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

  if (provider_feature_available($mysqli)) {
    $stmt = $mysqli->prepare('
      SELECT
        u.id,
        u.nombre,
        u.email,
        u.rol,
        u.password_hash,
        u.activo,
        u.proveedor_id,
        p.nombre AS proveedor_nombre,
        p.rut AS proveedor_rut
      FROM usuarios u
      LEFT JOIN proveedores p ON p.id = u.proveedor_id
      WHERE u.email = ?
      LIMIT 1
    ');
  } else {
    $stmt = $mysqli->prepare('
      SELECT
        u.id,
        u.nombre,
        u.email,
        u.rol,
        u.password_hash,
        u.activo,
        NULL AS proveedor_id,
        NULL AS proveedor_nombre,
        NULL AS proveedor_rut
      FROM usuarios u
      WHERE u.email = ?
      LIMIT 1
    ');
  }
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
    'user' => build_user_payload($userRow)
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
