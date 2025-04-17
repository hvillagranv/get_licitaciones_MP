import fs from 'fs/promises';
import Papa from 'papaparse';
import path from 'path';

// Limpieza profunda
function limpiarTexto(valor) {
  if (!valor) return '';
  return valor
    .toString()
    .normalize('NFC')
    .replace(/\u00a0/g, ' ')
    .replace(/\u200B/g, '')
    .replace(/\ufeff/g, '')
    .replace(/[\u2000-\u206F]/g, '')
    .replace(/[\uF000-\uFFFF]/g, '')
    .replace(/[“”‘’•●…¨ºª«»¬°²³´]/g, '')
    .replace(/^"+|"+$/g, '')
    .replace(/""+/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// 📄 Nueva función robusta para leer cualquier CSV
async function leerCSV(ruta) {
  const contenido = await fs.readFile(ruta, 'utf-8');
  const lineas = contenido.split(/\r?\n/);
  if (lineas.length === 0) return [];

  const encabezadoCrudo = lineas[0].split(';').map(h => limpiarTexto(h));
  const totalColumnas = encabezadoCrudo.length;

  const datos = [];
  let omitidas = 0;

  for (let i = 1; i < lineas.length; i++) {
    const linea = lineas[i];
    if (!linea.trim()) continue;

    let columnas = linea.split(';').map(col => limpiarTexto(col));

    if (columnas.length < totalColumnas) {
      columnas = [...columnas, ...Array(totalColumnas - columnas.length).fill('')];
    }

    if (columnas.length > totalColumnas) {
      columnas = columnas.slice(0, totalColumnas);
    }

    const fila = {};
    for (let j = 0; j < totalColumnas; j++) {
      fila[encabezadoCrudo[j]] = columnas[j];
    }

    if (fila[encabezadoCrudo[0]]) {
      datos.push(fila);
    } else {
      omitidas++;
    }
  }

  console.log(`📄 ${ruta} => ${datos.length} filas procesadas, ${omitidas} omitidas`);
  return datos;
}

async function guardarCSV(data, ruta) {
  const csv = Papa.unparse(data, { delimiter: ';' });
  await fs.writeFile(ruta, csv, 'utf-8');
}

async function unirArchivos(rutas) {
  const todos = [];
  for (const ruta of rutas) {
    const nombre = path.basename(ruta, '.csv'); // ej: 'cerradas'
    const datos = await leerCSV(ruta);
    for (const item of datos) {
      item.__estado_origen = nombre.toLowerCase();
      todos.push(item);
    }
  }
  return todos;
}

async function eliminarDuplicados(publicadasFile, archivosReferencia, salidaFile, campoUnico = 'codigo') {
  try {
    const publicadas = await leerCSV(publicadasFile);

    const ordenPrioridadEstado = ['adjudicadas', 'revocadas', 'desiertas', 'suspendidas', 'cerradas'];

    const mapaReferencias = new Map(); // codigo → estado más prioritario
    for (const item of archivosReferencia) {
      const codigo = limpiarTexto(item[campoUnico]);
      const estado = limpiarTexto(item.__estado_origen || '').toLowerCase();

      if (!codigo || !estado) continue;

      const prioridadNueva = ordenPrioridadEstado.indexOf(estado);
      if (prioridadNueva === -1) continue;

      if (!mapaReferencias.has(codigo)) {
        mapaReferencias.set(codigo, estado);
      } else {
        const estadoExistente = mapaReferencias.get(codigo);
        const prioridadExistente = ordenPrioridadEstado.indexOf(estadoExistente);
        if (prioridadNueva < prioridadExistente) {
          mapaReferencias.set(codigo, estado);
        }
      }
    }

    const publicadasFiltradas = [];
    const duplicados = [];

    for (const item of publicadas) {
      const codigoLimpio = limpiarTexto(item[campoUnico]);
      if (!codigoLimpio) continue;

      if (!mapaReferencias.has(codigoLimpio)) {
        publicadasFiltradas.push(item);
      } else {
        const copia = { ...item };
        copia['estado'] = mapaReferencias.get(codigoLimpio);
        duplicados.push(copia);
      }
    }

    console.log(`✅ Publicadas sin menciones: ${publicadasFiltradas.length}`);
    console.log(`🗑️  Registros descartados por duplicados: ${duplicados.length}`);

    await guardarCSV(publicadasFiltradas, salidaFile);
    await guardarCSV(duplicados, salidaFile.replace('.csv', '_repetidos.csv'));
  } catch (error) {
    console.error("❌ Error al eliminar duplicados:", error);
  }
}

// CONFIGURACIÓN
const archivosACombinar = [
  'csv/desiertas.csv',
  'csv/revocadas.csv',
  'csv/suspendidas.csv',
  'csv/adjudicadas.csv',
  'csv/cerradas.csv',
];

const archivoPublicadas = 'csv/publicadas.csv';
const archivoResultado = 'csv/publicadas_sin_duplicados.csv';

// EJECUCIÓN
(async () => {
  const combinados = await unirArchivos(archivosACombinar);
  await eliminarDuplicados(archivoPublicadas, combinados, archivoResultado);
})();
