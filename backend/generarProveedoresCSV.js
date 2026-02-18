import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './connectDB.js';
import { logMensaje } from './utils/logs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CSV_PATH = path.join(__dirname, '..', 'data', 'csv', 'proveedores.csv');

/**
 * Genera un CSV con la lista de proveedores y sus estadísticas
 */
async function generarProveedoresCSV() {
  try {
    logMensaje('📊 Iniciando generación de CSV de proveedores...', 'info');

    // Consultar proveedores con estadísticas
    const query = `
      SELECT 
        ai.nombre_proveedor,
        ai.rut_proveedor,
        COUNT(DISTINCT l.codigo_externo) AS total_licitaciones,
        COUNT(DISTINCT CASE WHEN l.estado = 'Adjudicada' THEN l.codigo_externo END) AS licitaciones_adjudicadas,
        COALESCE(SUM(ai.monto_unitario * ai.cantidad), 0) AS monto_total_adjudicado,
        MIN(l.fecha_publicacion) AS primera_licitacion,
        MAX(l.fecha_publicacion) AS ultima_licitacion,
        COUNT(DISTINCT c.nombre_organismo) AS organismos_distintos
      FROM adjudicaciones_item ai
      JOIN items i ON ai.item_id = i.id
      JOIN licitaciones l ON i.codigo_externo = l.codigo_externo
      JOIN compradores c ON l.codigo_externo = c.codigo_externo
      WHERE ai.nombre_proveedor IS NOT NULL 
        AND ai.nombre_proveedor <> ''
      GROUP BY ai.nombre_proveedor, ai.rut_proveedor
      ORDER BY monto_total_adjudicado DESC, total_licitaciones DESC
    `;

    const [rows] = await pool.query(query);

    if (!rows || rows.length === 0) {
      logMensaje('⚠️ No se encontraron proveedores en la base de datos', 'warning');
      return;
    }

    logMensaje(`✅ Se encontraron ${rows.length} proveedores`, 'info');

    // Crear encabezado del CSV
    const headers = [
      'nombre_proveedor',
      'rut_proveedor',
      'total_licitaciones',
      'licitaciones_adjudicadas',
      'monto_total_adjudicado',
      'primera_licitacion',
      'ultima_licitacion',
      'organismos_distintos'
    ];

    // Función para escapar valores CSV
    const escaparCSV = (valor) => {
      if (valor === null || valor === undefined) return '';
      const str = String(valor);
      // Si contiene comas, comillas o saltos de línea, encerrar en comillas
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Construir contenido del CSV
    let csvContent = headers.join(',') + '\n';

    for (const row of rows) {
      const valores = headers.map(header => {
        let valor = row[header];
        
        // Formatear fechas
        if ((header === 'primera_licitacion' || header === 'ultima_licitacion') && valor) {
          const fecha = new Date(valor);
          valor = fecha.toISOString().split('T')[0]; // YYYY-MM-DD
        }
        
        // Formatear monto
        if (header === 'monto_total_adjudicado') {
          valor = Number(valor).toFixed(2);
        }
        
        return escaparCSV(valor);
      });

      csvContent += valores.join(',') + '\n';
    }

    // Crear directorio si no existe
    const csvDir = path.dirname(CSV_PATH);
    if (!fs.existsSync(csvDir)) {
      fs.mkdirSync(csvDir, { recursive: true });
      logMensaje(`📁 Directorio creado: ${csvDir}`, 'info');
    }

    // Guardar archivo
    fs.writeFileSync(CSV_PATH, csvContent, 'utf-8');
    
    logMensaje(`✅ CSV generado exitosamente: ${CSV_PATH}`, 'success');
    logMensaje(`📊 Total de proveedores: ${rows.length}`, 'info');
    
    // Estadísticas adicionales
    const totalLicitaciones = rows.reduce((sum, row) => sum + Number(row.total_licitaciones), 0);
    const montoTotal = rows.reduce((sum, row) => sum + Number(row.monto_total_adjudicado), 0);
    
    logMensaje(`📈 Total licitaciones: ${totalLicitaciones}`, 'info');
    logMensaje(`💰 Monto total adjudicado: $${montoTotal.toLocaleString('es-CL')}`, 'info');

  } catch (error) {
    logMensaje(`❌ Error generando CSV de proveedores: ${error.message}`, 'error');
    console.error(error);
    throw error;
  }
}

/**
 * Función principal
 */
async function main() {
  try {
    await generarProveedoresCSV();
    process.exit(0);
  } catch (error) {
    logMensaje(`❌ Error en proceso principal: ${error.message}`, 'error');
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  main();
}

export { generarProveedoresCSV };
