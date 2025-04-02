import fs from 'fs';
import path from 'path';
const { createReadStream, writeFileSync } = fs;
import csv from 'csv-parser';

//Ticket de autenticación
const ticket = "0F702DFA-2D0B-4243-897A-84985C4FCA73";
const archivoPublicadas = 'publicadas.csv';
const archivoDesiertas = 'desiertas.csv';
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
    const codigosProcesados = obtenerCodigosProcesados(archivo);
    let totalNuevas = 0;

    for (const fecha of fechas) {
        try {
            console.log(`📅 Procesando licitaciones de la fecha: ${fecha}`);
            const url = `https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json?fecha=${fecha}&estado=${estado}&ticket=${ticket}`;

            const licitaciones = await obtenerDatos(url, fecha);
            if (!licitaciones.length) {
                console.log(`⚠️ No se encontraron licitaciones para la fecha ${fecha}.`);
                await esperar(1000)
                continue;
            }

            const detallesLicitaciones = [];

            for (const licitacion of licitaciones) {
                if (codigosProcesados.has(licitacion.CodigoExterno)) {
                    console.log(`⏩ Licitación ${licitacion.CodigoExterno} ya procesada. Se omite.`);
                    continue;
                }

                await esperar(1000);
                const detalles = await obtenerDetallesLicitacion(licitacion.CodigoExterno);

                if (detalles) {
                    console.log(`✅ Detalles obtenidos: ${detalles.codigo}`);
                    detallesLicitaciones.push(detalles);
                    totalNuevas++;
                } else {
                    console.log(`⚠️ No se encontraron detalles para ${licitacion.CodigoExterno}`);
                }
            }

            if (detallesLicitaciones.length > 0) {
                await guardarDetallesCSV(detallesLicitaciones, archivo);
            } else {
                console.log('✅ No hay nuevos detalles para guardar.');
            }

        } catch (error) {
            console.error(`❌ Error procesando la fecha ${fecha}: ${error.message}`);
        }

        console.log(`⏳ Esperando ${TIEMPO_ESPERA_FECHAS / 1000} segundos antes de la siguiente fecha...`);
        await esperar(TIEMPO_ESPERA_FECHAS);
    }

    console.log(`\n📊 Total de nuevas licitaciones procesadas: ${totalNuevas}`);
}

const fechaInicio = "2025-03-24"; //Formato: YYYY-MM-DD
const fechas = generarFechas(fechaInicio);

//Ejecutar el proceso por la fecha de inicio indicada
//procesarLicitacionesPorFecha(fechas,"publicada",archivoPublicadas);
//procesarLicitacionesPorFecha(fechas,"desierta",archivoDesiertas);

const outputPath = 'publicadas_filtrado.csv';

const leerCSV = async (filePath) => {
  return new Promise((resolve, reject) => {
    const rows = [];
    createReadStream(filePath)
      .pipe(csv({ separator: ';' }))
      .on('data', (data) => rows.push(data))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
};

const main = async () => {
  try {
    const publicadas = await leerCSV(archivoPublicadas);
    const desiertas = await leerCSV(archivoDesiertas);

    const codigosDesiertas = new Set(desiertas.map(row => row.codigo));
    const publicadasFiltrado = publicadas.filter(row => !codigosDesiertas.has(row.codigo));

    if (publicadasFiltrado.length === 0) {
      console.log('⚠️ No hay registros restantes en publicadas después del filtrado.');
      return;
    }

    const headers = Object.keys(publicadasFiltrado[0]);
    const contenido = [
      headers.join(';'),
      ...publicadasFiltrado.map(row => headers.map(h => row[h]).join(';'))
    ].join('\n');

    writeFileSync(outputPath, contenido, 'utf8');
    console.log(`✅ Archivo filtrado guardado en: ${outputPath}`);
  } catch (err) {
    console.error('❌ Error al procesar los archivos:', err);
  }
};

main();


/*
PENDIENTES MVP1: Listado de licitaciones publicadas
Actualizar licitaciones cerradas, revocadas, desiertas y suspendidas y eliminarlas del listado de publicadas
Utilizar todos los campos de la API

Etapa 2: Información de licitaciones cerradas y adjudicadas
Obtener información de empresas y competidores


*/