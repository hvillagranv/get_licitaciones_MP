import fs from 'fs';
import path from 'path';
import PQueue from 'p-queue';
import { guardarDetallesEnBD } from './guardarBD.js';
import { logMensaje } from './utils/logs.js';
import { fileURLToPath } from 'url';
import { pool } from './connectDB.js';

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === CONFIGURACIÓN GENERAL ===
const ticket = '886F450C-C2FA-4C9B-99BE-E06B63BAB511';
const CONCURRENCIA_ESTADO = 1;
const CONCURRENCIA_DETALLES = 20;
const TIEMPO_ESPERA_FECHAS = 4000;

const nombreEstado = {
  publicada: 'Publicada',
  cerrada: 'Cerrada',
  desierta: 'Desierta (o art. 3 ó 9 Ley 19.886)',
  revocada: 'Revocada',
  suspendida: 'Suspendida',
  adjudicada: 'Adjudicada'
};

// === PARAMETROS DESDE LA LÍNEA DE COMANDOS ===
const args = process.argv.slice(2);
const fechaInicio = args[0] || '2003-05-01';
const fechaFin = args[1] || new Date().toISOString().split('T')[0];
const estados = args[2] ? args[2].split(',') : ['suspendida'];

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
  if (!detalle) {
    if (!fallidosPendientes.has(codigo)) {
      fallidosPendientes.add(codigo);
      queueFallidos.add(() => reintentarDetalleHastaExito(codigo));
    }
  }
  return detalle;
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
    const codigos = licitaciones.map(l => l.CodigoExterno);
    const placeholders = codigos.map(() => '?').join(',');

    let existentes = [];
    if (codigos.length > 0) {
      const [rows] = await pool.query(
        `SELECT codigo_externo FROM licitaciones WHERE codigo_externo IN (${placeholders})  AND estado = ?`,
        [...codigos, nombreEstado[estado]]
      );
      existentes = rows.map(r => r.codigo_externo);
    }

    const nuevas = licitaciones.filter(l =>
      l.CodigoExterno && !existentes.includes(l.CodigoExterno)
    );

    logMensaje(`📄 ${estado} - ${fecha}: Obtenidas = ${licitaciones.length}, Nuevas = ${nuevas.length}`, 'info');

    if (nuevas.length === 0) {
      logMensaje(`🔇 ${estado} - ${fecha}: Sin nuevas licitaciones`, 'info');
    }

    for (const lic of nuevas) {
      const codigo = lic.CodigoExterno;
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
  const fechas = generarFechas(fechaInicio, fechaFin);
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
