let sugerencias = [];
let categoriasDisponibles = [];
let institucionesDisponibles = [];
let paginaActual = 1;
let sugerenciasFiltradasActuales = [];
let perfilCategorias = [];
let perfilInstituciones = [];
let enfoqueActual = 'listado';
let codigosGuardadosSugerencias = new Set();
const SUGERENCIAS_POR_PAGINA = 10;
const filtrosSugerencias = {
  afinidadMinima: 0,
  categoriasSeleccionadas: new Set(),
  institucionesSeleccionadas: new Set()
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function obtenerClaseEstadoSugerencia(estado) {
  const valor = (estado || '').toString().trim().toLowerCase();
  if (valor === 'adjudicada') return 'bg-success';
  if (valor === 'publicada') return 'bg-primary';
  if (valor === 'cerrada') return 'bg-secondary';
  if (valor.startsWith('desierta')) return 'bg-warning text-dark';
  if (valor === 'revocada' || valor === 'suspendida') return 'bg-danger';
  return 'bg-dark';
}

function formatearMoneda(valor, moneda = 'CLP') {
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero <= 0) {
    return 'No informado';
  }

  if (moneda && moneda !== 'CLP') {
    return `${Math.round(numero).toLocaleString('es-CL')} ${moneda}`;
  }

  return `$${Math.round(numero).toLocaleString('es-CL')}`;
}

function formatearFecha(valor) {
  if (!valor) return 'No informada';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return valor;
  return fecha.toLocaleDateString('es-CL');
}

function setEstado(message, type = 'info') {
  const box = document.getElementById('sugerenciasEstado');
  if (!box) return;
  box.innerHTML = `<div class="alert alert-${type} py-2 mb-0">${message}</div>`;
}

function etiquetaEnfoque(enfoque) {
  return enfoque === 'listado'
    ? 'listado de palabras clave indicadas'
    : 'sugerencia de palabras clave (historial)';
}

function normalizarInstitucion(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('es-CL');
}

function normalizarCategoria(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('es-CL');
}

function renderInlineList(items, className = '') {
  if (!items || items.length === 0) {
    return '<span class="text-muted">Sin coincidencias relevantes</span>';
  }

  return items.map((item, index) => {
    const separator = index < items.length - 1 ? '<span class="suggestion-separator">, </span>' : '';
    return `<span class="${className}">${escapeHtml(item)}</span>${separator}`;
  }).join('');
}

function renderBadges(containerId, items, mapper) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!items || items.length === 0) {
    container.innerHTML = '<div class="text-muted small">Sin datos suficientes.</div>';
    return;
  }

  container.innerHTML = items.map(mapper).join('');
}

function actualizarResumenSugerencias(totalFiltradas, totalOriginal) {
  const resumen = document.getElementById('sugerenciasResumen');
  if (!resumen) return;

  const totalPaginas = Math.max(1, Math.ceil((totalFiltradas || 0) / SUGERENCIAS_POR_PAGINA));

  resumen.innerHTML = `
    <div class="small text-muted">Sugerencias visibles</div>
    <div class="fs-4 fw-bold">${Number(totalFiltradas || 0).toLocaleString('es-CL')}</div>
    <div class="small text-muted">de ${Number(totalOriginal || 0).toLocaleString('es-CL')} detectadas</div>
    <div class="small text-muted">Página ${paginaActual} de ${totalPaginas}</div>
  `;
}

function actualizarResumenFiltros(totalFiltradas, totalOriginal) {
  const box = document.getElementById('sugerenciasFiltrosResumen');
  if (!box) return;

  const categoriasSeleccionadas = filtrosSugerencias.categoriasSeleccionadas.size;
  const totalCategorias = categoriasDisponibles.length;
  const seleccionadas = filtrosSugerencias.institucionesSeleccionadas.size;
  const totalInstituciones = institucionesDisponibles.length;
  box.textContent = `${Number(totalFiltradas || 0).toLocaleString('es-CL')} de ${Number(totalOriginal || 0).toLocaleString('es-CL')} resultados · ${categoriasSeleccionadas}/${totalCategorias} categorías · ${seleccionadas}/${totalInstituciones} instituciones`;
}

function construirCategoriasDisponibles(lista, perfilLista = []) {
  const mapa = new Map();

  (lista || []).forEach((item) => {
    const categorias = Array.isArray(item.categorias_coincidentes) ? item.categorias_coincidentes : [];
    categorias.forEach((categoria) => {
      const nombre = String(categoria || '').trim();
      if (!nombre) return;
      const key = normalizarCategoria(nombre);
      if (!mapa.has(key)) {
        mapa.set(key, { key, nombre, total: 0 });
      }
      mapa.get(key).total += 1;
    });
  });

  if (!mapa.size) {
    (perfilLista || []).forEach((item) => {
      const nombre = String(item.categoria_nombre || item.categoria || 'Sin categoría').trim() || 'Sin categoría';
      const key = normalizarCategoria(nombre);
      if (!mapa.has(key)) {
        mapa.set(key, { key, nombre, total: Number(item.total_licitaciones || 0) || 0 });
      }
    });
  }

  return Array.from(mapa.values()).sort((a, b) => {
    if (b.total !== a.total) {
      return b.total - a.total;
    }
    return a.nombre.localeCompare(b.nombre, 'es-CL');
  });
}

function construirInstitucionesDisponibles(lista, perfilLista = []) {
  const mapa = new Map();

  (lista || []).forEach((item) => {
    const nombre = String(item.institucion_nombre || 'No informada').trim() || 'No informada';
    const key = normalizarInstitucion(nombre);
    if (!mapa.has(key)) {
      mapa.set(key, { key, nombre, total: 0 });
    }
    mapa.get(key).total += 1;
  });

  if (!mapa.size) {
    (perfilLista || []).forEach((item) => {
      const nombre = String(item.nombre_organismo || item.institucion_nombre || 'No informada').trim() || 'No informada';
      const key = normalizarInstitucion(nombre);
      if (!mapa.has(key)) {
        mapa.set(key, { key, nombre, total: Number(item.total_licitaciones || 0) || 0 });
      }
    });
  }

  return Array.from(mapa.values()).sort((a, b) => {
    if (b.total !== a.total) {
      return b.total - a.total;
    }
    return a.nombre.localeCompare(b.nombre, 'es-CL');
  });
}

function renderSelectableChipFilter(containerId, items, selectedSet, onToggle) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!items.length) {
    container.innerHTML = '<div class="text-muted small">No hay elementos disponibles para filtrar.</div>';
    return;
  }

  container.innerHTML = items.map((item) => `
    <button type="button" class="suggestion-chip suggestion-chip-button ${selectedSet.has(item.key) ? 'is-selected' : 'is-unselected'}" data-key="${encodeURIComponent(item.key)}">
      <span>${escapeHtml(item.nombre)}</span>
      <strong>${item.total}</strong>
    </button>
  `).join('');

  container.querySelectorAll('[data-key]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = decodeURIComponent(button.dataset.key || '');
      onToggle(key);
      aplicarFiltros(true);
    });
  });
}

function renderCategoriasFiltro() {
  renderSelectableChipFilter('sugerenciasCategorias', categoriasDisponibles, filtrosSugerencias.categoriasSeleccionadas, (key) => {
    if (filtrosSugerencias.categoriasSeleccionadas.has(key)) {
      filtrosSugerencias.categoriasSeleccionadas.delete(key);
    } else {
      filtrosSugerencias.categoriasSeleccionadas.add(key);
    }
  });
}

function renderInstitucionesFiltro() {
  renderSelectableChipFilter('sugerenciasInstituciones', institucionesDisponibles, filtrosSugerencias.institucionesSeleccionadas, (key) => {
    if (filtrosSugerencias.institucionesSeleccionadas.has(key)) {
      filtrosSugerencias.institucionesSeleccionadas.delete(key);
    } else {
      filtrosSugerencias.institucionesSeleccionadas.add(key);
    }
  });
}

function sincronizarControlesFiltros() {
  const slider = document.getElementById('afinidadMinima');
  const value = document.getElementById('afinidadMinimaValor');

  if (slider) {
    slider.value = String(filtrosSugerencias.afinidadMinima);
  }

  if (value) {
    value.textContent = String(filtrosSugerencias.afinidadMinima);
  }
}

function tieneFiltrosActivos() {
  return (
    filtrosSugerencias.afinidadMinima > 0 ||
    filtrosSugerencias.categoriasSeleccionadas.size !== categoriasDisponibles.length ||
    filtrosSugerencias.institucionesSeleccionadas.size !== institucionesDisponibles.length
  );
}

function obtenerSugerenciasFiltradas() {
  return sugerencias.filter((item) => {
    const score = Number(item.score || 0);
    if (score < filtrosSugerencias.afinidadMinima) {
      return false;
    }

    const todasCategoriasActivas = filtrosSugerencias.categoriasSeleccionadas.size === categoriasDisponibles.length;
    if (!todasCategoriasActivas) {
      if (!filtrosSugerencias.categoriasSeleccionadas.size) {
        return false;
      }

      const categorias = Array.isArray(item.categorias_coincidentes) ? item.categorias_coincidentes : [];
      const coincideCategoria = categorias.some((categoria) => filtrosSugerencias.categoriasSeleccionadas.has(normalizarCategoria(categoria)));
      if (!coincideCategoria) {
        return false;
      }
    }

    const todasInstitucionesActivas = filtrosSugerencias.institucionesSeleccionadas.size === institucionesDisponibles.length;
    if (!todasInstitucionesActivas) {
      if (!filtrosSugerencias.institucionesSeleccionadas.size) {
        return false;
      }

      const institucionKey = normalizarInstitucion(item.institucion_nombre || 'No informada');
      if (!filtrosSugerencias.institucionesSeleccionadas.has(institucionKey)) {
        return false;
      }
    }

    return true;
  });
}

function obtenerTotalPaginas(totalItems) {
  return Math.max(1, Math.ceil(Number(totalItems || 0) / SUGERENCIAS_POR_PAGINA));
}

function obtenerSugerenciasPagina(lista) {
  const totalPaginas = obtenerTotalPaginas(lista.length);
  if (paginaActual > totalPaginas) {
    paginaActual = totalPaginas;
  }
  if (paginaActual < 1) {
    paginaActual = 1;
  }

  const inicio = (paginaActual - 1) * SUGERENCIAS_POR_PAGINA;
  return lista.slice(inicio, inicio + SUGERENCIAS_POR_PAGINA);
}

function renderPaginacion(totalItems) {
  const superior = document.getElementById('sugerenciasPaginacionSuperior');
  const inferior = document.getElementById('sugerenciasPaginacionInferior');
  if (!superior || !inferior) return;

  if (!totalItems || totalItems <= SUGERENCIAS_POR_PAGINA) {
    superior.innerHTML = '';
    inferior.innerHTML = '';
    return;
  }

  const totalPaginas = obtenerTotalPaginas(totalItems);
  const inicio = (paginaActual - 1) * SUGERENCIAS_POR_PAGINA + 1;
  const fin = Math.min(totalItems, paginaActual * SUGERENCIAS_POR_PAGINA);
  const paginas = [];
  for (let page = 1; page <= totalPaginas; page += 1) {
    paginas.push(`
      <li class="page-item ${page === paginaActual ? 'active' : ''}">
        <button type="button" class="page-link" data-page="${page}">${page}</button>
      </li>
    `);
  }

  const markup = `
    <div class="d-flex flex-wrap justify-content-between align-items-center gap-3 suggestion-pagination-bar">
      <div class="small text-muted">Mostrando ${inicio}-${fin} de ${Number(totalItems).toLocaleString('es-CL')} sugerencias</div>
      <nav aria-label="Paginación de sugerencias">
        <ul class="pagination mb-0">
          <li class="page-item ${paginaActual === 1 ? 'disabled' : ''}">
            <button type="button" class="page-link" data-page="${paginaActual - 1}">Anterior</button>
          </li>
          ${paginas.join('')}
          <li class="page-item ${paginaActual === totalPaginas ? 'disabled' : ''}">
            <button type="button" class="page-link" data-page="${paginaActual + 1}">Siguiente</button>
          </li>
        </ul>
      </nav>
    </div>
  `;

  superior.innerHTML = markup;
  inferior.innerHTML = markup;

  [superior, inferior].forEach((container) => {
    container.querySelectorAll('[data-page]').forEach((button) => {
      button.addEventListener('click', () => {
        const nextPage = Number(button.dataset.page || paginaActual);
        if (!Number.isFinite(nextPage) || nextPage < 1 || nextPage > totalPaginas || nextPage === paginaActual) {
          return;
        }
        paginaActual = nextPage;
        actualizarVistaSugerencias();
      });
    });
  });
}

function renderPerfil(data) {
  const proveedor = data.proveedor || {};
  const perfil = data.perfil || {};
  const subtitulo = document.getElementById('sugerenciasProveedorSubtitulo');
  const kpis = document.getElementById('sugerenciasKpis');
  const leyenda = document.getElementById('sugerenciasLeyenda');

  if (subtitulo) {
    subtitulo.textContent = proveedor.rut ? `${proveedor.nombre} · RUT ${proveedor.rut}` : (proveedor.nombre || 'Proveedor asociado');
  }

  if (kpis) {
    kpis.innerHTML = `
      <div class="row g-2">
        <div class="col-6">
          <div class="kpi-card h-100">
            <div class="kpi-label">Adjudicadas</div>
            <div class="kpi-value">${Number(perfil.total_adjudicadas || 0).toLocaleString('es-CL')}</div>
          </div>
        </div>
        <div class="col-6">
          <div class="kpi-card h-100">
            <div class="kpi-label">Monto histórico</div>
            <div class="kpi-value kpi-value-sm">${formatearMoneda(perfil.monto_total_adjudicado)}</div>
          </div>
        </div>
        <div class="col-12">
          <div class="small text-muted">Última adjudicación: ${formatearFecha(perfil.ultima_adjudicacion)}</div>
        </div>
      </div>
    `;
  }

  if (leyenda) {
    leyenda.innerHTML = `
      <strong>Cómo se interpreta la afinidad:</strong><br>
      La afinidad está normalizada de 0 a 100 y el listado se ordena primero por ese puntaje. Si hay empate, se usan como desempate las coincidencias de palabras clave, institución y categoría, y luego la fecha más reciente.
    `;
  }

  renderBadges('sugerenciasPalabras', perfil.palabras_clave || [], (item) => `
    <span class="suggestion-chip suggestion-chip-muted">${escapeHtml(item)}</span>
  `);
}

async function guardarSugerencia(codigo, button) {
  try {
    const response = await fetch('api/guardadas.php?action=add', {
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
      throw new Error(data.error || 'No se pudo guardar la licitación');
    }

    if (button) {
      button.disabled = true;
      button.textContent = 'Guardada';
    }

    codigosGuardadosSugerencias.add(codigo);
  } catch (error) {
    setEstado(error.message, 'danger');
  }
}

async function cargarGuardadasSugerencias() {
  try {
    const response = await fetch('api/guardadas.php?action=list', {
      method: 'GET',
      credentials: 'include'
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      codigosGuardadosSugerencias = new Set();
      return;
    }

    codigosGuardadosSugerencias = new Set((data.guardadas || []).map(item => item.codigo));
  } catch (error) {
    codigosGuardadosSugerencias = new Set();
  }
}

function renderSugerencias(lista) {
  const container = document.getElementById('sugerenciasCards');
  if (!container) return;

  if (!lista || lista.length === 0) {
    container.innerHTML = tieneFiltrosActivos()
      ? '<div class="alert alert-secondary">No hay licitaciones que coincidan con los filtros seleccionados.</div>'
      : '<div class="alert alert-secondary">No encontramos licitaciones publicadas con señales claras de afinidad para este proveedor.</div>';
    return;
  }

  const pagina = obtenerSugerenciasPagina(lista);

  container.innerHTML = pagina.map((item) => `
    <div class="card mb-3 shadow-sm suggestion-card">
      <div class="card-body">
        <div class="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-2">
          <div>
            <div class="text-muted small mb-2"><strong>ID Licitación:</strong> ${escapeHtml(item.codigo)}</div>
            <a href="https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idLicitacion=${encodeURIComponent(item.codigo)}" target="_blank" rel="noopener noreferrer">
              <h5 class="text-primary fw-bold mb-1">${escapeHtml(item.nombre || '(Sin título)')}</h5>
            </a>
          </div>
          <div class="suggestion-score-box">
            <div class="suggestion-score-label">Afinidad</div>
            <div class="suggestion-score-value">${Number(item.score || 0)}</div>
            <div class="suggestion-score-hint">escala 0 a 100</div>
          </div>
        </div>

        <p class="text-secondary mb-3">${escapeHtml(item.descripcion || '(Sin descripción)')}</p>

        <div class="row g-3 mb-3">
          <div class="col-md-4"><strong>Institución:</strong><br>${escapeHtml(item.institucion_nombre || 'No informada')}</div>
          <div class="col-md-4"><strong>Monto estimado:</strong><br>${formatearMoneda(item.monto_estimado, item.unidad_monetaria)}</div>
          <div class="col-md-4"><strong>Cierre:</strong><br>${formatearFecha(item.fecha_final)}</div>
        </div>

        <div class="mb-2 small">
          <strong>Señales detectadas:</strong><br>
          ${renderInlineList(item.razones || [], 'suggestion-inline-accent')}
        </div>

        <div class="mb-2 small">
          <strong>Categorías relacionadas:</strong><br>
          ${renderInlineList(item.categorias_coincidentes || [], 'suggestion-inline-category')}
        </div>

        <div class="mb-2 small">
          <strong>Términos relacionados:</strong><br>
          ${renderInlineList(item.palabras_coincidentes || [], 'suggestion-inline-muted')}
        </div>

        <div class="d-flex flex-wrap gap-2 mt-3">
          <span class="badge ${obtenerClaseEstadoSugerencia(item.estado)} align-self-center">${item.estado || 'Sin estado'}</span>
          <button class="btn ${codigosGuardadosSugerencias.has(item.codigo) ? 'btn-outline-secondary' : 'btn-warning'} btn-sm" data-guardar-codigo="${escapeHtml(item.codigo)}" ${codigosGuardadosSugerencias.has(item.codigo) ? 'disabled' : ''}>
            <i class="bi ${codigosGuardadosSugerencias.has(item.codigo) ? 'bi-bookmark-check' : 'bi-bookmark-plus'}"></i> ${codigosGuardadosSugerencias.has(item.codigo) ? 'Guardada' : 'Guardar licitación'}
          </button>
          <a class="btn btn-primary btn-sm" target="_blank" rel="noopener noreferrer" href="https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idLicitacion=${encodeURIComponent(item.codigo)}">Ver en Mercado Público</a>
        </div>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('[data-guardar-codigo]').forEach((button) => {
    button.addEventListener('click', () => guardarSugerencia(button.dataset.guardarCodigo, button));
  });
}

function actualizarVistaSugerencias() {
  actualizarResumenSugerencias(sugerenciasFiltradasActuales.length, sugerencias.length);
  actualizarResumenFiltros(sugerenciasFiltradasActuales.length, sugerencias.length);
  renderPaginacion(sugerenciasFiltradasActuales.length);
  renderSugerencias(sugerenciasFiltradasActuales);
}

function aplicarFiltros(resetPagina = false) {
  if (resetPagina) {
    paginaActual = 1;
  }

  sugerenciasFiltradasActuales = obtenerSugerenciasFiltradas();
  sincronizarControlesFiltros();
  renderCategoriasFiltro();
  renderInstitucionesFiltro();
  actualizarVistaSugerencias();
}

function inicializarFiltros() {
  categoriasDisponibles = construirCategoriasDisponibles(sugerencias, perfilCategorias);
  institucionesDisponibles = construirInstitucionesDisponibles(sugerencias, perfilInstituciones);
  filtrosSugerencias.afinidadMinima = 0;
  filtrosSugerencias.categoriasSeleccionadas = new Set(categoriasDisponibles.map((item) => item.key));
  filtrosSugerencias.institucionesSeleccionadas = new Set(institucionesDisponibles.map((item) => item.key));

  const slider = document.getElementById('afinidadMinima');
  const selectAllCategoriesButton = document.getElementById('seleccionarTodasCategorias');
  const clearCategoriesButton = document.getElementById('limpiarCategorias');
  const selectAllButton = document.getElementById('seleccionarTodasInstituciones');
  const clearButton = document.getElementById('limpiarInstituciones');

  if (slider) {
    const handleSliderChange = () => {
      filtrosSugerencias.afinidadMinima = Number(slider.value || 0);
      aplicarFiltros(true);
    };
    slider.oninput = handleSliderChange;
    slider.onchange = handleSliderChange;
  }

  if (selectAllCategoriesButton) {
    selectAllCategoriesButton.onclick = () => {
      filtrosSugerencias.categoriasSeleccionadas = new Set(categoriasDisponibles.map((item) => item.key));
      aplicarFiltros(true);
    };
  }

  if (clearCategoriesButton) {
    clearCategoriesButton.onclick = () => {
      filtrosSugerencias.categoriasSeleccionadas = new Set();
      aplicarFiltros(true);
    };
  }

  if (selectAllButton) {
    selectAllButton.onclick = () => {
      filtrosSugerencias.institucionesSeleccionadas = new Set(institucionesDisponibles.map((item) => item.key));
      aplicarFiltros(true);
    };
  }

  if (clearButton) {
    clearButton.onclick = () => {
      filtrosSugerencias.institucionesSeleccionadas = new Set();
      aplicarFiltros(true);
    };
  }

  aplicarFiltros(true);
}

async function cargarSugerencias() {
  if (!window.AuthState.loggedIn) {
    window.location.href = 'ingresar.html';
    return;
  }

  setEstado(`Calculando sugerencias por ${etiquetaEnfoque(enfoqueActual)}...`, 'info');

  try {
    const response = await fetch(`api/sugerenciasPub.php?enfoque=${encodeURIComponent(enfoqueActual)}`, {
      method: 'GET',
      credentials: 'include'
    });
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'No se pudieron cargar las sugerencias');
    }

    sugerencias = data.sugerencias || [];
    await cargarGuardadasSugerencias();
    perfilCategorias = data.perfil?.categorias || [];
    perfilInstituciones = data.perfil?.instituciones || [];
    renderPerfil(data);
    inicializarFiltros();
    setEstado(`Se encontraron ${sugerencias.length} licitaciones publicadas con afinidad para tu proveedor (${etiquetaEnfoque(enfoqueActual)}).`, 'success');
  } catch (error) {
    document.getElementById('sugerenciasCards').innerHTML = '';
    setEstado(error.message, 'danger');
  }
}

function inicializarSelectorEnfoque() {
  const select = document.getElementById('enfoqueSugerencias');
  if (!select) return;

  select.value = enfoqueActual;
  select.addEventListener('change', () => {
    const nuevoEnfoque = select.value === 'listado' ? 'listado' : 'sugeridas';
    if (nuevoEnfoque === enfoqueActual) return;
    enfoqueActual = nuevoEnfoque;
    paginaActual = 1;
    cargarSugerencias();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  inicializarSelectorEnfoque();
});

document.addEventListener('auth:changed', () => {
  if (!window.AuthState.loggedIn) {
    window.location.href = 'ingresar.html';
    return;
  }

  cargarSugerencias();
});