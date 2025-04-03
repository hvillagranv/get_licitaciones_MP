import Papa from 'papaparse';
import fs from 'fs';

// Función para leer el archivo CSV
function leerCSV(file) {
  return new Promise((resolve, reject) => {
    fs.readFile(file, 'utf8', (err, data) => {
      if (err) reject(err);
      else {
        const result = Papa.parse(data, { header: true, skipEmptyLines: true });
        resolve(result.data);
      }
    });
  });
}

function guardarCSV(data, file) {
  const csv = Papa.unparse(data, { delimiter: ';' });
  fs.writeFile(file, csv, (err) => {
    if (err) {
      console.error("Error al guardar el archivo:", err);
    } else {
      console.log("Archivo guardado correctamente:", file);
    }
  });
}

async function unirArchivos(archivos) {
  let datosCombinados = [];

  for (const archivo of archivos) {
    const datos = await leerCSV(archivo);
    datosCombinados = [...datosCombinados, ...datos]; 
  }

  return datosCombinados;
}

// Función para eliminar duplicados de 'publicadas.csv' utilizando el archivo combinado
async function eliminarDuplicados(publicadasFile, archivosCombinados, archivoSalida, campoUnico = 'codigo') {
  try {
    // Leer 'publicadas.csv'
    const publicadas = await leerCSV(publicadasFile);

    // Crear un conjunto de códigos únicos del archivo combinado
    const codigosCombinados = new Set(archivosCombinados.map(item => item[campoUnico]));

    // Eliminar duplicados de 'publicadas.csv' que están en el archivo combinado
    const datosSinDuplicados = publicadas.filter(item => !codigosCombinados.has(item[campoUnico]));

    // Guardar el archivo resultante sin duplicados
    guardarCSV(datosSinDuplicados, archivoSalida);
  } catch (error) {
    console.error("Error al eliminar duplicados:", error);
  }
}

// Archivos a combinar
const archivosACombinar = [
  'csv/cerradas.csv',
  'csv/desiertas.csv',
  'csv/revocadas.csv',
  'csv/suspendidas.csv',
  // Agrega aquí cualquier otro archivo que quieras combinar
];

// Archivo 'publicadas.csv' que será procesado
const publicadasFile = 'csv/publicadas.csv'; 

// Archivo de salida
const archivoSalida = 'csv/publicadas_sin_duplicados.csv';

// Ejecutar el proceso
(async () => {
  // Unir los archivos
  const archivosCombinados = await unirArchivos(archivosACombinar);

  // Eliminar duplicados en 'publicadas.csv' basados en el archivo combinado
  eliminarDuplicados(publicadasFile, archivosCombinados, archivoSalida);
})();
