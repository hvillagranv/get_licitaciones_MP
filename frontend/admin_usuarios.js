let usuarios = [];
let auditoria = [];
let proveedoresCatalogo = [];

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizarTexto(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizarRut(value) {
  return String(value ?? '').trim().toUpperCase().replace(/[.\-\s]/g, '');
}

function buscarProveedor(nombre = '', rut = '') {
  const nombreNormalizado = normalizarTexto(nombre);
  const rutNormalizado = normalizarRut(rut);

  if (rutNormalizado) {
    const matchByRut = proveedoresCatalogo.find((proveedor) => normalizarRut(proveedor.rut) === rutNormalizado);
    if (matchByRut) {
      return matchByRut;
    }
  }

  if (!nombreNormalizado) {
    return null;
  }

  return proveedoresCatalogo.find((proveedor) => normalizarTexto(proveedor.nombre) === nombreNormalizado) || null;
}

function renderProveedoresDatalist() {
  const datalist = document.getElementById('proveedoresDatalist');
  if (!datalist) return;

  datalist.innerHTML = proveedoresCatalogo.map((proveedor) => {
    const rut = proveedor.rut ? `RUT: ${proveedor.rut}` : 'Proveedor manual';
    return `<option value="${escapeHtml(proveedor.nombre)}" label="${escapeHtml(rut)}"></option>`;
  }).join('');
}

async function cargarProveedoresCatalogo(query = '') {
  if (!window.AuthState.loggedIn || !window.AuthState.isAdmin) {
    return;
  }

  try {
    const suffix = query ? `&q=${encodeURIComponent(query)}` : '';
    const data = await adminRequest(`providers&limit=500${suffix}`, {}, 'GET');
    const proveedores = data.proveedores || [];
    if (query) {
      const merged = new Map(proveedoresCatalogo.map((proveedor) => [proveedor.id, proveedor]));
      proveedores.forEach((proveedor) => merged.set(proveedor.id, proveedor));
      proveedoresCatalogo = Array.from(merged.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    } else {
      proveedoresCatalogo = proveedores;
    }
    renderProveedoresDatalist();
  } catch (error) {
    setAdminMsg(error.message, 'danger');
  }
}

function sincronizarProveedorInput(nombreInput, rutInput) {
  if (!nombreInput) return null;

  const match = buscarProveedor(nombreInput.value, rutInput?.value || '');
  if (match) {
    nombreInput.dataset.providerId = String(match.id);
    if (rutInput && !rutInput.value.trim() && match.rut) {
      rutInput.value = match.rut;
    }
    return match;
  }

  nombreInput.dataset.providerId = '';
  return null;
}

function setAdminMsg(message, type = 'info') {
  const box = document.getElementById('adminMsg');
  if (!box) return;
  box.innerHTML = `<div class="alert alert-${type} py-2">${message}</div>`;
}

async function adminRequest(action, payload = {}, method = 'POST') {
  const options = {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': window.AuthState.csrfToken || ''
    }
  };

  if (method !== 'GET') {
    options.body = JSON.stringify(payload);
  }

  const response = await fetch(`api/adminUsuarios.php?action=${action}`, options);
  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.error || 'Error en operación de administración');
  }

  return data;
}

function renderUsuarios() {
  const body = document.getElementById('usuariosBody');
  if (!body) return;

  body.innerHTML = usuarios.map((u) => `
    <tr>
      <td>${u.id}</td>
      <td><input class="form-control form-control-sm" id="nombre_${u.id}" value="${escapeHtml(u.nombre || '')}"></td>
      <td><input class="form-control form-control-sm" id="email_${u.id}" value="${escapeHtml(u.email || '')}"></td>
      <td>
        <input
          class="form-control form-control-sm proveedor-input"
          id="proveedor_${u.id}"
          list="proveedoresDatalist"
          value="${escapeHtml(u.proveedor_nombre || '')}"
          data-provider-id="${u.proveedor_id || ''}"
          placeholder="Proveedor existente o nuevo"
        >
        <input
          class="form-control form-control-sm mt-1 proveedor-rut-input"
          id="proveedor_rut_${u.id}"
          value="${escapeHtml(u.proveedor_rut || '')}"
          placeholder="RUT proveedor (opcional)"
        >
      </td>
      <td>
        <select class="form-select form-select-sm" id="rol_${u.id}">
          <option value="usuario" ${u.rol === 'usuario' ? 'selected' : ''}>usuario</option>
          <option value="admin" ${u.rol === 'admin' ? 'selected' : ''}>admin</option>
        </select>
      </td>
      <td>
        <select class="form-select form-select-sm" id="activo_${u.id}">
          <option value="1" ${Number(u.activo) === 1 ? 'selected' : ''}>Sí</option>
          <option value="0" ${Number(u.activo) === 0 ? 'selected' : ''}>No</option>
        </select>
      </td>
      <td>${u.ultimo_login_at || '-'}</td>
      <td class="d-flex gap-1">
        <button class="btn btn-sm btn-primary" onclick="guardarUsuario(${u.id})">Guardar</button>
        <button class="btn btn-sm btn-warning" onclick="cambiarPassword(${u.id})">Password</button>
        <button class="btn btn-sm btn-danger" onclick="eliminarUsuario(${u.id})">Eliminar</button>
      </td>
    </tr>
  `).join('');
}

function formatearDetalleAuditoria(row) {
  if (!row.detalle_json) return '-';
  try {
    const obj = typeof row.detalle_json === 'string' ? JSON.parse(row.detalle_json) : row.detalle_json;
    return Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join(' | ');
  } catch {
    return row.detalle_json;
  }
}

function renderAuditoria() {
  const body = document.getElementById('auditoriaBody');
  if (!body) return;

  if (auditoria.length === 0) {
    body.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Sin registros de auditoría.</td></tr>';
    return;
  }

  body.innerHTML = auditoria.map((row) => `
    <tr>
      <td>${row.created_at || '-'}</td>
      <td>${row.admin_nombre || '-'}<br><small class="text-muted">${row.admin_email || ''}</small></td>
      <td>${row.accion || '-'}</td>
      <td>${row.target_user_id || '-'}<br><small class="text-muted">${row.target_email || ''}</small></td>
      <td>${row.ip_address || '-'}</td>
      <td>${formatearDetalleAuditoria(row)}</td>
    </tr>
  `).join('');
}

async function cargarAuditoria() {
  if (!window.AuthState.loggedIn || !window.AuthState.isAdmin) {
    return;
  }

  try {
    const data = await adminRequest('audit&limit=100', {}, 'GET');
    auditoria = data.auditoria || [];
    renderAuditoria();
  } catch (error) {
    setAdminMsg(error.message, 'danger');
  }
}

async function cargarUsuarios() {
  if (!window.AuthState.loggedIn || !window.AuthState.isAdmin) {
    window.location.href = 'ingresar.html';
    return;
  }

  try {
    const data = await adminRequest('list', {}, 'GET');
    usuarios = data.usuarios || [];
    renderUsuarios();
    await cargarAuditoria();
  } catch (error) {
    setAdminMsg(error.message, 'danger');
  }
}

async function guardarUsuario(id) {
  const nombre = document.getElementById(`nombre_${id}`)?.value?.trim() || '';
  const email = document.getElementById(`email_${id}`)?.value?.trim() || '';
  const proveedorInput = document.getElementById(`proveedor_${id}`);
  const proveedorRutInput = document.getElementById(`proveedor_rut_${id}`);
  const rol = document.getElementById(`rol_${id}`)?.value || 'usuario';
  const activo = Number(document.getElementById(`activo_${id}`)?.value || 1);

  sincronizarProveedorInput(proveedorInput, proveedorRutInput);

  try {
    await adminRequest('update', {
      id,
      nombre,
      email,
      rol,
      activo,
      proveedor_id: Number(proveedorInput?.dataset?.providerId || 0),
      proveedor_nombre: proveedorInput?.value?.trim() || '',
      proveedor_rut: proveedorRutInput?.value?.trim() || ''
    });
    setAdminMsg('Usuario actualizado', 'success');
    await cargarProveedoresCatalogo();
    await cargarUsuarios();
  } catch (error) {
    setAdminMsg(error.message, 'danger');
  }
}

async function cambiarPassword(id) {
  const password = prompt('Nueva contraseña (10-72 caracteres con letras y números):');
  if (!password) return;

  try {
    await adminRequest('set_password', { id, password });
    setAdminMsg('Contraseña actualizada', 'success');
  } catch (error) {
    setAdminMsg(error.message, 'danger');
  }
}

async function eliminarUsuario(id) {
  const confirmar = confirm('¿Seguro que deseas eliminar este usuario? Esta acción no se puede deshacer.');
  if (!confirmar) return;

  try {
    await adminRequest('delete', { id });
    setAdminMsg('Usuario eliminado', 'success');
    await cargarUsuarios();
  } catch (error) {
    setAdminMsg(error.message, 'danger');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('crearUsuarioForm');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const nombre = document.getElementById('nuevoNombre')?.value?.trim() || '';
      const email = document.getElementById('nuevoEmail')?.value?.trim() || '';
      const password = document.getElementById('nuevoPassword')?.value || '';
      const rol = document.getElementById('nuevoRol')?.value || 'usuario';
      const proveedorInput = document.getElementById('nuevoProveedor');
      const proveedorRutInput = document.getElementById('nuevoProveedorRut');

      sincronizarProveedorInput(proveedorInput, proveedorRutInput);

      try {
        await adminRequest('create', {
          nombre,
          email,
          password,
          rol,
          proveedor_id: Number(proveedorInput?.dataset?.providerId || 0),
          proveedor_nombre: proveedorInput?.value?.trim() || '',
          proveedor_rut: proveedorRutInput?.value?.trim() || ''
        });
        form.reset();
        if (proveedorInput) proveedorInput.dataset.providerId = '';
        setAdminMsg('Usuario creado correctamente', 'success');
        await cargarProveedoresCatalogo();
        await cargarUsuarios();
      } catch (error) {
        setAdminMsg(error.message, 'danger');
      }
    });
  }

  document.addEventListener('auth:changed', () => {
    cargarProveedoresCatalogo();
    cargarUsuarios();
  });

  document.addEventListener('input', (event) => {
    const nombreInput = event.target.closest('.proveedor-input');
    if (nombreInput) {
      const rutInput = document.getElementById(nombreInput.id.replace('proveedor_', 'proveedor_rut_'));
      sincronizarProveedorInput(nombreInput, rutInput);

      const query = nombreInput.value.trim();
      if (query.length >= 2) {
        cargarProveedoresCatalogo(query);
      }
      return;
    }

    if (event.target.id === 'nuevoProveedor') {
      const rutInput = document.getElementById('nuevoProveedorRut');
      sincronizarProveedorInput(event.target, rutInput);

      const query = event.target.value.trim();
      if (query.length >= 2) {
        cargarProveedoresCatalogo(query);
      }
    }
  });

  document.addEventListener('blur', (event) => {
    const nombreInput = event.target.closest('.proveedor-input');
    if (nombreInput) {
      const rutInput = document.getElementById(nombreInput.id.replace('proveedor_', 'proveedor_rut_'));
      sincronizarProveedorInput(nombreInput, rutInput);
      return;
    }

    if (event.target.id === 'nuevoProveedor') {
      sincronizarProveedorInput(event.target, document.getElementById('nuevoProveedorRut'));
    }
  }, true);
});

window.cargarUsuarios = cargarUsuarios;
window.cargarAuditoria = cargarAuditoria;
window.guardarUsuario = guardarUsuario;
window.cambiarPassword = cambiarPassword;
window.eliminarUsuario = eliminarUsuario;
