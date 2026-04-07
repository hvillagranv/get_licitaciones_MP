window.AuthState = {
  loggedIn: false,
  user: null,
  csrfToken: '',
  isAdmin: false
};

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

    actualizarMenuAuth();
    document.dispatchEvent(new CustomEvent('auth:changed', { detail: window.AuthState }));
  } catch (error) {
    console.error('Error consultando sesión:', error);
    window.AuthState.loggedIn = false;
    window.AuthState.user = null;
    window.AuthState.isAdmin = false;
    actualizarMenuAuth();
    document.dispatchEvent(new CustomEvent('auth:changed', { detail: window.AuthState }));
  }
}

function actualizarMenuAuth() {
  const navAuthLink = document.getElementById('navAuthLink');
  const navGuardadasItem = document.getElementById('navGuardadasItem');
  const navAdminItem = document.getElementById('navAdminItem');

  if (navGuardadasItem) {
    if (window.AuthState.loggedIn) {
      navGuardadasItem.classList.remove('d-none');
    } else {
      navGuardadasItem.classList.add('d-none');
    }
  }

  if (navAdminItem) {
    if (window.AuthState.loggedIn && window.AuthState.isAdmin) {
      navAdminItem.classList.remove('d-none');
    } else {
      navAdminItem.classList.add('d-none');
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

    await fetchAuthStatus();

    if (window.location.pathname.endsWith('guardadas.html')) {
      window.location.href = 'index.html';
    }
  } catch (error) {
    alert(error.message || 'Error al cerrar sesión');
  }
}

document.addEventListener('DOMContentLoaded', fetchAuthStatus);

window.fetchAuthStatus = fetchAuthStatus;
window.logout = logout;
