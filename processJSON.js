import fs from 'fs';

//Ticket de autenticación
const ticket = "0F702DFA-2D0B-4243-897A-84985C4FCA73";
const archivoPublicadas = 'csv/publicadas.csv';
const archivoDesiertas = 'csv/desiertas.csv';
const archivoCerradas = 'csv/cerradas.csv';
const archivoRevocadas = 'csv/revocadas.csv';
const archivoSuspendidas = 'csv/suspendidas.csv';
const archivoAdjudicadas = 'csv/adjudicadas.csv';
const TIEMPO_ESPERA_FECHAS = 3000;

function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function generarFechas(inicio) {
    const fechas = [];
    const [anioInicio, mesInicio, diaInicio] = inicio.split('-').map(Number);

    let actual = new Date(anioInicio, mesInicio - 1, diaInicio);
    const ahora = new Date();
    const fechaLimite = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());

    while (actual <= fechaLimite) {
        if (actual.getDay() !== 0) { // 0 es domingo, ya que los domingos no hay licitaciones, por lo que se ignora del conteo
            const dia = String(actual.getDate()).padStart(2, '0');
            const mes = String(actual.getMonth() + 1).padStart(2, '0');
            const año = actual.getFullYear();
            fechas.push(`${dia}${mes}${año}`);
        }
        actual.setDate(actual.getDate() + 1);
    }

    return fechas;
}

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

//Función para obtener los códigos ya procesados
function obtenerCodigosProcesados(archivo) {
    if (!fs.existsSync(archivo)) return new Set();
    
    const contenido = fs.readFileSync(archivo, 'utf-8').split("\n");
    const codigos = new Set(contenido.slice(1).map(linea => linea.split(";")[0]));
    return codigos;
}

//Función para limpiar los textos eliminando saltos de línea
function limpiarTexto(texto) {
    return texto ? texto.replace(/[\r\n\"]+/g, ' ').trim() : "";
}

//Función para obtener detalles de una licitación
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
            nombre: detalles.Nombre || "",
            institucion_nombre: detalles.Comprador?.NombreOrganismo || "",
            institucion_rut: detalles.Comprador?.RutUnidad || "",
            institucion_unidad: limpiarTexto(detalles.Comprador?.NombreUnidad) || "",
            institucion_direccion: limpiarTexto(detalles.Comprador?.DireccionUnidad) || "",
            institucion_comuna: detalles.Comprador?.ComunaUnidad || "",
            institucion_region: detalles.Comprador?.RegionUnidad || "",
            tipo: detalles.Tipo || "",
            descripcion: limpiarTexto(detalles.Descripcion),
            fechaInicio: detalles.Fechas?.FechaPublicacion || "",
            fechaFinal: detalles.Fechas?.FechaCierre || "",
            fechaEstAdj: detalles.Fechas?.FechaAdjudicacion || "",
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

//Función para guardar los detalles en CSV
async function guardarDetallesCSV(detalles,archivo) {
    try {
        const existeArchivo = fs.existsSync(archivo);
        const stream = fs.createWriteStream(archivo, { flags: 'a', encoding: 'utf-8' });

        //Encabezados del archivo
        if (!existeArchivo) {
            stream.write('\uFEFFcodigo;nombre;institucion_nombre;institucion_rut;unidad;direccion;comuna;region;tipo;descripcion;fecha_inicio;fecha_final;fecha_adjudicacion;monto_estimado;unidad_monetaria;proveedores_participantes;adjudicados\n');
        }

        detalles.forEach(d => {
            stream.write(`${d.codigo};"${d.nombre}";"${d.institucion_nombre}";"${d.institucion_rut}";"${d.institucion_unidad}";"${d.institucion_direccion}";"${d.institucion_comuna}";"${d.institucion_region}";"${d.tipo}";"${d.descripcion}";${d.fechaInicio};${d.fechaFinal};${d.fechaEstAdj};${d.monto_estimado};"${d.unidad_monetaria}";${d.proveedores_participantes};${d.adjudicados}\n`);
        });

        stream.end();
        console.log(`✅ ${detalles.length} nuevos detalles guardados en ${archivo}`);
    } catch (error) {
        console.error('❌ Error al guardar detalles en CSV:', error);
    }
}

//Función principal para procesar las licitaciones por fecha
async function procesarLicitacionesPorFecha(fechas, estado, archivo) {
    let codigosProcesados = obtenerCodigosProcesados(archivo);  // Obtener códigos procesados previos
    let totalNuevas = 0;
    let totalLicitaciones = 0;  // Total de todas las licitaciones (procesadas y no procesadas)
    let totalProcesadas = 0;  // Contador de licitaciones procesadas (nuevas y previas)

    for (const fecha of fechas) {
        try {
            console.log(`📅 Procesando licitaciones de la fecha: ${fecha}`);
            const url = `https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json?fecha=${fecha}&estado=${estado}&ticket=${ticket}`;

            let licitaciones = await obtenerDatos(url, fecha);
            if (!licitaciones.length) {
                console.log(`⚠️ No se encontraron licitaciones para la fecha ${fecha}.`);
                await esperar(2000);
                continue;  // Si no hay licitaciones, continuamos con la siguiente fecha
            }

            totalLicitaciones += licitaciones.length;  // Incrementa el total de licitaciones

            let detallesLicitaciones = [];
            let licitacionesProcesadas = 0;

            // Ejecutar hasta que todas las licitaciones se procesen
            for (const licitacion of licitaciones) {
                // Verifica si la licitación ya ha sido procesada
                if (codigosProcesados.has(licitacion.CodigoExterno)) {
                    totalProcesadas++;  // Se cuenta como procesada, pero no imprimimos mensaje
                    continue;
                }

                await esperar(1000);
                const detalles = await obtenerDetallesLicitacion(licitacion.CodigoExterno);

                if (detalles) {
                    console.log(`✅ Detalles obtenidos: ${detalles.codigo}`);
                    detallesLicitaciones.push(detalles);
                    totalNuevas++;  // Solo contar las nuevas licitaciones procesadas
                    codigosProcesados.add(licitacion.CodigoExterno);  // Agregar código procesado
                } else {
                    console.log(`⚠️ No se encontraron detalles para ${licitacion.CodigoExterno}`);
                }
                licitacionesProcesadas++;  // Contamos las licitaciones procesadas
            }

            // Guardar las licitaciones procesadas en el archivo CSV
            if (detallesLicitaciones.length > 0) {
                await guardarDetallesCSV(detallesLicitaciones, archivo);
            } else {
                console.log('✅ No hay nuevos detalles para guardar.');
            }

            // Mostrar información de licitaciones procesadas por fecha
            const licitacionesFaltantes = totalLicitaciones - totalProcesadas;
            console.log(`\n📊 Fecha: ${fecha}`);
            console.log(`📊 Total de licitaciones: ${totalLicitaciones}`);
            console.log(`📊 Licitaciones procesadas: ${totalProcesadas}`);
            console.log(`📊 Licitaciones faltantes por procesar: ${licitacionesFaltantes}`);

            if (licitacionesFaltantes > 0) {
                console.log(`⚠️ Aún faltan ${licitacionesFaltantes} licitaciones por procesar en esta fecha. Reintentando...`);
                // Reintentar el procesamiento de esta fecha
                await esperar(2000);
                await procesarLicitacionesPorFecha([fecha], estado, archivo);  // Reintentar solo la fecha actual
            } else {
                console.log("✅ Todas las licitaciones de esta fecha han sido procesadas!");
            }

            // Esperar solo una vez después de procesar todas las licitaciones de la fecha actual
            console.log(`⏳ Esperando ${TIEMPO_ESPERA_FECHAS / 1000} segundos antes de la siguiente fecha...`);
            await esperar(TIEMPO_ESPERA_FECHAS);

        } catch (error) {
            console.error(`❌ Error procesando la fecha ${fecha}: ${error.message}`);
        }
    }
}


const fechaInicio = "2025-04-01"; //Formato: YYYY-MM-DD
const fechas = generarFechas(fechaInicio);

//Ejecutar el proceso por la fecha de inicio indicada
procesarLicitacionesPorFecha(fechas,"publicada",archivoPublicadas);
procesarLicitacionesPorFecha(fechas,"cerrada",archivoCerradas);
procesarLicitacionesPorFecha(fechas,"desierta",archivoDesiertas);
procesarLicitacionesPorFecha(fechas,"revocada",archivoRevocadas);
procesarLicitacionesPorFecha(fechas,"suspendida",archivoSuspendidas);
//procesarLicitacionesPorFecha(fechas,"adjudicada",archivoAdjudicadas);


/*
PENDIENTES MVP1: Listado de licitaciones publicadas
Actualizar licitaciones cerradas, revocadas, desiertas y suspendidas y eliminarlas del listado de publicadas
Utilizar todos los campos de la API

Etapa 2: Información de licitaciones cerradas y adjudicadas
Obtener información de empresas y competidores


*/