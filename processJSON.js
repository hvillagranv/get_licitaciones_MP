import fs from 'fs';

//Reemplazar por el ticket obtenido en api.mercadopublico.cl
const ticket = "0F702DFA-2D0B-4243-897A-84985C4FCA73";

async function obtenerDatos(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Error en la solicitud: ${response.statusText}`);
        
        const data = await response.json();
        return data.Listado;
    } catch (error) {
        console.error('❌ Error al obtener los datos:', error);
        return [];
    }
}

function extraerDatos(licitaciones) {
    return licitaciones.map(licitacion => ({
        codigo: licitacion.CodigoExterno || "",
        nombre: licitacion.Nombre || "",
        estado: licitacion.CodigoEstado || "",
        fechaCierre: licitacion.FechaCierre || ""
    }));
}

function limpiarDescripcion(texto) {
    return texto ? texto.replace(/\r?\n|\r/g, ' ').trim() : "";
}

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
            institucion_nombre: detalles.Comprador?.Nombre || "",
            institucion_rut: detalles.Comprador?.RutUnidad || "",
            tipo: detalles.Tipo || "",
            descripcion: limpiarDescripcion(detalles.Descripcion),
            fechaInicio: detalles.Fecha?.Inicio || "",
            fechaFinal: detalles.Fecha?.Final || "",
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

// Función para guardar los datos generales en CSV
async function guardarLocalCSV(datos) {
    try {
        const encabezados = 'codigo,nombre,estado,fecha_cierre\n';
        const filas = datos.map(d => `${d.codigo},"${d.nombre}",${d.estado},${d.fechaCierre}`).join('\n');

        fs.writeFileSync('datos.csv', '\uFEFF' + encabezados + filas, 'utf-8');
        console.log('✅ Datos generales guardados en datos.csv');
    } catch (error) {
        console.error('❌ Error al guardar datos en CSV:', error);
    }
}

// Función para guardar los detalles en CSV
async function guardarDetallesCSV(detalles) {
    try {
        const encabezados = 'codigo,institucion_nombre,institucion_rut,tipo,descripcion,fecha_inicio,fecha_final,monto_estimado,unidad_monetaria,proveedores_participantes,adjudicados\n';
        const filas = detalles.map(d =>
            `${d.codigo},"${d.institucion_nombre}","${d.institucion_rut}","${d.tipo}","${d.descripcion}",${d.fechaInicio},${d.fechaFinal},${d.monto_estimado},"${d.unidad_monetaria}",${d.proveedores_participantes},${d.adjudicados}`
        ).join('\n');

        fs.writeFileSync('detalles.csv', '\uFEFF' + encabezados + filas, 'utf-8');
        console.log('✅ Detalles guardados en detalles.csv');
    } catch (error) {
        console.error('❌ Error al guardar detalles en CSV:', error);
    }
}

// Función principal para procesar las licitaciones
async function procesarLicitaciones(url) {
    const licitaciones = await obtenerDatos(url);
    if (!licitaciones.length) {
        console.log('⚠️ No se encontraron licitaciones.');
        return;
    }

    const datosExtraidos = extraerDatos(licitaciones);
    const detallesLicitaciones = [];

    for (const licitacion of datosExtraidos) {
        await new Promise(resolve => setTimeout(resolve, 1500)); // Evitar sobrecarga de API
        const detalles = await obtenerDetallesLicitacion(licitacion.codigo);

        if (detalles) {
            console.log(`✅ Detalles obtenidos: ${detalles.codigo}`);
            detallesLicitaciones.push(detalles);
        } else {
            console.log(`⚠️ No se encontraron detalles para ${licitacion.codigo}`);
        }
    }

    await guardarLocalCSV(datosExtraidos);
    await guardarDetallesCSV(detallesLicitaciones);
}

const fechaConsulta = "25022025";
const url = `https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json?fecha=${fechaConsulta}&estado=publicada&ticket=${ticket}`;

procesarLicitaciones(url);
