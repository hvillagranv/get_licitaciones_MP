import fs from 'fs';
import PQueue from 'p-queue';
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Configuración general
const ticket = "0F702DFA-2D0B-4243-897A-84985C4FCA73";
const estados = {
    publicada: 'csv/publicadas.csv',
    cerrada: 'csv/cerradas.csv',
    desierta: 'csv/desiertas.csv',
    revocada: 'csv/revocadas.csv',
    suspendida: 'csv/suspendidas.csv',
    adjudicada: 'csv/adjudicadas.csv'
};
const CONCURRENCIA_ESTADO = 2;
const CONCURRENCIA_DETALLES = 10;
const TIEMPO_ESPERA_FECHAS = 2000;

// Utilidades
function generarFechas(inicio) {
    const fechas = [];
    const [y, m, d] = inicio.split('-').map(Number);
    let actual = new Date(y, m - 1, d);
    const hoy = new Date();

    while (actual <= hoy) {
        if (actual.getDay() !== 0) {
            const dia = String(actual.getDate()).padStart(2, '0');
            const mes = String(actual.getMonth() + 1).padStart(2, '0');
            const año = actual.getFullYear();
            fechas.push(`${dia}${mes}${año}`);
        }
        actual.setDate(actual.getDate() + 1);
    }
    return fechas;
}

function esperar(ms) {
    return new Promise(res => setTimeout(res, ms));
}

function obtenerCodigosProcesados(archivo) {
    if (!fs.existsSync(archivo)) return new Set();
    return new Set(fs.readFileSync(archivo, 'utf-8').split('\n').slice(1).map(l => l.split(';')[0]));
}

function limpiarTexto(t) {
    return t ? t.replace(/[\r\n\"]+/g, ' ').trim() : '';
}

// Fetch con backoff limitado
async function obtenerDetallesLicitacionConReintentos(codigo, maxIntentos = 5) {
    const url = `https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json?codigo=${codigo}&ticket=${ticket}`;
    let intentos = 0;

    while (intentos < maxIntentos) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(res.statusText);

            const json = await res.json();
            const d = json.Listado?.[0];
            if (!d) throw new Error("No se encontró información en la respuesta.");

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
                descripcion: limpiarTexto(d.Descripcion),
                fechaInicio: d.Fechas?.FechaPublicacion || "",
                fechaFinal: d.Fechas?.FechaCierre || "",
                fechaEstAdj: d.Fechas?.FechaAdjudicacion || "",
                monto_estimado: d.MontoEstimado || "",
                unidad_monetaria: d.Moneda || "",
                proveedores_participantes: d.Proveedores?.length || 0,
                adjudicados: d.Items?.length || 0
            };

        } catch (error) {
            intentos++;
            const waitTime = 1000 * Math.pow(2, intentos);
            if (intentos === 1) {
                console.log(`🔁 Reintentando ${codigo}...`);
            }
            await esperar(waitTime);
        }
    }

    return null;
}

// Guardar CSV
async function guardarDetallesCSV(detalles, archivo) {
    const existe = fs.existsSync(archivo);
    const stream = fs.createWriteStream(archivo, { flags: 'a', encoding: 'utf-8' });

    if (!existe) {
        stream.write('\uFEFFcodigo;nombre;institucion_nombre;institucion_rut;unidad;direccion;comuna;region;tipo;descripcion;fecha_inicio;fecha_final;fecha_adjudicacion;monto_estimado;unidad_monetaria;proveedores_participantes;adjudicados\n');
    }

    detalles.forEach(d => {
        stream.write(`${d.codigo};"${d.nombre}";"${d.institucion_nombre}";"${d.institucion_rut}";"${d.institucion_unidad}";"${d.institucion_direccion}";"${d.institucion_comuna}";"${d.institucion_region}";"${d.tipo}";"${d.descripcion}";${d.fechaInicio};${d.fechaFinal};${d.fechaEstAdj};${d.monto_estimado};"${d.unidad_monetaria}";${d.proveedores_participantes};${d.adjudicados}\n`);
    });

    stream.end();
}

// Cola de fallidos
const queueFallidos = new PQueue({ concurrency: 1 });
const fallidosPendientes = new Set();

async function reintentarDetalleHastaExito(codigo) {
    let intento = 0;

    while (true) {
        intento++;
        const detalle = await obtenerDetallesLicitacionConReintentos(codigo, 3);

        if (detalle) {
            for (const [estado, archivo] of Object.entries(estados)) {
                if (!fs.existsSync(archivo)) continue;
                const codigos = obtenerCodigosProcesados(archivo);
                if (!codigos.has(codigo)) {
                    await guardarDetallesCSV([detalle], archivo);
                    console.log(`🟢 Recuperado ${codigo} y guardado en ${estado}`);
                    break;
                }
            }
            fallidosPendientes.delete(codigo);
            return;
        }

        console.log(`🔁 Fallido persistente ${codigo}, reintentando en 30s...`);
        await esperar(30000);
    }
}

async function obtenerDetallesLicitacionRobusto(codigo) {
    const detalle = await obtenerDetallesLicitacionConReintentos(codigo, 5);

    if (!detalle && !fallidosPendientes.has(codigo)) {
        fallidosPendientes.add(codigo);
        queueFallidos.add(() => reintentarDetalleHastaExito(codigo));
    }

    return detalle;
}

// Procesar una fecha y estado
async function procesarFechaEstado(fecha, estado, archivo, queueDetalles, codigosProcesados) {
    const url = `https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json?fecha=${fecha}&estado=${estado}&ticket=${ticket}`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        const licitaciones = data.Listado || [];

        const nuevas = licitaciones.filter(l => !codigosProcesados.has(l.CodigoExterno));
        if (!nuevas.length) {
            console.log(`📭 ${estado} - ${fecha}: sin nuevas`);
            return;
        }

        nuevas.forEach(l => {
            queueDetalles.add(async () => {
                const detalle = await obtenerDetallesLicitacionRobusto(l.CodigoExterno);
                if (detalle) {
                    await guardarDetallesCSV([detalle], archivo);
                    codigosProcesados.add(l.CodigoExterno);
                    console.log(`✅ Guardado ${detalle.codigo} (${estado} - ${fecha})`);
                }
            });
        });

    } catch (error) {
        console.error(`❌ Error obteniendo ${estado} - ${fecha}: ${error.message}`);
    }
}

// Main
async function main() {
    const fechaInicio = "2025-04-01";
    const fechas = generarFechas(fechaInicio);
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
            console.log(`🏁 Finalizado: ${estado}`);
        });
    }

    await queueEstados.onIdle();
    await queueFallidos.onIdle();
    console.log("✅ Todas las licitaciones procesadas (incluyendo reintentos).");
}

main();



/*
PENDIENTES MVP1: Listado de licitaciones publicadas
Utilizar todos los campos de la API

Etapa 2: Información de licitaciones cerradas y adjudicadas
Obtener información de empresas y competidores


*/