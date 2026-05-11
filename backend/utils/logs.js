import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Crear carpeta de logs si no existe (en la raíz del proyecto)
const logsDir = path.join(__dirname, '..', '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Obtener fecha y hora de Santiago
const now = new Date();
const formatter = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'America/Santiago',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
});

const formatParts = formatter.formatToParts(now);
const parts = Object.fromEntries(formatParts.map(p => [p.type, p.value]));

const nombreArchivo = `log_${parts.year}-${parts.month}-${parts.day}_${parts.hour}-${parts.minute}-${parts.second}.txt`;
const logPath = path.join(logsDir, nombreArchivo);

// Control de inactividad
let ultimaActividad = Date.now();
let timeoutInterval = null;
let callbackInactividad = null;
const TIMEOUT_INACTIVIDAD = 45 * 1000; // 45 segundos

// Función para sanitizar datos sensibles
const sanitizarDatos = (msg) => {
  let sanitizado = String(msg);
  
  // Mascarar passwords
  sanitizado = sanitizado.replace(
    /password["\s:=]+["']?([^"'\s,}]+)/gi,
    'password: ***REDACTED***'
  );
  
  // Mascarar tokens
  sanitizado = sanitizado.replace(
    /token["\s:=]+["']?([^"'\s,}]+)/gi,
    'token: ***REDACTED***'
  );
  
  // Mascarar credenciales
  sanitizado = sanitizado.replace(
    /credential["\s:=]+["']?([^"'\s,}]+)/gi,
    'credential: ***REDACTED***'
  );
  
  // Mascarar JWT
  sanitizado = sanitizado.replace(
    /bearer\s+[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/gi,
    'Bearer ***JWT_REDACTED***'
  );
  
  // Mascarar API keys
  sanitizado = sanitizado.replace(
    /[Aa]pi[_-]?key["\s:=]+["']?([^"'\s,}]+)/gi,
    'api_key: ***REDACTED***'
  );
  
  // Mascarar emails (parcialmente) - solo si tiene @ y dominio válido
  sanitizado = sanitizado.replace(
    /\b([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g,
    '***@$2'
  );
  
  // Mascarar números de tarjeta (16 dígitos seguidos, no fechas)
  // Excluir si tiene formato de fecha (YYYY-MM-DD o DD-MM-YYYY)
  sanitizado = sanitizado.replace(
    /\b(?!(?:19|20)\d{2}[-/])\d{4}[\s-]\d{4}[\s-]\d{4}[\s-]\d{4}\b/g,
    '****-****-****-****'
  );
  
  // Mascarar números de teléfono chilenos (+56 9 XXXX XXXX)
  // Excluir si son fechas u horas
  sanitizado = sanitizado.replace(
    /\+?56[\s-]?9[\s-]?\d{4}[\s-]?\d{4}\b/g,
    '+56 9 ***-****'
  );
  
  return sanitizado;
};

// Función de log mejorada
export const logMensaje = (msg, tipo = 'info') => {
  ultimaActividad = Date.now();
  const timestamp = new Date().toLocaleString('es-CL', {
    timeZone: 'America/Santiago'
  });
  
  // Sanitizar el mensaje antes de loguearlo
  const msgSanitizado = sanitizarDatos(msg);
  const linea = `[${timestamp}] [${tipo.toUpperCase()}] ${msgSanitizado}\n`;
  
  try {
    fs.appendFileSync(logPath, linea);
  } catch (err) {
    console.error('Error escribiendo log:', err.message);
  }
};

// Iniciar monitor de inactividad
export const iniciarMonitorInactividad = () => {
  if (timeoutInterval) return; // Ya está iniciado
  
  logMensaje('⏱️ Monitor de inactividad iniciado (timeout: 45 segundos)', 'info');
  
  timeoutInterval = setInterval(() => {
    const tiempoInactivo = Date.now() - ultimaActividad;
    
    if (tiempoInactivo >= TIMEOUT_INACTIVIDAD) {
      if (typeof callbackInactividad === 'function') {
        try {
          callbackInactividad();
        } catch (err) {
          logMensaje(`⚠️ Error en callback de inactividad: ${err.message}`, 'warning');
        }
      }

      logMensaje('⏱️ Sin actividad por 45 segundos. Cerrando programa...', 'warning');
      clearInterval(timeoutInterval);
      setTimeout(() => {
        process.exit(0);
      }, 1000);
    }
  }, 10000); // Verificar cada 10 segundos
};

// Detener monitor de inactividad
export const detenerMonitorInactividad = () => {
  if (timeoutInterval) {
    clearInterval(timeoutInterval);
    timeoutInterval = null;
    logMensaje('⏱️ Monitor de inactividad detenido', 'info');
  }
};

export const registrarCallbackInactividad = (callback) => {
  callbackInactividad = callback;
};
