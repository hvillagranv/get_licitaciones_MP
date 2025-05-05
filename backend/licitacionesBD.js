// index.js
import fs from 'fs';
import path from 'path';
import PQueue from 'p-queue';
import { guardarDetallesEnBD } from './guardarBD.js';
import { logMensaje } from './utils/logs.js';
import { fileURLToPath } from 'url';
import { pool } from './connectDB.js';
import { verificarEstados } from './verificarEstados.js';

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === CONFIGURACIÓN GENERAL ===
const ticket = '0F702DFA-2D0B-4243-897A-84985C4FCA73';

const CONCURRENCIA_ESTADO = 1;
const CONCURRENCIA_DETALLES = 20;
const TIEMPO_ESPERA_FECHAS = 4000;
const estados = ['publicada', 'cerrada', 'desierta', 'revocada', 'suspendida', 'adjudicada'];
const nombreEstado = {
  publicada: 'Publicada',
  cerrada: 'Cerrada',
  desierta: 'Desierta (o art. 3 ó 9 Ley 19.886)',
  revocada: 'Revocada',
  suspendida: 'Suspendida',
  adjudicada: 'Adjudicada'
};

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
  while (true) {
    const detalle = await obtenerDetallesLicitacionConReintentos(codigo, 3);
    if (detalle) {
      await guardarDetallesEnBD(detalle);
      fallidosPendientes.delete(codigo);
      return;
    }
    logMensaje(`🔁 Fallido persistente ${codigo}, reintentando en 15s...`, 'warning');
    await esperar(15000);
  }
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

const generarFechas = (inicio) => {
  const fechas = [];
  const [y, m, d] = inicio.split('-').map(Number);
  const actual = new Date(y, m - 1, d);
  const hoy = new Date();

  while (actual <= hoy) {
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
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  const fechaInicio = '2025-05-02';//ayer.toISOString().split('T')[0];
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

  // 🔁 Verificación final de estado para publicadas vencidas
  await verificarEstados();

  logMensaje('✅ Verificación final de estados completada', 'success');
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
