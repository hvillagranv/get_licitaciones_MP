import fs from 'fs';
import csv from 'csv-parser';
import { pool } from './connectDB.js';

// Leer CSV
const leerCodigosDesdeCSV = (rutaCSV) => {
  return new Promise((resolve, reject) => {
    const codigos = [];
    fs.createReadStream(rutaCSV)
      .pipe(csv({ headers: false }))
      .on('data', (row) => {
        // row es un objeto con claves '0', '1', etc. si headers: false
        codigos.push(row[0]);
      })
      .on('end', () => resolve(codigos))
      .on('error', reject);
  });
};

const verificarCodigos = async () => {
  const codigos = await leerCodigosDesdeCSV('./backend/codigos_externos.csv');
  if (codigos.length === 0) {
    console.log('No se encontraron códigos en el CSV.');
    return;
  }

  const conn = await pool.getConnection();
  try {
    // Crear tabla temporal
    await conn.query('DROP TEMPORARY TABLE IF EXISTS codigos_verificar');
    await conn.query(`
      CREATE TEMPORARY TABLE codigos_verificar (
        codigo_externo VARCHAR(50)
      )
    `);

    // Insertar los códigos
    const insertQuery = 'INSERT INTO codigos_verificar (codigo_externo) VALUES ?';
    const valores = codigos.map(codigo => [codigo]);
    await conn.query(insertQuery, [valores]);

    // Obtener los que existen
    const [existentes] = await conn.query(`
      SELECT c.codigo_externo
      FROM codigos_verificar c
      JOIN licitaciones l ON c.codigo_externo = l.codigo_externo
    `);

    // Obtener los que no existen
    const [noExistentes] = await conn.query(`
      SELECT c.codigo_externo
      FROM codigos_verificar c
      LEFT JOIN licitaciones l ON c.codigo_externo = l.codigo_externo
      WHERE l.codigo_externo IS NULL
    `);

    console.log('✅ Códigos que SÍ existen en la BD:', existentes.map(r => r.codigo_externo));
    console.log('❌ Códigos que NO existen en la BD:', noExistentes.map(r => r.codigo_externo));
  } catch (err) {
    console.error('Error al verificar códigos:', err);
  } finally {
    conn.release();
  }
};

verificarCodigos()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async err => {
    console.error(err);
    await pool.end();
    process.exit(1);
  });