console.log("Palabras clave: script activo");

let datos = [];
let columnaOrdenada = 'fecha_inicio';
let ordenAscendente = false;
let paginaServidor = 1;
let totalPaginasServidor = 1;
let totalServidor = 0;
let cursorActualServidor = null;
let siguienteCursorServidor = null;
let historialCursoresServidor = [];
let hayMasResultadosServidor = false;
let textoFiltro = '';
let palabrasSeleccionadas = [];
let palabrasDisponibles = [];
let palabrasMap = new Map();
let aliasInstituciones = {};
let cargandoListado = false;
let forzarActualizacion = false;
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

document.addEventListener('DOMContentLoaded', () => {
  // Requiere autenticación
  document.addEventListener('auth:changed', (e) => {
    if (!e.detail.loggedIn) {
      window.location.href = 'ingresar.html?redir=palabras_clave.html';
    }
  }, { once: true });

  const botonActualizar = document.getElementById('btnActualizarListado');
  if (botonActualizar) {
    botonActualizar.onclick = null;
    botonActualizar.removeAttribute('onclick');
    botonActualizar.addEventListener('click', actualizarListadoManual);
  }
  actualizarResumenPalabras();
});

window.actualizarListadoManual = actualizarListadoManual;

actualizarListadoLicitaciones({ resetPagina: true });
cargarPalabrasClave();

function construirParams(pagina) {
  const params = new URLSearchParams();
  params.set('estado', 'Publicada');
  const modoLegacyPagina = Number.isFinite(Number(pagina));

  if (modoLegacyPagina) {
    params.set('pagina', String(pagina));
  } else {
    params.set('cursor_mode', '1');
    params.set('limit', '10');
    params.set('include_total', '1');
    if (cursorActualServidor) {
      params.set('cursor', cursorActualServidor);
    }
  }
  const texto = (document.getElementById('filtroTexto')?.value || '').trim();
  if (texto) params.set('texto', texto);
  const periodo = (document.getElementById('filtroPeriodo')?.value || '').trim();
  if (periodo) params.set('periodo', periodo);
  if (palabrasSeleccionadas.length > 0) {
    const variantes = obtenerVariantesOriginales();
    if (variantes.length > 0) params.set('palabras', variantes.join('|'));
  }
  return params;
}

function obtenerVariantesOriginales() {
  const variantes = new Set();
  palabrasSeleccionadas.forEach(base => {
    const entry = palabrasMap.get(base);
    if (entry) entry.variantesOriginales.forEach(v => variantes.add(v));
  });
  return Array.from(variantes);
}

async function actualizarListadoLicitaciones({
  resetPagina = false,
  mostrarEstado = true,
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
  if (mostrarEstado) setEstadoActualizacion('Actualizando listado...');
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

    const params = construirParams(null);
    const cacheKey = `lics_pk_${params.toString()}`;

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

    // Prefetch de la siguiente página para acelerar navegación paginada.
    if (siguienteCursorServidor && hayMasResultadosServidor) {
      const prevCursor = cursorActualServidor;
      cursorActualServidor = siguienteCursorServidor;
      const paramsSiguiente = construirParams(null);
      cursorActualServidor = prevCursor;
      const cacheKeySiguiente = `lics_pk_${paramsSiguiente.toString()}`;

      if (!leerCache(cacheKeySiguiente)) {
        fetch(`api/licitacionesPub.php?${paramsSiguiente.toString()}`, { cache: 'no-store' })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data) guardarCache(cacheKeySiguiente, data);
          })
          .catch(() => {});
      }
    }

    if (json.instituciones && json.instituciones.length > 0) {
      aliasInstituciones = Object.fromEntries(json.instituciones.map(item => [item.id, item.alias]));
    } else if (Object.keys(aliasInstituciones).length === 0) {
      cargarInstitucionesDesdeCSV();
    }

    ordenarDatos();
    mostrarDatos(datos);

    if (mostrarEstado) {
      setEstadoActualizacion(`Listado actualizado: ${new Date().toLocaleString('es-CL')}`);
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error('Error al cargar licitaciones:', err);
    setEstadoActualizacion('No se pudo actualizar el listado. Intenta nuevamente.');
  } finally {
    if (_fetchController === controller) _fetchController = null;
    cargandoListado = false;
    setBotonActualizacionEstado(false);
  }
}

function actualizarListadoManual() {
  forzarActualizacion = true;
  actualizarListadoLicitaciones({ resetPagina: true, mostrarEstado: true });
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

function setCargaResultadosActiva(cargando, mensaje = 'Cargando resultados...') {
  const contenedor = document.getElementById('contenedorCards');
  const cantidad = document.getElementById('cantidadResultados');
  const paginacion = document.getElementById('pagination');
  if (!contenedor || !cargando) return;

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
          <div class="small text-muted">Estamos consultando los resultados con tus filtros.</div>
        </div>
      </div>
    </div>
  `;
}

async function cargarPalabrasClave() {
  try {
    const res = await fetch('api/catalogosPub.php?catalogo=palabras_clave', { credentials: 'include' });
    if (res.status === 401) {
      window.location.href = 'ingresar.html?redir=palabras_clave.html';
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { palabras_clave } = await res.json();
    const filas = Array.isArray(palabras_clave) ? palabras_clave : [];
    palabrasDisponibles = filas.map(row => {
      const todos = [row.palabra, ...(row.variantes || [])].map(v => v.trim()).filter(Boolean);
      const base = row.palabra.trim();
      const variantesOriginales = Array.from(new Set(todos));
      const variantesNormalizadas = Array.from(new Set(todos.map(normalizarTexto)));
      return { base, variantesOriginales, variantesNormalizadas };
    }).sort((a, b) => a.base.localeCompare(b.base, 'es'));
    palabrasMap = new Map(palabrasDisponibles.map(item => [item.base, item]));
    renderizarCheckboxes();
    actualizarResumenPalabras();
    // No re-fetch: sin palabras seleccionadas la query no cambia
  } catch (err) {
    console.error('Error al cargar palabras clave:', err);
  }
}

async function cargarInstitucionesDesdeCSV() {
  try {
    const res = await fetch('api/catalogosPub.php?catalogo=instituciones', { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { instituciones } = await res.json();
    aliasInstituciones = Object.fromEntries((instituciones || []).map(item => [item.nombre, item.alias]));
  } catch (err) {
    console.error('Error al cargar instituciones:', err);
  }
  // Solo re-renderizar con los datos ya cargados, sin nueva petición al servidor
  ordenarDatos();
  mostrarDatos(datos);
}

function renderizarCheckboxes() {
  const contenedor = document.getElementById('filtrosPalabras');
  if (!contenedor) return;

  contenedor.innerHTML = '';

  palabrasDisponibles.forEach(item => {
    const seleccionada = palabrasSeleccionadas.includes(item.base);
    const variacionesTexto = item.variantesOriginales?.join(', ') || item.base;
    const chip = `
      <button
        type="button"
        class="suggestion-chip suggestion-chip-button ${seleccionada ? 'is-selected' : 'is-unselected'}"
        data-palabra="${encodeURIComponent(item.base)}"
      >
        <span>${item.base} (${variacionesTexto})</span>
      </button>`;
    contenedor.innerHTML += chip;
  });

  contenedor.querySelectorAll('[data-palabra]').forEach((button) => {
    button.addEventListener('click', () => {
      const base = decodeURIComponent(button.dataset.palabra || '');
      togglePalabra(base);
    });
  });
}

function actualizarPalabrasSeleccionadas() {
  renderizarCheckboxes();
  actualizarResumenPalabras();
  filtrarDatos();
}

function togglePalabra(base) {
  if (!base) return;
  if (palabrasSeleccionadas.includes(base)) {
    palabrasSeleccionadas = palabrasSeleccionadas.filter(item => item !== base);
  } else {
    palabrasSeleccionadas.push(base);
  }
  renderizarCheckboxes();
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
  palabrasSeleccionadas = palabrasDisponibles.map(item => item.base);
  renderizarCheckboxes();
  actualizarResumenPalabras();
  filtrarDatos();
}

function mostrarDatos(datosActuales) {
  const contenedor = document.getElementById('contenedorCards');
  contenedor.innerHTML = '';

  datosActuales.forEach(item => {
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

  const totalTexto = Number.isFinite(totalServidor)
    ? `Total de resultados encontrados: ${totalServidor}`
    : `Resultados mostrados: ${datosActuales.length} (total en calculo)`;
  document.getElementById('cantidadResultados').innerHTML = totalTexto;
  document.getElementById('btnDescargarCsv').disabled = datosActuales.length === 0;
  renderizarPaginacion();
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
  actualizarListadoLicitaciones({ resetPagina, mostrarEstado: false });
}

function buscarTextoEnEnter(event) {
  if (event.key !== 'Enter') return;

  event.preventDefault();
  actualizarListadoLicitaciones({ resetPagina: true, mostrarEstado: false });
}

function obtenerVariantesSeleccionadas() {
  // Mantenido por compatibilidad; usa obtenerVariantesOriginales para enviar al servidor
  return obtenerVariantesOriginales();
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
  const pagination = document.getElementById('pagination');
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
    mostrarSkeleton: true,
    mensajeCarga: `Cargando pagina ${paginaServidor}...`
  });
}

function limpiarFiltros() {
  document.getElementById('filtroTexto').value = '';
  const periodoEl = document.getElementById('filtroPeriodo');
  if (periodoEl) periodoEl.value = '';
  textoFiltro = '';
  palabrasSeleccionadas = [];
  renderizarCheckboxes();
  actualizarResumenPalabras();
  filtrarDatos();
}

async function descargarCsv() {
  if (totalServidor === 0) return;

  const btn = document.getElementById('btnDescargarCsv');
  const textoOriginal = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Descargando...'; }

  try {
    const todasLicitaciones = [];
    let totalPaginas = 1;
    for (let p = 1; p <= totalPaginas; p++) {
      const params = construirParams(p);
      const cacheKey = `lics_pk_${params.toString()}`;
      let json = leerCache(cacheKey);
      if (!json) {
        const res = await fetch(`api/licitacionesPub.php?${params.toString()}`, { cache: 'no-store' });
        if (!res.ok) break;
        json = await res.json();
        guardarCache(cacheKey, json);
      }
      todasLicitaciones.push(...(json.licitaciones || []).filter(item => item.codigo));
      totalPaginas = Math.max(1, Number(json.paginas) || 1);
    }

    const encabezados = [
      'codigo', 'estado', 'tipo', 'nombre', 'descripcion',
      'institucion_nombre', 'monto_estimado', 'unidad_monetaria',
      'fecha_inicio', 'fecha_final'
    ];
    const filas = todasLicitaciones.map(item =>
      encabezados.map(campo => escaparCsv(item[campo] ?? '')).join(';')
    );
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
  } finally {
    if (btn) { btn.disabled = totalServidor === 0; btn.textContent = textoOriginal; }
  }
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
