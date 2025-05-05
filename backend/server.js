// server.js
import express from 'express';
import { pool } from './connectDB.js';
import cors from 'cors';

const app = express();
const PORT = 5500;

app.use(cors());



// Ruta principal que consulta la base de datos
app.get('/api/licitaciones', async (req, res) => {
    try {
      console.log('📡 Se recibió una solicitud a /api/licitaciones');
  
      const [licitaciones] = await pool.query(`
        SELECT
          l.codigo_externo AS codigo,
          l.nombre,
          l.descripcion,
          c.nombre_organismo AS institucion_nombre,
          l.monto_estimado,
          l.moneda,
          l.fecha_inicio,
          l.fecha_cierre
        FROM licitaciones l
        JOIN compradores c ON l.codigo_externo = c.codigo_externo
        WHERE l.codigo_externo IS NOT NULL
      `);
  
      res.json({ licitaciones });
    } catch (err) {
      console.error('❌ Error en /api/licitaciones:', err.message);
      console.error(err.stack);
      res.status(500).json({ error: err.message });
    }
  });

  

app.listen(PORT, () => {
  console.log(`🚀 Servidor disponible en: http://localhost:${PORT}`);
});

