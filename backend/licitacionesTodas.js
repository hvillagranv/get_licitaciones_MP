import fs from 'fs';
import path from 'path';
import PQueue from 'p-queue';
import dotenv from 'dotenv';
import { guardarDetallesEnBD } from './guardarBD.js';
import { logMensaje } from './utils/logs.js';
import { fileURLToPath } from 'url';
import { pool } from './connectDB.js';

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

// === CONFIGURACIÓN GENERAL ===
const ticket = process.env.TICKET;
if (!ticket) {
  console.error('❌ ERROR: TICKET no está configurado en .env');
  process.exit(1);
}
const CONCURRENCIA_ESTADO = 1;
const CONCURRENCIA_DETALLES = 20;
const TIEMPO_ESPERA_FECHAS = 2000;
const estados = ['todos'];

const esperar = (ms) => new Promise(res => setTimeout(res, ms));
const fallidosPendientes = new Set();
const queueFallidos = new PQueue({ concurrency: 1 });

const fetchJSON = async (url, maxIntentos = 5) => {
  let intento = 0;
  while (intento < maxIntentos) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      intento++;
      if (intento < maxIntentos) await esperar(1000 * intento);
    }
  }
  return null;
};

const obtenerDetallesLicitacionConReintentos = async (codigo, maxIntentos = 3) => {
  const url = `https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json?codigo=${codigo}&ticket=${ticket}`;
  const data = await fetchJSON(url, maxIntentos);

  // 🚫 Si responde con Listado vacío, no seguir intentando
  if (data && Array.isArray(data.Listado) && data.Listado.length === 0) {
    logMensaje(`❌ Código ${codigo} respondió con listado vacío. Ignorado.`, 'warning');
    return '__LISTADO_VACIO__';
  }

  return data?.Listado?.[0] || null;
};

const reintentarDetalleHastaExito = async (codigo) => {
  const maxIntentos = 7;
  for (let intento = 1; intento <= maxIntentos; intento++) {
    const detalle = await obtenerDetallesLicitacionConReintentos(codigo, 3);
    if (detalle) {
      await guardarDetallesEnBD(detalle);
      fallidosPendientes.delete(codigo);
      return;
    }
    logMensaje(`🔁 Fallido persistente ${codigo}, intento ${intento}/${maxIntentos}, reintentando en 15s...`, 'warning');
    if (intento < maxIntentos) {
      await esperar(15000);
    }
  }

  logMensaje(`❌ Fallido permanente ${codigo} tras ${maxIntentos} intentos.`, 'error');
};

const obtenerDetallesLicitacionRobusto = async (codigo) => {
  const detalle = await obtenerDetallesLicitacionConReintentos(codigo, 5);

  // 🚫 Evitar agregar si listado estaba vacío
  if (detalle === '__LISTADO_VACIO__') {
    return null;
  }

  if (!detalle) {
    if (!fallidosPendientes.has(codigo)) {
      fallidosPendientes.add(codigo);
      queueFallidos.add(() => reintentarDetalleHastaExito(codigo));
    }
  }

  return detalle;
};

const chunkArray = (array, size = 300) => {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

// ✅ Solo retorna las licitaciones nuevas, y registra los inválidos en el log general
const obtenerSoloNuevas = async (licitaciones) => {
  const codigosInvalidos = licitaciones.filter(l => !l.CodigoExterno || l.CodigoExterno.trim() === '');
  if (codigosInvalidos.length > 0) {
    logMensaje(`⚠️ Códigos inválidos omitidos: ${codigosInvalidos.length}`, 'warning');
    const ejemplos = codigosInvalidos.slice(0, 10).map((l, i) =>
      `#${i + 1}: ${JSON.stringify(l)}`).join('\n');
    logMensaje(`📋 Ejemplos de licitaciones inválidas:\n${ejemplos}${codigosInvalidos.length > 10 ? '\n... (más omitidos)' : ''}`, 'warning');
  }

  const codigos = licitaciones
    .map(l => l.CodigoExterno)
    .filter(c => c && c.trim() !== '')
    .map(c => c.trim().toUpperCase());

  const chunks = chunkArray(codigos, 300);
  const existentesSet = new Set();

  for (const chunk of chunks) {
    const placeholders = chunk.map(() => '?').join(',');
    const [rows] = await pool.query(
      `SELECT codigo_externo FROM licitaciones WHERE codigo_externo IN (${placeholders})`,
      chunk
    );
    for (const row of rows) {
      const codigo = row.codigo_externo?.trim().toUpperCase();
      if (codigo) existentesSet.add(codigo);
    }
  }

  logMensaje(`🧩 Códigos existentes cargados: ${existentesSet.size}`, 'info');

  const resultado = licitaciones.filter(l => {
    const codigo = l.CodigoExterno?.trim().toUpperCase();
    return codigo && !existentesSet.has(codigo);
  });

  return resultado;
};

const generarFechas = (inicio, termino = null) => {
  const fechas = [];

  const [y1, m1, d1] = inicio.split('-').map(Number);
  const actual = new Date(y1, m1 - 1, d1);

  let fin;
  if (termino) {
    const [y2, m2, d2] = termino.split('-').map(Number);
    fin = new Date(y2, m2 - 1, d2);
  } else {
    fin = new Date(); // Hoy
  }

  while (actual <= fin) {
    fechas.push(
      String(actual.getDate()).padStart(2, '0') +
      String(actual.getMonth() + 1).padStart(2, '0') +
      actual.getFullYear()
    );
    actual.setDate(actual.getDate() + 1);
  }

  return fechas;
};

const procesarFechaEstado = async (fecha, estado, queueDetalles) => {
  const url = `https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json?fecha=${fecha}&estado=${estado}&ticket=${ticket}`;
  let intento = 0;
  const MAX_INTENTOS = 5;

  while (intento < MAX_INTENTOS) {
    const data = await fetchJSON(url, 1);
    intento++;

    if (!data || !Array.isArray(data.Listado)) {
      logMensaje(`❌ Respuesta inválida en ${estado} - ${fecha} (intento ${intento})`, 'error');
      await esperar(2000 * intento);
      continue;
    }

    const licitaciones = data.Listado;
    const nuevas = await obtenerSoloNuevas(licitaciones);

    logMensaje(`📄 ${estado} - ${fecha}: Obtenidas = ${licitaciones.length}, Nuevas = ${nuevas.length}`, 'info');

    if (nuevas.length === 0) {
      logMensaje(`🔇 ${estado} - ${fecha}: Sin nuevas licitaciones`, 'info');
    }

    for (const lic of nuevas) {
      const codigo = lic.CodigoExterno?.trim();
      if (!codigo) continue;

      queueDetalles.add(async () => {
        const detalle = await obtenerDetallesLicitacionRobusto(codigo);
        if (detalle) {
          await guardarDetallesEnBD(detalle);
        }
      });
    }

    return;
  }

  logMensaje(`❌ ${estado} - ${fecha} falló tras ${MAX_INTENTOS} intentos`, 'error');
};

const main = async () => {
  const fechaInicio = '2023-04-01';
  // Ajusta según tus necesidades
  const fechas = generarFechas(fechaInicio);

  const queueEstados = new PQueue({ concurrency: CONCURRENCIA_ESTADO });

  for (const estado of estados) {
    queueEstados.add(async () => {
      const queueDetalles = new PQueue({ concurrency: CONCURRENCIA_DETALLES });

      for (const fecha of fechas) {
        await procesarFechaEstado(fecha, estado, queueDetalles);
        await esperar(TIEMPO_ESPERA_FECHAS);
      }

      await queueDetalles.onIdle();
      logMensaje(`🏁 Finalizado: ${estado}`, 'info');
    });
  }

  await queueEstados.onIdle();
  await queueFallidos.onIdle();
  logMensaje('✅ Todas las licitaciones por fecha procesadas correctamente', 'success');
};

main()
  .then(() => {
    logMensaje('🛑 Ejecución finalizada correctamente', 'info');
    process.exit(0);
  })
  .catch(err => {
    logMensaje(`❌ Error no manejado: ${err.message}`, 'error');
    process.exit(1);
  });
