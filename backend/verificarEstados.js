import { pool } from './connectDB.js';
import { guardarDetallesEnBD } from './guardarBD.js';
import { logMensaje } from './utils/logs.js';

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const ticket = '0F702DFA-2D0B-4243-897A-84985C4FCA73';
const esperar = (ms) => new Promise(res => setTimeout(res, ms));

const fetchDetalleLicitacion = async (codigo) => {
  const url = `https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json?codigo=${codigo}&ticket=${ticket}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data?.Listado?.[0] || null;
  } catch (err) {
    return null;
  }
};

export const verificarEstados = async () => {
  const hoy = new Date().toISOString().split('T')[0];

  logMensaje('🔍 Verificando licitaciones "Publicada" con fecha_cierre vencida...', 'info');
  const [publicadas] = await pool.query(`
    SELECT codigo_externo, estado, fecha_cierre
    FROM licitaciones
    WHERE estado = 'Publicada' AND DATE(fecha_cierre) <= ?
  `, [hoy]);

  for (const row of publicadas) {
    const detalle = await fetchDetalleLicitacion(row.codigo_externo);
    if (!detalle) continue;

    const nuevoEstado = detalle.Estado;
    if (nuevoEstado && nuevoEstado !== row.estado) {
      logMensaje(`🔄 Cambio detectado en ${row.codigo_externo}: '${row.estado}' → '${nuevoEstado}'`, 'info');
      await guardarDetallesEnBD(detalle);
      await esperar(1000);
    }
  }

  logMensaje('🔍 Verificando licitaciones "Cerrada" con fecha_adjudicacion vencida...', 'info');
  const [cerradas] = await pool.query(`
    SELECT codigo_externo, estado, fecha_adjudicacion
    FROM licitaciones
    WHERE estado = 'Cerrada' AND DATE(fecha_adjudicacion) <= ?
  `, [hoy]);

  for (const row of cerradas) {
    const detalle = await fetchDetalleLicitacion(row.codigo_externo);
    if (!detalle) continue;

    const nuevoEstado = detalle.Estado;
    if (nuevoEstado && nuevoEstado !== row.estado) {
      logMensaje(`🔄 Cambio detectado en ${row.codigo_externo}: '${row.estado}' → '${nuevoEstado}'`, 'info');
      await guardarDetallesEnBD(detalle);
      await esperar(1000);
    }
  }

  logMensaje('✅ Verificación final de estados completada.', 'success');
};