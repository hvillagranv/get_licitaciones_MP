<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

// Parámetros de conexión
$host = "localhost"; // o el host que te dé tu proveedor
$user = "hansenri_admin";
$pass = "lEP5O3Ajhs";
$dbname = "hansenri_licitacionesMP";

// ⏱️ Medir inicio
$inicio = microtime(true);

// Activar compresión si el navegador lo permite
if (!ob_start("ob_gzhandler")) ob_start();

// Headers correctos para JSON
header('Content-Type: application/json; charset=utf-8');

// Parámetros de conexión
$mysqli = new mysqli($host, $user, $pass, $dbname);

// Verificar conexión
if ($mysqli->connect_errno) {
    http_response_code(500);
    echo json_encode(["error" => "Error al conectar a la base de datos"]);
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
        l.fecha_cierre AS fecha_final
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