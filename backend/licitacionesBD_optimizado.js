import fs from 'fs';
import path from 'path';
import PQueue from 'p-queue';
import dotenv from 'dotenv';
import { guardarDetallesEnBD } from './guardarBD.js';
import { logMensaje, iniciarMonitorInactividad, detenerMonitorInactividad } from './utils/logs.js';
import { fileURLToPath } from 'url';
import { pool } from './connectDB.js';

dotenv.config();

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === CONFIGURACIÓN ===
const CONFIG = {
  ticket: process.env.TICKET,
  concurrenciaEstado: 1,
  concurrenciaDetalles: 5,
  tiempoEsperaFechas: 1500,
  maxIntentosAPI: 5,
  maxIntentosDetalle: 5,
  timeoutAPI: 60000,
  estados: ['adjudicada'],
  nombreEstado: {
    publicada: 'Publicada',
    cerrada: 'Cerrada',
    desierta: 'Desierta (o art. 3 ó 9 Ley 19.886)',
    revocada: 'Revocada',
    suspendida: 'Suspendida',
    adjudicada: 'Adjudicada'
  }
};

// Validar que TICKET está configurado
if (!CONFIG.ticket) {
  console.error('❌ ERROR: TICKET no está configurado en .env');
  process.exit(1);
}

//desierta = 2006 - 2009, 2022 - 2025
//adjudicada = 2024 - 2025


// === RUTAS DE ARCHIVOS ===
const PATHS = {
  vacios: path.join(__dirname, 'codigos_vacios.txt'),
  fallidos: path.join(__dirname, 'codigos_fallidos.txt')
};

// === ESTADO GLOBAL ===
const estado = {
  codigosVacios: new Set(),
  codigosFallidos: new Set(),
  fallidosPendientes: new Set(),
  fechasFallidas: new Map()
};

// === UTILIDADES ===
const esperar = (ms) => new Promise(res => setTimeout(res, ms));

const fetchJSON = async (url, maxIntentos = CONFIG.maxIntentosAPI) => {
  for (let intento = 0; intento < maxIntentos; intento++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONFIG.timeoutAPI);
      
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch {
      if (intento < maxIntentos - 1) {
        await esperar(500 * (intento + 1));
      }
    }
  }
  return null;
};

// === GESTIÓN DE ARCHIVOS ===
const gestionArchivos = {
  cargarCodigosVacios() {
    if (!fs.existsSync(PATHS.vacios)) return new Set();
    return new Set(
      fs.readFileSync(PATHS.vacios, 'utf-8')
        .split('\n')
        .map(x => x.trim())
        .filter(Boolean)
    );
  },

  guardarCodigoVacio(codigo) {
    fs.appendFileSync(PATHS.vacios, `${codigo}\n`);
    estado.codigosVacios.add(codigo);
  },

  guardarCodigoFallido(codigo) {
    if (!estado.codigosFallidos.has(codigo)) {
      fs.appendFileSync(PATHS.fallidos, `${codigo}\n`);
      estado.codigosFallidos.add(codigo);
    }
  },

  actualizarArchivoFallidos() {
    const codigosPendientes = Array.from(estado.codigosFallidos);
    
    if (codigosPendientes.length === 0) {
      if (fs.existsSync(PATHS.fallidos)) {
        fs.unlinkSync(PATHS.fallidos);
        logMensaje(`🗑️ Archivo eliminado (sin fallidos pendientes)`, 'info');
      }
    } else {
      fs.writeFileSync(PATHS.fallidos, codigosPendientes.join('\n') + '\n');
      logMensaje(`📝 Archivo actualizado: ${codigosPendientes.length} códigos pendientes`, 'info');
    }
  }
};

// === CONSULTAS A BASE DE DATOS ===
const consultasDB = {
  async verificarCodigosExistentes(codigos) {
    if (codigos.length === 0) return new Set();
    
    try {
      const placeholders = codigos.map(() => '?').join(',');
      const [rows] = await pool.query(
        `SELECT codigo_externo FROM licitaciones WHERE codigo_externo IN (${placeholders})`,
        codigos
      );
      return new Set(rows.map(r => r.codigo_externo));
    } catch (err) {
      logMensaje(`⚠️ Error verificando códigos en BD: ${err.message}`, 'warning');
      return new Set();
    }
  },

  async verificarCodigosExistentesPorEstado(codigos, nombreEstado) {
    if (codigos.length === 0) return [];
    
    try {
      const placeholders = codigos.map(() => '?').join(',');
      const query = nombreEstado === 'todos'
        ? `SELECT codigo_externo FROM licitaciones WHERE codigo_externo IN (${placeholders})`
        : `SELECT codigo_externo FROM licitaciones WHERE codigo_externo IN (${placeholders}) AND estado = ?`;
      
      const params = nombreEstado === 'todos' ? codigos : [...codigos, nombreEstado];
      const [rows] = await pool.query(query, params);
      
      return rows.map(r => r.codigo_externo);
    } catch (err) {
      logMensaje(`⚠️ Error en consulta BD: ${err.message}`, 'warning');
      return [];
    }
  }
};

// === OBTENCIÓN DE DETALLES ===
const obtenerDetalles = {
  async conReintentos(codigo, maxIntentos = CONFIG.maxIntentosAPI) {
    if (estado.codigosVacios.has(codigo)) {
      logMensaje(`⏩ Código ${codigo} marcado como vacío, omitido`, 'info');
      return '__LISTADO_VACIO__';
    }

    const url = `https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json?codigo=${codigo}&ticket=${CONFIG.ticket}`;
    const data = await fetchJSON(url, maxIntentos);

    if (data && Array.isArray(data.Listado) && data.Listado.length === 0) {
      logMensaje(`❌ Código ${codigo}: listado vacío`, 'warning');
      gestionArchivos.guardarCodigoVacio(codigo);
      return '__LISTADO_VACIO__';
    }

    return data?.Listado?.[0] || null;
  },

  async robusto(codigo) {
    const detalle = await this.conReintentos(codigo, CONFIG.maxIntentosAPI);

    if (detalle === '__LISTADO_VACIO__') return null;

    if (!detalle) {
      estado.fallidosPendientes.add(codigo);
      return null;
    }

    return detalle;
  },

  async hastaExito(codigo) {
    // Verificar si el código ya está marcado como vacío antes de reintentar
    if (estado.codigosVacios.has(codigo)) {
      logMensaje(`⏩ Código ${codigo} marcado como vacío, omitido`, 'info');
      estado.codigosFallidos.delete(codigo);
      return false;
    }

    for (let intento = 1; intento <= CONFIG.maxIntentosDetalle; intento++) {
      const detalle = await this.conReintentos(codigo, 3);
      
      if (detalle === '__LISTADO_VACIO__') {
        // Código marcado como vacío durante el intento, detener reintentos y eliminarlo de fallidos
        estado.codigosFallidos.delete(codigo);
        return false;
      }
      
      if (detalle) {
        await guardarDetallesEnBD(detalle);
        estado.codigosFallidos.delete(codigo);
        return true;
      }
      
      if (intento < CONFIG.maxIntentosDetalle) {
        await esperar(5000);
      }
    }

    gestionArchivos.guardarCodigoFallido(codigo);
    return false;
  }
};

// === REINTENTOS ===
const reintentos = {
  async procesarCodigosFallidos(codigosFallidos, esPorFecha = false) {
    if (codigosFallidos.length === 0) return 0;
    
    if (!esPorFecha) {
      logMensaje(`🔄 Reintentando ${codigosFallidos.length} códigos...`, 'info');
    }
    
    const queue = new PQueue({ concurrency: CONFIG.concurrenciaDetalles });
    let exitosos = 0;
    let procesados = 0;
    
    for (const codigo of codigosFallidos) {
      queue.add(async () => {
        const resultado = await obtenerDetalles.hastaExito(codigo);
        procesados++;
        
        if (resultado) {
          exitosos++;
          estado.codigosFallidos.delete(codigo);
        }
        
        if (esPorFecha) {
          estado.fallidosPendientes.delete(codigo);
        } else if (procesados % 20 === 0 || procesados === codigosFallidos.length) {
          logMensaje(`🔄 Progreso: ${exitosos}/${procesados} de ${codigosFallidos.length}`, 'info');
        }
      });
    }
    
    await queue.onIdle();
    
    if (!esPorFecha) {
      gestionArchivos.actualizarArchivoFallidos();
    }
    
    return exitosos;
  },

  async procesarFechasFallidas() {
    const fechasARetentar = Array.from(estado.fechasFallidas.values());
    if (fechasARetentar.length === 0) return 0;
    
    logMensaje(`🔄 Reintentando ${fechasARetentar.length} fechas fallidas...`, 'info');
    let exitosas = 0;
    
    for (const { estadoNombre, fecha } of fechasARetentar) {
      try {
        await esperar(CONFIG.tiempoEsperaFechas);
        await procesamiento.procesarFechaEstado(fecha, estadoNombre);
        exitosas++;
        estado.fechasFallidas.delete(`${estadoNombre}-${fecha}`);
        logMensaje(`✅ ${estadoNombre} - ${fecha}: Recuperada`, 'info');
      } catch (err) {
        // Fecha sigue fallando
      }
    }
    
    return exitosas;
  }
};

// === GESTIÓN DE CÓDIGOS FALLIDOS ===
const gestionFallidos = {
  async cargarAnteriores() {
    try {
      const archivos = fs.readdirSync(__dirname);
      const archivosFallidos = archivos.filter(f => 
        f.startsWith('codigos_fallidos') && f.endsWith('.txt')
      );
      
      const codigosUnificados = new Set();
      
      for (const archivo of archivosFallidos) {
        const rutaArchivo = path.join(__dirname, archivo);
        const contenido = fs.readFileSync(rutaArchivo, 'utf-8');
        const codigos = contenido.split('\n').map(x => x.trim()).filter(Boolean);
        codigos.forEach(codigo => codigosUnificados.add(codigo));
        
        if (rutaArchivo !== PATHS.fallidos) {
          fs.unlinkSync(rutaArchivo);
          logMensaje(`🗑️ Archivo antiguo eliminado: ${archivo}`, 'info');
        }
      }

      if (codigosUnificados.size > 0) {
        logMensaje(`📋 Verificando ${codigosUnificados.size} códigos en BD...`, 'info');
        const codigosEnBD = await consultasDB.verificarCodigosExistentes(
          Array.from(codigosUnificados)
        );
        
        const codigosAReintentarSet = new Set(
          Array.from(codigosUnificados).filter(codigo => !codigosEnBD.has(codigo))
        );
        
        const recuperados = codigosUnificados.size - codigosAReintentarSet.size;
        if (recuperados > 0) {
          logMensaje(`✅ ${recuperados} códigos ya en BD`, 'success');
        }
        
        if (codigosAReintentarSet.size > 0) {
          fs.writeFileSync(
            PATHS.fallidos, 
            Array.from(codigosAReintentarSet).join('\n') + '\n'
          );
          logMensaje(`📝 ${codigosAReintentarSet.size} códigos únicos a reintentar`, 'info');
        } else if (fs.existsSync(PATHS.fallidos)) {
          fs.unlinkSync(PATHS.fallidos);
          logMensaje(`🗑️ Todos los códigos ya están en BD`, 'info');
        }
        
        return codigosAReintentarSet;
      }
      
      if (fs.existsSync(PATHS.fallidos)) {
        fs.unlinkSync(PATHS.fallidos);
      }
    } catch (err) {
      logMensaje(`⚠️ Error cargando fallidos: ${err.message}`, 'warning');
    }
    
    return new Set();
  },

  async limpiarRecuperados() {
    if (!fs.existsSync(PATHS.fallidos)) return;
    
    try {
      const contenido = fs.readFileSync(PATHS.fallidos, 'utf-8');
      const codigos = contenido.split('\n').map(x => x.trim()).filter(Boolean);
      
      if (codigos.length === 0) return;
      
      logMensaje(`🔍 Verificando ${codigos.length} códigos...`, 'info');
      const codigosEnBD = await consultasDB.verificarCodigosExistentes(codigos);
      const codigosPendientes = codigos.filter(codigo => !codigosEnBD.has(codigo));
      
      if (codigosEnBD.size > 0) {
        logMensaje(`✅ ${codigosEnBD.size} códigos guardados en BD`, 'success');
      }
      
      estado.codigosFallidos.clear();
      codigosPendientes.forEach(codigo => estado.codigosFallidos.add(codigo));
      
      gestionArchivos.actualizarArchivoFallidos();
    } catch (err) {
      logMensaje(`⚠️ Error limpiando fallidos: ${err.message}`, 'warning');
    }
  }
};

// === GENERACIÓN DE FECHAS ===
const generarFechas = (inicio, termino = null) => {
  const fechas = [];
  const [y1, m1, d1] = inicio.split('-').map(Number);
  const actual = new Date(y1, m1 - 1, d1);

  let fin;
  if (termino) {
    const [y2, m2, d2] = termino.split('-').map(Number);
    fin = new Date(y2, m2 - 1, d2);
    fin.setDate(fin.getDate() + 1);
  } else {
    fin = new Date();
    fin.setDate(fin.getDate() + 1);
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

// === PROCESAMIENTO ===
const procesamiento = {
  async procesarFechaEstado(fecha, estadoNombre) {
    const url = `https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json?fecha=${fecha}&estado=${estadoNombre}&ticket=${CONFIG.ticket}`;
    
    for (let intento = 0; intento < CONFIG.maxIntentosAPI; intento++) {
      const data = await fetchJSON(url, 1);

      if (!data || !Array.isArray(data.Listado)) {
        logMensaje(
          `❌ Respuesta inválida ${estadoNombre} - ${fecha} (intento ${intento + 1})`,
          'error'
        );
        await esperar(1000 * (intento + 1));
        continue;
      }

      const licitaciones = data.Listado;
      const codigos = licitaciones.map(l => l.CodigoExterno);

      let existentes = [];
      if (codigos.length > 0) {
        existentes = await consultasDB.verificarCodigosExistentesPorEstado(
          codigos,
          CONFIG.nombreEstado[estadoNombre]
        );
      }

      const vaciosEnFecha = licitaciones.filter(l =>
        l.CodigoExterno && estado.codigosVacios.has(l.CodigoExterno)
      ).length;

      const nuevas = licitaciones.filter(l =>
        l.CodigoExterno &&
        !existentes.includes(l.CodigoExterno) &&
        !estado.codigosVacios.has(l.CodigoExterno)
      );

      logMensaje(
        `📄 ${estadoNombre} - ${fecha}: Total=${licitaciones.length}, Nuevas=${nuevas.length}, Vacíos=${vaciosEnFecha}`,
        'info'
      );

      if (nuevas.length === 0) {
        logMensaje(`🔇 ${estadoNombre} - ${fecha}: Sin nuevas licitaciones`, 'info');
        return 0;
      }

      const queue = new PQueue({ concurrency: CONFIG.concurrenciaDetalles });
      let completadas = 0;
      let procesadas = 0;
      
      for (const lic of nuevas) {
        queue.add(async () => {
          const detalle = await obtenerDetalles.robusto(lic.CodigoExterno);
          procesadas++;
          
          if (detalle && detalle !== '__LISTADO_VACIO__') {
            await guardarDetallesEnBD(detalle);
            completadas++;
          }
          
          if (procesadas % 20 === 0 || procesadas === nuevas.length) {
            logMensaje(
              `📊 ${estadoNombre} - ${fecha}: ${completadas}/${nuevas.length} guardadas`,
              'info'
            );
          }
        });
      }

      await queue.onIdle();
      
      const fallidosEnFecha = Array.from(estado.fallidosPendientes);
      if (fallidosEnFecha.length > 0) {
        const recuperados = await reintentos.procesarCodigosFallidos(fallidosEnFecha, true);
        completadas += recuperados;
      }
      
      const faltantes = nuevas.length - completadas;
      const mensaje = faltantes === 0
        ? `✅ ${estadoNombre} - ${fecha}: ${completadas}/${nuevas.length} completadas`
        : `✅ ${estadoNombre} - ${fecha}: ${completadas}/${nuevas.length} (${faltantes} faltantes)`;
      
      logMensaje(mensaje, 'success');
      return completadas;
    }

    logMensaje(`❌ ${estadoNombre} - ${fecha} falló tras ${CONFIG.maxIntentosAPI} intentos`, 'error');
    
    const claveFecha = `${estadoNombre}-${fecha}`;
    if (!estado.fechasFallidas.has(claveFecha)) {
      estado.fechasFallidas.set(claveFecha, { estadoNombre, fecha });
    }
    
    throw new Error(`Falló ${estadoNombre} - ${fecha}`);
  },

  async procesarEstados(fechas) {
    const queue = new PQueue({ concurrency: CONFIG.concurrenciaEstado });

    for (const estadoNombre of CONFIG.estados) {
      queue.add(async () => {
        let fechasProcesadas = 0;
        let totalLicitaciones = 0;

        for (const fecha of fechas) {
          fechasProcesadas++;
          try {
            const licitaciones = await this.procesarFechaEstado(fecha, estadoNombre);
            totalLicitaciones += licitaciones;
          } catch (err) {
            logMensaje(`⚠️ Error ${estadoNombre} - ${fecha}: ${err.message}`, 'warning');
          }
          
          await esperar(CONFIG.tiempoEsperaFechas);
          
          if (fechasProcesadas % 15 === 0) {
            logMensaje(
              `📊 ${estadoNombre}: ${fechasProcesadas}/${fechas.length} fechas`,
              'info'
            );
          }
        }

        logMensaje(
          `🏁 ${estadoNombre}: ${fechasProcesadas} fechas, ${totalLicitaciones} licitaciones`,
          'info'
        );
      });
    }

    await queue.onIdle();
  }
};

// === FUNCIÓN PRINCIPAL ===
const main = async () => {
  // Inicializar estado
  estado.codigosVacios = gestionArchivos.cargarCodigosVacios();
  
  // Cargar códigos fallidos anteriores
  const codigosFallidos = await gestionFallidos.cargarAnteriores();
  if (codigosFallidos.size > 0) {
    logMensaje(`📂 ${codigosFallidos.size} códigos fallidos cargados`, 'info');
    codigosFallidos.forEach(codigo => estado.codigosFallidos.add(codigo));
  }
  
  // Configurar fechas
  const fechaInicio = '2023-07-19';
  const fechaTermino = '2023-07-25';
  const fechas = generarFechas(fechaInicio, fechaTermino);

  logMensaje(`📅 Fechas: ${fechaInicio} hasta ${fechaTermino}`, 'info');
  logMensaje(`📊 Total: ${fechas.length} fechas`, 'info');
  logMensaje(`📆 Primera: ${fechas[0]} | Última: ${fechas[fechas.length - 1]}`, 'info');

  // Procesar estados
  await procesamiento.procesarEstados(fechas);
  
  // Limpiar códigos recuperados
  logMensaje('🧹 Limpiando códigos recuperados...', 'info');
  await gestionFallidos.limpiarRecuperados();
  
  // Reintentar fechas fallidas
  let cicloFechas = 1;
  while (estado.fechasFallidas.size > 0) {
    const totalFallidas = estado.fechasFallidas.size;
    logMensaje(`⚠️ Ciclo ${cicloFechas}: ${totalFallidas} fechas fallidas`, 'warning');
    
    const recuperadas = await reintentos.procesarFechasFallidas();
    logMensaje(`📊 Ciclo ${cicloFechas}: ${recuperadas}/${totalFallidas} recuperadas`, 'info');
    
    if (estado.fechasFallidas.size > 0) {
      logMensaje(`⚠️ ${estado.fechasFallidas.size} fechas siguen fallando`, 'warning');
      cicloFechas++;
      await esperar(5000);
    }
  }
  
  if (estado.fechasFallidas.size === 0) {
    logMensaje(`✅ Todas las fechas recuperadas`, 'success');
  }
  
  // Reintentar códigos fallidos
  let cicloReintentos = 1;
  while (estado.codigosFallidos.size > 0) {
    const totalFallidos = estado.codigosFallidos.size;
    logMensaje(`🔄 Ciclo ${cicloReintentos}: ${totalFallidos} códigos fallidos`, 'info');
    
    const recuperados = await reintentos.procesarCodigosFallidos(
      Array.from(estado.codigosFallidos)
    );
    logMensaje(`📊 Ciclo ${cicloReintentos}: ${recuperados} recuperados`, 'info');
    
    if (estado.codigosFallidos.size === 0) {
      logMensaje(`🎉 Todos los códigos recuperados en ${cicloReintentos} ciclo(s)`, 'success');
      break;
    }
    
    logMensaje(`⏳ ${estado.codigosFallidos.size} códigos pendientes`, 'info');
    await esperar(10000);
    cicloReintentos++;
  }
  
  const mensajeFinal = estado.codigosFallidos.size === 0
    ? `✅ Proceso completado: Todos los códigos recuperados`
    : `⚠️ Proceso completado: ${estado.codigosFallidos.size} códigos pendientes (ver codigos_fallidos.txt)`;
  
  logMensaje(mensajeFinal, estado.codigosFallidos.size === 0 ? 'success' : 'warning');
};

// === EJECUCIÓN ===
iniciarMonitorInactividad();

main()
  .then(() => {
    detenerMonitorInactividad();
    logMensaje('🛑 Ejecución finalizada correctamente', 'info');
    process.exit(0);
  })
  .catch(err => {
    detenerMonitorInactividad();
    logMensaje(`❌ Error no manejado: ${err.message}`, 'error');
    console.error(err);
    process.exit(1);
  });
