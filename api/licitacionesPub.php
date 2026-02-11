<?php
// ✅ CONFIGURACIÓN SEGURA
error_reporting(E_ALL);
ini_set('display_errors', 0);  // ✅ No mostrar errores en producción
ini_set('log_errors', 1);
ini_set('error_log', '/var/log/php_errors.log');

// CSRF PROTECTION
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
  header('Access-Control-Allow-Headers: Content-Type, Authorization');
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

// Consulta: todas las licitaciones con estado "Publicada"
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
        l.tipo
    FROM licitaciones l
    JOIN compradores c ON l.codigo_externo = c.codigo_externo
    WHERE l.estado = 'Publicada'
    ORDER BY l.fecha_inicio DESC
";

$result = $mysqli->query($sql);
if (!$result) {
    http_response_code(500);
    echo json_encode(["error" => $mysqli->error]);
    exit;
}
$licitaciones = [];
while ($row = $result->fetch_assoc()) {
    $licitaciones[] = $row;
}

// Leer instituciones desde CSV
$instituciones = [];
$csvPath = __DIR__ . "/csv/instituciones.csv";
if (file_exists($csvPath)) {
    if (($handle = fopen($csvPath, "r")) !== FALSE) {
        $headers = fgetcsv($handle, 1000, ";");
        while (($data = fgetcsv($handle, 1000, ";")) !== FALSE) {
            $fila = array_combine($headers, $data);
            if (isset($fila['id'], $fila['alias'])) {
                $instituciones[] = [
                    "id" => $fila['id'],
                    "alias" => $fila['alias']
                ];
            }
        }
        fclose($handle);
    }
} else {
    // Si no existe, lo dejamos vacío pero no generamos error
    $instituciones = [];
}

// Entregar JSON
echo json_encode([
    "licitaciones" => $licitaciones,
    "instituciones" => $instituciones,
    "total" => count($licitaciones)
]);