import fs from 'fs';

// Ticket de autenticación
const ticket = "0F702DFA-2D0B-4243-897A-84985C4FCA73";

// Archivo CSV donde se guardan los detalles de licitaciones
const archivoDetalles = 'detalles.csv';

// Tiempo de espera entre consultas de fechas (en milisegundos)
const TIEMPO_ESPERA_FECHAS = 3000; // 3 segundos

// Función para esperar un tiempo determinado
function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Función para generar un rango de fechas en formato `ddMMyyyy`
function generarFechas(inicio, fin) {
    const fechas = [];
    let actual = new Date(inicio);
    const fechaFin = new Date(fin);

    while (actual <= fechaFin) {
        const dia = String(actual.getDate()).padStart(2, '0');
        const mes = String(actual.getMonth() + 1).padStart(2, '0'); // Enero = 0
        const año = actual.getFullYear();
        fechas.push(`${dia}${mes}${año}`);
        actual.setDate(actual.getDate() + 1);
    }
    return fechas;
}

// Función para obtener datos de la API
async function obtenerDatos(url, fecha) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.warn(`⚠️ Advertencia: No se pudo obtener licitaciones para la fecha ${fecha} - ${response.statusText}`);
            return [];
        }
        const data = await response.json();
        return data.Listado || [];
    } catch (error) {
        console.error(`❌ Error al obtener los datos para la fecha ${fecha}:`, error.message);
        return [];
    }
}

// Función para obtener los códigos ya procesados
function obtenerCodigosProcesados() {
    if (!fs.existsSync(archivoDetalles)) return new Set();
    
    const contenido = fs.readFileSync(archivoDetalles, 'utf-8').split("\n");
    const codigos = new Set(contenido.slice(1).map(linea => linea.split(";")[0])); // Extrae solo el código
    return codigos;
}

// Función para limpiar la descripción eliminando saltos de línea
function limpiarDescripcion(texto) {
    return texto ? texto.replace(/\r?\n|\r/g, ' ').trim() : "";
}

// Función para obtener detalles de una licitación
async function obtenerDetallesLicitacion(codigoExterno) {
    const urlDetalles = `https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json?codigo=${codigoExterno}&ticket=${ticket}`;
    
    try {
        const response = await fetch(urlDetalles);
        if (!response.ok) throw new Error(`Error en la solicitud de detalles: ${response.statusText}`);
        
        const data = await response.json();
        const detalles = data.Listado[0];

        if (!detalles) return null;

        return {
            codigo: detalles.CodigoExterno || "",
            institucion_nombre: detalles.Comprador?.Nombre || "",
            institucion_rut: detalles.Comprador?.RutUnidad || "",
            tipo: detalles.Tipo || "",
            descripcion: limpiarDescripcion(detalles.Descripcion),
            fechaInicio: detalles.Fecha?.Inicio || "",
            fechaFinal: detalles.Fecha?.Final || "",
            monto_estimado: detalles.MontoEstimado || "",
            unidad_monetaria: detalles.Moneda || "",
            proveedores_participantes: detalles.Proveedores?.length || 0,
            adjudicados: detalles.Items?.length || 0
        };

    } catch (error) {
        console.error(`⚠️ Error al obtener detalles de ${codigoExterno}:`, error);
        return null;
    }
}

// Función para guardar los detalles en CSV
async function guardarDetallesCSV(detalles) {
    try {
        const existeArchivo = fs.existsSync(archivoDetalles);
        const stream = fs.createWriteStream(archivoDetalles, { flags: 'a', encoding: 'utf-8' });

        // Escribir encabezados si el archivo no existe
        if (!existeArchivo) {
            stream.write('\uFEFFcodigo;institucion_nombre;institucion_rut;tipo;descripcion;fecha_inicio;fecha_final;monto_estimado;unidad_monetaria;proveedores_participantes;adjudicados\n');
        }

        // Escribir cada fila en el archivo CSV
        detalles.forEach(d => {
            stream.write(`${d.codigo};"${d.institucion_nombre}";"${d.institucion_rut}";"${d.tipo}";"${d.descripcion}";${d.fechaInicio};${d.fechaFinal};${d.monto_estimado};"${d.unidad_monetaria}";${d.proveedores_participantes};${d.adjudicados}\n`);
        });

        stream.end();
        console.log(`✅ ${detalles.length} nuevos detalles guardados en ${archivoDetalles}`);
    } catch (error) {
        console.error('❌ Error al guardar detalles en CSV:', error);
    }
}

// Función principal para procesar las licitaciones por fecha
async function procesarLicitacionesPorFecha(fechas) {
    const codigosProcesados = obtenerCodigosProcesados();

    for (const fecha of fechas) {
        console.log(`📅 Procesando licitaciones de la fecha: ${fecha}`);
        const url = `https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json?fecha=${fecha}&estado=publicada&ticket=${ticket}`;

        const licitaciones = await obtenerDatos(url, fecha);
        if (!licitaciones.length) {
            console.log(`⚠️ No se encontraron licitaciones para la fecha ${fecha}.`);
            continue;
        }

        const detallesLicitaciones = [];

        for (const licitacion of licitaciones) {
            if (codigosProcesados.has(licitacion.CodigoExterno)) {
                console.log(`⏩ Licitación ${licitacion.CodigoExterno} ya procesada. Se omite.`);
                continue;
            }

            await new Promise(resolve => setTimeout(resolve, 1500)); // Evitar sobrecarga de API
            const detalles = await obtenerDetallesLicitacion(licitacion.CodigoExterno);

            if (detalles) {
                console.log(`✅ Detalles obtenidos: ${detalles.codigo}`);
                detallesLicitaciones.push(detalles);
            } else {
                console.log(`⚠️ No se encontraron detalles para ${licitacion.CodigoExterno}`);
            }
        }

        if (detallesLicitaciones.length > 0) {
            await guardarDetallesCSV(detallesLicitaciones);
        } else {
            console.log('✅ No hay nuevos detalles para guardar.');
        }

        // Esperar antes de la siguiente fecha
        console.log(`⏳ Esperando ${TIEMPO_ESPERA_FECHAS / 1000} segundos antes de la siguiente fecha...`);
        await esperar(TIEMPO_ESPERA_FECHAS);
    }
}

// **Configurar rango de fechas**
const fechaInicio = "2025-02-20"; // Formato: YYYY-MM-DD
const fechaFin = "2025-02-26";
const fechas = generarFechas(fechaInicio, fechaFin);

// Ejecutar el proceso por fechas
procesarLicitacionesPorFecha(fechas);

