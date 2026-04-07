let usuarios = [];
let auditoria = [];

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
      <td><input class="form-control form-control-sm" id="nombre_${u.id}" value="${u.nombre || ''}"></td>
      <td><input class="form-control form-control-sm" id="email_${u.id}" value="${u.email || ''}"></td>
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
  const rol = document.getElementById(`rol_${id}`)?.value || 'usuario';
  const activo = Number(document.getElementById(`activo_${id}`)?.value || 1);

  try {
    await adminRequest('update', { id, nombre, email, rol, activo });
    setAdminMsg('Usuario actualizado', 'success');
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

      try {
        await adminRequest('create', { nombre, email, password, rol });
        form.reset();
        setAdminMsg('Usuario creado correctamente', 'success');
        await cargarUsuarios();
      } catch (error) {
        setAdminMsg(error.message, 'danger');
      }
    });
  }

  document.addEventListener('auth:changed', () => {
    cargarUsuarios();
  });
});

window.cargarUsuarios = cargarUsuarios;
window.cargarAuditoria = cargarAuditoria;
window.guardarUsuario = guardarUsuario;
window.cambiarPassword = cambiarPassword;
window.eliminarUsuario = eliminarUsuario;
