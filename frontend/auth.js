window.AuthState = {
  loggedIn: false,
  user: null,
  csrfToken: '',
  isAdmin: false
};

// Aplicar estado cacheado inmediatamente para evitar parpadeo del menú
(function aplicarCacheAuth() {
  try {
    const cached = localStorage.getItem('authState');
    if (cached) {
      const parsed = JSON.parse(cached);
      window.AuthState.loggedIn = !!parsed.loggedIn;
      window.AuthState.user = parsed.user || null;
      window.AuthState.isAdmin = !!parsed.isAdmin;
      // Aplicar menú antes de que el DOM esté listo, o en cuanto lo esté
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', actualizarMenuAuth, { once: true });
      } else {
        actualizarMenuAuth();
      }
    }
  } catch (_) {}
})();

async function fetchAuthStatus() {
  try {
    const response = await fetch('api/auth.php?action=status', {
      method: 'GET',
      credentials: 'include'
    });

    const data = await response.json();
    window.AuthState.loggedIn = !!data.logged_in;
    window.AuthState.user = data.user || null;
    window.AuthState.isAdmin = !!(data.user && data.user.rol === 'admin');
    window.AuthState.csrfToken = data.csrf_token || response.headers.get('X-CSRF-Token') || '';

    // Guardar en caché para la próxima carga de página
    try {
      localStorage.setItem('authState', JSON.stringify({
        loggedIn: window.AuthState.loggedIn,
        user: window.AuthState.user,
        isAdmin: window.AuthState.isAdmin
      }));
    } catch (_) {}

    actualizarMenuAuth();
    document.dispatchEvent(new CustomEvent('auth:changed', { detail: window.AuthState }));
  } catch (error) {
    console.error('Error consultando sesión:', error);
    window.AuthState.loggedIn = false;
    window.AuthState.user = null;
    window.AuthState.isAdmin = false;
    try { localStorage.removeItem('authState'); } catch (_) {}
    actualizarMenuAuth();
    document.dispatchEvent(new CustomEvent('auth:changed', { detail: window.AuthState }));
  }
}

function actualizarMenuAuth() {
  const navAuthLink = document.getElementById('navAuthLink');
  const navPalabrasClaveItem = document.getElementById('navPalabrasClaveItem');
  const navGuardadasItem = document.getElementById('navGuardadasItem');
  const navAdminDropdown = document.getElementById('navAdminDropdown');
  const navSugerenciasItem = document.getElementById('navSugerenciasItem');

  if (navPalabrasClaveItem) {
    if (window.AuthState.loggedIn) {
      navPalabrasClaveItem.classList.remove('d-none');
    } else {
      navPalabrasClaveItem.classList.add('d-none');
    }
  }

  if (navGuardadasItem) {
    if (window.AuthState.loggedIn) {
      navGuardadasItem.classList.remove('d-none');
    } else {
      navGuardadasItem.classList.add('d-none');
    }
  }

  if (navAdminDropdown) {
    if (window.AuthState.loggedIn && window.AuthState.isAdmin) {
      navAdminDropdown.classList.remove('d-none');
    } else {
      navAdminDropdown.classList.add('d-none');
    }
  }

  if (navSugerenciasItem) {
    if (window.AuthState.loggedIn && window.AuthState.user?.proveedor?.id) {
      navSugerenciasItem.classList.remove('d-none');
    } else {
      navSugerenciasItem.classList.add('d-none');
    }
  }

  if (!navAuthLink) return;

  if (window.AuthState.loggedIn) {
    navAuthLink.innerHTML = '<i class="bi bi-box-arrow-right"></i> Salir';
    navAuthLink.setAttribute('href', '#');
    navAuthLink.onclick = async (e) => {
      e.preventDefault();
      await logout();
    };
  } else {
    navAuthLink.innerHTML = '<i class="bi bi-box-arrow-in-right"></i> Ingresar';
    navAuthLink.setAttribute('href', 'ingresar.html');
    navAuthLink.onclick = null;
  }
}

async function logout() {
  try {
    const response = await fetch('api/auth.php?action=logout', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': window.AuthState.csrfToken || ''
      },
      body: JSON.stringify({})
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'No se pudo cerrar sesión');
    }

    // Limpiar caché de auth al cerrar sesión
    try { localStorage.removeItem('authState'); } catch (_) {}

    await fetchAuthStatus();

    if (
      window.location.pathname.endsWith('guardadas.html') ||
      window.location.pathname.endsWith('sugerencias.html') ||
      window.location.pathname.endsWith('admin_usuarios.html')
    ) {
      window.location.href = 'index.html';
    }
  } catch (error) {
    alert(error.message || 'Error al cerrar sesión');
  }
}

document.addEventListener('DOMContentLoaded', fetchAuthStatus);

window.fetchAuthStatus = fetchAuthStatus;
window.logout = logout;
