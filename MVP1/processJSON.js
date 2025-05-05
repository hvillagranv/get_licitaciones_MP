import fs from 'fs';
import { promises as fsp } from 'fs';
import PQueue from 'p-queue';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const ticket = "0F702DFA-2D0B-4243-897A-84985C4FCA73";
const estados = {
    publicada: path.join(__dirname, 'csv/publicadas.csv'),
    cerrada: path.join(__dirname, 'csv/cerradas.csv'),
    desierta: path.join(__dirname, 'csv/desiertas.csv'),
    revocada: path.join(__dirname, 'csv/revocadas.csv'),
    suspendida: path.join(__dirname, 'csv/suspendidas.csv'),
    adjudicada: path.join(__dirname, 'csv/adjudicadas.csv')
};

const CONCURRENCIA_ESTADO = 1;
const CONCURRENCIA_DETALLES = 20;
const TIEMPO_ESPERA_FECHAS = 4000;

const fallidosPendientes = new Set();
const queueFallidos = new PQueue({ concurrency: 1 });

const now = new Date();
const fechaStr = now.toLocaleString('sv-SE', { timeZone: 'America/Santiago' }).replace(/:/g, '-').replace(' ', '_');
const logFileName = path.join(__dirname, 'logs', `log_${fechaStr}.txt`);

if (!fs.existsSync(path.join(__dirname, 'logs'))) fs.mkdirSync(path.join(__dirname, 'logs'));

const logMensaje = (mensaje, tipo = 'info') => {
    const fechaHora = new Date().toLocaleString('es-CL', {
        timeZone: 'America/Santiago',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    const texto = `[${fechaHora}] [${tipo.toUpperCase()}] ${mensaje}\n`;
    fs.appendFileSync(logFileName, texto);
};

const esperar = (ms) => new Promise(res => setTimeout(res, ms));

const limpiarTexto = (t) => t ? t.replace(/[\r\n\";]+/g, ' ').trim() : '';

const campoTextoCSV = (t) => `"${limpiarTexto(t).replace(/"/g, '""')}"`;

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

const obtenerCodigosProcesados = (archivo) => {
    if (!fs.existsSync(archivo)) return new Set();
    return new Set(fs.readFileSync(archivo, 'utf-8').split('\n').slice(1).map(l => l.split(';')[0]));
};

const fetchJSON = async (url, maxIntentos = 3) => {
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

const guardarDetallesCSV = async (detalles, archivo) => {
    const existe = fs.existsSync(archivo);
    const stream = fs.createWriteStream(archivo, { flags: 'a', encoding: 'utf-8' });

    if (!existe) {
        stream.write('\uFEFFcodigo;nombre;institucion_nombre;institucion_rut;unidad;direccion;comuna;region;tipo;estado;descripcion;fecha_inicio;fecha_final;fecha_adjudicacion;monto_estimado;unidad_monetaria;proveedores_participantes;adjudicados\n');
    }

    for (const d of detalles) {
        stream.write(`${d.codigo};${campoTextoCSV(d.nombre)};${campoTextoCSV(d.institucion_nombre)};${campoTextoCSV(d.institucion_rut)};${campoTextoCSV(d.institucion_unidad)};${campoTextoCSV(d.institucion_direccion)};${campoTextoCSV(d.institucion_comuna)};${campoTextoCSV(d.institucion_region)};${campoTextoCSV(d.tipo)};${campoTextoCSV(d.estado)};${campoTextoCSV(d.descripcion)};${d.fechaInicio};${d.fechaFinal};${d.fechaEstAdj};${d.monto_estimado};${campoTextoCSV(d.unidad_monetaria)};${d.proveedores_participantes};${d.adjudicados}\n`);
    }

    stream.end();
};

// ---------------- DETALLES Y RECUPERACIÓN ----------------

const obtenerDetallesLicitacionConReintentos = async (codigo, maxIntentos = 5) => {
    const url = `https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json?codigo=${codigo}&ticket=${ticket}`;
    const data = await fetchJSON(url, maxIntentos);
    const d = data?.Listado?.[0];
    if (!d) return null;

    return {
        codigo: d.CodigoExterno || "",
        nombre: d.Nombre || "",
        institucion_nombre: d.Comprador?.NombreOrganismo || "",
        institucion_rut: d.Comprador?.RutUnidad || "",
        institucion_unidad: limpiarTexto(d.Comprador?.NombreUnidad),
        institucion_direccion: limpiarTexto(d.Comprador?.DireccionUnidad),
        institucion_comuna: d.Comprador?.ComunaUnidad || "",
        institucion_region: d.Comprador?.RegionUnidad || "",
        tipo: d.Tipo || "",
        estado: d.Estado || "",
        descripcion: limpiarTexto(d.Descripcion),
        fechaInicio: d.Fechas?.FechaPublicacion || "",
        fechaFinal: d.Fechas?.FechaCierre || "",
        fechaEstAdj: d.Fechas?.FechaAdjudicacion || "",
        monto_estimado: d.MontoEstimado || "",
        unidad_monetaria: d.Moneda || "",
        proveedores_participantes: d.Proveedores?.length || 0,
        adjudicados: d.Items?.length || 0
    };
};

const mapearEstado = (estado) => {
    if (!estado) return '';
    
    // Convertir a minúsculas y quitar tildes
    const base = estado.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // Mapeo de estados especiales
    if (base.includes('desierta')) return 'desierta';
    if (base.includes('revocada')) return 'revocada';
    if (base.includes('adjudicada')) return 'adjudicada';
    if (base.includes('cerrada')) return 'cerrada';
    if (base.includes('publicada')) return 'publicada';
    if (base.includes('suspendida')) return 'suspendida';

    return base;
};

const reintentarDetalleHastaExito = async (codigo) => {
    while (true) {
        const detalle = await obtenerDetallesLicitacionConReintentos(codigo, 3);
        if (detalle) {
            const estadoNormalizado = mapearEstado(detalle.estado);
            const archivo = estados[estadoNormalizado];

            if (archivo) {
                const codigos = obtenerCodigosProcesados(archivo);
                if (!codigos.has(codigo)) {
                    await guardarDetallesCSV([detalle], archivo);
                    logMensaje(`🟢 Recuperado ${codigo} y guardado en ${estadoNormalizado}`, 'success');
                } else {
                    logMensaje(`ℹ️ ${codigo} ya estaba registrado en ${estadoNormalizado}`, 'info');
                }
            } else {
                logMensaje(`⚠️ Estado no mapeado: '${detalle.estado}' para ${codigo}`, 'warning');
            }

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
        } else {
            logMensaje(`⏩ ${codigo} ya está en cola de reintento`, 'info');
        }
    }

    return detalle;
};


// ---------------- PROCESAR POR FECHA Y ESTADO ----------------

const procesarFechaEstado = async (fecha, estado, archivo, queueDetalles, codigosProcesados) => {
    const url = `https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json?fecha=${fecha}&estado=${estado}&ticket=${ticket}`;
    let intento = 0;
    const MAX_INTENTOS = 3;

    while (intento < MAX_INTENTOS) {                    
        const data = await fetchJSON(url, 1);
        intento++;

        if (!data || !Array.isArray(data.Listado)) {
            logMensaje(`❌ Respuesta inválida o vacía en ${estado} - ${fecha} (intento ${intento})`, 'error');
            await esperar(2000 * intento);
            continue;
        }

        const licitaciones = data.Listado;
        logMensaje(`📄 ${estado} - ${fecha}: Total obtenidas = ${licitaciones.length}`, 'info');

        if (licitaciones.length === 0 && intento < MAX_INTENTOS) {
            logMensaje(`📭 ${estado} - ${fecha}: sin resultados, reintentando...`, 'warning');
            await esperar(2000);
            continue;
        }

        const nuevas = licitaciones.filter(l => !codigosProcesados.has(l.CodigoExterno));
        logMensaje(`📌 ${estado} - ${fecha}: Nuevas = ${nuevas.length}`, 'info');

        nuevas.forEach(l => {
            queueDetalles.add(async () => {
                const detalle = await obtenerDetallesLicitacionRobusto(l.CodigoExterno);
                if (detalle) {
                    await guardarDetallesCSV([detalle], archivo);
                    codigosProcesados.add(l.CodigoExterno);
                    logMensaje(`✅ Guardado ${detalle.codigo} (${estado} - ${fecha})`, 'success');
                }
            });
        });

        return;
    }

    logMensaje(`❌ ${estado} - ${fecha} falló tras ${MAX_INTENTOS} intentos`, 'error');
};

// ---------------- MAIN ----------------

const main = async () => {
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    const fechaAyer = ayer.toISOString().split('T')[0]; // formato YYYY-MM-DD
    const fechas = generarFechas(fechaAyer);
    const queueEstados = new PQueue({ concurrency: CONCURRENCIA_ESTADO });

    for (const [estado, archivo] of Object.entries(estados)) {
        queueEstados.add(async () => {
            const queueDetalles = new PQueue({ concurrency: CONCURRENCIA_DETALLES });
            const codigosProcesados = obtenerCodigosProcesados(archivo);

            for (const fecha of fechas) {
                await procesarFechaEstado(fecha, estado, archivo, queueDetalles, codigosProcesados);
                await esperar(TIEMPO_ESPERA_FECHAS);
            }

            await queueDetalles.onIdle();
            logMensaje(`🏁 Finalizado: ${estado}`, 'info');
        });
    }

    await queueEstados.onIdle();
    await queueFallidos.onIdle();
    logMensaje("✅ Todas las licitaciones procesadas (incluyendo reintentos).", 'success');
    logMensaje("📝 Log completo guardado en: " + logFileName, 'info');
};

export default main;


/*
PENDIENTES MVP1: Listado de licitaciones publicadas
Utilizar todos los campos de la API

Etapa 2: Información de licitaciones cerradas y adjudicadas
Obtener información de empresas y competidores


*/