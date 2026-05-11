function setAuthMsg(message, type = 'info') {
  const box = document.getElementById('authMsg');
  if (!box) return;
  box.innerHTML = `<div class="alert alert-${type} py-2">${message}</div>`;
}

let proveedoresRegistro = [];
let proveedorDropdownVisible = false;

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

function buscarProveedorRegistro(nombre = '', rut = '') {
  const nombreNormalizado = normalizarTexto(nombre);
  const rutNormalizado = normalizarRut(rut);

  if (rutNormalizado) {
    const matchByRut = proveedoresRegistro.find((proveedor) => normalizarRut(proveedor.rut) === rutNormalizado);
    if (matchByRut) {
      return matchByRut;
    }
  }

  if (!nombreNormalizado) {
    return null;
  }

  return proveedoresRegistro.find((proveedor) => normalizarTexto(proveedor.nombre) === nombreNormalizado) || null;
}

function renderProveedoresRegistro() {
  const datalist = document.getElementById('registerProveedoresDatalist');
  if (!datalist) return;

  datalist.innerHTML = proveedoresRegistro.map((proveedor) => {
    const rut = proveedor.rut ? `RUT: ${proveedor.rut}` : 'Proveedor manual';
    return `<option value="${escapeHtml(proveedor.nombre)}" label="${escapeHtml(rut)}"></option>`;
  }).join('');
}

function setProveedorHelp(message, type = 'muted') {
  const help = document.getElementById('registerProveedorHelp');
  if (!help) return;

  help.className = type === 'danger' ? 'form-text text-danger' : 'form-text';
  help.textContent = message;
}

function ocultarSugerenciasProveedor() {
  const contenedor = document.getElementById('registerProveedorSugerencias');
  if (!contenedor) return;
  contenedor.classList.add('d-none');
  proveedorDropdownVisible = false;
}

function mostrarEstadoSugerenciasProveedor(message) {
  const contenedor = document.getElementById('registerProveedorSugerencias');
  if (!contenedor) return;

  contenedor.innerHTML = `<div class="auth-provider-item text-muted">${escapeHtml(message)}</div>`;
  contenedor.classList.remove('d-none');
  proveedorDropdownVisible = true;
}

function seleccionarProveedorRegistro(proveedor) {
  const proveedorInput = document.getElementById('registerProveedor');
  const proveedorRutInput = document.getElementById('registerProveedorRut');
  if (!proveedorInput) return;

  proveedorInput.value = proveedor.nombre || '';
  proveedorInput.dataset.providerId = proveedor.id ? String(proveedor.id) : '';
  if (proveedorRutInput) {
    proveedorRutInput.value = proveedor.rut || '';
  }
  ocultarSugerenciasProveedor();
}

function renderSugerenciasProveedor(query = '') {
  const contenedor = document.getElementById('registerProveedorSugerencias');
  const proveedorInput = document.getElementById('registerProveedor');
  if (!contenedor || !proveedorInput) return;

  const texto = normalizarTexto(query || proveedorInput.value);
  const sugerencias = proveedoresRegistro
    .filter((proveedor) => {
      if (!texto) return true;
      const nombre = normalizarTexto(proveedor.nombre);
      const rut = normalizarRut(proveedor.rut);
      return nombre.includes(texto) || (!!rut && rut.includes(normalizarRut(texto)));
    })
    .slice(0, 12);

  if (sugerencias.length === 0) {
    contenedor.innerHTML = '<div class="auth-provider-item text-muted">No hay coincidencias. Puedes escribir un proveedor nuevo.</div>';
  } else {
    contenedor.innerHTML = sugerencias.map((proveedor) => `
      <div class="auth-provider-item" data-provider-id="${proveedor.id}" data-provider-name="${escapeHtml(proveedor.nombre)}" data-provider-rut="${escapeHtml(proveedor.rut || '')}">
        <span>${escapeHtml(proveedor.nombre)}</span>
        <span class="auth-provider-meta">${escapeHtml(proveedor.rut || 'Sin RUT')}</span>
      </div>
    `).join('');
  }

  contenedor.classList.remove('d-none');
  proveedorDropdownVisible = true;
}

async function cargarProveedoresRegistro(query = '') {
  try {
    const suffix = query ? `&q=${encodeURIComponent(query)}` : '';
    const response = await fetch(`api/auth.php?action=providers&limit=500${suffix}`, {
      method: 'GET',
      credentials: 'include'
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'No se pudo cargar el catálogo de proveedores');
    }

    if (data.feature_available === false) {
      proveedoresRegistro = [];
      renderProveedoresRegistro();
      setProveedorHelp(data.message || 'El catálogo de proveedores no está disponible todavía.', 'danger');
      ocultarSugerenciasProveedor();
      return;
    }

    const proveedores = data.proveedores || [];
    if (query) {
      const merged = new Map(proveedoresRegistro.map((proveedor) => [proveedor.id, proveedor]));
      proveedores.forEach((proveedor) => merged.set(proveedor.id, proveedor));
      proveedoresRegistro = Array.from(merged.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    } else {
      proveedoresRegistro = proveedores;
    }

    renderProveedoresRegistro();
    setProveedorHelp(
      proveedoresRegistro.length > 0
        ? 'Selecciona un proveedor existente o escribe uno nuevo.'
        : 'No hay proveedores cargados todavía. Puedes escribir uno nuevo.',
      'muted'
    );

    return proveedoresRegistro;
  } catch (error) {
    console.error(error);
    setProveedorHelp('No se pudo cargar el catálogo de proveedores.', 'danger');
    return [];
  }
}

function sincronizarProveedorRegistro() {
  const proveedorInput = document.getElementById('registerProveedor');
  const proveedorRutInput = document.getElementById('registerProveedorRut');
  if (!proveedorInput) return null;

  const match = buscarProveedorRegistro(proveedorInput.value, proveedorRutInput?.value || '');
  if (match) {
    proveedorInput.dataset.providerId = String(match.id);
    if (proveedorRutInput && !proveedorRutInput.value.trim() && match.rut) {
      proveedorRutInput.value = match.rut;
    }
    return match;
  }

  proveedorInput.dataset.providerId = '';
  return null;
}

async function doAuthRequest(action, payload) {
  const response = await fetch(`api/auth.php?action=${action}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': window.AuthState.csrfToken || ''
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || 'Error en autenticación');
  }

  await window.fetchAuthStatus();
  return data;
}

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const registerProveedorInput = document.getElementById('registerProveedor');
  const loginTabButton = document.getElementById('tab-login');
  const registerTabButton = document.getElementById('tab-register');
  const loginPanel = document.getElementById('panel-login');
  const registerPanel = document.getElementById('panel-register');

  function setActiveAuthPanel(panelName) {
    const showLogin = panelName === 'login';

    loginTabButton?.classList.toggle('active', showLogin);
    registerTabButton?.classList.toggle('active', !showLogin);

    loginPanel?.classList.toggle('show', showLogin);
    loginPanel?.classList.toggle('active', showLogin);
    loginPanel?.setAttribute('aria-hidden', showLogin ? 'false' : 'true');

    registerPanel?.classList.toggle('show', !showLogin);
    registerPanel?.classList.toggle('active', !showLogin);
    registerPanel?.setAttribute('aria-hidden', showLogin ? 'true' : 'false');
  }

  loginTabButton?.addEventListener('click', () => setActiveAuthPanel('login'));
  registerTabButton?.addEventListener('click', () => setActiveAuthPanel('register'));
  setActiveAuthPanel('login');

  document.addEventListener('auth:changed', (event) => {
    if (event.detail.loggedIn) {
      setAuthMsg(`Sesión activa como ${event.detail.user?.nombre || event.detail.user?.email || 'usuario'}.`, 'success');
      setTimeout(() => {
        const params = new URLSearchParams(window.location.search);
        const redir = params.get('redir');
        window.location.href = (redir && /^[a-zA-Z0-9_-]+\.html$/.test(redir)) ? redir : 'index.html';
      }, 600);
    }
  });

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;

      try {
        await doAuthRequest('login', { email, password });
      } catch (error) {
        setAuthMsg(error.message, 'danger');
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nombre = document.getElementById('registerNombre').value.trim();
      const email = document.getElementById('registerEmail').value.trim();
      const password = document.getElementById('registerPassword').value;
      const proveedorInput = document.getElementById('registerProveedor');
      const proveedorRutInput = document.getElementById('registerProveedorRut');

      sincronizarProveedorRegistro();

      try {
        await doAuthRequest('register', {
          nombre,
          email,
          password,
          proveedor_id: Number(proveedorInput?.dataset?.providerId || 0),
          proveedor_nombre: proveedorInput?.value?.trim() || '',
          proveedor_rut: proveedorRutInput?.value?.trim() || ''
        });
      } catch (error) {
        setAuthMsg(error.message, 'danger');
      }
    });
  }

  if (registerProveedorInput) {
    cargarProveedoresRegistro();

    registerProveedorInput.addEventListener('input', async (event) => {
      sincronizarProveedorRegistro();
      const query = event.target.value.trim();
      if (query.length >= 2) {
        mostrarEstadoSugerenciasProveedor('Buscando proveedores...');
        await cargarProveedoresRegistro(query);
        renderSugerenciasProveedor(query);
      } else if (query.length === 0 && proveedoresRegistro.length > 0) {
        renderSugerenciasProveedor('');
      } else {
        ocultarSugerenciasProveedor();
      }
    });

    registerProveedorInput.addEventListener('focus', async () => {
      const query = registerProveedorInput.value.trim();
      if (proveedoresRegistro.length === 0) {
        mostrarEstadoSugerenciasProveedor('Cargando proveedores...');
        await cargarProveedoresRegistro(query);
      }

      if (proveedoresRegistro.length > 0) {
        renderSugerenciasProveedor(query);
      } else {
        mostrarEstadoSugerenciasProveedor('No hay proveedores disponibles. Puedes escribir uno nuevo.');
      }
    });

    registerProveedorInput.addEventListener('blur', () => {
      window.setTimeout(() => {
        sincronizarProveedorRegistro();
        ocultarSugerenciasProveedor();
      }, 150);
    });
  }

  document.getElementById('registerProveedorSugerencias')?.addEventListener('mousedown', (event) => {
    const item = event.target.closest('.auth-provider-item[data-provider-id]');
    if (!item) return;

    seleccionarProveedorRegistro({
      id: Number(item.dataset.providerId || 0),
      nombre: item.dataset.providerName || '',
      rut: item.dataset.providerRut || ''
    });
  });

  document.addEventListener('click', (event) => {
    if (!proveedorDropdownVisible) return;

    const proveedorInput = document.getElementById('registerProveedor');
    const contenedor = document.getElementById('registerProveedorSugerencias');
    if (!proveedorInput || !contenedor) return;

    if (event.target === proveedorInput || contenedor.contains(event.target)) {
      return;
    }

    ocultarSugerenciasProveedor();
  });
});
