<?php
// api/catalogosAdmin.php
// CRUD admin para palabras_clave e instituciones + import/export CSV
// Acceso: solo admin autenticado

ob_start(); // captura cualquier notice/warning para no romper el JSON
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
  header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type, Authorization, X-CSRF-Token');
}
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

function json_response($data, $status = 200) {
  if (ob_get_level()) ob_end_clean(); // descartar cualquier salida previa
  http_response_code($status);
  echo json_encode($data, JSON_UNESCAPED_UNICODE);
  exit;
}

function get_json_input() {
  $raw = file_get_contents('php://input');
  if (!$raw) return [];
  $decoded = json_decode($raw, true);
  return is_array($decoded) ? $decoded : [];
}

function require_admin() {
  if (empty($_SESSION['user_id']) || ($_SESSION['user_rol'] ?? '') !== 'admin') {
    json_response(['error' => 'Acceso solo para administradores'], 403);
  }
}

function validate_csrf() {
  $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? $_POST['csrf_token'] ?? '';
  if (empty($token) || !hash_equals($_SESSION['csrf_token'], $token)) {
    json_response(['error' => 'Token CSRF inválido'], 403);
  }
}

function connect_db() {
  $dbHost = $_ENV['DB_HOST'] ?? getenv('DB_HOST') ?: 'localhost';
  $dbUser = $_ENV['DB_USER'] ?? getenv('DB_USER') ?: '';
  $dbPass = $_ENV['DB_PASSWORD'] ?? $_ENV['DB_PASS'] ?? getenv('DB_PASSWORD') ?: getenv('DB_PASS') ?: '';
  $dbName = $_ENV['DB_NAME'] ?? getenv('DB_NAME') ?: '';

  if ($dbUser === '' || $dbName === '') {
    json_response(['error' => 'Credenciales de base de datos no configuradas. Verifique el archivo .env'], 500);
  }

  $mysqli = new mysqli($dbHost, $dbUser, $dbPass, $dbName);
  if ($mysqli->connect_error) {
    json_response(['error' => 'Error de conexión: ' . $mysqli->connect_error], 500);
  }
  $mysqli->set_charset('utf8mb4');
  return $mysqli;
}

// Cache estático por request para evitar consultas repetidas a information_schema
function column_exists_admin($db, $table, $column) {
  static $cache = [];
  $key = "$table.$column";
  if (!isset($cache[$key])) {
    $res = $db->query("SELECT COUNT(*) AS c FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = '$table' AND column_name = '$column'");
    $cache[$key] = $res && ($res->fetch_assoc()['c'] ?? 0) > 0;
  }
  return $cache[$key];
}

// Obtiene el proveedor_id para el contexto de catálogo:
// - Si ?proveedor_id= está en la URL (admin gestionando otra empresa), usa ese valor.
// - Si no, usa el proveedor_id del usuario autenticado desde la BD.
// - Devuelve null si no aplica (catálogo global/admin sin empresa asignada).
function get_request_proveedor_id($db) {
  if (array_key_exists('proveedor_id', $_GET)) {
    $v = $_GET['proveedor_id'];
    return ($v === '' || $v === 'null') ? null : (int)$v;
  }
  if (!column_exists_admin($db, 'usuarios', 'proveedor_id')) {
    return null;
  }
  try {
    $stmt = $db->prepare('SELECT proveedor_id FROM usuarios WHERE id = ? LIMIT 1');
    $stmt->bind_param('i', $_SESSION['user_id']);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    return $row ? $row['proveedor_id'] : null;
  } catch (Throwable $e) {
    return null;
  }
}

// -------------------------------------------------------
// Enrutamiento
// -------------------------------------------------------
$method   = $_SERVER['REQUEST_METHOD'];
$catalogo = $_GET['catalogo'] ?? '';   // 'palabras_clave' | 'instituciones'
$action   = $_GET['action'] ?? '';     // '' | 'export_csv' | 'import_csv'
$id       = isset($_GET['id']) ? (int)$_GET['id'] : 0;

if (!in_array($catalogo, ['palabras_clave', 'instituciones'], true)) {
  json_response(['error' => 'Catálogo inválido. Use ?catalogo=palabras_clave o ?catalogo=instituciones'], 400);
}

// Exportar CSV: GET sin autenticación especial de CSRF
if ($method === 'GET' && $action === 'export_csv') {
  require_admin();
  export_csv($catalogo);
}

// Importar CSV: POST multipart
if ($method === 'POST' && $action === 'import_csv') {
  require_admin();
  validate_csrf();
  try {
    import_csv($catalogo);
  } catch (Throwable $e) {
    json_response(['error' => 'Error interno: ' . $e->getMessage()], 500);
  }
}

// Listar: GET
if ($method === 'GET' && $action === '') {
  require_admin();
  try { listar($catalogo); } catch (Throwable $e) { json_response(['error' => $e->getMessage()], 500); }
}

// Crear: POST (JSON)
if ($method === 'POST' && $action === '') {
  require_admin();
  validate_csrf();
  try { crear($catalogo); } catch (Throwable $e) { json_response(['error' => $e->getMessage()], 500); }
}

// Actualizar: PUT
if ($method === 'PUT') {
  require_admin();
  validate_csrf();
  if ($id <= 0) json_response(['error' => 'ID requerido'], 400);
  try { actualizar($catalogo, $id); } catch (Throwable $e) { json_response(['error' => $e->getMessage()], 500); }
}

// Eliminar: DELETE
if ($method === 'DELETE') {
  require_admin();
  validate_csrf();
  if ($id <= 0) json_response(['error' => 'ID requerido'], 400);
  try { eliminar($catalogo, $id); } catch (Throwable $e) { json_response(['error' => $e->getMessage()], 500); }
}

json_response(['error' => 'Acción no reconocida'], 405);

// -------------------------------------------------------
// Funciones por catálogo
// -------------------------------------------------------

function listar($catalogo) {
  $db = connect_db();
  $prov_id = get_request_proveedor_id($db);
  $hasProv = column_exists_admin($db, $catalogo, 'proveedor_id');

  if ($catalogo === 'palabras_clave') {
    try {
      if (!$hasProv) {
        $res = $db->query("SELECT id, palabra, variantes, activo FROM palabras_clave ORDER BY palabra");
      } elseif ($prov_id === null) {
        $res = $db->query("SELECT id, palabra, variantes, activo FROM palabras_clave WHERE proveedor_id IS NULL ORDER BY palabra");
      } else {
        $stmt_l = $db->prepare("SELECT id, palabra, variantes, activo FROM palabras_clave WHERE proveedor_id = ? ORDER BY palabra");
        $stmt_l->bind_param('i', $prov_id);
        $stmt_l->execute();
        $res = $stmt_l->get_result();
      }
    } catch (Throwable $e) {
      $res = $db->query("SELECT id, palabra, variantes, activo FROM palabras_clave ORDER BY palabra");
    }
    if (!$res) {
      json_response(['data' => [], 'warning' => 'Tabla palabras_clave no existe aún. Ejecute la migración 006.']);
    }
    $rows = [];
    while ($row = $res->fetch_assoc()) {
      $row['variantes'] = $row['variantes'] ? json_decode($row['variantes'], true) : [];
      $rows[] = $row;
    }
    json_response(['data' => $rows]);
  } else {
    try {
      if (!$hasProv) {
        $res = $db->query("SELECT id, nombre, alias, activo FROM instituciones ORDER BY alias");
      } elseif ($prov_id === null) {
        $res = $db->query("SELECT id, nombre, alias, activo FROM instituciones WHERE proveedor_id IS NULL ORDER BY alias");
      } else {
        $stmt_l = $db->prepare("SELECT id, nombre, alias, activo FROM instituciones WHERE proveedor_id = ? ORDER BY alias");
        $stmt_l->bind_param('i', $prov_id);
        $stmt_l->execute();
        $res = $stmt_l->get_result();
      }
    } catch (Throwable $e) {
      $res = $db->query("SELECT id, nombre, alias, activo FROM instituciones ORDER BY alias");
    }
    if (!$res) {
      json_response(['data' => [], 'warning' => 'Tabla instituciones no existe aún. Ejecute la migración 006.']);
    }
    $rows = [];
    while ($row = $res->fetch_assoc()) $rows[] = $row;
    json_response(['data' => $rows]);
  }
}

function crear($catalogo) {
  $db = connect_db();
  $prov_id = get_request_proveedor_id($db);
  $body = get_json_input();
  if ($catalogo === 'palabras_clave') {
    $palabra = trim((string)($body['palabra'] ?? ''));
    if ($palabra === '') json_response(['error' => 'Campo "palabra" requerido'], 422);
    $variantes = array_values(array_filter(array_map('trim', (array)($body['variantes'] ?? [])), fn($v) => $v !== ''));
    $varJson = json_encode($variantes, JSON_UNESCAPED_UNICODE);
    if ($prov_id === null) {
      $stmt = $db->prepare("INSERT INTO palabras_clave (palabra, variantes) VALUES (?, ?)");
      if (!$stmt) json_response(['error' => 'Tabla no existe. Ejecute la migración 006.'], 500);
      $stmt->bind_param('ss', $palabra, $varJson);
    } else {
      $stmt = $db->prepare("INSERT INTO palabras_clave (proveedor_id, palabra, variantes) VALUES (?, ?, ?)");
      if (!$stmt) json_response(['error' => 'Tabla no existe. Ejecute la migración 006.'], 500);
      $stmt->bind_param('iss', $prov_id, $palabra, $varJson);
    }
    if (!$stmt->execute()) {
      if ($db->errno === 1062) json_response(['error' => 'La palabra clave ya existe'], 409);
      json_response(['error' => 'Error al guardar'], 500);
    }
    json_response(['ok' => true, 'id' => $stmt->insert_id]);
  } else {
    $nombre = trim((string)($body['nombre'] ?? ''));
    $alias  = trim((string)($body['alias'] ?? ''));
    if ($nombre === '' || $alias === '') json_response(['error' => 'Campos "nombre" y "alias" requeridos'], 422);
    if ($prov_id === null) {
      $stmt = $db->prepare("INSERT INTO instituciones (nombre, alias) VALUES (?, ?)");
      if (!$stmt) json_response(['error' => 'Tabla no existe. Ejecute la migración 006.'], 500);
      $stmt->bind_param('ss', $nombre, $alias);
    } else {
      $stmt = $db->prepare("INSERT INTO instituciones (proveedor_id, nombre, alias) VALUES (?, ?, ?)");
      if (!$stmt) json_response(['error' => 'Tabla no existe. Ejecute la migración 006.'], 500);
      $stmt->bind_param('iss', $prov_id, $nombre, $alias);
    }
    if (!$stmt->execute()) {
      if ($db->errno === 1062) json_response(['error' => 'La institución ya existe'], 409);
      json_response(['error' => 'Error al guardar'], 500);
    }
    json_response(['ok' => true, 'id' => $stmt->insert_id]);
  }
}

function actualizar($catalogo, $id) {
  $db = connect_db();
  $prov_id = get_request_proveedor_id($db);
  $body = get_json_input();
  if ($catalogo === 'palabras_clave') {
    $palabra = trim((string)($body['palabra'] ?? ''));
    if ($palabra === '') json_response(['error' => 'Campo "palabra" requerido'], 422);
    $variantes = array_values(array_filter(array_map('trim', (array)($body['variantes'] ?? [])), fn($v) => $v !== ''));
    $varJson = json_encode($variantes, JSON_UNESCAPED_UNICODE);
    $activo = isset($body['activo']) ? (int)(bool)$body['activo'] : 1;
    if ($prov_id === null) {
      $stmt = $db->prepare("UPDATE palabras_clave SET palabra=?, variantes=?, activo=? WHERE id=? AND proveedor_id IS NULL");
      if (!$stmt) json_response(['error' => 'Tabla no existe. Ejecute la migración 006.'], 500);
      $stmt->bind_param('ssii', $palabra, $varJson, $activo, $id);
    } else {
      $stmt = $db->prepare("UPDATE palabras_clave SET palabra=?, variantes=?, activo=? WHERE id=? AND proveedor_id=?");
      if (!$stmt) json_response(['error' => 'Tabla no existe. Ejecute la migración 006.'], 500);
      $stmt->bind_param('ssiii', $palabra, $varJson, $activo, $id, $prov_id);
    }
    $stmt->execute();
    if ($stmt->affected_rows === 0) json_response(['error' => 'No encontrado o sin cambios'], 404);
    json_response(['ok' => true]);
  } else {
    $nombre = trim((string)($body['nombre'] ?? ''));
    $alias  = trim((string)($body['alias'] ?? ''));
    $activo = isset($body['activo']) ? (int)(bool)$body['activo'] : 1;
    if ($nombre === '' || $alias === '') json_response(['error' => 'Campos "nombre" y "alias" requeridos'], 422);
    if ($prov_id === null) {
      $stmt = $db->prepare("UPDATE instituciones SET nombre=?, alias=?, activo=? WHERE id=? AND proveedor_id IS NULL");
      if (!$stmt) json_response(['error' => 'Tabla no existe. Ejecute la migración 006.'], 500);
      $stmt->bind_param('ssii', $nombre, $alias, $activo, $id);
    } else {
      $stmt = $db->prepare("UPDATE instituciones SET nombre=?, alias=?, activo=? WHERE id=? AND proveedor_id=?");
      if (!$stmt) json_response(['error' => 'Tabla no existe. Ejecute la migración 006.'], 500);
      $stmt->bind_param('ssiii', $nombre, $alias, $activo, $id, $prov_id);
    }
    $stmt->execute();
    if ($stmt->affected_rows === 0) json_response(['error' => 'No encontrado o sin cambios'], 404);
    json_response(['ok' => true]);
  }
}

function eliminar($catalogo, $id) {
  $db = connect_db();
  $prov_id = get_request_proveedor_id($db);
  $table = $catalogo === 'palabras_clave' ? 'palabras_clave' : 'instituciones';
  if ($prov_id === null) {
    $stmt = $db->prepare("DELETE FROM `$table` WHERE id=? AND proveedor_id IS NULL");
    $stmt->bind_param('i', $id);
  } else {
    $stmt = $db->prepare("DELETE FROM `$table` WHERE id=? AND proveedor_id=?");
    $stmt->bind_param('ii', $id, $prov_id);
  }
  $stmt->execute();
  if ($stmt->affected_rows === 0) json_response(['error' => 'No encontrado'], 404);
  json_response(['ok' => true]);
}

// -------------------------------------------------------
// Export CSV
// -------------------------------------------------------
function export_csv($catalogo) {
  $db = connect_db();
  $prov_id = get_request_proveedor_id($db);
  // Override Content-Type para descarga
  header('Content-Type: text/csv; charset=utf-8');
  header('X-Content-Type-Options: nosniff');
  if ($catalogo === 'palabras_clave') {
    header('Content-Disposition: attachment; filename="palabras_clave.csv"');
    if ($prov_id === null) {
      $res = $db->query("SELECT palabra, variantes FROM palabras_clave WHERE activo=1 AND proveedor_id IS NULL ORDER BY palabra");
    } else {
      $stmt_e = $db->prepare("SELECT palabra, variantes FROM palabras_clave WHERE activo=1 AND proveedor_id = ? ORDER BY palabra");
      $stmt_e->bind_param('i', $prov_id);
      $stmt_e->execute();
      $res = $stmt_e->get_result();
    }
    echo "\xEF\xBB\xBF"; // BOM UTF-8
    // Calcular el número máximo de variantes para dimensionar las columnas
    $filas = [];
    while ($row = $res->fetch_assoc()) {
      $row['variantes'] = $row['variantes'] ? json_decode($row['variantes'], true) : [];
      $filas[] = $row;
    }
    $maxCols = 0;
    foreach ($filas as $row) {
      $maxCols = max($maxCols, count($row['variantes']));
    }
    $maxCols = max($maxCols, 1); // al menos 1 columna de variante
    $header = ['Palabra'];
    for ($i = 1; $i <= $maxCols; $i++) $header[] = "Variación $i";
    echo implode(';', $header) . "\r\n";
    foreach ($filas as $row) {
      $vars = $row['variantes'];
      $line = [csv_escape($row['palabra'])];
      for ($i = 0; $i < $maxCols; $i++) {
        $line[] = isset($vars[$i]) ? csv_escape($vars[$i]) : '';
      }
      echo implode(';', $line) . "\r\n";
    }
  } else {
    header('Content-Disposition: attachment; filename="instituciones.csv"');
    if ($prov_id === null) {
      $res = $db->query("SELECT nombre, alias FROM instituciones WHERE activo=1 AND proveedor_id IS NULL ORDER BY alias");
    } else {
      $stmt_e = $db->prepare("SELECT nombre, alias FROM instituciones WHERE activo=1 AND proveedor_id = ? ORDER BY alias");
      $stmt_e->bind_param('i', $prov_id);
      $stmt_e->execute();
      $res = $stmt_e->get_result();
    }
    echo "\xEF\xBB\xBF";
    echo "nombre;alias\r\n";
    while ($row = $res->fetch_assoc()) {
      echo csv_escape($row['nombre']) . ';' . csv_escape($row['alias']) . "\r\n";
    }
  }
  exit;
}

function csv_escape($value) {
  $value = (string)$value;
  if (strpbrk($value, ";\"\r\n") !== false) {
    return '"' . str_replace('"', '""', $value) . '"';
  }
  return $value;
}

// -------------------------------------------------------
// Import CSV
// -------------------------------------------------------
function import_csv($catalogo) {
  if (empty($_FILES['archivo']) || $_FILES['archivo']['error'] !== UPLOAD_ERR_OK) {
    $uploadErr = $_FILES['archivo']['error'] ?? -1;
    json_response(['error' => 'Archivo CSV no recibido (código ' . $uploadErr . '). Verifique que el servidor permite subidas de archivos.'], 400);
  }
  $maxSize = 2 * 1024 * 1024; // 2 MB
  if ($_FILES['archivo']['size'] > $maxSize) {
    json_response(['error' => 'El archivo supera el tamaño máximo de 2 MB'], 413);
  }

  $contenido = file_get_contents($_FILES['archivo']['tmp_name']);
  if ($contenido === false) {
    json_response(['error' => 'No se pudo leer el archivo subido'], 500);
  }
  // Eliminar BOM UTF-8 si existe
  $contenido = ltrim($contenido, "\xEF\xBB\xBF");
  $lineas = preg_split('/\r\n|\r|\n/', trim($contenido));
  if (count($lineas) < 2) json_response(['error' => 'El CSV no tiene datos suficientes (se necesita al menos cabecera + 1 fila)'], 422);

  // Auto-detectar separador: ';' o ','
  $primeraLinea = $lineas[0];
  $sep = substr_count($primeraLinea, ';') >= substr_count($primeraLinea, ',') ? ';' : ',';

  $db = connect_db();
  $prov_id = get_request_proveedor_id($db);
  $insertados  = 0;
  $actualizados = 0;
  $sin_cambios = 0;
  $errores = [];

  if ($catalogo === 'palabras_clave') {
    // Formato: Palabra;Variación 1;...;Variación N  (cabecera en fila 1)
    array_shift($lineas); // Saltar cabecera
    if ($prov_id === null) {
      $stmtPK = $db->prepare("INSERT INTO palabras_clave (palabra, variantes) VALUES (?, ?) ON DUPLICATE KEY UPDATE variantes=VALUES(variantes), updated_at=NOW()");
    } else {
      $stmtPK = $db->prepare("INSERT INTO palabras_clave (proveedor_id, palabra, variantes) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE variantes=VALUES(variantes), updated_at=NOW()");
    }
    if (!$stmtPK) {
      json_response(['error' => 'Tabla palabras_clave no existe. Ejecute la migración 006_palabras_clave_instituciones.sql'], 500);
    }
    foreach ($lineas as $nLinea => $linea) {
      $cols = str_getcsv(trim($linea), $sep, '"');
      $palabra = trim($cols[0] ?? '');
      if ($palabra === '') continue;
      $variantes = [];
      for ($i = 1; $i < count($cols); $i++) {
        $v = trim($cols[$i]);
        if ($v !== '') $variantes[] = $v;
      }
      $varJson = json_encode($variantes, JSON_UNESCAPED_UNICODE);
      if ($prov_id === null) {
        $stmtPK->bind_param('ss', $palabra, $varJson);
      } else {
        $stmtPK->bind_param('iss', $prov_id, $palabra, $varJson);
      }
      if ($stmtPK->execute()) {
        if ($stmtPK->affected_rows === 1)      $insertados++;
        elseif ($stmtPK->affected_rows === 2)  $actualizados++;
        else                                   $sin_cambios++;
      } else {
        $errores[] = "Línea " . ($nLinea + 2) . ": " . $db->error;
      }
    }
  } else {
    // Formato: nombre;alias  (cabecera en fila 1, igual que data/csv/instituciones.csv)
    array_shift($lineas); // Saltar cabecera
    if ($prov_id === null) {
      $stmtInst = $db->prepare("INSERT INTO instituciones (nombre, alias) VALUES (?, ?) ON DUPLICATE KEY UPDATE alias=VALUES(alias), updated_at=NOW()");
    } else {
      $stmtInst = $db->prepare("INSERT INTO instituciones (proveedor_id, nombre, alias) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE alias=VALUES(alias), updated_at=NOW()");
    }
    if (!$stmtInst) {
      json_response(['error' => 'Tabla instituciones no existe. Ejecute la migración 006_palabras_clave_instituciones.sql'], 500);
    }
    foreach ($lineas as $nLinea => $linea) {
      $cols = str_getcsv(trim($linea), $sep, '"');
      $nombre = trim($cols[0] ?? '');
      $alias  = trim($cols[1] ?? '');
      if ($nombre === '' || $alias === '') continue;
      if ($prov_id === null) {
        $stmtInst->bind_param('ss', $nombre, $alias);
      } else {
        $stmtInst->bind_param('iss', $prov_id, $nombre, $alias);
      }
      if ($stmtInst->execute()) {
        if ($stmtInst->affected_rows === 1)      $insertados++;
        elseif ($stmtInst->affected_rows === 2)  $actualizados++;
        else                                     $sin_cambios++;
      } else {
        $errores[] = "Línea " . ($nLinea + 2) . ": " . $db->error;
      }
    }
  }

  json_response([
    'ok'          => true,
    'insertados'  => $insertados,
    'actualizados'=> $actualizados,
    'sin_cambios' => $sin_cambios,
    'errores'     => $errores
  ]);
}
