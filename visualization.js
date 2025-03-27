let datos = [];

Papa.parse('detalles.csv', {
download: true,
header: true,
delimiter: ';',
complete: (results) => {
    datos = results.data.filter(item => item.codigo);
    mostrarDatos(datos);
}
});

function mostrarDatos(datosFiltrados) {
const tabla = document.getElementById('tablaDatos');
tabla.innerHTML = '';
datosFiltrados.forEach(item => {
    const fila = `<tr>
    <td>${item.codigo}</td>
    <td>${item.nombre}</td>
    <td>${item.institucion_nombre}</td>
    <td>${item.descripcion}</td>
    <td>${new Date(item.fecha_inicio).toLocaleString()}</td>
    <td>${new Date(item.fecha_final).toLocaleString()}</td>
    </tr>`;
    tabla.innerHTML += fila;
});
}

function filtrarDatos() {
const texto = document.getElementById('filtroTexto').value.toLowerCase();
const datosFiltrados = datos.filter(item =>
    item.institucion_nombre.toLowerCase().includes(texto) ||
    item.codigo.toLowerCase().includes(texto)
);
mostrarDatos(datosFiltrados);
}