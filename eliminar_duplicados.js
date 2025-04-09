import fs from 'fs/promises';
import Papa from 'papaparse';

// Leer un CSV y parsear como JSON
async function leerCSV(ruta) {
  const contenido = await fs.readFile(ruta, 'utf-8');
  const resultado = Papa.parse(contenido, { header: true, skipEmptyLines: true });
  return resultado.data;
}

// Guardar datos en CSV
async function guardarCSV(data, ruta) {
  const csv = Papa.unparse(data, { delimiter: ';' });
  await fs.writeFile(ruta, csv, 'utf-8');
}

// Unir múltiples archivos CSV en un solo array de objetos
async function unirArchivos(rutas) {
  const datosCombinados = [];

  for (const ruta of rutas) {
    const datos = await leerCSV(ruta);
    datosCombinados.push(...datos);
  }

  return datosCombinados;
}

// Eliminar registros de 'origen' que existan en 'referencia' según un campo único
async function eliminarDuplicados(publicadasFile, archivosReferencia, salidaFile, campoUnico = 'codigo') {
  try {
    const publicadas = await leerCSV(publicadasFile);
    const codigosReferencia = new Set(archivosReferencia.map(item => item[campoUnico]));

    const publicadasFiltradas = publicadas.filter(item => !codigosReferencia.has(item[campoUnico]));

    await guardarCSV(publicadasFiltradas, salidaFile);
  } catch (error) {
    console.error("❌ Error al eliminar duplicados:", error);
  }
}

// ------------- CONFIGURACIÓN -------------

const archivosACombinar = [
  'csv/cerradas.csv',
  'csv/desiertas.csv',
  'csv/revocadas.csv',
  'csv/suspendidas.csv',
  'csv/adjudicadas.csv'
];

const archivoPublicadas = 'csv/publicadas.csv';
const archivoResultado = 'csv/publicadas_sin_duplicados.csv';

// ------------- EJECUCIÓN PRINCIPAL -------------

(async () => {
  const combinados = await unirArchivos(archivosACombinar);
  await eliminarDuplicados(archivoPublicadas, combinados, archivoResultado);
})();