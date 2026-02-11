# ✅ Corrección de Credenciales de Base de Datos

## Vulnerabilidad Identificada
Las credenciales de la base de datos estaban **hardcodeadas** en tres archivos PHP:
- `licitacionesPub.php`
- `organismosPub.php`  
- `proveedoresPub.php`

### Antes (INSEGURO ❌)
```php
$host = "162.241.60.15";
$user = "hansenri_admin";
$pass = "lEP5O3Ajhs";
$dbname = "hansenri_licitacionesMP";
```

## Cambios Implementados

### 1. ✅ Credenciales desde Variables de Entorno
Todos los archivos PHP ahora cargan credenciales desde `getenv()`:

```php
$host = getenv('DB_HOST');
$user = getenv('DB_USER');
$pass = getenv('DB_PASSWORD');
$dbname = getenv('DB_NAME');

// Validación estricta
if (!$host || !$user || !$pass || !$dbname) {
  http_response_code(500);
  echo json_encode(['error' => 'Configuración incompleta']);
  exit;
}
```

### 2. ✅ Secretos Solo en .env (Git Ignored)
- `.env` contiene credenciales reales (**NO subir a git**)
- `.env.example` contiene plantilla con valores placeholder
- `.gitignore` ya incluye `.env`

### 3. ✅ Headers de Seguridad Añadidos
```php
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('X-XSS-Protection: 1; mode=block');
header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
```

### 4. ✅ CORS Restrictivo Implementado
```php
$allowed_origins = [
  'https://tunominio.com',
  'https://www.tunominio.com',
  'http://localhost:3000'
];
```

### 5. ✅ Error Handling Seguro
- Errores detallados **NO mostrados** en producción
- `display_errors = 0`
- Mensajes genéricos al cliente: "Error interno del servidor"
- Logs dirigidos a `/var/log/php_errors.log`

## Archivos Afectados

| Archivo | Estado |
|---------|--------|
| `licitacionesPub.php` | ✅ Corregido |
| `organismosPub.php` | ✅ Corregido |
| `proveedoresPub.php` | ✅ Corregido |
| `.env` | ✅ Existente (Git ignored) |
| `.env.example` | ✅ Creado (template seguro) |

## Pasos Siguientes

### 1. Cambiar la Contraseña en la Base de Datos
⚠️ **CRÍTICO**: La contraseña `lEP5O3Ajhs` ahora es pública en git history. Debe ser cambiada:

```bash
# Conectar a MySQL y ejecutar:
ALTER USER 'hansenri_admin'@'localhost' IDENTIFIED BY 'nueva_contraseña_segura';
FLUSH PRIVILEGES;
```

### 2. Actualizar .env con Nueva Contraseña
```bash
# En tu servidor, editar .env:
DB_PASSWORD=nueva_contraseña_segura
```

### 3. Actualizar CORS_ORIGIN
En `.env`, actualizar con tus dominios reales:
```env
CORS_ORIGIN=https://tudominio.com,https://www.tudominio.com
```

### 4. Verificar Configuración
```bash
# Confirmar que NO hay credenciales en código
grep -r "hansenri_admin\|lEP5O3Ajhs\|162.241.60.15" backend/ --include="*.js" --include="*.php"

# Resultado esperado: VACÍO
```

## Beneficios de Seguridad

| Aspecto | Antes | Después |
|--------|-------|---------|
| Credenciales expuestas | ❌ Hardcodeadas en PHP | ✅ Solo en .env |
| Control de errores | ❌ Detallados (info leak) | ✅ Genéricos y seguros |
| Headers de seguridad | ❌ No implementados | ✅ Completos |
| CORS | ❌ Abierto a todo | ✅ Restringido |
| Git history | ❌ Secretos visibles | ✅ Limpio (para adelante) |

## Notas Importantes

1. **Git History**: Las credenciales aún están en el histórico de git. Si el repo es privado, considere sellar el acceso. Si es público, **debe cambiar la contraseña inmediatamente**.

2. **Ambiente Development**: Para desarrollo local, copiar `.env.example` a `.env` y llenar con credenciales locales.

3. **Ambiente Production**: El servidor de producción debe tener un archivo `.env` secure con credenciales reales (nunca checksueado en git).

4. **Variables de Entorno en Hosting**: Si usa hosting compartido sin acceso a usar `.env`, contacte al proveedor sobre cómo inyectar variables de entorno.

---
**🔒 Seguridad mejorada. Credenciales externalizadas correctamente.**
