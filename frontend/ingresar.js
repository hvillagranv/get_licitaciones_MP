function setAuthMsg(message, type = 'info') {
  const box = document.getElementById('authMsg');
  if (!box) return;
  box.innerHTML = `<div class="alert alert-${type} py-2">${message}</div>`;
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

  document.addEventListener('auth:changed', (event) => {
    if (event.detail.loggedIn) {
      setAuthMsg(`Sesión activa como ${event.detail.user?.nombre || event.detail.user?.email || 'usuario'}.`, 'success');
      setTimeout(() => {
        window.location.href = 'index.html';
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

      try {
        await doAuthRequest('register', { nombre, email, password });
      } catch (error) {
        setAuthMsg(error.message, 'danger');
      }
    });
  }
});
