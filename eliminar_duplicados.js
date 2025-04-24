import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import readline from 'readline';
import ejecutarExtraccion from './processJSON.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

// 🧠 Carga códigos en un Set por archivo de referencia (una sola vez)
async function cargarCodigosPorArchivo(ruta) {
  const codigos = new Set();
  const estado = path.basename(ruta, '.csv').toLowerCase();

  const stream = fsSync.createReadStream(ruta, 'utf-8');
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let isFirstLine = true;
  for await (const line of rl) {
    if (isFirstLine) { isFirstLine = false; continue; }
    if (!line.trim()) continue;
    const columnas = line.split(';');
    const codigo = limpiarTexto(columnas[0]);
    if (codigo) codigos.add(codigo);
  }

  return { estado, codigos };
}

// 🧼 Elimina duplicados comparando línea por línea con Sets precargados
async function eliminarDuplicadosTiempoReal(publicadasPath, archivosReferencia, salidaPath) {
  const referencias = [];
  for (const ruta of archivosReferencia) {
    const resultado = await cargarCodigosPorArchivo(ruta);
    referencias.push(resultado);
  }

  const streamPublicadas = fsSync.createReadStream(publicadasPath, 'utf-8');
  const rl = readline.createInterface({ input: streamPublicadas, crlfDelay: Infinity });

  const salidaStream = fsSync.createWriteStream(salidaPath, 'utf-8');
  const duplicadosStream = fsSync.createWriteStream(salidaPath.replace('.csv', '_repetidos.csv'), 'utf-8');

  let headers = [];
  let total = 0;
  let duplicados = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    const columnas = line.split(';');

    if (headers.length === 0) {
      headers = columnas.map(limpiarTexto);
      salidaStream.write(line + '\n');
      duplicadosStream.write(line + ';estado\n');
      continue;
    }

    const fila = {};
    headers.forEach((h, i) => fila[h] = limpiarTexto(columnas[i]));
    const codigo = limpiarTexto(fila['codigo']);

    let estadoDuplicado = null;
    for (const ref of referencias) {
      if (ref.codigos.has(codigo)) {
        estadoDuplicado = ref.estado;
        break;
      }
    }

    if (estadoDuplicado) {
      duplicados++;
      duplicadosStream.write(line + ';' + estadoDuplicado + '\n');
    } else {
      total++;
      salidaStream.write(line + '\n');
    }
  }

  salidaStream.end();
  duplicadosStream.end();

  console.log(`✅ Publicadas sin menciones: ${total}`);
  console.log(`🗑️  Registros descartados por duplicados: ${duplicados}`);
}

// 🗂️ Configuración de rutas
const archivosReferencia = [
  path.join(__dirname, 'csv/desiertas.csv'),
  path.join(__dirname, 'csv/revocadas.csv'),
  path.join(__dirname, 'csv/suspendidas.csv'),
  path.join(__dirname, 'csv/adjudicadas.csv'),
  path.join(__dirname, 'csv/cerradas.csv'),
];

const archivoPublicadas = path.join(__dirname, 'csv/publicadas.csv');
const archivoResultado = path.join(__dirname, 'csv/publicadas_sin_duplicados.csv');

// 🏁 Ejecución
(async () => {
  await ejecutarExtraccion(); // si no se requiere, comenta esta línea
  await eliminarDuplicadosTiempoReal(archivoPublicadas, archivosReferencia, archivoResultado);
})();
