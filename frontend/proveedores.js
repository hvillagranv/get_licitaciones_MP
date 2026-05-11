console.log("🔄 Versión activa de script de proveedores");

let datos = [];
let columnaOrdenada = 'fecha_inicio';
let ordenAscendente = false;
let paginaActual = 1;
const filasPorPagina = 10;
let textoFiltro = '';
let filtroAnio = 'todos';
let filtroTipo = 'todos';
let datosFiltradosActuales = [];

// Listas estáticas de filtros
const aniosDisponibles = [2026,2025,2024,2023,2022,2021,2020,2019,2018,2017,2016,2015,2014,2013,2012,2011,2010,2009,2008,2007,2006,2005,2004];
const tiposDisponibles = ["B2","CO","DC","E2","H2","I2","L1","LE","LP","LQ","LR","LS","O1","O2","SE"];

// Proveedores cargados desde CSV
let proveedoresDisponibles = [];

// Cargar proveedores desde CSV
async function cargarProveedoresDisponibles() {
  return new Promise((resolve) => {
    if (typeof Papa === 'undefined') {
      console.error('❌ PapaParse no está disponible para cargar proveedores desde CSV.');
      resolve();
      return;
    }

    Papa.parse('data/csv/proveedores.csv', {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const filas = Array.isArray(results.data) ? results.data : [];
        const proveedores = filas
          .map(row => (row.nombre_proveedor || '').toString().trim())
          .filter(Boolean);
        proveedoresDisponibles = Array.from(new Set(proveedores))
          .sort((a, b) => a.localeCompare(b, 'es'));
        console.log(`✅ ${proveedoresDisponibles.length} proveedores cargados desde CSV`);
        resolve();
      },
      error: (error) => {
        console.error('❌ Error al cargar proveedores desde CSV:', error);
        resolve();
      }
    });
  });
}

// Inicializar la interfaz
document.addEventListener('DOMContentLoaded', () => {
  cargarProveedoresDisponibles();
  renderizarFiltros();
  actualizarKpis();
});

// Función para cargar licitaciones de un proveedor específico
function cargarLicitacionesPorProveedor(proveedor) {
  if (!proveedor || !proveedor.trim()) return;
  
  console.log(`🔍 Cargando licitaciones para: ${proveedor}`);
  
  fetch(`api/proveedoresPub.php?proveedor=${encodeURIComponent(proveedor)}`)
    .then(async (res) => {
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        const texto = await res.text();
        throw new Error(texto || `HTTP ${res.status}`);
      }
      return res.json();
    })
    .then(({ licitaciones, organismos, rut_proveedor, nombre_proveedor }) => {
      datos = (licitaciones || []).filter(item => item.codigo);
      console.log(`✅ ${datos.length} licitaciones cargadas`);
      console.log(`✅ ${organismos.length} organismos obtenidos`);
      
      // Actualizar título con nombre y RUT del proveedor
      const titulo = document.querySelector('h2');
      if (titulo && nombre_proveedor) {
        const rutTexto = rut_proveedor ? ` (RUT: ${rut_proveedor})` : '';
        titulo.textContent = `Análisis de Proveedores Adjudicados - ${nombre_proveedor}${rutTexto}`;
      }
      
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
        
        // Generar tabla de organismos y gráfico de categorías
        generarOrganismosYCategorias(organismos);
      }
      
      renderizarFiltros();
      ordenarDatos();
      filtrarDatos();
    })
    .catch(err => {
      console.error('❌ Error al cargar licitaciones por proveedor:', err);
    });
}

function renderizarFiltros() {
  const selectAnio = document.getElementById('filtroAnio');
  const selectTipo = document.getElementById('filtroTipo');

  if (selectAnio) {
    selectAnio.innerHTML = '<option value="todos">Todos</option>';
    aniosDisponibles.forEach(anio => {
      selectAnio.innerHTML += `<option value="${anio}">${anio}</option>`;
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
  const textoProveedor = (document.getElementById('filtroProveedor')?.value || '').toLowerCase().trim();
  filtroAnio = document.getElementById('filtroAnio')?.value || 'todos';
  const filtroPeriodo = document.getElementById('filtroPeriodo')?.value || '';
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

  actualizarSugerencias(textoProveedor);

  const datosFiltrados = datos.filter(item => {
    const textoBase = (
      `${item.codigo} ${item.institucion_nombre} ${item.nombre || ''} ${item.descripcion || ''}`
    ).toLowerCase();

    const coincideTexto = !textoFiltro || textoBase.includes(textoFiltro);
    const proveedoresTexto = (item.proveedores_adjudicados || '').toLowerCase();
    const coincideProveedor = !textoProveedor || proveedoresTexto.includes(textoProveedor);

    const anioItem = obtenerAnio(item);
    const coincideAnio = filtroAnio === 'todos' || String(anioItem) === String(filtroAnio);

    const coincideTipo = filtroTipo === 'todos' || (item.tipo || '') === filtroTipo;

    const coincidePeriodo = (() => {
      if (!tienePeriodo) return true;
      const fechaPub = parsearFechaFiltro(item.fecha_inicio || item.fecha_publicacion || item.fecha_final);
      if (!fechaPub) return false;
      if (filtroPeriodo === 'gt5y') return fechaPub < limite;
      return fechaPub >= limite;
    })();

    return coincideTexto && coincideProveedor && coincideAnio && coincideTipo && coincidePeriodo;
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

function actualizarSugerencias(textoProveedor) {
  const contenedor = document.getElementById('proveedoresSugerencias');
  const input = document.getElementById('filtroProveedor');
  if (!contenedor || !input) return;

  const textoNormalizado = normalizarTexto(textoProveedor);
  const sugerencias = proveedoresDisponibles
    .filter((proveedor) => {
      if (!textoNormalizado) return true;
      return normalizarTexto(proveedor).includes(textoNormalizado);
    })
    .slice(0, 10);

  if (sugerencias.length === 0) {
    contenedor.classList.remove('show');
    contenedor.innerHTML = '';
    return;
  }

  contenedor.innerHTML = sugerencias
    .map((proveedor) => `<div class="proveedor-dropdown-item" data-valor="${proveedor}">${proveedor}</div>`)
    .join('');
  contenedor.classList.add('show');
}

document.addEventListener('click', (event) => {
  const contenedor = document.getElementById('proveedoresSugerencias');
  const input = document.getElementById('filtroProveedor');
  if (!contenedor || !input) return;

  const item = event.target.closest('.proveedor-dropdown-item');
  if (item) {
    const valor = item.dataset.valor;
    input.value = valor;
    contenedor.classList.remove('show');
    cargarLicitacionesPorProveedor(valor);
    return;
  }

  if (!contenedor.contains(event.target) && event.target !== input) {
    contenedor.classList.remove('show');
  }
});

document.getElementById('filtroProveedor')?.addEventListener('focus', () => {
  const input = document.getElementById('filtroProveedor');
  if (!input) return;
  actualizarSugerencias(input.value || '');
});

document.getElementById('filtroProveedor')?.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  const input = event.currentTarget;
  const valor = (input?.value || '').trim();
  if (valor) {
    cargarLicitacionesPorProveedor(valor);
  }
});

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

function generarTablaOrganismos(organismos) {
  // Convertir a array y ordenar por monto descendente
  const arrayOrganismos = Object.entries(organismos)
    .map(([nombre, datos]) => ({ nombre, ...datos }))
    .sort((a, b) => b.monto - a.monto)
    .slice(0, 15); // Top 15
  
  const tbody = document.getElementById('cuerpoTablaOrganismos');
  if (!tbody) {
    console.error('❌ No se encontró elemento cuerpoTablaOrganismos');
    return;
  }
  
  tbody.innerHTML = arrayOrganismos
    .map((organismo, idx) => {
      return `
      <tr title="${organismo.nombre}">
        <td style="max-width: 400px; word-wrap: break-word;">${organismo.nombre}</td>
        <td class="text-end">${organismo.cantidad}</td>
        <td class="text-end">$${organismo.monto.toLocaleString('es-CL')}</td>
      </tr>
    `;
    })
    .join('');
  
  console.log('✅ Tabla Top 15 organismos generada');
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

function generarOrganismosYCategorias(organismoData) {
  console.log('=== PROCESANDO ORGANISMOS Y CATEGORÍAS ===');
  console.log('Total registros:', organismoData ? organismoData.length : 0);
  
  const organismos = {};
  const categorias = {};
  const licitacionesPorOrganismo = {};
  
  if (organismoData && Array.isArray(organismoData)) {
    organismoData.forEach(row => {
      const nombreOrganismo = row.nombre_organismo.trim();
      const monto = parseFloat(row.monto_unitario) * parseFloat(row.cantidad_adjudicada);
      const categoriaCompleta = (row.categoria || 'Sin especificar').trim();
      const partes = categoriaCompleta.split('/');
      const categoria = partes[0].trim();
      const codigo = row.codigo_externo;
      
      // Agrupar organismos
      if (!organismos[nombreOrganismo]) {
        organismos[nombreOrganismo] = {
          monto: 0,
          licitaciones: new Set()
        };
      }
      organismos[nombreOrganismo].monto += monto;
      organismos[nombreOrganismo].licitaciones.add(codigo);
      
      // Contar categorías
      if (!categorias[categoria]) {
        categorias[categoria] = 0;
      }
      categorias[categoria]++;
    });
  }
  
  // Convertir a formato final
  const organismosFinal = {};
  Object.entries(organismos).forEach(([nombre, datos]) => {
    organismosFinal[nombre] = {
      cantidad: datos.licitaciones.size,
      monto: datos.monto
    };
  });
  
  console.log(`✅ Organismos procesados: ${Object.keys(organismosFinal).length}`);
  console.log(`✅ Categorías encontradas: ${Object.keys(categorias).length}`);
  
  if (Object.keys(organismosFinal).length > 0) {
    generarTablaOrganismos(organismosFinal);
    generarGraficoCategoria(categorias);
    
    const filaOrganismosCategories = document.getElementById('filaOrganismosCategories');
    if (filaOrganismosCategories) filaOrganismosCategories.style.display = 'flex';
  }
}

function actualizarKpis(datosFiltrados = datos) {
  const kpiContainer = document.getElementById('kpiCards');
  if (!kpiContainer) return;

  const lista = Array.isArray(datosFiltrados) ? datosFiltrados : [];
  const totalAdjudicadas = lista.filter(item => normalizarTexto(item.estado) === 'adjudicada').length;
  const totalCerradas = lista.filter(item => normalizarTexto(item.estado) === 'cerrada').length;
  const totalPublicadas = lista.filter(item => normalizarTexto(item.estado) === 'publicada').length;

  const montoAdjudicado = lista.reduce((acc, item) => {
    if (normalizarTexto(item.estado) !== 'adjudicada') return acc;
    const valor = Number(item.monto_adjudicado_total);
    return acc + (isNaN(valor) ? 0 : valor);
  }, 0);

  kpiContainer.innerHTML = `
    <div class="col-md-3">
      <div class="p-3 kpi-card bg-white shadow-sm">
        <div class="kpi-label">Adjudicadas</div>
        <div class="kpi-value">${totalAdjudicadas.toLocaleString('es-CL')}</div>
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
        <div class="kpi-label">Publicadas</div>
        <div class="kpi-value">${totalPublicadas.toLocaleString('es-CL')}</div>
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
  const filtro = (document.getElementById('filtroProveedor')?.value || '').trim();
  const base = filtro ? `proveedores_${filtro}` : 'proveedores';
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
  const filtroProveedor = document.getElementById('filtroProveedor');
  if (filtroProveedor) filtroProveedor.value = '';
  if (document.getElementById('filtroAnio')) document.getElementById('filtroAnio').value = 'todos';
  if (document.getElementById('filtroPeriodo')) document.getElementById('filtroPeriodo').value = '';
  if (document.getElementById('filtroTipo')) document.getElementById('filtroTipo').value = 'todos';
  textoFiltro = '';
  const contenedor = document.getElementById('proveedoresSugerencias');
  if (contenedor) contenedor.classList.remove('show');
  filtrarDatos();
}

// Event listeners para el dropdown de proveedores
document.addEventListener('DOMContentLoaded', () => {
  const inputProveedor = document.getElementById('filtroProveedor');
  const contenedorSugerencias = document.getElementById('proveedoresSugerencias');
  
  if (inputProveedor) {
    // Actualizar sugerencias al escribir
    inputProveedor.addEventListener('input', (e) => {
      actualizarSugerencias(e.target.value);
    });
    
    // Mostrar sugerencias al hacer foco
    inputProveedor.addEventListener('focus', (e) => {
      actualizarSugerencias(e.target.value);
    });
    
    // Cargar licitaciones al presionar Enter
    inputProveedor.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const valor = e.target.value.trim();
        if (valor) {
          cargarLicitacionesPorProveedor(valor);
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
