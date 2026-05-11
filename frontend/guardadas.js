let guardadas = [];

function formatearFecha(valor) {
  if (!valor) return 'No informada';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return valor;
  return fecha.toLocaleDateString('es-CL');
}

function obtenerClaseEstado(estado) {
  const valor = (estado || '').toString().trim().toLowerCase();
  if (valor === 'adjudicada') return 'bg-success';
  if (valor === 'publicada') return 'bg-primary';
  if (valor === 'cerrada') return 'bg-secondary';
  if (valor.startsWith('desierta')) return 'bg-warning text-dark';
  if (valor === 'revocada' || valor === 'suspendida') return 'bg-danger';
  return 'bg-dark';
}

function formatearMonto(item) {
  if (item.monto_estimado && !isNaN(item.monto_estimado)) {
    const monto = parseInt(item.monto_estimado, 10).toLocaleString('es-CL');
    if (item.unidad_monetaria && item.unidad_monetaria !== 'CLP') {
      return `${monto} ${item.unidad_monetaria}`;
    }
    return `$${monto}`;
  }
  return 'No informado';
}

async function cargarGuardadas() {
  if (!window.AuthState.loggedIn) {
    window.location.href = 'ingresar.html';
    return;
  }

  const estado = document.getElementById('estadoGuardadas');
  const contenedor = document.getElementById('contenedorGuardadas');
  const cantidad = document.getElementById('cantidadResultados');

  estado.innerHTML = '<div class="alert alert-info py-2">Cargando guardadas...</div>';

  try {
    const response = await fetch('api/guardadas.php?action=list', {
      method: 'GET',
      credentials: 'include'
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'No se pudieron cargar las guardadas');
    }

    guardadas = data.guardadas || [];
    cantidad.textContent = `Total guardadas: ${guardadas.length}`;

    if (guardadas.length === 0) {
      estado.innerHTML = '<div class="alert alert-secondary py-2">Aún no tienes licitaciones guardadas.</div>';
      contenedor.innerHTML = '';
      return;
    }

    estado.innerHTML = '';

    contenedor.innerHTML = guardadas.map(item => `
      <div class="card mb-3 p-3 shadow-sm">
        <div class="d-flex justify-content-between align-items-start gap-2">
          <div>
            <div class="text-muted mb-2"><strong>ID Licitación:</strong> ${item.codigo || ''}</div>
            <a href="https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idLicitacion=${item.codigo}" target="_blank">
              <h5 class="text-primary fw-bold mb-1">${item.nombre || '(Sin título)'}</h5>
            </a>
            <p class="text-secondary mb-2">${item.descripcion || '(Sin descripción)'}</p>
            <div class="mb-2">
              <span class="badge ${obtenerClaseEstado(item.estado)}">${item.estado || 'Sin estado'}</span>
            </div>
            <div><strong>Institución:</strong> ${item.institucion_nombre || 'No informada'}</div>
            <div><strong>Monto:</strong> ${formatearMonto(item)}</div>
            <div><strong>Fecha de cierre:</strong> ${formatearFecha(item.fecha_final)}</div>
            <div><strong>Fecha de adjudicación:</strong> ${formatearFecha(item.fecha_adjudicacion)}</div>
            <div><strong>Fecha guardado:</strong> ${formatearFecha(item.fecha_guardado)}</div>
          </div>
          <button class="btn btn-outline-danger btn-sm" onclick="quitarGuardada('${item.codigo}')">Quitar</button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    estado.innerHTML = `<div class="alert alert-danger py-2">${error.message}</div>`;
    contenedor.innerHTML = '';
  }
}

async function quitarGuardada(codigo) {
  if (!codigo) return;

  try {
    const response = await fetch('api/guardadas.php?action=remove', {
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
      throw new Error(data.error || 'No se pudo quitar la guardada');
    }

    await cargarGuardadas();
  } catch (error) {
    alert(error.message || 'Error al quitar guardada');
  }
}

document.addEventListener('auth:changed', () => {
  if (window.AuthState.loggedIn) {
    cargarGuardadas();
  }
});

window.quitarGuardada = quitarGuardada;
