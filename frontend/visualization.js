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
let codigosGuardados = new Set();
let cargandoListado = false;
let paginaServidor = 1;
let totalServidor = 0;
let totalPaginasServidor = 1;
let cursorActualServidor = null;
let siguienteCursorServidor = null;
let historialCursoresServidor = [];
let hayMasResultadosServidor = false;
let _filtroDebounce = null;
let forzarActualizacion = false;
let _compradoresCargados = false;
let _fetchController = null; // AbortController para cancelar fetches en curso

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos

function guardarCache(clave, valor) {
  try { localStorage.setItem(clave, JSON.stringify({ ts: Date.now(), datos: valor })); } catch (_) {}
}

function leerCache(clave) {
  try {
    const raw = localStorage.getItem(clave);
    if (!raw) return null;
    const { ts, datos } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) { localStorage.removeItem(clave); return null; }
    return datos;
  } catch (_) { return null; }
}

asegurarControlesActualizacion();

document.addEventListener('DOMContentLoaded', () => {
  asegurarControlesActualizacion();
});

function asegurarControlesActualizacion() {
  const botonExistente = document.getElementById('btnActualizarListado');
  if (botonExistente) {
    botonExistente.onclick = null;
    botonExistente.removeAttribute('onclick');
    botonExistente.addEventListener('click', actualizarListadoManual);
  } else {
    const acciones = document.querySelector('.col-md-9 .d-flex.justify-content-between > .d-flex.gap-2.align-items-center');
    if (acciones) {
      const boton = document.createElement('button');
      boton.id = 'btnActualizarListado';
      boton.className = 'btn btn-outline-primary btn-sm mb-2';
      boton.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Actualizar listado';
      boton.addEventListener('click', actualizarListadoManual);
      acciones.prepend(boton);
    }
  }

  const estadoExistente = document.getElementById('estadoActualizacion');
  if (!estadoExistente) {
    const contenedorCards = document.getElementById('contenedorCards');
    if (contenedorCards && contenedorCards.parentElement) {
      const estado = document.createElement('div');
      estado.id = 'estadoActualizacion';
      estado.className = 'small text-muted mb-2';
      contenedorCards.parentElement.insertBefore(estado, contenedorCards);
    }
  }
}

document.addEventListener('auth:changed', (event) => {
  const seccionInstituciones = document.getElementById('seccionInstituciones');
  if (event.detail.loggedIn) {
    if (seccionInstituciones) seccionInstituciones.classList.remove('d-none');
    // Forzar actualización para obtener las instituciones del usuario autenticado
    // (el fetch inicial puede haberse hecho sin sesión activa)
    forzarActualizacion = true;
    actualizarListadoLicitaciones({ resetPagina: false, mostrarEstado: false });
    cargarCodigosGuardados();  } else {
    if (seccionInstituciones) seccionInstituciones.classList.add('d-none');
    aliasInstituciones = {};
    renderizarCheckboxes();
    codigosGuardados = new Set();
    filtrarDatos(false);
  }
});

actualizarListadoLicitaciones({ resetPagina: true });

async function actualizarListadoLicitaciones({
  resetPagina = false,
  mostrarEstado = true,
  filtrando = false,
  mostrarSkeleton = true,
  mensajeCarga = 'Cargando resultados...'
} = {}) {
  // Cancelar fetch anterior si sigue en curso
  if (_fetchController) {
    _fetchController.abort();
    _fetchController = null;
    cargandoListado = false;
  }

  cargandoListado = true;
  if (mostrarSkeleton) {
    setCargaResultadosActiva(true, mensajeCarga);
  }
  setEstadoActualizacion('Actualizando listado...');
  setBotonActualizacionEstado(true);

  const controller = new AbortController();
  _fetchController = controller;

  try {
    if (resetPagina) {
      paginaServidor = 1;
      cursorActualServidor = null;
      siguienteCursorServidor = null;
      historialCursoresServidor = [];
      hayMasResultadosServidor = false;
    }

    const params = new URLSearchParams();
    const estadoVal = document.getElementById('filtroEstado')?.value ?? 'Publicada';
    params.set('estado', estadoVal);
    params.set('cursor_mode', '1');
    params.set('limit', String(filasPorPagina));
    params.set('include_total', '1');
    if (cursorActualServidor) {
      params.set('cursor', cursorActualServidor);
    }

    const texto = (document.getElementById('filtroTexto')?.value || '').trim();
    if (texto) params.set('texto', texto);

    const tipoVal = document.getElementById('filtroTipo')?.value || '';
    if (tipoVal) params.set('tipo', tipoVal);

    const periodoVal = document.getElementById('filtroPeriodo')?.value || '';
    if (periodoVal) params.set('periodo', periodoVal);

    const compradorVal = (document.getElementById('filtroComprador')?.value || '').trim();
    if (compradorVal) params.set('comprador', compradorVal);

    if (document.getElementById('excluirBajoValor')?.checked) params.set('excluir_bajo_valor', '1');

    const rc = calcularRangoCierre();
    if (rc.desde) params.set('cierre_desde', rc.desde);
    if (rc.hasta) params.set('cierre_hasta', rc.hasta);

    if (institucionesSeleccionadas.length > 0) {
      institucionesSeleccionadas.forEach((institucion) => {
        params.append('institucion[]', institucion);
      });
    }

    // Solicitar compradores solo si aún no se han cargado (o si se fuerza actualización)
    const pedirCompradores = !filtrando && (!_compradoresCargados || forzarActualizacion);
    if (pedirCompradores) params.set('compradores', '1');

    const cacheKey = `lics_viz_${params.toString()}`;
    let json;
    if (!forzarActualizacion) {
      json = leerCache(cacheKey);
    }
    if (!json) {
      const res = await fetch(`api/licitacionesPub.php?${params.toString()}`, {
        cache: 'no-store',
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      json = await res.json();
      guardarCache(cacheKey, json);
    }
    forzarActualizacion = false;
    datos = (json.licitaciones || []).filter(item => item.codigo);
    totalServidor = (json.total === null || json.total === undefined || json.total === '')
      ? null
      : (Number.isFinite(Number(json.total)) ? Number(json.total) : null);
    totalPaginasServidor = (json.paginas === null || json.paginas === undefined || json.paginas === '')
      ? null
      : (Number.isFinite(Number(json.paginas)) ? Number(json.paginas) : null);
    siguienteCursorServidor = json.next_cursor || null;
    hayMasResultadosServidor = Boolean(json.has_more) || (
      Number.isFinite(totalPaginasServidor) && paginaServidor < totalPaginasServidor
    );
    paginaServidor = historialCursoresServidor.length + 1;

    // Prefetch de la siguiente página para acelerar la navegación paginada.
    if (siguienteCursorServidor && hayMasResultadosServidor) {
      const paramsSiguiente = new URLSearchParams(params.toString());
      paramsSiguiente.set('cursor', String(siguienteCursorServidor));
      const cacheKeySiguiente = `lics_viz_${paramsSiguiente.toString()}`;

      if (!leerCache(cacheKeySiguiente)) {
        fetch(`api/licitacionesPub.php?${paramsSiguiente.toString()}`, { cache: 'no-store' })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data) guardarCache(cacheKeySiguiente, data);
          })
          .catch(() => {});
      }
    }

    if (!filtrando) {
      if (json.compradores && json.compradores.length > 0) {
        construirListaCompradores(json.compradores);
        _compradoresCargados = true;
      } else if (!_compradoresCargados) {
        construirListaCompradores(null);
      }
      if (json.instituciones && json.instituciones.length > 0) {
        aliasInstituciones = Object.fromEntries(json.instituciones.map(item => [item.id, item.alias]));
      } else {
        aliasInstituciones = {};
      }
      renderizarCheckboxes();
    }

    ordenarDatos();
    mostrarDatos(datos);

    if (mostrarEstado) {
      setEstadoActualizacion(`Listado actualizado: ${new Date().toLocaleString('es-CL')}`);
    } else if (filtrando) {
      setEstadoActualizacion('');
    }
  } catch (err) {
    if (err.name === 'AbortError') return; // Fetch cancelado intencionalmente, no mostrar error
    console.error('❌ Error al cargar datos desde la API:', err);
    setEstadoActualizacion('No se pudo actualizar el listado. Intenta nuevamente.');
  } finally {
    const esControllerActivo = _fetchController === controller;
    if (esControllerActivo) {
      _fetchController = null;
      cargandoListado = false;
      setBotonActualizacionEstado(false);
    }
  }
}

function calcularRangoCierre() {
  const c1s  = document.getElementById('cierre1semana')?.checked;
  const c2s  = document.getElementById('cierre2semanas')?.checked;
  const c1m  = document.getElementById('cierre1mes')?.checked;
  const cMas = document.getElementById('cierreMas1mes')?.checked;
  if (!c1s && !c2s && !c1m && !cMas) return { desde: '', hasta: '' };
  const hoy  = new Date(); hoy.setHours(0, 0, 0, 0);
  const addD = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  const fmt  = d => d.toISOString().slice(0, 10);
  const rangos = [];
  if (c1s)  rangos.push({ desde: hoy,           hasta: addD(hoy, 7) });
  if (c2s)  rangos.push({ desde: addD(hoy, 7),  hasta: addD(hoy, 14) });
  if (c1m)  rangos.push({ desde: addD(hoy, 14), hasta: addD(hoy, 30) });
  if (cMas) rangos.push({ desde: addD(hoy, 30), hasta: null });
  const desde    = rangos.reduce((m, r) => !m || r.desde < m ? r.desde : m, null);
  const sinLimite = rangos.some(r => r.hasta === null);
  const hasta    = sinLimite ? null : rangos.reduce((m, r) => !m || r.hasta > m ? r.hasta : m, null);
  return { desde: desde ? fmt(desde) : '', hasta: hasta ? fmt(hasta) : '' };
}

function actualizarListadoManual() {
  forzarActualizacion = true;
  actualizarListadoLicitaciones({ resetPagina: false, mostrarEstado: true });
}

// Exponer para fallback de onclick inline en HTML.
window.actualizarListadoManual = actualizarListadoManual;

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

function setCargaResultadosActiva(cargando, mensaje = 'Cargando resultados...') {
  const contenedor = document.getElementById('contenedorCards');
  const cantidad = document.getElementById('cantidadResultados');
  const paginacion = document.getElementById('pagination');
  if (!contenedor) return;

  if (!cargando) return;

  if (cantidad) {
    cantidad.innerHTML = '<span class="text-muted">Cargando resultados...</span>';
  }
  if (paginacion) {
    paginacion.innerHTML = '';
  }

  contenedor.innerHTML = `
    <div class="card mb-4 p-4 shadow-sm">
      <div class="d-flex align-items-center gap-3">
        <span class="spinner-border text-primary" role="status" aria-hidden="true"></span>
        <div>
          <div class="fw-semibold">${mensaje}</div>
          <div class="small text-muted">Estamos consultando Mercado Publico con tus filtros.</div>
        </div>
      </div>
    </div>
  `;
}

function setBotonDescargaEstado(cargando) {
  const boton = document.getElementById('btnDescargarLicitaciones');
  if (!boton) return;
  boton.disabled = cargando;
  boton.innerHTML = cargando
    ? '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Descargando...'
    : 'Descargar Licitaciones';
}

// 🧾 Cargar instituciones desde respaldo CSV
function cargarInstitucionesDesdeCSV() {
  Papa.parse('data/csv/instituciones.csv', {
    download: true,
    header: true,
    delimiter: ';',
    complete: (results) => {
      aliasInstituciones = Object.fromEntries(
        results.data
          .filter(item => item?.nombre && item?.alias)
          .map(item => [item.nombre, item.alias])
      );
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
    const seleccionada = institucionesSeleccionadas.includes(nombreOriginal);
    const chip = `
      <button
        type="button"
        class="suggestion-chip suggestion-chip-button ${seleccionada ? 'is-selected' : 'is-unselected'}"
        data-institucion="${encodeURIComponent(nombreOriginal)}"
      >
        <span>${aliasAmigable}</span>
      </button>`;
    contenedor.innerHTML += chip;
  });

  contenedor.querySelectorAll('[data-institucion]').forEach((button) => {
    button.addEventListener('click', () => {
      const valor = decodeURIComponent(button.dataset.institucion || '');
      toggleInstitucion(valor);
    });
  });
}

function toggleInstitucion(valor) {
  if (!valor) return;
  if (institucionesSeleccionadas.includes(valor)) {
    institucionesSeleccionadas = institucionesSeleccionadas.filter(item => item !== valor);
  } else {
    institucionesSeleccionadas.push(valor);
  }
  renderizarCheckboxes();
  filtrarDatos(false);
}

function actualizarInstitucionesSeleccionadas() {
  renderizarCheckboxes();
  filtrarDatos(false);
}

function seleccionarTodasYFiltrar() {
  institucionesSeleccionadas = Object.keys(aliasInstituciones);
  renderizarCheckboxes();
  filtrarDatos();
}

function obtenerClaseEstado(estado) {
  const valor = (estado || '').toString().trim().toLowerCase();
  if (valor === 'adjudicada') return 'bg-success';
  if (valor === 'publicada') return 'bg-primary';
  if (valor === 'cerrada') return 'bg-secondary';
  if (valor.startsWith('desierta')) return 'bg-warning text-dark';
  if (valor === 'revocada' || valor === 'suspendida') return 'bg-danger';
  return 'bg-dark';
}

function mostrarDatos(datosFiltrados) {
  const contenedor = document.getElementById('contenedorCards');
  contenedor.innerHTML = '';

  datosFiltrados.forEach(item => {
    const alias = aliasInstituciones[item.institucion_nombre] || item.institucion_nombre;
    const guardada = codigosGuardados.has(item.codigo);
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
        <div class="d-flex justify-content-between align-items-start gap-2">
          <a href="https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idLicitacion=${item.codigo}" target="_blank"><h5 class="text-primary fw-bold mb-1">${item.nombre || '(Sin título)'}</h5></a>
          <div class="d-flex align-items-center gap-2 flex-shrink-0">
            <span class="badge ${obtenerClaseEstado(item.estado)}">${item.estado || 'Sin estado'}</span>
            <button class="btn ${guardada ? 'btn-warning' : 'btn-outline-warning'} btn-sm" onclick="toggleGuardada('${item.codigo}')">
              ${guardada ? 'Guardada' : 'Guardar'}
            </button>
          </div>
        </div>
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

  const totalTexto = Number.isFinite(totalServidor)
    ? `Total de resultados encontrados: ${Number(totalServidor).toLocaleString('es-CL')}`
    : `Resultados mostrados: ${datosFiltrados.length.toLocaleString('es-CL')} (total en calculo)`;
  document.getElementById('cantidadResultados').innerHTML = totalTexto;
  renderizarPaginacion();
}

function filtrarDatos(resetPagina = true) {
  clearTimeout(_filtroDebounce);
  _filtroDebounce = setTimeout(() => {
    actualizarListadoLicitaciones({ resetPagina, mostrarEstado: false, filtrando: true });
  }, 300);
}

function buscarTextoEnEnter(event) {
  if (event.key !== 'Enter') return;

  event.preventDefault();
  clearTimeout(_filtroDebounce);
  actualizarListadoLicitaciones({ resetPagina: true, mostrarEstado: false, filtrando: true });
}

// Filtrado ahora es 100% servidor; este stub se mantiene solo para compatibilidad.
function obtenerDatosFiltrados() { return datos; }

function cambiarEstado() {
  const el = document.getElementById('filtroEstado');
  const titulo = document.getElementById('estadoTitulo');
  if (titulo && el) {
    const labels = {
      '': 'de todos los estados',
      'Publicada': 'publicadas', 'Adjudicada': 'adjudicadas',
      'Desierta (o art. 3 ó 9 Ley 19.886)': 'desiertas', 'Cerrada': 'cerradas',
      'Revocada': 'revocadas',   'Suspendida': 'suspendidas'
    };
    titulo.textContent = labels[el.value] || el.value.toLowerCase();
  }
  actualizarListadoLicitaciones({ resetPagina: true });
}

function populateTipoCheckboxes() {}

function toggleTipo(tipo) {}

function construirListaCompradores(listaExterna) {
  const datalist = document.getElementById('listaCompradores');
  if (!datalist) return;
  const compradores = listaExterna
    ? listaExterna
    : [...new Set(datos.map(d => d.institucion_nombre).filter(Boolean))].sort();
  datalist.innerHTML = compradores.map(c => `<option value="${c}"></option>`).join('');
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

function renderizarPaginacion() {
  const pagination   = document.getElementById('pagination');
  pagination.innerHTML = '';

  const puedeVolver = historialCursoresServidor.length > 0;
  const puedeAvanzar = hayMasResultadosServidor && Boolean(siguienteCursorServidor);

  if (!puedeVolver && !puedeAvanzar) return;

  pagination.innerHTML += `<li class="page-item ${puedeVolver ? '' : 'disabled'}"><button class="page-link" onclick="cambiarPagina('prev')">Anterior</button></li>`;
  pagination.innerHTML += `<li class="page-item active"><span class="page-link">${paginaServidor}</span></li>`;
  pagination.innerHTML += `<li class="page-item ${puedeAvanzar ? '' : 'disabled'}"><button class="page-link" onclick="cambiarPagina('next')">Siguiente</button></li>`;
}

function cambiarPagina(direccion) {
  if (direccion === 'next') {
    if (!siguienteCursorServidor || !hayMasResultadosServidor) return;
    historialCursoresServidor.push(cursorActualServidor);
    cursorActualServidor = siguienteCursorServidor;
    paginaServidor = historialCursoresServidor.length + 1;
  } else if (direccion === 'prev') {
    if (historialCursoresServidor.length === 0) return;
    cursorActualServidor = historialCursoresServidor.pop() || null;
    paginaServidor = historialCursoresServidor.length + 1;
  } else {
    return;
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
  actualizarListadoLicitaciones({
    resetPagina: false,
    mostrarEstado: false,
    filtrando: true,
    mostrarSkeleton: true,
    mensajeCarga: `Cargando pagina ${paginaServidor}...`
  });
}

function limpiarFiltros() {
  document.getElementById('filtroTexto').value = '';
  textoFiltro = '';
  institucionesSeleccionadas = [];
  const checkbox = document.getElementById('excluirBajoValor');
  if (checkbox) checkbox.checked = false;
  excluirBajoValor = false;
  const tipoEl = document.getElementById('filtroTipo');
  if (tipoEl) tipoEl.value = '';
  const periodoEl = document.getElementById('filtroPeriodo');
  if (periodoEl) periodoEl.value = '';
  ['cierre1semana', 'cierre2semanas', 'cierre1mes', 'cierreMas1mes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.checked = false;
  });
  const compEl = document.getElementById('filtroComprador');
  if (compEl) compEl.value = '';
  renderizarCheckboxes();
  clearTimeout(_filtroDebounce);
  actualizarListadoLicitaciones({ resetPagina: true, mostrarEstado: false, filtrando: true });
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

async function descargarLicitaciones() {
  setBotonDescargaEstado(true);
  const paramsBase = new URLSearchParams();
  const estadoVal = document.getElementById('filtroEstado')?.value ?? 'Publicada';
  paramsBase.set('estado', estadoVal);

  const texto = (document.getElementById('filtroTexto')?.value || '').trim();
  if (texto) paramsBase.set('texto', texto);

  const tipoVal = document.getElementById('filtroTipo')?.value || '';
  if (tipoVal) paramsBase.set('tipo', tipoVal);

  const periodoVal = document.getElementById('filtroPeriodo')?.value || '';
  if (periodoVal) paramsBase.set('periodo', periodoVal);

  const compradorVal = (document.getElementById('filtroComprador')?.value || '').trim();
  if (compradorVal) paramsBase.set('comprador', compradorVal);

  if (document.getElementById('excluirBajoValor')?.checked) paramsBase.set('excluir_bajo_valor', '1');

  const rc = calcularRangoCierre();
  if (rc.desde) paramsBase.set('cierre_desde', rc.desde);
  if (rc.hasta) paramsBase.set('cierre_hasta', rc.hasta);

  if (institucionesSeleccionadas.length > 0) {
    institucionesSeleccionadas.forEach((institucion) => {
      paramsBase.append('institucion[]', institucion);
    });
  }

  paramsBase.set('download', 'csv');

  try {
    const link = document.createElement('a');
    link.href = `api/licitacionesPub.php?${paramsBase.toString()}`;
    link.download = 'licitaciones.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error('❌ Error al exportar licitaciones:', error);
    alert('No se pudo generar la descarga. Intenta nuevamente.');
  } finally {
    setBotonDescargaEstado(false);
  }
}

async function cargarCodigosGuardados() {
  try {
    const response = await fetch('api/guardadas.php?action=list', {
      method: 'GET',
      credentials: 'include'
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      codigosGuardados = new Set();
      filtrarDatos(false);
      return;
    }

    codigosGuardados = new Set((data.guardadas || []).map(item => item.codigo));
    filtrarDatos(false);
  } catch (error) {
    console.error('No se pudieron cargar las licitaciones guardadas:', error);
  }
}

async function toggleGuardada(codigo) {
  if (!window.AuthState || !window.AuthState.loggedIn) {
    alert('Debes ingresar para guardar licitaciones.');
    window.location.href = 'ingresar.html';
    return;
  }

  const action = codigosGuardados.has(codigo) ? 'remove' : 'add';

  try {
    const response = await fetch(`api/guardadas.php?action=${action}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': window.AuthState.csrfToken || ''
      },
      body: JSON.stringify({ codigo })
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'No se pudo actualizar guardadas');
    }

    if (action === 'add') {
      codigosGuardados.add(codigo);
    } else {
      codigosGuardados.delete(codigo);
    }

    filtrarDatos(false);
  } catch (error) {
    alert(error.message || 'Error al actualizar guardadas');
  }
}