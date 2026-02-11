import dotenv from 'dotenv';
import { pool } from './connectDB.js';
import { guardarDetallesEnBD } from './guardarBD.js';
import { logMensaje } from './utils/logs.js';
import fs from 'fs';

dotenv.config();

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const ticket = process.env.TICKET;
if (!ticket) {
  console.error('❌ ERROR: TICKET no está configurado en .env');
  process.exit(1);
}
const esperar = (ms) => new Promise(res => setTimeout(res, ms));
const NO_ENCONTRADOS_PATH = './no_encontrados.txt';

const intentarFetchDetalleLicitacion = async (codigo, maxIntentos = 3) => {
  const url = `https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json?codigo=${codigo}&ticket=${ticket}`;
  for (let intento = 1; intento <= maxIntentos; intento++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data?.Listado?.[0] || null;
    } catch (err) {
      if (intento === maxIntentos) {
        logMensaje(`❌ Error al obtener ${codigo} después de ${maxIntentos} intentos: ${err.message}`, 'error');
        return null;
      }
      await esperar(1000 * intento);
    }
  }
};

const toISOStringSafe = (fecha) => {
  try {
    return fecha ? new Date(fecha).toISOString() : null;
  } catch {
    return null;
  }
};

const fechasSonDiferentes = (fechaBD, fechaAPI) => {
  if (!fechaBD && !fechaAPI) return false;
  if (!fechaBD || !fechaAPI) return true;
  const d1 = new Date(fechaBD);
  const d2 = new Date(fechaAPI);
  d1.setMilliseconds(0);
  d2.setMilliseconds(0);
  return d1.getTime() !== d2.getTime();
};

// Formatea fecha para log en horario de Chile (texto legible)
function fechaChileStr(fecha) {
  if (!fecha) return '';
  return new Date(fecha).toLocaleString('es-CL', {
    timeZone: 'America/Santiago',
    hour12: false
  });
}

function fechaChileSQL(fecha) {
  if (!fecha) return null;
  // Devuelve 'YYYY-MM-DD HH:mm:ss' en horario de Chile
  return new Date(fecha)
    .toLocaleString('sv-SE', { timeZone: 'America/Santiago', hour12: false })
    .replace('T', ' ');
}

function guardarNoEncontrado(codigo) {
  fs.appendFileSync(NO_ENCONTRADOS_PATH, `${codigo}\n`);
}

export const verificarEstados = async () => {
  logMensaje('🔍 Verificando licitaciones "Publicada" con fecha_cierre vencida...', 'info');
  const [publicadas] = await pool.query(`
    SELECT codigo_externo, estado, fecha_cierre
    FROM licitaciones
    WHERE estado = 'Publicada' AND fecha_cierre <= NOW()
    ORDER BY fecha_cierre ASC
  `);

  // Nuevo: informar cuántas serán revisadas
  logMensaje(`📊 Publicadas a revisar: ${publicadas.length}`, 'info');

  for (const row of publicadas) {
    const mesRow = row.fecha_cierre ? new Date(row.fecha_cierre).getMonth() + 1 : null;
    const anioRow = row.fecha_cierre ? new Date(row.fecha_cierre).getFullYear() : null;
    const claveMes = mesRow && anioRow ? `${anioRow}-${mesRow}` : null;
    
    const detalle = await intentarFetchDetalleLicitacion(row.codigo_externo);
    if (!detalle) continue;

    const nuevoEstado = detalle.Estado;
    const fechaCierreAPI = detalle.Fechas?.FechaCierre || null;
    const hayCambioEstado = nuevoEstado && nuevoEstado !== row.estado;
    const hayCambioFechaCierre = fechasSonDiferentes(row.fecha_cierre, fechaCierreAPI);

    if (hayCambioEstado || hayCambioFechaCierre) {
      let mensaje = `📄 Licitación ${row.codigo_externo}`;
      if (hayCambioEstado) {
        mensaje += `\n🔄 Estado: '${row.estado}' → '${nuevoEstado}'`;
      }
      if (hayCambioFechaCierre) {
        mensaje += `\n📅 fecha_cierre: BD = ${fechaChileStr(row.fecha_cierre)} → API = ${fechaChileStr(fechaCierreAPI)}`;
      }

      // 🔧 Reescribir correctamente fechas internas para la BD
      detalle.Fechas = {
        ...detalle.Fechas,
        FechaCierre: fechaChileSQL(fechaCierreAPI),
      };

      logMensaje(mensaje, 'info');
      await guardarDetallesEnBD(detalle);
      await esperar(1000);
    }
  }
  


  logMensaje('🔍 Verificando licitaciones "Cerrada" con fecha_adjudicacion vencida...', 'info');
  const [cerradas] = await pool.query(`
    SELECT codigo_externo, estado, fecha_adjudicacion
    FROM licitaciones
    WHERE estado = 'Cerrada' AND fecha_adjudicacion >= NOW() - INTERVAL 1 WEEK AND fecha_adjudicacion <= NOW()
    ORDER BY fecha_adjudicacion DESC
  `);

  // Nuevo: informar cuántas serán revisadas
  logMensaje(`📊 Cerradas a revisar: ${cerradas.length}`, 'info');

  let mesActual = null;
  let idxMes = 0;
  let contadorExitosos = 0;
  let contadorNoExitosos = 0;
  let contadorSinCambios = 0;
  for (const row of cerradas) {
    const mesRow = row.fecha_adjudicacion ? new Date(row.fecha_adjudicacion).getMonth() + 1 : null;
    const anioRow = row.fecha_adjudicacion ? new Date(row.fecha_adjudicacion).getFullYear() : null;
    const claveMes = mesRow && anioRow ? `${anioRow}-${mesRow}` : null;

    if (claveMes && claveMes !== mesActual) {
      if (mesActual !== null) {
        logMensaje(
          `📊 Resumen ${mesActual}: Total revisados ${idxMes}, Exitosos ${contadorExitosos}, No exitosos ${contadorNoExitosos}, Sin cambios ${contadorSinCambios}`,
          'info'
        );
      }
      mesActual = claveMes;
      idxMes = 0;
      contadorExitosos = 0;
      contadorNoExitosos = 0;
      contadorSinCambios = 0;

      logMensaje(`📆 Revisando mes: ${anioRow}-${mesRow.toString().padStart(2, '0')}`, 'info');
    }

    // Incrementar numeración para este mes
    idxMes++;

    const detalle = await intentarFetchDetalleLicitacion(row.codigo_externo);
    if (!detalle) {
      contadorNoExitosos++;
      logMensaje(`[#${idxMes}] ❌ ${row.codigo_externo} no exitoso (sin detalle)`, 'warning');
      guardarNoEncontrado(row.codigo_externo);
      continue;
    }

    const nuevoEstado = detalle.Estado;
    const fechaAdjAPI = detalle.Fechas?.FechaAdjudicacion || null;
    const hayCambioEstado = nuevoEstado && nuevoEstado !== row.estado;
    const hayCambioFechaAdj = fechasSonDiferentes(row.fecha_adjudicacion, fechaAdjAPI);

    if (hayCambioEstado || hayCambioFechaAdj) {
      contadorExitosos++;
      let mensaje = `[#${idxMes}] 📄 Licitación ${row.codigo_externo}`;
      if (hayCambioEstado) {
        mensaje += `\n🔄 Estado: '${row.estado}' → '${nuevoEstado}'`;
      }
      if (hayCambioFechaAdj) {
        mensaje += `\n📅 fecha_adjudicacion: BD = ${fechaChileStr(row.fecha_adjudicacion)} → API = ${fechaChileStr(fechaAdjAPI)}`;
      }

      // Guardar en BD con fecha Chile si corresponde
      detalle.Fechas = {
        ...detalle.Fechas,
        FechaAdjudicacion: fechaChileSQL(fechaAdjAPI),
      };

      logMensaje(mensaje, 'info');
      await guardarDetallesEnBD(detalle);
      await esperar(1000);
    } else {
      contadorSinCambios++;
      logMensaje(`[#${idxMes}] 🔇 ${row.codigo_externo} sin cambios`, 'info');
    }
  }

  // Al terminar el ciclo, loguea el último mes
  if (mesActual !== null) {
    logMensaje(
      `📊 Resumen ${mesActual}: Total revisados ${idxMes}, Exitosos ${contadorExitosos}, No exitosos ${contadorNoExitosos}, Sin cambios ${contadorSinCambios}`,
      'info'
    );
  }

  logMensaje('✅ Verificación final de estados completada.', 'success');
};

verificarEstados()
  .then(async () => {
    await pool.end();
    logMensaje('🛑 Conexión cerrada correctamente. Proceso finalizado.', 'info');
    process.exit(0);
  })
  .catch(async (err) => {
    logMensaje(`❌ Error fatal: ${err.message}`, 'error');
    await pool.end();
    process.exit(1);
  });
