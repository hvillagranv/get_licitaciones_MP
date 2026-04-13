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
  header('Access-Control-Allow-Methods: GET, OPTIONS');
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

function normalize_text($value) {
  $value = preg_replace('/\s+/u', ' ', trim((string)$value));
  if ($value === '') {
    return '';
  }

  $value = function_exists('mb_strtolower') ? mb_strtolower($value, 'UTF-8') : strtolower($value);
  $value = strtr($value, [
    'á' => 'a',
    'é' => 'e',
    'í' => 'i',
    'ó' => 'o',
    'ú' => 'u',
    'ü' => 'u',
    'ñ' => 'n'
  ]);
  return $value;
}

function normalize_rut($value) {
  $value = strtoupper(trim((string)$value));
  $value = str_replace(['.', '-', ' '], '', $value);
  return $value;
}

function tokenize_text($text) {
  static $stopwords = [
    'para', 'como', 'entre', 'sobre', 'desde', 'hasta', 'donde', 'este', 'esta', 'estos', 'estas',
    'dela', 'del', 'las', 'los', 'una', 'uno', 'unos', 'unas', 'con', 'sin', 'por', 'que', 'sus',
    'ante', 'bajo', 'cada', 'contra', 'desde', 'durante', 'hacia', 'hasta', 'mediante', 'segun',
    'tras', 'sobre', 'municipalidad', 'servicio', 'servicios', 'adquisicion', 'adquisiciones',
    'licitacion', 'licitaciones', 'publica', 'publicas', 'publico', 'publicos', 'compra',
    'contratacion', 'suministro', 'prestacion', 'mantencion', 'mantenimiento', 'general',
    'provision', 'sistema', 'sistemas', 'apoyo', 'bases', 'base', 'tecnica', 'tecnico',
    'tecnicas', 'tecnicos', 'administrativa', 'administrativas', 'administrativo', 'administrativos'
  ];

  $parts = preg_split('/[^\p{L}\p{N}]+/u', normalize_text($text));
  $tokens = [];
  foreach ($parts as $part) {
    if ($part === '' || mb_strlen($part, 'UTF-8') < 4 || in_array($part, $stopwords, true)) {
      continue;
    }
    $tokens[] = $part;
  }

  return $tokens;
}

function compute_keyword_weights($rows, $limit = 20) {
  $weights = [];
  foreach ($rows as $row) {
    $text = implode(' ', [
      $row['nombre'] ?? '',
      $row['descripcion'] ?? '',
      $row['nombre_producto'] ?? '',
      $row['item_descripcion'] ?? ''
    ]);

    foreach (tokenize_text($text) as $token) {
      if (!isset($weights[$token])) {
        $weights[$token] = 0;
      }
      $weights[$token]++;
    }
  }

  arsort($weights);
  return array_slice($weights, 0, $limit, true);
}

function load_keyword_variants_from_csv($filePath) {
  $result = [
    'base_terms' => [],
    'variant_to_base' => []
  ];

  if (!is_file($filePath)) {
    return $result;
  }

  $handle = fopen($filePath, 'r');
  if (!$handle) {
    return $result;
  }

  $lineNumber = 0;
  while (($row = fgetcsv($handle, 0, ';')) !== false) {
    $lineNumber++;
    if ($lineNumber === 1) {
      continue;
    }

    $values = [];
    foreach ((array)$row as $column) {
      $column = trim((string)$column);
      if ($column !== '') {
        $values[] = $column;
      }
    }

    if (!$values) {
      continue;
    }

    $baseDisplay = $values[0];
    $baseNormalized = normalize_text($baseDisplay);
    if ($baseNormalized === '') {
      continue;
    }

    if (!isset($result['base_terms'][$baseNormalized])) {
      $result['base_terms'][$baseNormalized] = $baseDisplay;
    }

    foreach ($values as $value) {
      $normalized = normalize_text($value);
      if ($normalized === '') {
        continue;
      }
      if (!isset($result['variant_to_base'][$normalized])) {
        $result['variant_to_base'][$normalized] = $baseDisplay;
      }
    }
  }

  fclose($handle);
  return $result;
}

function normalize_score_0_100($rawScore, $maxScore) {
  if ($maxScore <= 0) {
    return 0;
  }

  $normalized = (int)round(($rawScore / $maxScore) * 100);
  if ($normalized < 0) {
    return 0;
  }
  if ($normalized > 100) {
    return 100;
  }

  return $normalized;
}

function provider_match_condition() {
  return "(
    ai.rut_proveedor = ?
    OR UPPER(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(ai.rut_proveedor, '')), '.', ''), '-', ''), ' ', '')) = ?
    OR TRIM(COALESCE(ai.nombre_proveedor, '')) = ?
    OR LOWER(TRIM(COALESCE(ai.nombre_proveedor, ''))) = ?
  )";
}

if (empty($_SESSION['user_id'])) {
  json_response(['ok' => false, 'error' => 'No autenticado'], 401);
}

$enfoque = strtolower(trim((string)($_GET['enfoque'] ?? 'sugeridas')));
if (!in_array($enfoque, ['sugeridas', 'listado'], true)) {
  $enfoque = 'sugeridas';
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

if (!provider_feature_available($mysqli)) {
  json_response(['ok' => false, 'error' => 'La funcionalidad requiere ejecutar la migración 005_usuarios_proveedores.sql'], 500);
}

$userId = (int)$_SESSION['user_id'];
$stmtProvider = $mysqli->prepare('
  SELECT p.id, p.nombre, p.rut
  FROM usuarios u
  LEFT JOIN proveedores p ON p.id = u.proveedor_id
  WHERE u.id = ?
  LIMIT 1
');
$stmtProvider->bind_param('i', $userId);
$stmtProvider->execute();
$providerResult = $stmtProvider->get_result();
$provider = $providerResult ? $providerResult->fetch_assoc() : null;

if (!$provider || empty($provider['id'])) {
  json_response(['ok' => false, 'error' => 'Tu usuario no tiene un proveedor asociado todavía'], 400);
}

$providerRut = $provider['rut'] ?? '';
$normalizedRut = normalize_rut($providerRut);
$providerName = trim((string)($provider['nombre'] ?? ''));
$normalizedProviderName = normalize_text($providerName);
$providerParams = [$providerRut, $normalizedRut, $providerName, $normalizedProviderName];

$sqlCategories = '
  SELECT
    COALESCE(NULLIF(TRIM(i.codigo_categoria), \'\'), CONCAT(\'TXT:\', LEFT(MD5(LOWER(TRIM(COALESCE(i.categoria, i.nombre_producto, \'\')))), 12))) AS categoria_clave,
    COALESCE(NULLIF(TRIM(i.categoria), \'\'), NULLIF(TRIM(i.nombre_producto), \'\'), \'Sin categoría\') AS categoria_nombre,
    COUNT(*) AS total_items,
    COUNT(DISTINCT l.codigo_externo) AS total_licitaciones
  FROM adjudicaciones_item ai
  JOIN items i ON i.id = ai.item_id
  JOIN licitaciones l ON l.codigo_externo = i.codigo_externo
  WHERE l.estado = \'Adjudicada\'
    AND ' . provider_match_condition() . '
  GROUP BY categoria_clave, categoria_nombre
  ORDER BY total_licitaciones DESC, total_items DESC
  LIMIT 20
';
$stmtCategories = $mysqli->prepare($sqlCategories);
$stmtCategories->bind_param('ssss', ...$providerParams);
$stmtCategories->execute();
$categoriesResult = $stmtCategories->get_result();
$topCategories = [];
$categoryKeys = [];
$categoryNames = [];
while ($row = $categoriesResult->fetch_assoc()) {
  $row['total_items'] = (int)$row['total_items'];
  $row['total_licitaciones'] = (int)$row['total_licitaciones'];
  $topCategories[] = $row;
  $categoryKeys[$row['categoria_clave']] = $row['categoria_nombre'];
  $categoryNames[normalize_text($row['categoria_nombre'])] = $row['categoria_nombre'];
}

$sqlInstitutions = '
  SELECT
    c.nombre_organismo,
    COUNT(DISTINCT l.codigo_externo) AS total_licitaciones
  FROM adjudicaciones_item ai
  JOIN items i ON i.id = ai.item_id
  JOIN licitaciones l ON l.codigo_externo = i.codigo_externo
  JOIN compradores c ON c.codigo_externo = l.codigo_externo
  WHERE l.estado = \'Adjudicada\'
    AND ' . provider_match_condition() . '
  GROUP BY c.nombre_organismo
  ORDER BY total_licitaciones DESC, c.nombre_organismo ASC
  LIMIT 15
';
$stmtInstitutions = $mysqli->prepare($sqlInstitutions);
$stmtInstitutions->bind_param('ssss', ...$providerParams);
$stmtInstitutions->execute();
$institutionsResult = $stmtInstitutions->get_result();
$topInstitutions = [];
$institutionMap = [];
while ($row = $institutionsResult->fetch_assoc()) {
  $row['total_licitaciones'] = (int)$row['total_licitaciones'];
  $topInstitutions[] = $row;
  $institutionMap[normalize_text($row['nombre_organismo'])] = $row['total_licitaciones'];
}

$sqlKeywords = '
  SELECT
    l.nombre,
    l.descripcion,
    i.categoria,
    i.nombre_producto,
    i.descripcion AS item_descripcion
  FROM adjudicaciones_item ai
  JOIN items i ON i.id = ai.item_id
  JOIN licitaciones l ON l.codigo_externo = i.codigo_externo
  WHERE l.estado = \'Adjudicada\'
    AND ' . provider_match_condition() . '
  ORDER BY l.fecha_adjudicacion DESC, l.fecha_publicacion DESC
  LIMIT 400
';
$stmtKeywords = $mysqli->prepare($sqlKeywords);
$stmtKeywords->bind_param('ssss', ...$providerParams);
$stmtKeywords->execute();
$keywordsResult = $stmtKeywords->get_result();
$keywordRows = [];
while ($row = $keywordsResult->fetch_assoc()) {
  $keywordRows[] = $row;
}

$keywordWeights = compute_keyword_weights($keywordRows, 20);
$keywordCatalog = load_keyword_variants_from_csv(__DIR__ . '/../data/csv/palabras_clave.csv');
$listedBaseTerms = array_values($keywordCatalog['base_terms']);
$listedVariantToBase = $keywordCatalog['variant_to_base'];

$sqlStats = '
  SELECT
    COUNT(DISTINCT l.codigo_externo) AS total_adjudicadas,
    COALESCE(SUM(ai.monto_unitario * ai.cantidad), 0) AS monto_total_adjudicado,
    MAX(l.fecha_adjudicacion) AS ultima_adjudicacion
  FROM adjudicaciones_item ai
  JOIN items i ON i.id = ai.item_id
  JOIN licitaciones l ON l.codigo_externo = i.codigo_externo
  WHERE l.estado = \'Adjudicada\'
    AND ' . provider_match_condition() . '
';
$stmtStats = $mysqli->prepare($sqlStats);
$stmtStats->bind_param('ssss', ...$providerParams);
$stmtStats->execute();
$statsResult = $stmtStats->get_result();
$historyStats = $statsResult ? $statsResult->fetch_assoc() : null;

$sqlPublished = '
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
    i.codigo_categoria,
    i.categoria,
    i.nombre_producto,
    i.descripcion AS item_descripcion
  FROM licitaciones l
  JOIN compradores c ON c.codigo_externo = l.codigo_externo
  LEFT JOIN items i ON i.codigo_externo = l.codigo_externo
  WHERE l.estado = \'Publicada\'
  ORDER BY l.fecha_publicacion DESC
  LIMIT 3000
';
$publishedResult = $mysqli->query($sqlPublished);
if (!$publishedResult) {
  json_response(['ok' => false, 'error' => 'No se pudieron calcular las sugerencias'], 500);
}

$suggestionsMap = [];
while ($row = $publishedResult->fetch_assoc()) {
  $code = $row['codigo'];
  if (!isset($suggestionsMap[$code])) {
    $suggestionsMap[$code] = [
      'codigo' => $row['codigo'],
      'nombre' => $row['nombre'],
      'descripcion' => $row['descripcion'],
      'institucion_nombre' => $row['institucion_nombre'],
      'monto_estimado' => $row['monto_estimado'],
      'unidad_monetaria' => $row['unidad_monetaria'],
      'fecha_inicio' => $row['fecha_inicio'],
      'fecha_final' => $row['fecha_final'],
      'estado' => $row['estado'],
      'tipo' => $row['tipo'],
      'score' => 0,
      'categorias_coincidentes' => [],
      'palabras_coincidentes' => [],
      'institucion_familiar' => false,
      '_tokens' => [],
      '_category_keys' => []
    ];
  }

  $entry = &$suggestionsMap[$code];
  $categoryKey = trim((string)($row['codigo_categoria'] ?? ''));
  $categoryName = trim((string)($row['categoria'] ?? ''));
  if ($categoryKey !== '' && isset($categoryKeys[$categoryKey])) {
    $entry['categorias_coincidentes'][$categoryKeys[$categoryKey]] = true;
    $entry['_category_keys'][$categoryKey] = true;
  } elseif ($categoryName !== '') {
    $normalizedCategoryName = normalize_text($categoryName);
    if (isset($categoryNames[$normalizedCategoryName])) {
      $entry['categorias_coincidentes'][$categoryNames[$normalizedCategoryName]] = true;
    }
  }

  $entry['_tokens'] = array_merge(
    $entry['_tokens'],
    tokenize_text(implode(' ', [
      $row['nombre'] ?? '',
      $row['descripcion'] ?? '',
      $row['nombre_producto'] ?? '',
      $row['item_descripcion'] ?? ''
    ]))
  );

  unset($entry);
}

$suggestions = [];
$maxAffinityScore = 18;
foreach ($suggestionsMap as $entry) {
  $rawScore = 0;
  $reasons = [];
  $keywordPriority = 0;
  $institutionPriority = 0;
  $categoryPriority = 0;

  $institutionKey = normalize_text($entry['institucion_nombre']);
  if (isset($institutionMap[$institutionKey])) {
    $entry['institucion_familiar'] = true;
    $institutionWeight = min(4, 1 + (int)floor($institutionMap[$institutionKey] / 2));
    $rawScore += $institutionWeight;
    $institutionPriority = $institutionWeight;
    $reasons[] = 'Ya has sido adjudicado por esta institución';
  }

  if (!empty($entry['categorias_coincidentes'])) {
    $categoryWeight = min(8, count($entry['categorias_coincidentes']) * 3);
    $rawScore += $categoryWeight;
    $categoryPriority = count($entry['categorias_coincidentes']);
    $reasons[] = 'Coincide con categorías históricas del proveedor';
  }

  if ($enfoque === 'listado') {
    $textoLicitacion = normalize_text(implode(' ', [
      $entry['nombre'] ?? '',
      $entry['descripcion'] ?? ''
    ]));

    foreach ($listedVariantToBase as $variant => $baseTerm) {
      if ($variant === '' || mb_strlen($variant, 'UTF-8') < 3) {
        continue;
      }

      $pattern = '/(^|[^[:alnum:]])' . preg_quote($variant, '/') . '([^[:alnum:]]|$)/u';
      if (preg_match($pattern, $textoLicitacion)) {
        $entry['palabras_coincidentes'][$baseTerm] = true;
      }
    }

    if (!empty($entry['palabras_coincidentes'])) {
      $keywordWeight = min(6, count($entry['palabras_coincidentes']));
      $rawScore += $keywordWeight;
      $keywordPriority = count($entry['palabras_coincidentes']);
      $reasons[] = 'Coincide con palabras clave definidas en el listado';
    }
  } else {
    $uniqueTokens = array_unique($entry['_tokens']);
    foreach ($uniqueTokens as $token) {
      if (!isset($keywordWeights[$token])) {
        continue;
      }
      $entry['palabras_coincidentes'][$token] = true;
    }

    if (!empty($entry['palabras_coincidentes'])) {
      $keywordWeight = min(6, count($entry['palabras_coincidentes']));
      $rawScore += $keywordWeight;
      $keywordPriority = count($entry['palabras_coincidentes']);
      $reasons[] = 'Contiene términos frecuentes en tus adjudicaciones';
    }
  }

  if ($rawScore <= 0) {
    continue;
  }

  $entry['score_raw'] = $rawScore;
  $entry['score_max'] = $maxAffinityScore;
  $entry['score'] = normalize_score_0_100($rawScore, $maxAffinityScore);
  $entry['priority_keyword'] = $keywordPriority;
  $entry['priority_institucion'] = $institutionPriority;
  $entry['priority_categoria'] = $categoryPriority;
  $entry['razones'] = $reasons;
  $entry['categorias_coincidentes'] = array_values(array_keys($entry['categorias_coincidentes']));
  $entry['palabras_coincidentes'] = array_slice(array_values(array_keys($entry['palabras_coincidentes'])), 0, 8);
  unset($entry['_tokens'], $entry['_category_keys']);
  $suggestions[] = $entry;
}

usort($suggestions, function ($a, $b) {
  if (($a['priority_keyword'] ?? 0) !== ($b['priority_keyword'] ?? 0)) {
    return ($b['priority_keyword'] ?? 0) <=> ($a['priority_keyword'] ?? 0);
  }

  if (($a['priority_institucion'] ?? 0) !== ($b['priority_institucion'] ?? 0)) {
    return ($b['priority_institucion'] ?? 0) <=> ($a['priority_institucion'] ?? 0);
  }

  if (($a['priority_categoria'] ?? 0) !== ($b['priority_categoria'] ?? 0)) {
    return ($b['priority_categoria'] ?? 0) <=> ($a['priority_categoria'] ?? 0);
  }

  if (($a['score'] ?? 0) !== ($b['score'] ?? 0)) {
    return ($b['score'] ?? 0) <=> ($a['score'] ?? 0);
  }

  return strcmp((string)($b['fecha_inicio'] ?? ''), (string)($a['fecha_inicio'] ?? ''));
});

$suggestions = array_slice($suggestions, 0, 100);

json_response([
  'ok' => true,
  'enfoque' => $enfoque,
  'proveedor' => [
    'id' => (int)$provider['id'],
    'nombre' => $provider['nombre'],
    'rut' => $provider['rut'] ?: null
  ],
  'perfil' => [
    'total_adjudicadas' => (int)($historyStats['total_adjudicadas'] ?? 0),
    'monto_total_adjudicado' => (float)($historyStats['monto_total_adjudicado'] ?? 0),
    'ultima_adjudicacion' => $historyStats['ultima_adjudicacion'] ?? null,
    'score_maximo' => $maxAffinityScore,
    'categorias' => $topCategories,
    'instituciones' => $topInstitutions,
    'palabras_clave' => $enfoque === 'listado' ? array_slice($listedBaseTerms, 0, 20) : array_keys($keywordWeights)
  ],
  'sugerencias' => $suggestions,
  'total' => count($suggestions)
]);