# 🔧 GUÍA RÁPIDA DE REMEDICIÓN

## ⚡ ACCIÓN INMEDIATA (Próximas 2 horas)

### 1. Cambiar Credenciales de BD
```bash
# Conectarse al servidor de hosting
# Ir a cPanel → MySQL Databases
# Cambiar contraseña del usuario hansenri_admin
# NUEVA CONTRASEÑA: usar generador seguro (https://bit.ly/3AXd5kZ)
```

**Credencial anterior COMPROMETIDA:**
```
Usuario: hansenri_admin
Contraseña: lEP5O3Ajhs  ❌ NO USAR MÁS
```

---

### 2. Crear archivo .env (NO subir a Git)
En la raíz del proyecto:

```bash
# Copiar archivo de ejemplo
cp .env.example .env

# Editar .env con nuevas credenciales
# DB_PASSWORD=TU_NUEVA_CONTRASEÑA_SEGURA_AQUI
```

**Generar contraseña segura:**
```bash
# En Terminal:
openssl rand -base64 32

# O usar online: https://password-generator.com/
# Mínimo 16 caracteres, mezclar: MAYÚS + minús + números + símbolos
```

---

### 3. Actualizar connectDB.js
Reemplazar con versión segura:

```bash
# Respaldar original
cp backend/connectDB.js backend/connectDB.js.backup

# Copiar versión segura
cp SECURE_connectDB.js backend/connectDB.js
```

**Instalar dotenv:**
```bash
npm install dotenv
```

---

### 4. Verificar que .env está en .gitignore
```bash
# Abrir .gitignore y asegurarse que contiene:
echo ".env" >> .gitignore

# Verificar
cat .gitignore | grep -i ".env"
```

---

### 5. Limpiar Historial de Git (IMPORTANTE)
Si las credenciales ya están en Git:

```bash
# ⚠️ SOLO SI USUARIO ÚNICO O AMBIENTE CONTROLADO
# Para repos compartidos, usar BFG Repo Cleaner (más seguro)

# Opción 1: Usando git-filter-branch
git filter-branch --index-filter \
  'git rm --cached --ignore-unmatch backend/connectDB.js licitacionesPub.php' \
  --prune-empty -f

# Opción 2: Usando BFG Repo Cleaner (RECOMENDADO)
# Descargar desde: https://rtyley.github.io/bfg-repo-cleaner/
bfg --delete-files "connectDB.js" --delete-files "*.php"

# Hacer force push
git push origin main --force
```

**⚠️ ADVERTENCIA:** Force push puede afectar a otros usuarios. Coordinar antes.

---

### 6. Desactivar display_errors en PHP
```bash
# Respaldar archivos PHP
for file in *.php backend/*.php; do
  cp "$file" "$file.backup"
done

# Editar cada .php y cambiar:
sed -i 's/ini_set.*display_errors.*/ini_set("display_errors", 0);/g' *.php
```

**Manual:** Buscar en cada `.php`:
```php
// ❌ CAMBIAR ESTO:
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);

// ✅ POR ESTO:
ini_set('display_errors', 0);
ini_set('log_errors', 1);
ini_set('error_log', '/var/log/php_errors.log');
```

---

### 7. Configurar CORS en server.js
```bash
# Reemplazar con versión segura
cp SECURE_server.js backend/server.js

# Instalar dependencias
npm install express-rate-limit helmet cors
```

**En .env agregar:**
```env
CORS_ORIGIN=https://tunominio.com,http://localhost:3000
```

---

### 8. Testing rápido
```bash
# Verificar que no hay credenciales en código
grep -r "lEP5O3Ajhs" .
grep -r "hansenri_admin" backend/
grep -r "hardcoded" .

# Resultado esperado: "No such file or directory" (sin matches)
```

---

## ✅ CHECKLIST ANTES DE DEPLOY

```
☐ Nuevas credenciales creadas en BD
☐ .env creado con nuevas credenciales
☐ .env en .gitignore
☐ connectDB.js actualizado
☐ Credenciales removidas de Git history
☐ display_errors desactivado en PHP
☐ CORS configurado restrictivo
☐ CORS_ORIGIN en .env
☐ npm install ejecutado
☐ Tests pasan localmente
☐ No hay credenciales en código (grep verify)
☐ npm audit sin vulnerabilidades críticas
```

---

## 🚀 DEPLOY A PRODUCCIÓN

```bash
# 1. Staging first (si está disponible)
git push origin staging
# Revisar cambios en staging

# 2. Production
git push origin main

# 3. En servidor de producción
ssh user@servidor
cd /path/to/app
git pull origin main
npm install
npm audit fix
# Crear .env a partir de .env.example
# Llenar credenciales nuevas en .env
# Reiniciar servicio
systemctl restart node-app  # o el servicio que uses
```

---

## 📋 Instalar Seguridad en Producción

### Para Node.js
```bash
npm install --save \
  express-rate-limit \
  helmet \
  dotenv \
  cors

npm audit fix
```

### Para PHP
```bash
# No necesita instalar nada, todo es nativo
# Solo asegurar que:
# - display_errors = Off
# - error_log configurado
# - Headers configurados
```

---

## 🔍 VERIFICACIÓN FINAL

### Prueba 1: Credenciales NO expuestas
```bash
# En local:
grep -r "lEP5O3Ajhs" .
grep -r "hansenri_admin" .  # Except .env
# Resultado esperado: NADA (empty)
```

### Prueba 2: CORS funciona correctamente
```bash
# En terminal, probar desde otro dominio
curl -H "Origin: https://otrositio.com" \
  -H "Access-Control-Request-Method: GET" \
  http://localhost:5500/api/licitaciones

# Resultado esperado: Error o status 403
# NO: "Access-Control-Allow-Origin: *"
```

### Prueba 3: Errores NO se muestran
```bash
# Intentar query inválida en PHP
# Resultado esperado: "Error interno del servidor"
# NO: "SQL Error: You have an error in your SQL syntax..."
```

---

## ⚠️ PROBLEMAS COMUNES Y SOLUCIONES

### Error: Module not found: dotenv
```bash
npm install dotenv
npm install dotenv --save
```

### Error: .env file not loaded
```bash
# Verificar que está en raíz del proyecto
ls -la | grep .env
# Debe estar al lado de package.json
```

### Error: CORS bloqueado
```bash
# Verificar CORS_ORIGIN en .env
# Debe incluir tu dominio sin path
CORS_ORIGIN=https://www.mikestio.com
# NO: https://www.mikestio.com/path
```

### Error: Credenciales incorrectas
```bash
# Verificar en BD:
# 1. Usuario existe y está activo
# 2. Contraseña es correcta
# 3. Puede acceder a hansenri_licitacionesMP
```

---

## 📞 SOPORTE

Si encuentras problemas:

1. Verificar que .env está en `.gitignore`
2. Verificar que .env tiene variables correctas
3. Verificar `npm audit` no tiene vulnerabilidades críticas
4. Reiniciar la aplicación
5. Revisar logs de errores

---

## 🎓 APRENDER MÁS

Recursos para el equipo:

- **OWASP Top 10:** https://owasp.org/www-project-top-ten/
- **Node.js Security:** https://nodejs.org/en/docs/guides/security/
- **PHP Security:** https://www.php.net/manual/en/security.php
- **Web API Security:** https://cheatsheetseries.owasp.org/

---

**Última actualización:** 11 Febrero 2026  
**Status:** 🔴 Crítico - Requiere atención inmediata
