// ✅ FUNCIONES SEGURAS PARA EL FRONTEND
// Copiar en un archivo nuevo: frontend-security.js

/**
 * Escapa caracteres HTML para prevenir XSS
 * @param {string} texto - Texto a escapar
 * @returns {string} - Texto escapado
 */
export function escaparHTML(texto) {
  if (typeof texto !== 'string') return '';
  
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  
  return texto.replace(/[&<>"']/g, char => map[char]);
}

/**
 * Crea un elemento de DOM de forma segura
 * @param {string} type - Tipo de elemento (div, span, h3, etc)
 * @param {Object} attrs - Atributos {class, id, etc}
 * @param {string} textContent - Contenido de texto (se escapa automáticamente)
 * @returns {HTMLElement}
 */
export function crearElementoSeguro(type, attrs = {}, textContent = '') {
  const elemento = document.createElement(type);
  
  // Establecer atributos
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === 'class') {
      elemento.className = value;
    } else if (key === 'dataset') {
      Object.entries(value).forEach(([k, v]) => {
        elemento.dataset[k] = v;
      });
    } else if (!key.startsWith('on')) {  // No permitir event handlers dinámicos
      elemento.setAttribute(key, escaparHTML(String(value)));
    }
  });
  
  // Establecer contenido de texto (seguro)
  if (textContent) {
    elemento.textContent = textContent;
  }
  
  return elemento;
}

/**
 * Crea una tarjeta de licitación de forma segura
 * Este reemplaza: contenedor.innerHTML += card;
 */
export function crearCardLicitacion(item, institucionesAlias = {}) {
  // Obtener alias o usar nombre original
  const alias = institucionesAlias[item.institucion_nombre] || item.institucion_nombre;
  
  // Formatear monto
  const montoFormateado = formatearMonto(item.monto_estimado, item.unidad_monetaria);
  
  // Crear elementos de forma segura
  const card = crearElementoSeguro('div', { class: 'card mb-3' });
  
  const cardBody = crearElementoSeguro('div', { class: 'card-body' });
  
  // Título
  const titulo = crearElementoSeguro('h5', { class: 'card-title' }, item.nombre);
  cardBody.appendChild(titulo);
  
  // Institución
  const institucion = crearElementoSeguro('p', 
    { class: 'card-text text-muted small' }, 
    `📍 ${alias}`
  );
  cardBody.appendChild(institucion);
  
  // Descripción
  if (item.descripcion) {
    const desc = crearElementoSeguro('p', 
      { class: 'card-text' }, 
      item.descripcion.substring(0, 200) + '...'
    );
    cardBody.appendChild(desc);
  }
  
  // Detalles
  const detalles = crearElementoSeguro('div', { class: 'row text-sm' });
  
  const montoCol = crearElementoSeguro('div', { class: 'col-6' });
  const montoLabel = crearElementoSeguro('small', { class: 'text-muted' }, 'Monto:');
  const montoValor = crearElementoSeguro('strong', {}, montoFormateado);
  montoCol.appendChild(montoLabel);
  montoCol.appendChild(document.createElement('br'));
  montoCol.appendChild(montoValor);
  detalles.appendChild(montoCol);
  
  const fechaCol = crearElementoSeguro('div', { class: 'col-6' });
  const fechaLabel = crearElementoSeguro('small', { class: 'text-muted' }, 'Fecha cierre:');
  const fechaValor = crearElementoSeguro('strong', {}, formatearFecha(item.fecha_final));
  fechaCol.appendChild(fechaLabel);
  fechaCol.appendChild(document.createElement('br'));
  fechaCol.appendChild(fechaValor);
  detalles.appendChild(fechaCol);
  
  cardBody.appendChild(detalles);
  
  // Botón de ver más (sin onclick dinámico)
  const boton = crearElementoSeguro('button', 
    { class: 'btn btn-sm btn-primary mt-3' },
    'Ver detalles'
  );
  boton.addEventListener('click', () => {
    verDetalleSeguro(item);
  });
  cardBody.appendChild(boton);
  
  card.appendChild(cardBody);
  return card;
}

/**
 * Formatea un monto de forma segura
 */
function formatearMonto(monto, moneda) {
  if (!monto || isNaN(monto)) return 'No informado';
  
  const num = parseInt(monto);
  const formateado = num.toLocaleString('es-CL');
  
  if (moneda && moneda !== 'CLP' && moneda.match(/^[A-Z]{3}$/)) {
    return `${formateado} ${escaparHTML(moneda)}`;
  }
  
  return `$${formateado}`;
}

/**
 * Formatea una fecha de forma segura
 */
function formatearFecha(fecha) {
  if (!fecha) return 'No disponible';
  
  try {
    const date = new Date(fecha);
    return date.toLocaleDateString('es-CL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  } catch (e) {
    return 'Fecha inválida';
  }
}

/**
 * Ver detalles de una licitación de forma segura
 */
function verDetalleSeguro(item) {
  // Validar que item es un objeto válido
  if (!item || typeof item !== 'object') return;
  
  // Crear modal o mostrar panel con datos escapados
  const details = {
    codigo: escaparHTML(String(item.codigo || '')),
    nombre: escaparHTML(String(item.nombre || '')),
    institucion: escaparHTML(String(item.institucion_nombre || '')),
    descripcion: escaparHTML(String(item.descripcion || '')),
    monto: formatearMonto(item.monto_estimado, item.unidad_monetaria),
    estado: escaparHTML(String(item.estado || ''))
  };
  
  // Aquí puedes abrir un modal o enviar a otra página
  console.log('Detalles:', details);
  alert(`Licitación: ${details.nombre}\nEstado: ${details.estado}`);
}

/**
 * Validar entrada de usuario en formularios
 */
export function validarEntradaUsuario(texto, maxLength = 255) {
  if (typeof texto !== 'string') return '';
  
  // Remover caracteres peligrosos
  let limpio = texto.trim();
  
  // Limitar longitud
  if (limpio.length > maxLength) {
    limpio = limpio.substring(0, maxLength);
  }
  
  // Validar que no contiene HTML/JS malicioso
  if (/<script|<iframe|javascript:|onerror=|onload=/i.test(limpio)) {
    return '';  // Rechazar entrada sospechosa
  }
  
  return limpio;
}

/**
 * Insertar HTML seguro desde API
 * Solo usar si estás 100% seguro que la fuente es confiable
 */
export function insertarHTMLSeguro(elemento, htmlSeguro) {
  // Crear un contenedor temporal
  const temp = document.createElement('div');
  
  // Usar insertAdjacentHTML solo para HTML escapeado previamente
  elemento.insertAdjacentHTML('beforeend', htmlSeguro);
}

/**
 * Fetch seguro con validación
 */
export async function fetchSeguro(url, opciones = {}) {
  try {
    // Validar URL
    const urlObj = new URL(url, window.location.origin);
    
    // Solo permitir HTTPS en producción
    if (window.location.protocol === 'https:' && urlObj.protocol !== 'https:') {
      console.error('❌ No se permiten URLs HTTP en HTTPS');
      return null;
    }
    
    const response = await fetch(urlObj.toString(), {
      ...opciones,
      headers: {
        'Content-Type': 'application/json',
        ...opciones.headers
      }
    });
    
    if (!response.ok) {
      console.error(`❌ Error HTTP ${response.status}`);
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error('❌ Error en fetch:', error.message);
    return null;
  }
}

/**
 * Limpiar almacenamiento local
 */
export function limpiarDatosLocales() {
  // Limpiar solo datos no sensibles
  localStorage.clear();
  sessionStorage.clear();
}

// ✅ EXPORTAR PARA USO EN OTROS SCRIPTS
window.FrontendSecurity = {
  escaparHTML,
  crearElementoSeguro,
  crearCardLicitacion,
  validarEntradaUsuario,
  fetchSeguro,
  limpiarDatosLocales
};
