console.log("🔄 Versión activa de script de licitaciones");

let datos = [];
let columnaOrdenada = 'fecha_inicio';
let ordenAscendente = false;
let paginaActual = 1;
const filasPorPagina = 10;
let textoFiltro = '';
let institucionesSeleccionadas = [];
let aliasInstituciones = {};
let excluirBajoValor = false;

// 🔄 Cargar datos desde la API PHP
fetch('api/licitacionesPub.php')
  .then(res => res.json())
  .then(({ licitaciones, instituciones }) => {
    datos = licitaciones.filter(item => item.codigo);

    if (instituciones && instituciones.length > 0) {
      aliasInstituciones = Object.fromEntries(instituciones.map(item => [item.id, item.alias]));
      renderizarCheckboxes();
    } else {
      console.warn("⚠️ Instituciones no encontradas en la API, cargando respaldo CSV...");
      cargarInstitucionesDesdeCSV();
    }

    ordenarDatos();
    filtrarDatos();
  })
  .catch(err => {
    console.error('❌ Error al cargar datos desde la API:', err);
    console.warn("🔁 Intentando cargar respaldo desde CSV...");
    cargarInstitucionesDesdeCSV();
  });

// 🧾 Cargar instituciones desde respaldo CSV
function cargarInstitucionesDesdeCSV() {
  Papa.parse('data/csv/instituciones.csv', {
    download: true,
    header: true,
    delimiter: ';',
    complete: (results) => {
      aliasInstituciones = Object.fromEntries(results.data.map(item => [item.id, item.alias]));
      renderizarCheckboxes();
      ordenarDatos();
      filtrarDatos();
    },
    error: (error) => {
      console.error('❌ Error al cargar respaldo CSV de instituciones:', error);
    }
  });
}

function renderizarCheckboxes() {
  const contenedor = document.getElementById('filtrosInstituciones');
  contenedor.innerHTML = '';

  Object.entries(aliasInstituciones).forEach(([nombreOriginal, aliasAmigable]) => {
    const id = `chk_${btoa(nombreOriginal).replace(/[^a-zA-Z0-9]/g, '')}`;
    const checked = institucionesSeleccionadas.includes(nombreOriginal) ? 'checked' : '';
    const checkbox = `<div class="form-check">
      <input class="form-check-input" type="checkbox" value="${nombreOriginal}" id="${id}" ${checked} onchange="actualizarInstitucionesSeleccionadas()">
      <label class="form-check-label" for="${id}">${aliasAmigable}</label>
    </div>`;
    contenedor.innerHTML += checkbox;
  });
}

function actualizarInstitucionesSeleccionadas() {
  institucionesSeleccionadas = [...document.querySelectorAll('#filtrosInstituciones input:checked')].map(el => el.value);
  filtrarDatos(false);
}

function seleccionarTodasYFiltrar() {
  const checkboxes = document.querySelectorAll('#filtrosInstituciones input[type=checkbox]');
  institucionesSeleccionadas = [];
  checkboxes.forEach(chk => {
    chk.checked = true;
    institucionesSeleccionadas.push(chk.value);
  });
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
          ? `${parseInt(item.monto_estimado).toLocaleString('es-CL')} ${item.unidad_monetaria}`
          : `$${parseInt(item.monto_estimado).toLocaleString('es-CL')}`)
      : (item.monto_estimado || 'No informado');

    const card = `
      <div class="card mb-4 p-3 shadow-sm">
        <div class="mb-2 text-muted">
          <strong>ID Licitación:</strong> ${item.codigo}
        </div>
        <a href="https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idLicitacion=${item.codigo}" target="_blank"><h5 class="text-primary fw-bold mb-1">${item.nombre || '(Sin título)'}</h5></a>
        <p class="text-secondary">${item.descripcion || '(Sin descripción)'}</p>
        <div class="row mt-3">
          <div class="col-md-3 mb-2"><strong>Monto:</strong><br>${montoFormateado}</div>
          <div class="col-md-3 mb-2"><strong>Fecha de publicación:</strong><br>${new Date(item.fecha_inicio).toLocaleDateString()}</div>
          <div class="col-md-3 mb-2"><strong>Fecha de cierre:</strong><br>${new Date(item.fecha_final).toLocaleDateString()}</div>
        </div>
        <hr>
        <div class="row mt-2">
          <div class="col-md-6"><strong>Institución:</strong><br>${alias}</div>
        </div>
      </div>`;
    contenedor.innerHTML += card;
  });

  document.getElementById('cantidadResultados').innerHTML = `Total de resultados encontrados: ${datosFiltrados.length}`;
  renderizarPaginacion(datosFiltrados.length);
}

function filtrarDatos(resetPagina = true) {
  textoFiltro = document.getElementById('filtroTexto').value.toLowerCase();
  excluirBajoValor = document.getElementById('excluirBajoValor')?.checked || false;
  if (resetPagina) paginaActual = 1;

  const datosFiltrados = datos.filter(item =>
    (item.codigo.toLowerCase().includes(textoFiltro) ||
     item.institucion_nombre.toLowerCase().includes(textoFiltro) || 
     item.nombre.toLowerCase().includes(textoFiltro) || 
     item.descripcion.toLowerCase().includes(textoFiltro)) &&
    (institucionesSeleccionadas.length === 0 || institucionesSeleccionadas.includes(item.institucion_nombre)) &&
    (!excluirBajoValor || (item.tipo !== 'L1' && item.tipo !== 'E2'))
  );

  mostrarDatos(datosFiltrados);
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
  institucionesSeleccionadas = [];
  const checkbox = document.getElementById('excluirBajoValor');
  if (checkbox) checkbox.checked = false;
  renderizarCheckboxes();
  filtrarDatos();
}

function escaparCsv(valor) {
  const texto = (valor ?? '').toString().replace(/\r?\n/g, ' ');
  if (/[";\n]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

function formatearMontoCsv(item) {
  if (item.monto_estimado && !isNaN(item.monto_estimado)) {
    const monto = parseFloat(item.monto_estimado);
    if (item.unidad_monetaria && item.unidad_monetaria !== 'CLP') {
      return `${monto} ${item.unidad_monetaria}`;
    }
    return monto.toString();
  }
  return item.monto_estimado || '';
}

function descargarLicitaciones() {
  const filtro = document.getElementById('filtroTexto').value.toLowerCase();
  const excluirBajoValorDescarga = document.getElementById('excluirBajoValor')?.checked || false;

  const datosFiltrados = datos.filter(item =>
    (item.codigo.toLowerCase().includes(filtro) ||
     item.institucion_nombre.toLowerCase().includes(filtro) ||
     item.nombre.toLowerCase().includes(filtro) ||
     item.descripcion.toLowerCase().includes(filtro)) &&
    (institucionesSeleccionadas.length === 0 || institucionesSeleccionadas.includes(item.institucion_nombre)) &&
    (!excluirBajoValorDescarga || (item.tipo !== 'L1' && item.tipo !== 'E2'))
  );

  if (datosFiltrados.length === 0) {
    alert('No hay datos para exportar.');
    return;
  }

  const headers = [
    'ID',
    'Nombre',
    'Descripción',
    'Institución',
    'Monto',
    'Fecha Publicación',
    'Fecha Cierre',
    'Estado',
    'Tipo de licitación'
  ];

  const lines = datosFiltrados.map(item => {
    return [
      item.codigo || '',
      item.nombre || '(Sin título)',
      item.descripcion || '(Sin descripción)',
      item.institucion_nombre || '',
      formatearMontoCsv(item),
      item.fecha_inicio || '',
      item.fecha_final || '',
      item.estado || '',
      item.tipo || ''
    ].map(escaparCsv).join(';');
  });

  const contenido = ['\uFEFF' + headers.map(escaparCsv).join(';'), ...lines].join('\n');
  const csvBlob = new Blob([contenido], { type: 'text/csv; charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(csvBlob);
  link.download = 'licitaciones.csv';
  link.click();
}