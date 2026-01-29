console.log("🔄 Versión activa de script de organismos compradores");

let datos = [];
let columnaOrdenada = 'fecha_inicio';
let ordenAscendente = false;
let paginaActual = 1;
const filasPorPagina = 10;
let textoFiltro = '';
let filtroAnio = 'todos';
let filtroEstado = 'todos';
let filtroTipo = 'todos';
let aliasInstituciones = {};

// 🔄 Cargar datos desde la API PHP
fetch('organismosPub.php')
  .then(res => res.json())
  .then(({ licitaciones, instituciones }) => {
    datos = licitaciones.filter(item => item.codigo);

    if (instituciones && instituciones.length > 0) {
      aliasInstituciones = Object.fromEntries(instituciones.map(item => [item.id, item.alias]));
      renderizarOrganismos();
    } else {
      console.warn("⚠️ Instituciones no encontradas en la API, cargando respaldo CSV...");
      cargarInstitucionesDesdeCSV();
    }

    renderizarFiltros();
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
  Papa.parse('/csv/instituciones.csv', {
    download: true,
    header: true,
    delimiter: ';',
    complete: (results) => {
      aliasInstituciones = Object.fromEntries(results.data.map(item => [item.id, item.alias]));
      renderizarOrganismos();
      renderizarFiltros();
      ordenarDatos();
      filtrarDatos();
    },
    error: (error) => {
      console.error('❌ Error al cargar respaldo CSV de instituciones:', error);
    }
  });
}

function renderizarOrganismos() {
  const dataList = document.getElementById('organismosList');
  if (!dataList) return;

  const mapa = new Map();
  datos.forEach(item => {
    const original = item.institucion_nombre || '';
    if (!original) return;
    const alias = aliasInstituciones[original] || original;
    const key = alias.toLowerCase();
    if (!mapa.has(key)) {
      mapa.set(key, { alias, original });
    }
  });

  dataList.innerHTML = '';
  const organismos = Array.from(mapa.values()).sort((a, b) => a.alias.localeCompare(b.alias, 'es'));
  organismos.forEach(({ alias }) => {
    const option = document.createElement('option');
    option.value = alias;
    dataList.appendChild(option);
  });
}

function renderizarFiltros() {
  const anios = new Set();
  const estados = new Set();
  const tipos = new Set();

  datos.forEach(item => {
    const anio = obtenerAnio(item);
    if (anio) anios.add(anio);
    if (item.estado) estados.add(item.estado);
    if (item.tipo) tipos.add(item.tipo);
  });

  const selectAnio = document.getElementById('filtroAnio');
  const selectEstado = document.getElementById('filtroEstado');
  const selectTipo = document.getElementById('filtroTipo');

  if (selectAnio) {
    selectAnio.innerHTML = '<option value="todos">Todos</option>';
    Array.from(anios).sort((a, b) => b - a).forEach(anio => {
      selectAnio.innerHTML += `<option value="${anio}">${anio}</option>`;
    });
  }

  if (selectEstado) {
    selectEstado.innerHTML = '<option value="todos">Todos</option>';
    Array.from(estados).sort((a, b) => a.localeCompare(b, 'es')).forEach(estado => {
      selectEstado.innerHTML += `<option value="${estado}">${estado}</option>`;
    });
  }

  if (selectTipo) {
    selectTipo.innerHTML = '<option value="todos">Todos</option>';
    Array.from(tipos).sort((a, b) => a.localeCompare(b, 'es')).forEach(tipo => {
      selectTipo.innerHTML += `<option value="${tipo}">${tipo}</option>`;
    });
  }
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
    const montoAdjudicado = formatearMoneda(item.monto_adjudicado_total, { zeroAsNoInfo: true });

    const card = `
      <div class="card mb-4 p-3 shadow-sm">
        <div class="mb-2 text-muted">
          <strong>ID Licitación:</strong> ${item.codigo}
        </div>
        <a href="https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idLicitacion=${item.codigo}" target="_blank"><h5 class="text-primary fw-bold mb-1">${item.nombre || '(Sin título)'}</h5></a>
        <p class="text-secondary">${item.descripcion || '(Sin descripción)'}</p>
        <div class="row mt-3">
          <div class="col-md-3 mb-2"><strong>Monto:</strong><br>${montoFormateado}</div>
          <div class="col-md-3 mb-2"><strong>Fecha de publicación:</strong><br>${formatearFecha(item.fecha_inicio)}</div>
          <div class="col-md-3 mb-2"><strong>Fecha de cierre:</strong><br>${formatearFecha(item.fecha_final)}</div>
        </div>
        <hr>
        <div class="row mt-2">
          <div class="col-md-6"><strong>Institución:</strong><br>${alias}</div>
          <div class="col-md-3"><strong>Estado:</strong><br>${item.estado || '-'}</div>
          <div class="col-md-3"><strong>Tipo:</strong><br>${item.tipo || '-'}</div>
        </div>
        <div class="row mt-2">
          <div class="col-md-6"><strong>Monto adjudicado:</strong><br>${montoAdjudicado}</div>
        </div>
      </div>`;
    contenedor.innerHTML += card;
  });

  document.getElementById('cantidadResultados').innerHTML = `Total de resultados encontrados: ${datosFiltrados.length}`;
  renderizarPaginacion(datosFiltrados.length);
}

function filtrarDatos(resetPagina = true) {
  textoFiltro = document.getElementById('filtroTexto').value.toLowerCase();
  const textoOrganismo = (document.getElementById('filtroOrganismo')?.value || '').toLowerCase().trim();
  filtroAnio = document.getElementById('filtroAnio')?.value || 'todos';
  filtroEstado = document.getElementById('filtroEstado')?.value || 'todos';
  filtroTipo = document.getElementById('filtroTipo')?.value || 'todos';
  if (resetPagina) paginaActual = 1;

  const datosFiltrados = datos.filter(item => {
    const alias = (aliasInstituciones[item.institucion_nombre] || item.institucion_nombre || '').toLowerCase();
    const textoBase = (
      `${item.codigo} ${item.institucion_nombre} ${item.nombre || ''} ${item.descripcion || ''}`
    ).toLowerCase();

    const coincideTexto = !textoFiltro || textoBase.includes(textoFiltro);
    const coincideOrganismo = !textoOrganismo || alias.includes(textoOrganismo) || (item.institucion_nombre || '').toLowerCase().includes(textoOrganismo);

    const anioItem = obtenerAnio(item);
    const coincideAnio = filtroAnio === 'todos' || String(anioItem) === String(filtroAnio);

    const estadoItem = normalizarTexto(item.estado);
    const estadoFiltro = filtroEstado === 'todos' ? 'todos' : normalizarTexto(filtroEstado);
    const coincideEstado = estadoFiltro === 'todos' || estadoItem === estadoFiltro;

    const coincideTipo = filtroTipo === 'todos' || (item.tipo || '') === filtroTipo;

    return coincideTexto && coincideOrganismo && coincideAnio && coincideEstado && coincideTipo;
  });

  actualizarKpis(datosFiltrados);
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

function actualizarKpis(datosFiltrados) {
  const kpiContainer = document.getElementById('kpiCards');
  if (!kpiContainer) return;

  const totalPublicadas = datosFiltrados.filter(item => normalizarTexto(item.estado) === 'publicada').length;
  const totalCerradas = datosFiltrados.filter(item => normalizarTexto(item.estado) === 'cerrada').length;
  const totalAdjudicadas = datosFiltrados.filter(item => normalizarTexto(item.estado) === 'adjudicada').length;

  const montoAdjudicado = datosFiltrados.reduce((acc, item) => {
    if (normalizarTexto(item.estado) !== 'adjudicada') return acc;
    const valor = Number(item.monto_adjudicado_total);
    return acc + (isNaN(valor) ? 0 : valor);
  }, 0);

  kpiContainer.innerHTML = `
    <div class="col-md-3">
      <div class="p-3 kpi-card bg-white shadow-sm">
        <div class="kpi-label">Publicadas</div>
        <div class="kpi-value">${totalPublicadas.toLocaleString('es-CL')}</div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="p-3 kpi-card bg-white shadow-sm">
        <div class="kpi-label">Cerradas</div>
        <div class="kpi-value">${totalCerradas.toLocaleString('es-CL')}</div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="p-3 kpi-card bg-white shadow-sm">
        <div class="kpi-label">Adjudicadas</div>
        <div class="kpi-value">${totalAdjudicadas.toLocaleString('es-CL')}</div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="p-3 kpi-card bg-white shadow-sm">
        <div class="kpi-label">Monto adjudicado</div>
        <div class="kpi-value">${formatearMoneda(montoAdjudicado)}</div>
      </div>
    </div>
  `;
}

function normalizarTexto(valor) {
  return (valor || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function obtenerAnio(item) {
  const fecha = item.fecha_inicio || item.fecha_publicacion || item.fecha_inicio;
  if (!fecha) return null;
  const date = new Date(fecha);
  if (isNaN(date.getTime())) return null;
  return date.getFullYear();
}

function formatearMoneda(valor, opciones = {}) {
  const numero = Number(valor);
  if (isNaN(numero)) return opciones.fallback || 'No informado';
  if (numero === 0) return opciones.zeroAsNoInfo ? 'No informado' : '$0';
  return `$${Math.round(numero).toLocaleString('es-CL')}`;
}

function formatearFecha(valor) {
  if (!valor) return 'Sin fecha';
  const date = new Date(valor);
  if (isNaN(date.getTime())) return 'Sin fecha';
  return date.toLocaleDateString();
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
  const filtroOrganismo = document.getElementById('filtroOrganismo');
  if (filtroOrganismo) filtroOrganismo.value = '';
  if (document.getElementById('filtroAnio')) document.getElementById('filtroAnio').value = 'todos';
  if (document.getElementById('filtroEstado')) document.getElementById('filtroEstado').value = 'todos';
  if (document.getElementById('filtroTipo')) document.getElementById('filtroTipo').value = 'todos';
  textoFiltro = '';
  filtrarDatos();
}