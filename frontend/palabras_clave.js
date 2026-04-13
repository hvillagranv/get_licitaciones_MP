console.log("Palabras clave: script activo");

let datos = [];
let columnaOrdenada = 'fecha_inicio';
let ordenAscendente = false;
let paginaActual = 1;
const filasPorPagina = 10;
let textoFiltro = '';
let palabrasSeleccionadas = [];
let palabrasDisponibles = [];
let palabrasMap = new Map();
let datosFiltradosActuales = [];
let aliasInstituciones = {};
let cargandoListado = false;

actualizarListadoLicitaciones({ resetPagina: true });

cargarPalabrasClave();

document.addEventListener('DOMContentLoaded', () => {
  actualizarResumenPalabras();
});

async function actualizarListadoLicitaciones({ resetPagina = false, mostrarEstado = true } = {}) {
  if (cargandoListado) return;
  cargandoListado = true;
  setEstadoActualizacion('Actualizando listado...');
  setBotonActualizacionEstado(true);

  try {
    const res = await fetch('api/licitacionesPub.php', { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const { licitaciones, instituciones } = await res.json();
    datos = (licitaciones || []).filter(item => item.codigo);

    if (instituciones && instituciones.length > 0) {
      aliasInstituciones = Object.fromEntries(instituciones.map(item => [item.id, item.alias]));
    } else {
      cargarInstitucionesDesdeCSV();
    }

    ordenarDatos();
    filtrarDatos(resetPagina);

    if (mostrarEstado) {
      setEstadoActualizacion(`Listado actualizado: ${new Date().toLocaleString('es-CL')}`);
    }
  } catch (err) {
    console.error('Error al cargar licitaciones:', err);
    setEstadoActualizacion('No se pudo actualizar el listado. Intenta nuevamente.');
  } finally {
    cargandoListado = false;
    setBotonActualizacionEstado(false);
  }
}

function actualizarListadoManual() {
  actualizarListadoLicitaciones({ resetPagina: false, mostrarEstado: true });
}

function setBotonActualizacionEstado(cargando) {
  const boton = document.getElementById('btnActualizarListado');
  if (!boton) return;
  boton.disabled = cargando;
  boton.innerHTML = cargando
    ? '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Actualizando...'
    : '<i class="bi bi-arrow-clockwise"></i> Actualizar listado';
}

function setEstadoActualizacion(mensaje) {
  const estado = document.getElementById('estadoActualizacion');
  if (!estado) return;
  estado.textContent = mensaje || '';
}

function cargarPalabrasClave() {
  Papa.parse('data/csv/palabras_clave.csv', {
    download: true,
    header: true,
    delimiter: ';',
    complete: (results) => {
      const filas = Array.isArray(results.data) ? results.data : [];
      palabrasDisponibles = filas
        .map(row => {
          const valores = Object.values(row)
            .map(valor => (valor || '').toString().trim())
            .filter(valor => valor.length > 0);
          if (valores.length === 0) return null;
          const base = valores[0];
          const variantesOriginales = Array.from(new Set(valores));
          const variantesNormalizadas = Array.from(new Set(valores.map(normalizarTexto)));
          return { base, variantesOriginales, variantesNormalizadas };
        })
        .filter(Boolean)
        .sort((a, b) => a.base.localeCompare(b.base, 'es'));

      palabrasMap = new Map(palabrasDisponibles.map(item => [item.base, item]));
      renderizarCheckboxes();
      actualizarResumenPalabras();
      filtrarDatos();
    },
    error: (error) => {
      console.error('Error al cargar palabras clave:', error);
    }
  });
}

function cargarInstitucionesDesdeCSV() {
  Papa.parse('data/csv/instituciones.csv', {
    download: true,
    header: true,
    delimiter: ';',
    complete: (results) => {
      aliasInstituciones = Object.fromEntries((results.data || []).map(item => [item.id, item.alias]));
      ordenarDatos();
      filtrarDatos();
    },
    error: (error) => {
      console.error('Error al cargar instituciones desde CSV:', error);
    }
  });
}

function renderizarCheckboxes() {
  const contenedor = document.getElementById('filtrosPalabras');
  if (!contenedor) return;

  contenedor.innerHTML = '';

  palabrasDisponibles.forEach(item => {
    const id = `chk_${btoa(item.base).replace(/[^a-zA-Z0-9]/g, '')}`;
    const checked = palabrasSeleccionadas.includes(item.base) ? 'checked' : '';
    const checkbox = `
      <div class="form-check">
        <input class="form-check-input" type="checkbox" value="${item.base}" id="${id}" ${checked} onchange="actualizarPalabrasSeleccionadas()">
        <label class="form-check-label" for="${id}">${item.base}</label>
      </div>`;
    contenedor.innerHTML += checkbox;
  });
}

function actualizarPalabrasSeleccionadas() {
  palabrasSeleccionadas = [...document.querySelectorAll('#filtrosPalabras input:checked')].map(el => el.value);
  actualizarResumenPalabras();
  filtrarDatos();
}

function actualizarResumenPalabras() {
  const resumen = document.getElementById('resumenPalabras');
  if (!resumen) return;

  if (palabrasSeleccionadas.length === 0) {
    resumen.textContent = 'Sin palabras seleccionadas';
    return;
  }

  const totalVariantes = palabrasSeleccionadas
    .map(base => palabrasMap.get(base))
    .filter(Boolean)
    .reduce((acc, item) => acc + item.variantesOriginales.length, 0);

  resumen.textContent = `${palabrasSeleccionadas.length} palabra(s) seleccionada(s). Variaciones: ${totalVariantes}`;
}

function seleccionarTodasYFiltrar() {
  const checkboxes = document.querySelectorAll('#filtrosPalabras input[type=checkbox]');
  palabrasSeleccionadas = [];
  checkboxes.forEach(chk => {
    chk.checked = true;
    palabrasSeleccionadas.push(chk.value);
  });
  actualizarResumenPalabras();
  filtrarDatos();
}

function mostrarDatos(datosFiltrados) {
  const inicio = (paginaActual - 1) * filasPorPagina;
  const fin = inicio + filasPorPagina;
  const datosPaginados = datosFiltrados.slice(inicio, fin);

  const contenedor = document.getElementById('contenedorCards');
  contenedor.innerHTML = '';

  datosPaginados.forEach(item => {
    const alias = aliasInstituciones[item.institucion_nombre] || item.institucion_nombre;
    const montoFormateado = item.monto_estimado && !isNaN(item.monto_estimado)
      ? (item.unidad_monetaria && item.unidad_monetaria !== 'CLP'
        ? `${parseInt(item.monto_estimado, 10).toLocaleString('es-CL')} ${item.unidad_monetaria}`
        : `$${parseInt(item.monto_estimado, 10).toLocaleString('es-CL')}`)
      : (item.monto_estimado || 'No informado');
    const coincidencias = obtenerCoincidencias(item);
    const bloquePalabras = coincidencias.length
      ? `<div class="row mt-2"><div class="col-md-12"><strong>Palabras clave:</strong> ${coincidencias.join(', ')}</div></div>`
      : '<div class="row mt-2"><div class="col-md-12"><strong>Palabras clave:</strong> Sin coincidencias</div></div>';

    const card = `
      <div class="card mb-4 p-3 shadow-sm">
        <div class="mb-2 text-muted">
          <strong>ID Licitacion:</strong> ${item.codigo}
        </div>
        <a href="https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idLicitacion=${item.codigo}" target="_blank"><h5 class="text-primary fw-bold mb-1">${item.nombre || '(Sin titulo)'}</h5></a>
        <p class="text-secondary">${item.descripcion || '(Sin descripcion)'}</p>
        <div class="row mt-3">
          <div class="col-md-3 mb-2"><strong>Monto:</strong><br>${montoFormateado}</div>
          <div class="col-md-3 mb-2"><strong>Fecha de publicacion:</strong><br>${formatearFecha(item.fecha_inicio)}</div>
          <div class="col-md-3 mb-2"><strong>Fecha de cierre:</strong><br>${formatearFecha(item.fecha_final)}</div>
        </div>
        <hr>
        <div class="row mt-2">
          <div class="col-md-6"><strong>Institucion:</strong><br>${alias}</div>
        </div>
        ${bloquePalabras}
      </div>`;
    contenedor.innerHTML += card;
  });

  const total = datosFiltrados.length;
  document.getElementById('cantidadResultados').innerHTML = `Total de resultados encontrados: ${total}`;
  document.getElementById('btnDescargarCsv').disabled = total === 0;
  renderizarPaginacion(total);
}

function obtenerCoincidencias(item) {
  if (palabrasSeleccionadas.length === 0) return [];

  const textoBase = normalizarTexto(
    `${item.codigo || ''} ${item.nombre || ''} ${item.descripcion || ''}`
  );

  const coincidencias = [];
  palabrasSeleccionadas.forEach(base => {
    const entry = palabrasMap.get(base);
    if (!entry) return;
    const coincide = entry.variantesNormalizadas.some(variacion => {
      const regex = new RegExp(`\\b${escaparRegex(variacion)}\\b`, 'i');
      return regex.test(textoBase);
    });
    if (coincide) coincidencias.push(base);
  });

  return coincidencias;
}

function filtrarDatos(resetPagina = true) {
  if (!datos.length) return;

  textoFiltro = document.getElementById('filtroTexto').value.toLowerCase();
  if (resetPagina) paginaActual = 1;

  const variantesSeleccionadas = obtenerVariantesSeleccionadas();

  const datosFiltrados = datos.filter(item => {
    const textoBase = normalizarTexto(
      `${item.codigo || ''} ${item.nombre || ''} ${item.descripcion || ''}`
    );

    const coincideTexto = !textoFiltro || textoBase.includes(normalizarTexto(textoFiltro));

    if (!coincideTexto) return false;

    if (variantesSeleccionadas.length === 0) return true;

    return variantesSeleccionadas.some(variacion => {
      const regex = new RegExp(`\\b${escaparRegex(variacion)}\\b`, 'i');
      return regex.test(textoBase);
    });
  });

  datosFiltradosActuales = datosFiltrados;
  mostrarDatos(datosFiltrados);
}

function obtenerVariantesSeleccionadas() {
  if (palabrasSeleccionadas.length === 0) return [];

  const variantes = new Set();
  palabrasSeleccionadas.forEach(base => {
    const entry = palabrasMap.get(base);
    if (entry) {
      entry.variantesNormalizadas.forEach(variacion => variantes.add(variacion));
    }
  });

  return Array.from(variantes);
}

function ordenarTabla(columna) {
  if (columnaOrdenada === columna) {
    ordenAscendente = !ordenAscendente;
  } else {
    columnaOrdenada = columna;
    ordenAscendente = true;
  }
  ordenarDatos();
  filtrarDatos(false);
}

function ordenarDatos() {
  datos.sort((a, b) => {
    const valA = columnaOrdenada.includes('fecha') ? new Date(a[columnaOrdenada]) : (a[columnaOrdenada] || '').toLowerCase();
    const valB = columnaOrdenada.includes('fecha') ? new Date(b[columnaOrdenada]) : (b[columnaOrdenada] || '').toLowerCase();
    return ordenAscendente ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
  });
}

function renderizarPaginacion(totalDatos) {
  const totalPaginas = Math.ceil(totalDatos / filasPorPagina);
  const pagination = document.getElementById('pagination');
  pagination.innerHTML = '';

  if (totalPaginas <= 1) return;

  let inicio = Math.max(paginaActual - 5, 1);
  let fin = Math.min(inicio + 9, totalPaginas);
  if (fin - inicio < 9) inicio = Math.max(fin - 9, 1);

  if (paginaActual > 1) {
    pagination.innerHTML += `<li class="page-item"><button class="page-link" onclick="cambiarPagina(${paginaActual - 1})">Anterior</button></li>`;
  }

  for (let i = inicio; i <= fin; i++) {
    pagination.innerHTML += `<li class="page-item ${i === paginaActual ? 'active' : ''}"><button class="page-link" onclick="cambiarPagina(${i})">${i}</button></li>`;
  }

  if (paginaActual < totalPaginas) {
    pagination.innerHTML += `<li class="page-item"><button class="page-link" onclick="cambiarPagina(${paginaActual + 1})">Siguiente</button></li>`;
  }
}

function cambiarPagina(pagina) {
  paginaActual = pagina;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  filtrarDatos(false);
}

function limpiarFiltros() {
  document.getElementById('filtroTexto').value = '';
  textoFiltro = '';
  palabrasSeleccionadas = [];
  renderizarCheckboxes();
  actualizarResumenPalabras();
  filtrarDatos();
}

function descargarCsv() {
  if (!datosFiltradosActuales.length) return;

  const encabezados = [
    'codigo',
    'estado',
    'tipo',
    'nombre',
    'descripcion',
    'institucion_nombre',
    'monto_estimado',
    'unidad_monetaria',
    'fecha_inicio',
    'fecha_final'
  ];

  const filas = datosFiltradosActuales.map(item => {
    return encabezados.map(campo => escaparCsv(item[campo] ?? '')).join(';');
  });

  const contenido = [encabezados.join(';'), ...filas].join('\n');
  const bytesLatin1 = codificarLatin1(contenido);
  const blob = new Blob([bytesLatin1], { type: 'text/csv;charset=iso-8859-1;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'licitaciones_por_palabras_clave.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function normalizarTexto(texto) {
  return (texto || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function formatearFecha(fecha) {
  if (!fecha) return '-';
  const fechaObj = new Date(fecha);
  if (Number.isNaN(fechaObj.getTime())) return fecha;
  return fechaObj.toLocaleDateString('es-CL');
}

function escaparCsv(valor) {
  const texto = (valor ?? '').toString().replace(/\r?\n/g, ' ');
  if (/[";\n]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

function codificarLatin1(texto) {
  const bytes = new Uint8Array(texto.length);
  for (let i = 0; i < texto.length; i++) {
    const code = texto.charCodeAt(i);
    bytes[i] = code <= 255 ? code : 63;
  }
  return bytes;
}

function escaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
