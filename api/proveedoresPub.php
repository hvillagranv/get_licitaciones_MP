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

// Proveedor seleccionado
$proveedor = isset($_GET['proveedor']) ? trim($_GET['proveedor']) : '';
$action = isset($_GET['action']) ? trim($_GET['action']) : '';

// Obtener lista de proveedores (DISTINCT)
if ($action === 'lista') {
    $proveedores = [];
    $resultProveedores = $mysqli->query("
        SELECT DISTINCT ai.nombre_proveedor 
        FROM adjudicaciones_item ai
        WHERE ai.nombre_proveedor IS NOT NULL 
          AND ai.nombre_proveedor <> ''
        ORDER BY ai.nombre_proveedor ASC
    ");
    
    if ($resultProveedores) {
        while ($row = $resultProveedores->fetch_assoc()) {
            $proveedores[] = $row['nombre_proveedor'];
        }
    }
    
    echo json_encode([
        "proveedores" => $proveedores,
        "total" => count($proveedores)
    ]);
    exit;
}

// Licitaciones filtradas por proveedor (solo si hay selección)
$licitaciones = [];
$organismos = [];
$rutProveedor = '';

if ($proveedor !== '') {
    $sql = "
        SELECT DISTINCT
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
                SELECT GROUP_CONCAT(DISTINCT ai2.nombre_proveedor ORDER BY ai2.nombre_proveedor SEPARATOR ', ')
                FROM items i
                JOIN adjudicaciones_item ai2 ON ai2.item_id = i.id
                WHERE i.codigo_externo = l.codigo_externo
            ), '') AS proveedores_adjudicados,
            COALESCE((
                SELECT SUM(ai2.monto_unitario * ai2.cantidad)
                FROM items i
                JOIN adjudicaciones_item ai2 ON ai2.item_id = i.id
                WHERE i.codigo_externo = l.codigo_externo
            ), 0) AS monto_adjudicado_total
        FROM licitaciones l
        JOIN compradores c ON l.codigo_externo = c.codigo_externo
        JOIN items i ON i.codigo_externo = l.codigo_externo
        JOIN adjudicaciones_item ai ON ai.item_id = i.id
        WHERE l.codigo_externo IS NOT NULL
          AND ai.nombre_proveedor = ?
        ORDER BY l.fecha_publicacion DESC
    ";

    $stmt = $mysqli->prepare($sql);
    if (!$stmt) {
        http_response_code(500);
        echo json_encode(["error" => $mysqli->error]);
        exit;
    }
    $stmt->bind_param("s", $proveedor);
    $stmt->execute();
    $result = $stmt->get_result();
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $licitaciones[] = $row;
        }
    }
    $stmt->close();
    
    // Obtener RUT del proveedor
    if (!empty($licitaciones)) {
        $stmtRut = $mysqli->prepare("SELECT DISTINCT ai.rut_proveedor FROM adjudicaciones_item ai WHERE ai.nombre_proveedor = ? LIMIT 1");
        if ($stmtRut) {
            $stmtRut->bind_param("s", $proveedor);
            $stmtRut->execute();
            $resultRut = $stmtRut->get_result();
            if ($rowRut = $resultRut->fetch_assoc()) {
                $rutProveedor = $rowRut['rut_proveedor'] ?: '';
            }
            $stmtRut->close();
        }
    }
}

// Obtener organismos de las licitaciones del proveedor
if (!empty($licitaciones) && $proveedor !== '') {
    $datosSQL = "
        SELECT 
            l.codigo_externo,
            l.nombre as nombre_licitacion,
            l.estado,
            c.nombre_organismo,
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
        WHERE ai.nombre_proveedor = ?
          AND l.estado = 'Adjudicada'
        ORDER BY l.codigo_externo, i.id, ai.id
    ";
    
    $datosStmt = $mysqli->prepare($datosSQL);
    if ($datosStmt) {
        $datosStmt->bind_param("s", $proveedor);
        $datosStmt->execute();
        $datosResult = $datosStmt->get_result();
        
        while ($row = $datosResult->fetch_assoc()) {
            $organismos[] = $row;
        }
        
        $datosStmt->close();
    }
}

// Entregar JSON
echo json_encode([
    "licitaciones" => $licitaciones,
    "organismos" => $organismos,
    "rut_proveedor" => $rutProveedor,
    "nombre_proveedor" => $proveedor,
    "total" => count($licitaciones)
]);

// Mostrar tiempo de ejecución
$fin = microtime(true);
$tiempo = ($fin - $inicio) * 1000;
error_log("proveedoresPub.php ejecutado en {$tiempo}ms");

$mysqli->close();
exit;
