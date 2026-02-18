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
const TIEMPO_ESPERA_FECHAS = 1500;
const estados = ['publicada', 'cerrada', 'desierta', 'revocada', 'suspendida', 'adjudicada', 'todos'];
//desierta = 2006 - 2009, 2023 - 2025
//adjudicada = 2024 - 2025

//['publicada', 'cerrada', 'desierta', 'revocada', 'suspendida', 'adjudicada'];
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
const codigosFallidosEstaEjecucion = new Set(); // Rastrear solo fallidos de esta ejecución
const fechasFallidasEstaEjecucion = new Map(); // Rastrear fechas fallidas {fecha, estado}
const queueFallidos = new PQueue({ concurrency: 3 });

// Generar timestamp para archivos de fallidos
const ahora = new Date();
const timestamp = `${String(ahora.getDate()).padStart(2, '0')}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${ahora.getFullYear()}_${String(ahora.getHours()).padStart(2, '0')}-${String(ahora.getMinutes()).padStart(2, '0')}-${String(ahora.getSeconds()).padStart(2, '0')}`;

const CODIGOS_VACIOS_PATH = path.join(__dirname, 'codigos_vacios.txt');
const CODIGOS_FALLIDOS_PATH = path.join(__dirname, 'codigos_fallidos.txt');

function guardarCodigoVacio(codigo) {
  fs.appendFileSync(CODIGOS_VACIOS_PATH, `${codigo}\n`);
}

function guardarCodigoFallido(codigo) {
  // Evitar duplicados: solo guardar si no está ya registrado
  if (!codigosFallidosEstaEjecucion.has(codigo)) {
    fs.appendFileSync(CODIGOS_FALLIDOS_PATH, `${codigo}\n`);
    codigosFallidosEstaEjecucion.add(codigo);
  }
}

function cargarCodigosVacios() {
  if (!fs.existsSync(CODIGOS_VACIOS_PATH)) return new Set();
  return new Set(
    fs.readFileSync(CODIGOS_VACIOS_PATH, 'utf-8')
      .split('\n')
      .map(x => x.trim())
      .filter(Boolean)
  );
}

let codigosVacios = cargarCodigosVacios();

// Función para verificar si un código ya existe en la base de datos
const codigoExisteEnBD = async (codigo) => {
  try {
    const [rows] = await pool.query(
      'SELECT codigo_externo FROM licitaciones WHERE codigo_externo = ?',
      [codigo]
    );
    return rows.length > 0;
  } catch (err) {
    logMensaje(`⚠️ Error verificando ${codigo} en BD: ${err.message}`, 'warning');
    return false;
  }
};

// Función para verificar múltiples códigos en la BD
const codigosExistenEnBD = async (codigos) => {
  const codigosExistentes = new Set();
  
  if (codigos.length === 0) return codigosExistentes;
  
  try {
    const placeholders = codigos.map(() => '?').join(',');
    const [rows] = await pool.query(
      `SELECT codigo_externo FROM licitaciones WHERE codigo_externo IN (${placeholders})`,
      codigos
    );
    rows.forEach(r => codigosExistentes.add(r.codigo_externo));
  } catch (err) {
    logMensaje(`⚠️ Error verificando códigos en BD: ${err.message}`, 'warning');
  }
  
  return codigosExistentes;
};

const fetchJSON = async (url, maxIntentos = 5) => {
  let intento = 0;
  while (intento < maxIntentos) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 segundos timeout
      
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      intento++;
      if (intento < maxIntentos) await esperar(500 * intento);
    }
  }
  return null;
};

const obtenerDetallesLicitacionConReintentos = async (codigo, maxIntentos = 5) => {
  // Evita consultar la API si el código ya está marcado como vacío
  if (codigosVacios.has(codigo)) {
    logMensaje(`⏩ Código ${codigo} ya está en codigos_vacios.txt, se ignora la consulta a la API.`, 'info');
    return '__LISTADO_VACIO__';
  }

  const url = `https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json?codigo=${codigo}&ticket=${ticket}`;
  const data = await fetchJSON(url, maxIntentos);

  // 🚫 Si responde con Listado vacío, no seguir intentando
  if (data && Array.isArray(data.Listado) && data.Listado.length === 0) {
    logMensaje(`❌ Código ${codigo} respondió con listado vacío. Ignorado.`, 'warning');
    guardarCodigoVacio(codigo);
    codigosVacios.add(codigo);
    return '__LISTADO_VACIO__';
  }

  return data?.Listado?.[0] || null;
};

const reintentarDetalleHastaExito = async (codigo) => {
  const maxIntentos = 5;
  for (let intento = 1; intento <= maxIntentos; intento++) {
    const detalle = await obtenerDetallesLicitacionConReintentos(codigo, 3);
    if (detalle && detalle !== '__LISTADO_VACIO__') {
      await guardarDetallesEnBD(detalle);
      return true;
    }
    if (intento < maxIntentos) {
      await esperar(5000);
    }
  }

  guardarCodigoFallido(codigo);
  return false;
};

const reintentarFallidosPorFecha = async (codigosFallidos) => {
  if (codigosFallidos.length === 0) return 0;
  
  const queueReintentos = new PQueue({ concurrency: CONCURRENCIA_DETALLES });
  let exitosos = 0;
  
  for (const codigo of codigosFallidos) {
    queueReintentos.add(async () => {
      const resultado = await reintentarDetalleHastaExito(codigo);
      if (resultado) exitosos++;
      fallidosPendientes.delete(codigo);
    });
  }
  
  await queueReintentos.onIdle();
  return exitosos;
};

// Nueva función: Reintentar solo los códigos fallidos de ESTA EJECUCIÓN
const reintentarFallidosEstaEjecucion = async () => {
  const codigosFallidos = Array.from(codigosFallidosEstaEjecucion);
  
  if (codigosFallidos.length === 0) return 0;
  
  logMensaje(`🔄 Reintentando ${codigosFallidos.length} códigos fallidos de esta ejecución...`, 'info');
  
  const queueReintentos = new PQueue({ concurrency: CONCURRENCIA_DETALLES });
  let exitosos = 0;
  let procesados = 0;
  
  for (const codigo of codigosFallidos) {
    queueReintentos.add(async () => {
      const resultado = await reintentarDetalleHastaExito(codigo);
      procesados++;
      if (resultado) {
        exitosos++;
        codigosFallidosEstaEjecucion.delete(codigo); // Remover si tuvo éxito
      }
      
      if (procesados % 20 === 0 || procesados === codigosFallidos.length) {
        logMensaje(`🔄 Reintentos: ${exitosos}/${procesados} de ${codigosFallidos.length} recuperados`, 'info');
      }
    });
  }
  
  await queueReintentos.onIdle();
  
  // Limpiar/actualizar archivo único de fallidos
  const codigosFallidosFinal = Array.from(codigosFallidosEstaEjecucion);
  if (codigosFallidosFinal.length === 0) {
    if (fs.existsSync(CODIGOS_FALLIDOS_PATH)) {
      fs.unlinkSync(CODIGOS_FALLIDOS_PATH);
      logMensaje(`🗑️ Archivo ${CODIGOS_FALLIDOS_PATH} eliminado (sin fallidos pendientes)`, 'info');
    }
  } else {
    const contenido = codigosFallidosFinal.join('\n') + '\n';
    fs.writeFileSync(CODIGOS_FALLIDOS_PATH, contenido);
    logMensaje(`📝 ${CODIGOS_FALLIDOS_PATH} actualizado con ${codigosFallidosFinal.length} códigos pendientes`, 'info');
  }
  
  return exitosos;
};

const obtenerDetallesLicitacionRobusto = async (codigo) => {
  const detalle = await obtenerDetallesLicitacionConReintentos(codigo, 5);

  if (detalle === '__LISTADO_VACIO__') {
    return null;
  }

  if (!detalle) {
    if (!fallidosPendientes.has(codigo)) {
      fallidosPendientes.add(codigo);
    }
    return null;
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
    // Agregar un día para asegurar que se incluya la fecha de término
    fin.setDate(fin.getDate() + 1);
  } else {
    fin = new Date(); // Hoy
    fin.setDate(fin.getDate() + 1); // Incluir el día actual
  }

  while (actual < fin) {
    fechas.push(
      String(actual.getDate()).padStart(2, '0') +
      String(actual.getMonth() + 1).padStart(2, '0') +
      actual.getFullYear()
    );
    actual.setDate(actual.getDate() + 1);
  }

  return fechas;
};

const procesarFechaEstado = async (fecha, estado) => {
  const url = `https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json?fecha=${fecha}&estado=${estado}&ticket=${ticket}`;
  let intento = 0;
  const MAX_INTENTOS = 5;

  while (intento < MAX_INTENTOS) {
    const data = await fetchJSON(url, 1);
    intento++;

    if (!data || !Array.isArray(data.Listado)) {
      logMensaje(`❌ Respuesta inválida en ${estado} - ${fecha} (intento ${intento}) - Data: ${JSON.stringify(data || 'null')}`, 'error');
      await esperar(1000 * intento);
      continue;
    }

    const licitaciones = data.Listado;
    const codigos = licitaciones.map(l => l.CodigoExterno);
    const placeholders = codigos.map(() => '?').join(',');

    let existentes = [];
    if (codigos.length > 0) {
      let rows;
      if (estado === 'todos') {
        [rows] = await pool.query(
          `SELECT codigo_externo FROM licitaciones WHERE codigo_externo IN (${placeholders})`,
          codigos
        );
      } else {
        [rows] = await pool.query(
          `SELECT codigo_externo FROM licitaciones WHERE codigo_externo IN (${placeholders})  AND estado = ?`,
          [...codigos, nombreEstado[estado]]
        );
      }
      existentes = rows.map(r => r.codigo_externo);
    }

    // Calcula cuántos códigos de esta fecha están en codigosVacios
    const vaciosEnFecha = licitaciones.filter(l =>
      l.CodigoExterno && codigosVacios.has(l.CodigoExterno)
    ).length;

    const nuevas = licitaciones.filter(l =>
      l.CodigoExterno &&
      !existentes.includes(l.CodigoExterno) &&
      !codigosVacios.has(l.CodigoExterno)
    );

    logMensaje(
      `📄 ${estado} - ${fecha}: Obtenidas = ${licitaciones.length}, Nuevas = ${nuevas.length} (excluidas por vacíos: ${vaciosEnFecha})`,
      'info'
    );

    if (nuevas.length === 0) {
      logMensaje(`🔇 ${estado} - ${fecha}: Sin nuevas licitaciones`, 'info');
      return 0;
    }

    // Crear cola temporal para esta fecha específica
    const queueFecha = new PQueue({ concurrency: CONCURRENCIA_DETALLES });
    let completadasEnFecha = 0;
    let procesadasEnFecha = 0;
    
    for (const lic of nuevas) {
      const codigo = lic.CodigoExterno;
      queueFecha.add(async () => {
        const detalle = await obtenerDetallesLicitacionRobusto(codigo);
        procesadasEnFecha++;
        if (detalle && detalle !== '__LISTADO_VACIO__') {
          await guardarDetallesEnBD(detalle);
          completadasEnFecha++;
        }
        if (procesadasEnFecha % 20 === 0 || procesadasEnFecha === nuevas.length) {
          logMensaje(`📊 ${estado} - ${fecha}: Progreso ${completadasEnFecha}/${nuevas.length} guardadas (${procesadasEnFecha} procesadas)`, 'info');
        }
      });
    }

    // Esperar a que TODAS las licitaciones de esta fecha terminen
    await queueFecha.onIdle();
    
    // Reintentar los que fallaron PARA ESTA FECHA específicamente (sin mostrar en log)
    const codigosFallidosEnFecha = Array.from(fallidosPendientes);
    if (codigosFallidosEnFecha.length > 0) {
      const reintentosExitosos = await reintentarFallidosPorFecha(codigosFallidosEnFecha);
      completadasEnFecha += reintentosExitosos;
    }
    
    const faltantesEnFecha = nuevas.length - completadasEnFecha;
    const mensaje = faltantesEnFecha === 0 
      ? `✅ ${estado} - ${fecha}: Completadas ${completadasEnFecha} de ${nuevas.length} licitaciones`
      : `✅ ${estado} - ${fecha}: Completadas ${completadasEnFecha} de ${nuevas.length} licitaciones (${faltantesEnFecha} faltantes)`;
    logMensaje(mensaje, 'success');
    return completadasEnFecha;
  }

  logMensaje(`❌ ${estado} - ${fecha} falló tras ${MAX_INTENTOS} intentos`, 'error');
  // Registrar fecha fallida para reintentar después
  const claveFecha = `${estado}-${fecha}`;
  if (!fechasFallidasEstaEjecucion.has(claveFecha)) {
    fechasFallidasEstaEjecucion.set(claveFecha, { estado, fecha });
  }
  throw new Error(`Falló procesamiento de ${estado} - ${fecha} tras ${MAX_INTENTOS} intentos`);
};

// Función para cargar y unificar códigos fallidos de ejecuciones anteriores
const cargarCodigosFallidosAnteriores = async () => {
  const codigosFallidos = new Set();
  const archivosParaBorrar = [];
  
  try {
    const archivos = fs.readdirSync(__dirname);
    // Incluye cualquier codigos_fallidos*.txt (viejos con timestamp o el actual)
    const archivosFallidosPaths = archivos.filter(f => f.startsWith('codigos_fallidos') && f.endsWith('.txt'));
    
    for (const archivo of archivosFallidosPaths) {
      const rutaArchivo = path.join(__dirname, archivo);
      const contenido = fs.readFileSync(rutaArchivo, 'utf-8');
      const codigos = contenido.split('\n').map(x => x.trim()).filter(Boolean);
      codigos.forEach(codigo => codigosFallidos.add(codigo)); // Set evita duplicados automáticamente
      if (rutaArchivo !== CODIGOS_FALLIDOS_PATH) {
        archivosParaBorrar.push(rutaArchivo);
      }
    }

    // Filtrar códigos que ya existen en la BD
    const listaUnica = Array.from(codigosFallidos);
    if (listaUnica.length > 0) {
      logMensaje(`📋 Verificando ${listaUnica.length} códigos fallidos en la BD...`, 'info');
      const codigosEnBD = await codigosExistenEnBD(listaUnica);
      
      // Mantener solo los que NO están en la BD
      const codigosAReintentarSet = new Set(
        listaUnica.filter(codigo => !codigosEnBD.has(codigo))
      );
      
      const recuperadosEnBD = listaUnica.length - codigosAReintentarSet.size;
      if (recuperadosEnBD > 0) {
        logMensaje(`✅ ${recuperadosEnBD} códigos ya están en la BD (no necesitan reintento)`, 'success');
      }
      
      // Escribir solo los que requieren reintento (sin duplicados)
      if (codigosAReintentarSet.size > 0) {
        const contenidoLimpio = Array.from(codigosAReintentarSet).join('\n') + '\n';
        fs.writeFileSync(CODIGOS_FALLIDOS_PATH, contenidoLimpio);
        logMensaje(`📝 Archivo de fallidos deduplicado: ${codigosAReintentarSet.size} códigos únicos`, 'info');
      } else if (fs.existsSync(CODIGOS_FALLIDOS_PATH)) {
        fs.unlinkSync(CODIGOS_FALLIDOS_PATH);
        logMensaje(`🗑️ Archivo ${CODIGOS_FALLIDOS_PATH} eliminado (todos en BD)`, 'info');
      }
      
      codigosFallidos.clear();
      codigosAReintentarSet.forEach(codigo => codigosFallidos.add(codigo));
    } else if (fs.existsSync(CODIGOS_FALLIDOS_PATH)) {
      fs.unlinkSync(CODIGOS_FALLIDOS_PATH);
    }

    for (const ruta of archivosParaBorrar) {
      try {
        fs.unlinkSync(ruta);
        logMensaje(`🗑️ Archivo previo ${ruta} eliminado (unificado en ${CODIGOS_FALLIDOS_PATH})`, 'info');
      } catch (err) {
        logMensaje(`⚠️ No se pudo eliminar ${ruta}: ${err.message}`, 'warning');
      }
    }
  } catch (err) {
    logMensaje(`⚠️ Error al cargar códigos fallidos anteriores: ${err.message}`, 'warning');
  }
  
  return codigosFallidos;
};

// Función para limpiar archivos de fallidos después de cada ejecución
const limpiarCodigosFallidosDeEjecucion = async () => {
  if (!fs.existsSync(CODIGOS_FALLIDOS_PATH)) return;
  
  try {
    const contenido = fs.readFileSync(CODIGOS_FALLIDOS_PATH, 'utf-8');
    const codigos = contenido.split('\n').map(x => x.trim()).filter(Boolean);
    
    if (codigos.length === 0) return;
    
    logMensaje(`🔍 Verificando ${codigos.length} códigos fallidos contra BD...`, 'info');
    const codigosEnBD = await codigosExistenEnBD(codigos);
    
    // Mantener solo los que NO están en la BD
    const codigosPendientes = codigos.filter(codigo => !codigosEnBD.has(codigo));
    
    const recuperados = codigosEnBD.size;
    if (recuperados > 0) {
      logMensaje(`✅ ${recuperados} códigos se guardaron exitosamente en BD`, 'success');
    }
    
    if (codigosPendientes.length === 0) {
      fs.unlinkSync(CODIGOS_FALLIDOS_PATH);
      logMensaje(`🗑️ Archivo ${CODIGOS_FALLIDOS_PATH} eliminado (todos recuperados)`, 'info');
      // Limpiar el Set también
      codigosFallidosEstaEjecucion.clear();
    } else {
      const contenidoLimpio = codigosPendientes.join('\n') + '\n';
      fs.writeFileSync(CODIGOS_FALLIDOS_PATH, contenidoLimpio);
      logMensaje(`📝 ${CODIGOS_FALLIDOS_PATH} actualizado: ${codigosPendientes.length} códigos pendientes`, 'info');
      
      // Actualizar el Set para que solo contenga los códigos pendientes
      const nuevoSet = new Set(codigosPendientes);
      codigosFallidosEstaEjecucion.clear();
      nuevoSet.forEach(codigo => codigosFallidosEstaEjecucion.add(codigo));
    }
  } catch (err) {
    logMensaje(`⚠️ Error limpiando códigos fallidos: ${err.message}`, 'warning');
  }
};

// Función para reintentar fechas fallidas
const reintentarFechasFallidas = async () => {
  const fechasARetentar = Array.from(fechasFallidasEstaEjecucion.values());
  
  if (fechasARetentar.length === 0) return 0;
  
  logMensaje(`🔄 Reintentando ${fechasARetentar.length} fechas fallidas...`, 'info');
  
  let exitosas = 0;
  let procesadas = 0;
  
  for (const { estado, fecha } of fechasARetentar) {
    try {
      await esperar(TIEMPO_ESPERA_FECHAS);
      const licitacionesObtenidas = await procesarFechaEstado(fecha, estado);
      
      if (licitacionesObtenidas >= 0) {
        exitosas++;
        const claveFecha = `${estado}-${fecha}`;
        fechasFallidasEstaEjecucion.delete(claveFecha);
        logMensaje(`✅ ${estado} - ${fecha}: Recuperada en reintento`, 'info');
      }
    } catch (err) {
      // La fecha sigue fallando, se mantiene en el Map
    }
    
    procesadas++;
    if (procesadas % 5 === 0 || procesadas === fechasARetentar.length) {
      logMensaje(`🔄 Reintentos de fechas: ${exitosas}/${procesadas} de ${fechasARetentar.length} exitosas`, 'info');
    }
  }
  
  return exitosas;
};

const main = async () => {
  // Cargar y unificar códigos fallidos de ejecuciones anteriores
  const codigosFallidos = await cargarCodigosFallidosAnteriores();
  if (codigosFallidos.size > 0) {
    logMensaje(`📂 Encontrados ${codigosFallidos.size} códigos fallidos para reintentar`, 'info');
    codigosFallidos.forEach(codigo => codigosFallidosEstaEjecucion.add(codigo));
  }
  
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  const fechaInicio = '2022-03-01';
  const fechaTermino = '2022-04-01';
  //ayer.toISOString().split('T')[0];
  //const fechas = generarFechas(fechaInicio);
  const fechas = generarFechas(fechaInicio, fechaTermino);

  const hoy = new Date();
  //const fechaTermino = hoy.toISOString().split('T')[0];
  logMensaje(`📅 Generando fechas desde ${fechaInicio} hasta ${fechaTermino}`, 'info');
  
  
  
  logMensaje(`📊 Total de fechas generadas: ${fechas.length}`, 'info');
  logMensaje(`📆 Primera fecha: ${fechas[0]} | Última fecha: ${fechas[fechas.length - 1]}`, 'info');

  const queueEstados = new PQueue({ concurrency: CONCURRENCIA_ESTADO });

  for (const estado of estados) {
    queueEstados.add(async () => {
      let fechasProcesadas = 0;
      let licitacionesObtenidasTotal = 0;

      for (const fecha of fechas) {
        fechasProcesadas++;
        try {
          const licitacionesObtenidas = await procesarFechaEstado(fecha, estado);
          licitacionesObtenidasTotal += licitacionesObtenidas;
        } catch (err) {
          logMensaje(`⚠️ Error procesando ${estado} - ${fecha}: ${err.message}. Continuando...`, 'warning');
        }
        await esperar(TIEMPO_ESPERA_FECHAS);
        
        if (fechasProcesadas % 15 === 0) {
          logMensaje(`📊 Progreso ${estado}: ${fechasProcesadas}/${fechas.length} fechas procesadas`, 'info');
        }
      }

      logMensaje(`🏁 Finalizado: ${estado} - Total: ${fechasProcesadas} fechas procesadas, ${licitacionesObtenidasTotal} licitaciones obtenidas`, 'info');
    });
  }

  await queueEstados.onIdle();
  
  // Limpiar códigos fallidos que ya fueron guardados en la BD en esta ejecución
  logMensaje('🧹 Limpiando códigos de fallidos que se guardaron exitosamente...', 'info');
  await limpiarCodigosFallidosDeEjecucion();
  
  // Reintentar fechas fallidas indefinidamente hasta recuperarlas todas
  let cicloFechas = 1;
  while (fechasFallidasEstaEjecucion.size > 0) {
    const totalFechasFallidas = fechasFallidasEstaEjecucion.size;
    logMensaje(`⚠️ Ciclo ${cicloFechas}: ${totalFechasFallidas} fechas no obtuvieron datos de la API. Reintentando...`, 'warning');
    const fechasRecuperadas = await reintentarFechasFallidas();
    logMensaje(`📊 Ciclo ${cicloFechas}: ${fechasRecuperadas} de ${totalFechasFallidas} fechas recuperadas`, 'info');
    
    const fechasFallidasRestantes = fechasFallidasEstaEjecucion.size;
    if (fechasFallidasRestantes > 0) {
      logMensaje(`⚠️ Ciclo ${cicloFechas}: ${fechasFallidasRestantes} fechas siguen fallando. Reintentando nuevamente...`, 'warning');
      cicloFechas++;
      await esperar(5000); // Esperar 5 segundos antes de reintentar
    }
  }
  logMensaje(`✅ Todas las fechas han sido recuperadas exitosamente`, 'info');
  
  // Reintentar todos los códigos fallidos de ESTA EJECUCIÓN (incluye los de ejecuciones anteriores)
  // Repetir reintentos hasta que no queden códigos fallidos
  let cicloReintento = 1;
  while (codigosFallidosEstaEjecucion.size > 0) {
    const totalCodigosFallidos = Array.from(codigosFallidosEstaEjecucion).length;
    logMensaje(`🔄 Ciclo ${cicloReintento}: Iniciando reintentos globales de ${totalCodigosFallidos} códigos fallidos...`, 'info');
    
    const recuperadosGlobales = await reintentarFallidosEstaEjecucion();
    logMensaje(`📊 Ciclo ${cicloReintento}: ${recuperadosGlobales} códigos recuperados`, 'info');
    
    const codigosFallidosFinal = Array.from(codigosFallidosEstaEjecucion);
    
    if (codigosFallidosFinal.length === 0) {
      logMensaje(`🎉 ¡Todos los códigos fueron recuperados exitosamente en ${cicloReintento} ciclo(s)!`, 'success');
      break;
    } else {
      logMensaje(`⏳ ${codigosFallidosFinal.length} códigos aún pendientes. Esperando antes del siguiente ciclo...`, 'info');
      await esperar(10000); // Esperar 10 segundos antes del siguiente ciclo
      cicloReintento++;
    }
  }
  
  if (codigosFallidosEstaEjecucion.size === 0) {
    logMensaje(`✅ Proceso completado: Todos los códigos fueron recuperados`, 'success');
  } else {
    logMensaje(`⚠️ Proceso completado con ${codigosFallidosEstaEjecucion.size} códigos no recuperados. Ver: codigos_fallidos.txt`, 'warning');
  }


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
