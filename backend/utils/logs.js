import fs from 'fs';
import path from 'path';

// Crear carpeta de logs si no existe
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
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

// Función de log
export const logMensaje = (msg, tipo = 'info') => {
  const timestamp = new Date().toLocaleString('es-CL', {
    timeZone: 'America/Santiago'
  });
  const linea = `[${timestamp}] [${tipo.toUpperCase()}] ${msg}\n`;
  fs.appendFileSync(logPath, linea);
};
