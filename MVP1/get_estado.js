import fs from 'fs/promises';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import Papa from 'papaparse';
import PQueue from 'p-queue';

const ticket = "0F702DFA-2D0B-4243-897A-84985C4FCA73";
const archivoPublicadas = 'csv/publicadas_sin_duplicados.csv';

const RANGO_INICIO =0;
const RANGO_FIN = 2000;

const CONCURRENCIA_INICIAL = 3;
const CONCURRENCIA_REINTENTOS = 2;
const BATCH_SIZE = 50;
const DELAY_BATCH_MS = 10000;

const estadosDestino = ['publicada', 'cerrada', 'adjudicada', 'desierta', 'revocada', 'suspendida'];

const esperar = ms => new Promise(res => setTimeout(res, ms));

const fetchEstadoActual = async (codigo, reintentos = 3) => {
    const url = `https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json?codigo=${codigo}&ticket=${ticket}`;
    for (let i = 0; i < reintentos; i++) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            return data?.Listado?.[0]?.Estado || 'NO_ENCONTRADA';
        } catch {
            if (i < reintentos - 1) await esperar(1000 * (i + 1));
        }
    }
    return 'ERROR';
};

const mapearEstado = (estado) => {
    if (!estado) return 'desconocido';
    const base = estado.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, '');
    for (const e of estadosDestino) {
        if (base.includes(e)) return e;
    }
    return base;
};

const leerCodigosExistentes = (ruta) => {
    if (!existsSync(ruta)) return new Set();
    const contenido = readFileSync(ruta, 'utf-8');
    const lineas = contenido.split('\n').slice(1);
    return new Set(lineas.map(l => l.split(';')[0]));
};

const guardarRegistroCompleto = async (registroOriginal, estadoDestino, encabezado) => {
    const carpeta = 'csv';
    const archivoDestino = path.join(carpeta, `${estadoDestino}s.csv`);

    if (!existsSync(carpeta)) {
        mkdirSync(carpeta);
    }

    const codigosExistentes = leerCodigosExistentes(archivoDestino);
    if (codigosExistentes.has(registroOriginal.codigo)) {
        console.log(`🟡 Ya está ${registroOriginal.codigo} en ${estadoDestino}s.csv`);
        return;
    }

    const fila = encabezado.map(campo => registroOriginal[campo] ?? '').join(';') + '\n';
    const necesitaEncabezado = !existsSync(archivoDestino);

    if (necesitaEncabezado) {
        const encabezadoStr = encabezado.join(';') + '\n';
        await fs.writeFile(archivoDestino, '\uFEFF' + encabezadoStr + fila, 'utf-8');
    } else {
        await fs.appendFile(archivoDestino, fila, 'utf-8');
    }

    console.log(`📁 Copiado ${registroOriginal.codigo} a ${estadoDestino}s.csv`);
};

const procesar = async () => {
    const contenido = await fs.readFile(archivoPublicadas, 'utf-8');
    const { data, meta } = Papa.parse(contenido, {
        header: true,
        delimiter: ';',
        skipEmptyLines: true
    });

    const subset = data.slice(RANGO_INICIO, RANGO_FIN);
    const queuePrincipal = new PQueue({ concurrency: CONCURRENCIA_INICIAL });
    const queueReintentos = new PQueue({ concurrency: CONCURRENCIA_REINTENTOS });

    const fallidos = [];
    const codigosMovidos = new Set();

    // 🔁 Proceso principal con concurrencia
    await Promise.all(subset.map(fila => {
        const codigo = fila.codigo;
        if (!codigo) return;

        return queuePrincipal.add(async () => {
            await esperar(200 + Math.random() * 800);
            console.log(`🔍 Consultando ${codigo}`);
            const estadoActual = await fetchEstadoActual(codigo);
            const estadoMapeado = mapearEstado(estadoActual);

            if (estadoActual === 'ERROR') {
                fallidos.push(fila);
                return;
            }

            const estadoOriginal = mapearEstado(fila.estado);
            if (estadoMapeado !== estadoOriginal && estadosDestino.includes(estadoMapeado)) {
                await guardarRegistroCompleto(fila, estadoMapeado, meta.fields);
                codigosMovidos.add(codigo);
            }
        });
    }));

    await queuePrincipal.onIdle();

    // 🔁 Reintentos con concurrencia
    await Promise.all(fallidos.map(fila => {
        const codigo = fila.codigo;
        return queueReintentos.add(async () => {
            while (true) {
                console.log(`⏳ Reintentando ${codigo}`);
                const estadoActual = await fetchEstadoActual(codigo, 3);
                const estadoMapeado = mapearEstado(estadoActual);

                if (estadoActual !== 'ERROR') {
                    const estadoOriginal = mapearEstado(fila.estado);
                    if (estadoMapeado !== estadoOriginal && estadosDestino.includes(estadoMapeado)) {
                        await guardarRegistroCompleto(fila, estadoMapeado, meta.fields);
                        codigosMovidos.add(codigo);
                    }
                    break;
                } else {
                    console.log(`⚠️ Fallido persistente ${codigo}, esperando...`);
                    await esperar(3000 + Math.random() * 3000);
                }
            }
        });
    }));

    await queueReintentos.onIdle();

    // 🧹 Eliminar migrados de publicadas
    const dataFiltrada = data.filter(f => !codigosMovidos.has(f.codigo));
    const csvFinal = [
        meta.fields.join(';'),
        ...dataFiltrada.map(fila => meta.fields.map(f => fila[f] ?? '').join(';'))
    ].join('\n');

    await fs.writeFile(archivoPublicadas, '\uFEFF' + csvFinal, 'utf-8');

    console.log(`🧹 Eliminados ${codigosMovidos.size} de publicadas`);
    console.log('✅ Proceso completo con concurrencia.');
};

procesar();
