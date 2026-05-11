// frontend/admin_catalogos.js
// Gestión de palabras clave e instituciones (solo admin)

let pcDatos = [];
let instDatos = [];
let _bindsDone = false; // evitar registrar listeners duplicados en auth:changed

document.addEventListener('auth:changed', (e) => {
  const sinSesion = document.getElementById('sinSesion');
  const contenido = document.getElementById('contenidoCatalogos');
  if (!e.detail.loggedIn || !e.detail.isAdmin) {
    sinSesion?.classList.remove('d-none');
    contenido?.classList.add('d-none');
    _bindsDone = false; // resetear si se cierra sesión
    return;
  }
  sinSesion?.classList.add('d-none');
  contenido?.classList.remove('d-none');
  cargarPC();
  cargarInst();
  if (!_bindsDone) {
    _bindsDone = true;
    bindFormPC();
    bindFormInst();
    bindImportExport();
  }
});

// -------------------------------------------------------
// Auth helpers
// -------------------------------------------------------
function getCsrf() {
  return window.AuthState?.csrfToken || '';
}

// -------------------------------------------------------
// Utilidades UI
// -------------------------------------------------------
function mostrarAlerta(idContenedor, tipo, mensaje) {
  const el = document.getElementById(idContenedor);
  if (!el) return;
  el.innerHTML = `<div class="alert alert-${tipo} alert-dismissible py-1 px-2 small mb-2" role="alert">
    ${escHTML(mensaje)}
    <button type="button" class="btn-close btn-close-sm" data-bs-dismiss="alert"></button>
  </div>`;
}

function escHTML(str) {
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// -------------------------------------------------------
// Palabras Clave
// -------------------------------------------------------
async function cargarPC() {
  try {
    const res = await fetch('api/catalogosAdmin.php?catalogo=palabras_clave', { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    pcDatos = json.data || [];
    renderTablaPC(pcDatos);
    if (json.warning) mostrarAlerta('alertaPC', 'warning', json.warning);
  } catch (err) {
    mostrarAlerta('alertaPC', 'danger', 'Error al cargar palabras clave: ' + err.message);
  }
}

function renderTablaPC(filas) {
  const tbody = document.getElementById('tablaPC');
  if (!tbody) return;
  const filtro = (document.getElementById('buscarPC')?.value || '').toLowerCase();
  const visibles = filtro
    ? filas.filter(r => r.palabra.toLowerCase().includes(filtro))
    : filas;
  tbody.innerHTML = '';
  for (const r of visibles) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="fw-semibold">${escHTML(r.palabra)}</td>
      <td class="text-muted small">${escHTML((r.variantes || []).join(', '))}</td>
      <td>${r.activo ? '<span class="badge bg-success">Sí</span>' : '<span class="badge bg-secondary">No</span>'}</td>
      <td class="text-end text-nowrap">
        <button class="btn btn-outline-primary btn-sm py-0 px-1 me-1" data-edit-pc="${r.id}" title="Editar">
          <i class="bi bi-pencil"></i>
        </button>
        <button class="btn btn-outline-danger btn-sm py-0 px-1" data-del-pc="${r.id}" title="Eliminar">
          <i class="bi bi-trash"></i>
        </button>
      </td>`;
    tbody.appendChild(tr);
  }
  // Eventos fila
  tbody.querySelectorAll('[data-edit-pc]').forEach(btn => {
    btn.addEventListener('click', () => editarPC(parseInt(btn.dataset.editPc)));
  });
  tbody.querySelectorAll('[data-del-pc]').forEach(btn => {
    btn.addEventListener('click', () => eliminarPC(parseInt(btn.dataset.delPc)));
  });
}

function editarPC(id) {
  const r = pcDatos.find(x => x.id === id);
  if (!r) return;
  document.getElementById('pcId').value = r.id;
  document.getElementById('pcPalabra').value = r.palabra;
  document.getElementById('pcVariantes').value = (r.variantes || []).join('\n');
  document.getElementById('tituloFormPC').textContent = 'Editar palabra clave';
  document.getElementById('btnGuardarPC').innerHTML = '<i class="bi bi-save"></i> Actualizar';
  document.getElementById('btnCancelarPC').classList.remove('d-none');
}

function resetFormPC() {
  document.getElementById('pcId').value = '';
  document.getElementById('pcPalabra').value = '';
  document.getElementById('pcVariantes').value = '';
  document.getElementById('tituloFormPC').textContent = 'Agregar palabra clave';
  document.getElementById('btnGuardarPC').innerHTML = '<i class="bi bi-plus-circle"></i> Guardar';
  document.getElementById('btnCancelarPC').classList.add('d-none');
}

function bindFormPC() {
  document.getElementById('formPC')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('pcId').value;
    const palabra = document.getElementById('pcPalabra').value.trim();
    const variantes = document.getElementById('pcVariantes').value
      .split('\n').map(v => v.trim()).filter(Boolean);
    const body = { palabra, variantes };
    try {
      const url = id
        ? `api/catalogosAdmin.php?catalogo=palabras_clave&id=${id}`
        : 'api/catalogosAdmin.php?catalogo=palabras_clave';
      const res = await fetch(url, {
        method: id ? 'PUT' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrf() },
        body: JSON.stringify(body)
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      mostrarAlerta('alertaPC', 'success', id ? 'Actualizada.' : 'Agregada.');
      resetFormPC();
      cargarPC();
    } catch (err) {
      mostrarAlerta('alertaPC', 'danger', err.message);
    }
  });
  document.getElementById('btnCancelarPC')?.addEventListener('click', resetFormPC);
  document.getElementById('buscarPC')?.addEventListener('input', () => renderTablaPC(pcDatos));
}

async function eliminarPC(id) {
  if (!confirm('¿Eliminar esta palabra clave?')) return;
  try {
    const res = await fetch(`api/catalogosAdmin.php?catalogo=palabras_clave&id=${id}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'X-CSRF-Token': getCsrf() }
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    mostrarAlerta('alertaPC', 'success', 'Eliminada.');
    cargarPC();
  } catch (err) {
    mostrarAlerta('alertaPC', 'danger', err.message);
  }
}

// -------------------------------------------------------
// Instituciones
// -------------------------------------------------------
async function cargarInst() {
  try {
    const res = await fetch('api/catalogosAdmin.php?catalogo=instituciones', { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    instDatos = json.data || [];
    renderTablaInst(instDatos);
    if (json.warning) mostrarAlerta('alertaInst', 'warning', json.warning);
  } catch (err) {
    mostrarAlerta('alertaInst', 'danger', 'Error al cargar instituciones: ' + err.message);
  }
}

function renderTablaInst(filas) {
  const tbody = document.getElementById('tablaInst');
  if (!tbody) return;
  const filtro = (document.getElementById('buscarInst')?.value || '').toLowerCase();
  const visibles = filtro
    ? filas.filter(r => r.alias.toLowerCase().includes(filtro) || r.nombre.toLowerCase().includes(filtro))
    : filas;
  tbody.innerHTML = '';
  for (const r of visibles) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="fw-semibold">${escHTML(r.alias)}</td>
      <td class="text-muted small">${escHTML(r.nombre)}</td>
      <td>${r.activo ? '<span class="badge bg-success">Sí</span>' : '<span class="badge bg-secondary">No</span>'}</td>
      <td class="text-end text-nowrap">
        <button class="btn btn-outline-primary btn-sm py-0 px-1 me-1" data-edit-inst="${r.id}" title="Editar">
          <i class="bi bi-pencil"></i>
        </button>
        <button class="btn btn-outline-danger btn-sm py-0 px-1" data-del-inst="${r.id}" title="Eliminar">
          <i class="bi bi-trash"></i>
        </button>
      </td>`;
    tbody.appendChild(tr);
  }
  tbody.querySelectorAll('[data-edit-inst]').forEach(btn => {
    btn.addEventListener('click', () => editarInst(parseInt(btn.dataset.editInst)));
  });
  tbody.querySelectorAll('[data-del-inst]').forEach(btn => {
    btn.addEventListener('click', () => eliminarInst(parseInt(btn.dataset.delInst)));
  });
}

function editarInst(id) {
  const r = instDatos.find(x => x.id === id);
  if (!r) return;
  document.getElementById('instId').value = r.id;
  document.getElementById('instNombre').value = r.nombre;
  document.getElementById('instAlias').value = r.alias;
  document.getElementById('tituloFormInst').textContent = 'Editar institución';
  document.getElementById('btnGuardarInst').innerHTML = '<i class="bi bi-save"></i> Actualizar';
  document.getElementById('btnCancelarInst').classList.remove('d-none');
}

function resetFormInst() {
  document.getElementById('instId').value = '';
  document.getElementById('instNombre').value = '';
  document.getElementById('instAlias').value = '';
  document.getElementById('tituloFormInst').textContent = 'Agregar institución';
  document.getElementById('btnGuardarInst').innerHTML = '<i class="bi bi-plus-circle"></i> Guardar';
  document.getElementById('btnCancelarInst').classList.add('d-none');
}

function bindFormInst() {
  document.getElementById('formInst')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('instId').value;
    const nombre = document.getElementById('instNombre').value.trim();
    const alias  = document.getElementById('instAlias').value.trim();
    try {
      const url = id
        ? `api/catalogosAdmin.php?catalogo=instituciones&id=${id}`
        : 'api/catalogosAdmin.php?catalogo=instituciones';
      const res = await fetch(url, {
        method: id ? 'PUT' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrf() },
        body: JSON.stringify({ nombre, alias })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      mostrarAlerta('alertaInst', 'success', id ? 'Actualizada.' : 'Agregada.');
      resetFormInst();
      cargarInst();
    } catch (err) {
      mostrarAlerta('alertaInst', 'danger', err.message);
    }
  });
  document.getElementById('btnCancelarInst')?.addEventListener('click', resetFormInst);
  document.getElementById('buscarInst')?.addEventListener('input', () => renderTablaInst(instDatos));
}

async function eliminarInst(id) {
  if (!confirm('¿Eliminar esta institución?')) return;
  try {
    const res = await fetch(`api/catalogosAdmin.php?catalogo=instituciones&id=${id}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'X-CSRF-Token': getCsrf() }
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    mostrarAlerta('alertaInst', 'success', 'Eliminada.');
    cargarInst();
  } catch (err) {
    mostrarAlerta('alertaInst', 'danger', err.message);
  }
}

// -------------------------------------------------------
// Import / Export CSV
// -------------------------------------------------------
function bindImportExport() {
  // Palabras clave
  document.getElementById('exportPC')?.addEventListener('click', () => {
    window.location.href = 'api/catalogosAdmin.php?catalogo=palabras_clave&action=export_csv';
  });
  document.getElementById('importPC')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    subirCSV('palabras_clave', file, 'alertaPC', cargarPC);
    e.target.value = '';
  });

  // Instituciones
  document.getElementById('exportInst')?.addEventListener('click', () => {
    window.location.href = 'api/catalogosAdmin.php?catalogo=instituciones&action=export_csv';
  });
  document.getElementById('importInst')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    subirCSV('instituciones', file, 'alertaInst', cargarInst);
    e.target.value = '';
  });
}

async function subirCSV(catalogo, file, alertaId, recargar) {
  const form = new FormData();
  form.append('archivo', file);
  try {
    const res = await fetch(
      `api/catalogosAdmin.php?catalogo=${catalogo}&action=import_csv`,
      { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': getCsrf() }, body: form }
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    const partes = [`Importado: ${json.insertados} nuevos, ${json.actualizados} actualizados`];
    if (json.sin_cambios > 0) partes.push(`${json.sin_cambios} sin cambios`);
    const msg = partes.join(', ') + '.'
      + (json.errores?.length ? ` Errores: ${json.errores.join(' | ')}` : '');
    mostrarAlerta(alertaId, json.errores?.length ? 'warning' : 'success', msg);
    recargar();
  } catch (err) {
    mostrarAlerta(alertaId, 'danger', err.message);
  }
}
