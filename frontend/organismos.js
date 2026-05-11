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
let datosFiltradosActuales = [];

// Listas estáticas de filtros
const aniosDisponibles = [2026,2025,2024,2023,2022,2021,2020,2019,2018,2017,2016,2015,2014,2013,2012,2011,2010,2009,2008,2007,2006,2005,2004];
const estadosDisponibles = ["Adjudicada","Cerrada","Desierta (o art. 3 ó 9 Ley 19.886)","Publicada","Revocada","Suspendida"];
const tiposDisponibles = ["B2","CO","DC","E2","H2","I2","L1","LE","LP","LQ","LR","LS","O1","O2","SE"];

// Organismos cargados desde CSV
let organismosDisponibles = [];

// Cargar organismos desde CSV
fetch('data/csv/organismos.csv')
  .then(res => res.text())
  .then(texto => {
    const lineas = texto.split('\n');
    organismosDisponibles = lineas
      .slice(1) // Saltar header
      .map(linea => linea.trim())
      .filter(linea => linea.length > 0)
      .sort((a, b) => a.localeCompare(b, 'es'));
    
    console.log(`✅ ${organismosDisponibles.length} organismos cargados desde CSV`);
  })
  .catch(err => {
    console.error('❌ Error al cargar organismos desde CSV:', err);
  });

// Inicializar la interfaz
document.addEventListener('DOMContentLoaded', () => {
  renderizarFiltros();
  actualizarKpis();
});

// Función para cargar licitaciones de un organismo específico
function cargarLicitacionesPorOrganismo(organismo) {
  if (!organismo || !organismo.trim()) return;
  
  console.log(`🔍 Cargando licitaciones para: ${organismo}`);
  
  fetch(`api/organismosPub.php?organismo=${encodeURIComponent(organismo)}`)
    .then(async (res) => {
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        const texto = await res.text();
        throw new Error(texto || `HTTP ${res.status}`);
      }
      return res.json();
    })
    .then(({ licitaciones }) => {
      datos = (licitaciones || []).filter(item => item.codigo);
      console.log(`✅ ${datos.length} licitaciones cargadas`);
      ordenarDatos();
      filtrarDatos();
    })
    .catch(err => {
      console.error('❌ Error al cargar licitaciones:', err);
      alert('Error al cargar las licitaciones del organismo seleccionado');
    });
}

// Función para actualizar sugerencias del dropdown
function actualizarSugerencias(texto) {
  const contenedor = document.getElementById('organismosSugerencias');
  if (!contenedor) return;
  
  const textoNorm = normalizarTexto(texto);
  
  if (!textoNorm) {
    // Mostrar todos los organismos si no hay texto
    const sugerencias = organismosDisponibles.slice(0, 10);
    contenedor.innerHTML = sugerencias
      .map(org => `<button type="button" class="dropdown-item" onclick="seleccionarOrganismo('${org.replace(/'/g, "\\'")}')">${org}</button>`)
      .join('');
    contenedor.classList.add('show');
    return;
  }
  
  // Filtrar organismos que coincidan
  const sugerencias = organismosDisponibles
    .filter(org => normalizarTexto(org).includes(textoNorm))
    .slice(0, 10);
  
  if (sugerencias.length > 0) {
    contenedor.innerHTML = sugerencias
      .map(org => `<button type="button" class="dropdown-item" onclick="seleccionarOrganismo('${org.replace(/'/g, "\\'")}')">${org}</button>`)
      .join('');
    contenedor.classList.add('show');
  } else {
    contenedor.innerHTML = '<div class="dropdown-item disabled">No se encontraron coincidencias</div>';
    contenedor.classList.add('show');
  }
}

// Función para seleccionar un organismo del dropdown
function seleccionarOrganismo(organismo) {
  const input = document.getElementById('filtroOrganismo');
  const contenedor = document.getElementById('organismosSugerencias');
  
  if (input) input.value = organismo;
  if (contenedor) contenedor.classList.remove('show');
  
  cargarLicitacionesPorOrganismo(organismo);
}

function renderizarFiltros() {
  const selectAnio = document.getElementById('filtroAnio');
  const selectEstado = document.getElementById('filtroEstado');
  const selectTipo = document.getElementById('filtroTipo');

  if (selectAnio) {
    selectAnio.innerHTML = '<option value="todos">Todos</option>';
    aniosDisponibles.forEach(anio => {
      selectAnio.innerHTML += `<option value="${anio}">${anio}</option>`;
    });
  }

  if (selectEstado) {
    selectEstado.innerHTML = '<option value="todos">Todos</option>';
    estadosDisponibles.forEach(estado => {
      selectEstado.innerHTML += `<option value="${estado}">${estado}</option>`;
    });
  }

  if (selectTipo) {
    selectTipo.innerHTML = '<option value="todos">Todos</option>';
    tiposDisponibles.forEach(tipo => {
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
    const alias = item.institucion_nombre;
    const montoFormateado = item.monto_estimado && !isNaN(item.monto_estimado)
      ? (item.unidad_monetaria && item.unidad_monetaria !== 'CLP'
          ? `${parseInt(item.monto_estimado).toLocaleString('es-CL')} ${item.unidad_monetaria}`
          : `$${parseInt(item.monto_estimado).toLocaleString('es-CL')}`)
      : (item.monto_estimado || 'No informado');
    const montoAdjudicado = formatearMoneda(item.monto_adjudicado_total, { zeroAsNoInfo: true });
    const esAdjudicada = normalizarTexto(item.estado) === 'adjudicada';
    const proveedoresAdjudicados = (item.proveedores_adjudicados || '').trim();
    const fechaAdjudicacion = formatearFecha(item.fecha_adjudicacion);
    const bloqueProveedor = esAdjudicada
      ? `<div class="row mt-2">
          <div class="col-md-12"><strong>Proveedor adjudicado:</strong><br>${proveedoresAdjudicados || 'No informado'}</div>
        </div>`
      : '';
    const bloqueFechaAdjudicacion = esAdjudicada
      ? `<div class="row mt-2">
          <div class="col-md-6"><strong>Fecha de adjudicación:</strong><br>${fechaAdjudicacion}</div>
        </div>`
      : '';

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
        ${bloqueFechaAdjudicacion}
        ${bloqueProveedor}
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
  const filtroPeriodo = document.getElementById('filtroPeriodo')?.value || '';
  filtroEstado = document.getElementById('filtroEstado')?.value || 'todos';
  filtroTipo = document.getElementById('filtroTipo')?.value || 'todos';
  if (resetPagina) paginaActual = 1;

  const ahora = new Date();
  const limite = new Date(ahora);
  const tienePeriodo = filtroPeriodo !== '';
  if (filtroPeriodo === '3m') limite.setMonth(limite.getMonth() - 3);
  if (filtroPeriodo === '6m') limite.setMonth(limite.getMonth() - 6);
  if (filtroPeriodo === '1y') limite.setFullYear(limite.getFullYear() - 1);
  if (filtroPeriodo === '2y') limite.setFullYear(limite.getFullYear() - 2);
  if (filtroPeriodo === '3y') limite.setFullYear(limite.getFullYear() - 3);
  if (filtroPeriodo === '5y') limite.setFullYear(limite.getFullYear() - 5);

  actualizarSugerencias(textoOrganismo);

  const datosFiltrados = datos.filter(item => {
    const alias = (item.institucion_nombre || '').toLowerCase();
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

    const coincidePeriodo = (() => {
      if (!tienePeriodo) return true;
      const fechaPub = parsearFechaFiltro(item.fecha_inicio || item.fecha_publicacion || item.fecha_final);
      if (!fechaPub) return false;
      if (filtroPeriodo === 'gt5y') return fechaPub < limite;
      return fechaPub >= limite;
    })();

    return coincideTexto && coincideOrganismo && coincideAnio && coincideEstado && coincideTipo && coincidePeriodo;
  });

  datosFiltradosActuales = datosFiltrados;
  const botonCsv = document.getElementById('btnDescargarCsv');
  if (botonCsv) botonCsv.disabled = datosFiltrados.length === 0;

  actualizarKpis(datosFiltrados);
  generarGraficos(datosFiltrados);
  mostrarDatos(datosFiltrados);
}

function buscarTextoEnEnter(event) {
  if (event.key !== 'Enter') return;

  event.preventDefault();
  filtrarDatos(true);
}

function actualizarSugerencias(textoOrganismo) {
  const contenedor = document.getElementById('organismosSugerencias');
  const input = document.getElementById('filtroOrganismo');
  if (!contenedor || !input) return;

  const textoNormalizado = normalizarTexto(textoOrganismo);
  const sugerencias = organismosDisponibles
    .filter((alias) => {
      if (!textoNormalizado) return true;
      return normalizarTexto(alias).includes(textoNormalizado);
    })
    .slice(0, 10);

  if (sugerencias.length === 0) {
    contenedor.classList.remove('show');
    contenedor.innerHTML = '';
    return;
  }

  contenedor.innerHTML = sugerencias
    .map((alias) => `<div class="organismo-dropdown-item" data-valor="${alias}">${alias}</div>`)
    .join('');
  contenedor.classList.add('show');
}

document.addEventListener('click', (event) => {
  const contenedor = document.getElementById('organismosSugerencias');
  const input = document.getElementById('filtroOrganismo');
  if (!contenedor || !input) return;

  const item = event.target.closest('.organismo-dropdown-item');
  if (item) {
    const valor = item.dataset.valor;
    input.value = valor;
    contenedor.classList.remove('show');
    cargarLicitacionesPorOrganismo(valor);
    return;
  }

  if (!contenedor.contains(event.target) && event.target !== input) {
    contenedor.classList.remove('show');
  }
});

document.getElementById('filtroOrganismo')?.addEventListener('focus', () => {
  const input = document.getElementById('filtroOrganismo');
  if (!input) return;
  actualizarSugerencias(input.value || '');
});

document.getElementById('filtroOrganismo')?.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  const input = event.currentTarget;
  const valor = (input?.value || '').trim();
  if (valor) {
    cargarLicitacionesPorOrganismo(valor);
  }
});

function cargarLicitacionesPorOrganismo(organismo) {
  if (!organismo) return;
  const url = `api/organismosPub.php?organismo=${encodeURIComponent(organismo)}`;
  fetch(url)
    .then(async (res) => {
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        const texto = await res.text();
        throw new Error(texto || `HTTP ${res.status}`);
      }
      return res.json();
    })
    .then(({ licitaciones, proveedores, filtros }) => {
      datos = (licitaciones || []).filter(item => item.codigo);
      console.log(`✅ ${datos.length} licitaciones cargadas para ${organismo}`);
      console.log(`✅ ${proveedores.length} proveedores obtenidos`);
      console.log('Proveedores desde PHP:', proveedores);
      
      if (datos.length > 0) {
        // Mostrar KPIs
        const kpiCards = document.getElementById('kpiCards');
        if (kpiCards) kpiCards.style.display = 'flex';
        
        // Mostrar buscador y botón limpiar
        const filaBuscador = document.getElementById('filaBuscador');
        if (filaBuscador) filaBuscador.style.display = 'flex';
        
        // Mostrar botones de ordenamiento
        const botonesOrdenamiento = document.getElementById('botonesOrdenamiento');
        if (botonesOrdenamiento) botonesOrdenamiento.style.display = 'flex';
        
        // Mostrar gráficos
        const filaGraficos = document.getElementById('filaGraficos');
        if (filaGraficos) filaGraficos.style.display = 'flex';
        const filaGraficosAnuales = document.getElementById('filaGraficosAnuales');
        if (filaGraficosAnuales) filaGraficosAnuales.style.display = 'flex';
        
        // Generar gráficos
        generarGraficos();
        
        // Generar tabla de proveedores y gráfico de categorías
        generarProveedoresYCategorias(proveedores);
      }
      
      renderizarFiltros();
      ordenarDatos();
      filtrarDatos();
    })
    .catch(err => {
      console.error('❌ Error al cargar licitaciones por organismo:', err);
    });
}

function ordenarTabla(columna) {
  if (columnaOrdenada === columna) {
    ordenAscendente = !ordenAscendente;
  } else {
    columnaOrdenada = columna;
    ordenAscendente = true;
  }
  ordenarDatos();
  actualizarIconosOrdenamiento();
  filtrarDatos(false);
}

function ordenarDatos() {
  datos.sort((a, b) => {
    let valA, valB;
    
    if (columnaOrdenada.includes('fecha')) {
      valA = new Date(a[columnaOrdenada]);
      valB = new Date(b[columnaOrdenada]);
    } else if (columnaOrdenada === 'monto') {
      // Si es adjudicada, usar monto_adjudicado_total; si no, monto_estimado
      const esAdjudicadaA = normalizarTexto(a.estado) === 'adjudicada';
      const esAdjudicadaB = normalizarTexto(b.estado) === 'adjudicada';
      valA = parseFloat(esAdjudicadaA ? a.monto_adjudicado_total : a.monto_estimado) || 0;
      valB = parseFloat(esAdjudicadaB ? b.monto_adjudicado_total : b.monto_estimado) || 0;
    } else {
      valA = (a[columnaOrdenada] || '').toLowerCase();
      valB = (b[columnaOrdenada] || '').toLowerCase();
    }
    
    return ordenAscendente ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
  });
}

function actualizarIconosOrdenamiento() {
  const iconoFecha = document.getElementById('iconoFecha');
  const iconoMonto = document.getElementById('iconoMonto');
  
  if (iconoFecha) iconoFecha.textContent = '';
  if (iconoMonto) iconoMonto.textContent = '';
  
  if (columnaOrdenada === 'fecha_inicio' && iconoFecha) {
    iconoFecha.textContent = ordenAscendente ? '↑' : '↓';
  } else if (columnaOrdenada === 'monto' && iconoMonto) {
    iconoMonto.textContent = ordenAscendente ? '↑' : '↓';
  }
}

// Gráficos
let graficoLicitacionesChart = null;
let graficoMontosChart = null;
let graficoLicitacionesAnioChart = null;
let graficoMontosAnioChart = null;

function procesarDatosPorMes() {
  return procesarDatosUltimos12Meses(datos);
}

function procesarDatosUltimos12Meses(lista = datos) {
  const datosPorMes = {};
  const montosPorMes = {};

  const hoy = new Date();
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 11, 1);

  for (let i = 0; i < 12; i++) {
    const d = new Date(inicio.getFullYear(), inicio.getMonth() + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    datosPorMes[key] = 0;
    montosPorMes[key] = 0;
  }

  (Array.isArray(lista) ? lista : []).forEach(item => {
    const fecha = new Date(item.fecha_inicio || item.fecha_publicacion || item.fecha_final);
    if (isNaN(fecha.getTime())) return;
    const key = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
    if (!(key in datosPorMes)) return;

    datosPorMes[key] += 1;
    if (normalizarTexto(item.estado) === 'adjudicada') {
      montosPorMes[key] += Number(item.monto_adjudicado_total) || 0;
    }
  });

  return { datosPorMes, montosPorMes };
}

function procesarDatosPorAnio(lista = datos) {
  const datosPorAnio = {};
  const montosPorAnio = {};

  (Array.isArray(lista) ? lista : []).forEach(item => {
    const anio = obtenerAnio(item);
    if (!anio) return;

    if (!datosPorAnio[anio]) {
      datosPorAnio[anio] = 0;
      montosPorAnio[anio] = 0;
    }

    datosPorAnio[anio] += 1;

    if (normalizarTexto(item.estado) === 'adjudicada') {
      montosPorAnio[anio] += Number(item.monto_adjudicado_total) || 0;
    }
  });

  return { datosPorAnio, montosPorAnio };
}

function generarGraficos(lista = datos) {
  const { datosPorMes, montosPorMes } = procesarDatosUltimos12Meses(lista);
  const meses = Object.keys(datosPorMes).sort();

  const { datosPorAnio, montosPorAnio } = procesarDatosPorAnio(lista);
  const anios = Object.keys(datosPorAnio)
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  
  const ctxLicitaciones = document.getElementById('graficoLicitacionesPorMes');
  const ctxMontos = document.getElementById('graficoMontosAdjudicados');
  const ctxLicitacionesAnio = document.getElementById('graficoLicitacionesPorAnio');
  const ctxMontosAnio = document.getElementById('graficoMontosPorAnio');

  if (meses.length === 0 && anios.length === 0) {
    if (graficoLicitacionesChart) {
      graficoLicitacionesChart.destroy();
      graficoLicitacionesChart = null;
    }
    if (graficoMontosChart) {
      graficoMontosChart.destroy();
      graficoMontosChart = null;
    }
    if (graficoLicitacionesAnioChart) {
      graficoLicitacionesAnioChart.destroy();
      graficoLicitacionesAnioChart = null;
    }
    if (graficoMontosAnioChart) {
      graficoMontosAnioChart.destroy();
      graficoMontosAnioChart = null;
    }
    return;
  }

  const etiquetasMeses = meses.map(mes => {
    const [anio, mesNum] = mes.split('-');
    const fecha = new Date(Number(anio), Number(mesNum) - 1, 1);
    return fecha.toLocaleDateString('es-CL', { month: 'short', year: 'numeric' });
  });
  const cantidadesMes = meses.map(mes => datosPorMes[mes] || 0);
  const montosMes = meses.map(mes => montosPorMes[mes] || 0);

  const etiquetasAnios = anios.map(String);
  const cantidadesAnio = anios.map(anio => datosPorAnio[anio] || 0);
  const montosAnio = anios.map(anio => montosPorAnio[anio] || 0);
  
  if (ctxLicitaciones) {
    if (graficoLicitacionesChart) graficoLicitacionesChart.destroy();
    graficoLicitacionesChart = new Chart(ctxLicitaciones, {
      type: 'bar',
      data: {
        labels: etiquetasMeses,
        datasets: [{
          label: 'Cantidad de licitaciones',
          data: cantidadesMes,
          backgroundColor: 'rgba(54, 162, 235, 0.7)',
          borderColor: 'rgb(54, 162, 235)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });
  }
  
  if (ctxMontos) {
    if (graficoMontosChart) graficoMontosChart.destroy();
    graficoMontosChart = new Chart(ctxMontos, {
      type: 'bar',
      data: {
        labels: etiquetasMeses,
        datasets: [{
          label: 'Monto adjudicado (CLP)',
          data: montosMes,
          backgroundColor: 'rgba(75, 192, 75, 0.7)',
          borderColor: 'rgb(75, 192, 75)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { callback: (value) => '$' + value.toLocaleString('es-CL') } } }
      }
    });
  }

  if (ctxLicitacionesAnio) {
    if (graficoLicitacionesAnioChart) graficoLicitacionesAnioChart.destroy();
    graficoLicitacionesAnioChart = new Chart(ctxLicitacionesAnio, {
      type: 'bar',
      data: {
        labels: etiquetasAnios,
        datasets: [{
          label: 'Cantidad de licitaciones',
          data: cantidadesAnio,
          backgroundColor: 'rgba(54, 162, 235, 0.7)',
          borderColor: 'rgb(54, 162, 235)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });
  }

  if (ctxMontosAnio) {
    if (graficoMontosAnioChart) graficoMontosAnioChart.destroy();
    graficoMontosAnioChart = new Chart(ctxMontosAnio, {
      type: 'bar',
      data: {
        labels: etiquetasAnios,
        datasets: [{
          label: 'Monto adjudicado (CLP)',
          data: montosAnio,
          backgroundColor: 'rgba(75, 192, 75, 0.7)',
          borderColor: 'rgb(75, 192, 75)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { callback: (value) => '$' + value.toLocaleString('es-CL') } } }
      }
    });
  }
}

let graficoCategoriasChart = null;

function procesarProveedoresYCategorias() {
  const proveedores = {};
  const categorias = {};
  
  // Log COMPLETO de la primera licitación ADJUDICADA
  const licAdjudicadas = datos.filter(item => normalizarTexto(item.estado) === 'adjudicada');
  
  if (licAdjudicadas.length > 0) {
    const primera = licAdjudicadas[0];
    console.log('=== PRIMERA LICITACIÓN ADJUDICADA - OBJETO COMPLETO ===');
    console.log(JSON.stringify(primera, null, 2));
    console.log('=== FIN ===\n');
  }
  
  // Aquí irá la lógica de procesamiento
  const proveedoresFinales = {};
  
  return { proveedores: proveedoresFinales, categorias };
}


function generarTablaProveedores(proveedores) {
  // Convertir a array y ordenar por monto descendente
  const arrayProveedores = Object.entries(proveedores)
    .map(([nombre, datos]) => ({ nombre, ...datos }))
    .sort((a, b) => b.monto - a.monto)
    .slice(0, 20); // Top 20
  
  const tbody = document.getElementById('cuerpoTablaProveedores');
  if (!tbody) {
    console.error('❌ No se encontró elemento cuerpoTablaProveedores');
    return;
  }
  
  tbody.innerHTML = arrayProveedores
    .map((proveedor, idx) => {
      return `
      <tr title="${proveedor.nombre}">
        <td style="max-width: 400px; word-wrap: break-word;">${proveedor.nombre}</td>
        <td class="text-end">${proveedor.cantidad}</td>
        <td class="text-end">$${proveedor.monto.toLocaleString('es-CL')}</td>
      </tr>
    `;
    })
    .join('');
  
  console.log('✅ Tabla Top 20 generada');
}

function generarGraficoCategoria(categorias) {
  const ctxCategorias = document.getElementById('graficoCategorias');
  if (!ctxCategorias) return;
  
  // Ordenar categorías por cantidad descendente
  const categoriasOrdenadas = Object.entries(categorias)
    .sort((a, b) => b[1] - a[1])
    .reduce((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});
  
  const etiquetas = Object.keys(categoriasOrdenadas);
  const datos = Object.values(categoriasOrdenadas);
  const colores = [
    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
    '#FF9F40', '#FF6384', '#C9CBCF', '#4BC0C0', '#FF6384'
  ];
  
  if (graficoCategoriasChart) graficoCategoriasChart.destroy();
  graficoCategoriasChart = new Chart(ctxCategorias, {
    type: 'doughnut',
    data: {
      labels: etiquetas,
      datasets: [{
        data: datos,
        backgroundColor: colores.slice(0, etiquetas.length),
        borderColor: '#fff',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'right' },
        tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.parsed} licitaciones` } }
      }
    }
  });
}

function generarProveedoresYCategorias(proveedoresData) {
  console.log('=== PROCESANDO PROVEEDORES Y CATEGORÍAS ===');
  console.log('Total registros:', proveedoresData ? proveedoresData.length : 0);
  
  const proveedores = {};
  const categorias = {};
  const licitacionesPorProveedor = {};
  
  if (proveedoresData && Array.isArray(proveedoresData)) {
    proveedoresData.forEach(row => {
      const nombreProveedor = row.nombre_proveedor.trim();
      const monto = parseFloat(row.monto_unitario) * parseFloat(row.cantidad_adjudicada);
      // Obtener el primer nivel de categoría
      const categoriaCompleta = (row.categoria || 'Sin especificar').trim();
      const partes = categoriaCompleta.split('/');
      const categoria = partes[0].trim(); // Usar solo el primero
      const codigo = row.codigo_externo;
      
      // Agrupar proveedores
      if (!proveedores[nombreProveedor]) {
        proveedores[nombreProveedor] = {
          monto: 0,
          licitaciones: new Set()
        };
      }
      proveedores[nombreProveedor].monto += monto;
      proveedores[nombreProveedor].licitaciones.add(codigo);
      
      // Contar categorías
      if (!categorias[categoria]) {
        categorias[categoria] = 0;
      }
      categorias[categoria]++;
    });
  }
  
  // Convertir a formato final: nombre_proveedor -> {cantidad: licitaciones únicas, monto: total}
  const proveedoresFinales = {};
  Object.entries(proveedores).forEach(([nombre, datos]) => {
    proveedoresFinales[nombre] = {
      cantidad: datos.licitaciones.size,
      monto: datos.monto
    };
  });
  
  console.log(`✅ Proveedores procesados: ${Object.keys(proveedoresFinales).length}`);
  console.log(`✅ Categorías encontradas: ${Object.keys(categorias).length}`);
  console.log('Proveedores:', proveedoresFinales);
  console.log('Categorías:', categorias);
  
  if (Object.keys(proveedoresFinales).length > 0) {
    generarTablaProveedores(proveedoresFinales);
    generarGraficoCategoria(categorias);
    
    const filaProveedoresCategories = document.getElementById('filaProveedoresCategories');
    if (filaProveedoresCategories) filaProveedoresCategories.style.display = 'flex';
  }
}

function actualizarKpis(datosFiltrados = datos) {
  const kpiContainer = document.getElementById('kpiCards');
  if (!kpiContainer) return;

  const lista = Array.isArray(datosFiltrados) ? datosFiltrados : [];
  const totalPublicadas = lista.filter(item => normalizarTexto(item.estado) === 'publicada').length;
  const totalCerradas = lista.filter(item => normalizarTexto(item.estado) === 'cerrada').length;
  const totalAdjudicadas = lista.filter(item => normalizarTexto(item.estado) === 'adjudicada').length;

  const montoAdjudicado = lista.reduce((acc, item) => {
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

function parsearFechaFiltro(valor) {
  if (!valor) return null;
  const raw = String(valor).trim();
  if (!raw) return null;

  const normalizada = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const fecha = new Date(normalizada);
  if (Number.isNaN(fecha.getTime())) return null;
  return fecha;
}

function obtenerAnio(item) {
  const date = parsearFechaFiltro(item.fecha_inicio || item.fecha_publicacion || item.fecha_final);
  if (!date) return null;
  return date.getFullYear();
}

function formatearMoneda(valor, opciones = {}) {
  const numero = Number(valor);
  if (isNaN(numero)) return opciones.fallback || 'No informado';
  if (numero === 0) return opciones.zeroAsNoInfo ? 'No informado' : '$0';
  return `$${Math.round(numero).toLocaleString('es-CL')}`;
}

function formatearFecha(valor) {
  const date = parsearFechaFiltro(valor);
  if (!date) return 'Sin fecha';
  return date.toLocaleDateString();
}

function escaparCsv(valor) {
  const texto = (valor ?? '').toString().replace(/\r?\n/g, ' ');
  if (/[";\n]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

function obtenerNombreArchivoCsv() {
  const filtro = (document.getElementById('filtroOrganismo')?.value || '').trim();
  const base = filtro ? `organismos_${filtro}` : 'organismos';
  const safe = base.replace(/[^a-zA-Z0-9-_]+/g, '_');
  const fecha = new Date().toISOString().slice(0, 10);
  return `${safe}_${fecha}.csv`;
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

function descargarCsv() {
  const filas = Array.isArray(datosFiltradosActuales) ? datosFiltradosActuales : [];
  if (filas.length === 0) {
    alert('No hay datos para exportar.');
    return;
  }

  const headers = [
    'ID',
    'Nombre',
    'Descripción',
    'Institución',
    'Monto',
    'Fecha y Hora Publicación',
    'Fecha y Hora Cierre',
    'Tipo de licitación',
    'Estado',
    'Fecha de adjudicación',
    'Proveedor adjudicado'
  ];

  const lines = filas.map(item => {
    return [
      item.codigo || '',
      item.nombre || '',
      item.descripcion || '',
      item.institucion_nombre || '',
      formatearMontoCsv(item),
      item.fecha_inicio || '',
      item.fecha_final || '',
      item.tipo || '',
      item.estado || '',
      item.fecha_adjudicacion || '',
      item.proveedores_adjudicados || ''
    ].map(escaparCsv).join(';');
  });

  const contenido = ['\uFEFF' + headers.map(escaparCsv).join(';'), ...lines].join('\n');
  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = obtenerNombreArchivoCsv();
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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
  if (document.getElementById('filtroPeriodo')) document.getElementById('filtroPeriodo').value = '';
  if (document.getElementById('filtroEstado')) document.getElementById('filtroEstado').value = 'todos';
  if (document.getElementById('filtroTipo')) document.getElementById('filtroTipo').value = 'todos';
  textoFiltro = '';
  const contenedor = document.getElementById('organismosSugerencias');
  if (contenedor) contenedor.classList.remove('show');
  filtrarDatos();
}

// Event listeners para el dropdown de organismos
document.addEventListener('DOMContentLoaded', () => {
  const inputOrganismo = document.getElementById('filtroOrganismo');
  const contenedorSugerencias = document.getElementById('organismosSugerencias');
  
  if (inputOrganismo) {
    // Actualizar sugerencias al escribir
    inputOrganismo.addEventListener('input', (e) => {
      actualizarSugerencias(e.target.value);
    });
    
    // Mostrar sugerencias al hacer foco
    inputOrganismo.addEventListener('focus', (e) => {
      actualizarSugerencias(e.target.value);
    });
    
    // Cargar licitaciones al presionar Enter
    inputOrganismo.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const valor = e.target.value.trim();
        if (valor) {
          cargarLicitacionesPorOrganismo(valor);
          if (contenedorSugerencias) contenedorSugerencias.classList.remove('show');
        }
      }
    });
  }
  
  // Cerrar dropdown al hacer clic fuera
  document.addEventListener('click', (e) => {
    if (contenedorSugerencias && !e.target.closest('.dropdown')) {
      contenedorSugerencias.classList.remove('show');
    }
  });
});