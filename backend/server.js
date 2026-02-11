// server.js
import express from "express";
import { pool } from "./connectDB.js";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 5500;

app.use(helmet());

const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:3000").split(",");
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin.trim())) {
      callback(null, true);
    } else {
      callback(new Error("CORS no permitido"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"]
}));

app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ limit: "10kb" }));

// Servir archivos estáticos (CSS, JS) desde frontend/
app.use(express.static(path.join(__dirname, "../frontend")));

// Ruta raíz - HTML servido desde la carpeta base
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../index.html"));
});

app.get("/api/licitaciones", async (req, res) => {
  try {
    const [licitaciones] = await pool.query(`
      SELECT l.codigo_externo AS codigo, l.nombre, l.descripcion,
             c.nombre_organismo AS institucion_nombre, l.monto_estimado,
             l.moneda, l.fecha_inicio, l.fecha_cierre
      FROM licitaciones l
      JOIN compradores c ON l.codigo_externo = c.codigo_externo
      WHERE l.codigo_externo IS NOT NULL
    `);
    res.json({ licitaciones });
  } catch (err) {
    console.error("Error:", err.message);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

app.use((err, req, res, next) => {
  if (err.message === "CORS no permitido") {
    return res.status(403).json({ error: "Origen no autorizado" });
  }
  res.status(500).json({ error: "Error interno del servidor" });
});

app.use((req, res) => {
  if (req.accepts("html")) {
    res.sendFile(path.join(__dirname, "../index.html"));
  } else {
    res.status(404).json({ error: "Ruta no encontrada" });
  }
});

app.listen(PORT, () => {
  console.log(` Servidor disponible: http://localhost:${PORT}`);
  console.log(` CORS: ${allowedOrigins.join(", ")}`);
});

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
