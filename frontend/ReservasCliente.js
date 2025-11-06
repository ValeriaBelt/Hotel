document.addEventListener('DOMContentLoaded', () => {
    const formBuscarReservas = document.getElementById('form-buscar-reservas-cliente');
    const gestionMessageDiv = document.getElementById('gestion-message');
    const resultadosReservasContainer = document.getElementById('resultados-reservas-cliente');

    formBuscarReservas.addEventListener('submit', async (event) => {
        event.preventDefault();
        const termino = document.getElementById('termino-busqueda').value;

        try {
            // Mostramos un mensaje de carga
            resultadosReservasContainer.innerHTML = '<p>Buscando sus reservas...</p>';
            gestionMessageDiv.textContent = '';

            const response = await fetch(`http://localhost:3000/api/reservas/buscar?termino=${encodeURIComponent(termino)}`);
            const reservas = await response.json();

            resultadosReservasContainer.innerHTML = ''; // Limpiamos el contenedor

            if (!response.ok) {
                throw new Error(reservas.message || 'Ocurrió un error al buscar.');
            }

            if (reservas.length === 0) {
                resultadosReservasContainer.innerHTML = '<p>No se encontraron reservas con la información proporcionada. Por favor, verifique los datos e intente de nuevo.</p>';
                return;
            }

            const tabla = document.createElement('table');
            tabla.className = 'tabla-reservas';
            tabla.innerHTML = `
                <thead>
                    <tr>
                        <th>Habitación</th>
                        <th>Tipo</th>
                        <th>Fecha de Llegada</th>
                        <th>Fecha de Salida</th>
                        <th>Acción</th>
                    </tr>
                </thead>
                <tbody>
                    ${reservas.map(res => `
                        <tr data-id-reserva="${res.idReserva}">
                            <td>N° ${res.NumeroHabitacion}</td>
                            <td>${res.Tipo}</td>
                            <td>${new Date(res.FechaEntrada).toLocaleDateString()}</td>
                            <td>${new Date(res.FechaSalida).toLocaleDateString()}</td>
                            <td><button class="btn-cancelar" data-id="${res.idReserva}">Cancelar Reserva</button></td>
                        </tr>
                    `).join('')}
                </tbody>
            `;
            resultadosReservasContainer.appendChild(tabla);

            // Limpiamos el formulario de búsqueda
            formBuscarReservas.reset();

        } catch (error) {
            console.error('Error al buscar reservas:', error);
            gestionMessageDiv.textContent = `Error: ${error.message}`;
            gestionMessageDiv.style.color = 'red';
            resultadosReservasContainer.innerHTML = '';
        }
    });

    // Delegación de eventos para el botón de cancelar
    resultadosReservasContainer.addEventListener('click', async (event) => {
        if (event.target.classList.contains('btn-cancelar')) {
            const idReserva = event.target.dataset.id;
            
            if (confirm('¿Estás seguro de que deseas cancelar esta reserva? Esta acción no se puede deshacer.')) {
                try {
                    const response = await fetch(`http://localhost:3000/api/reservas/${idReserva}`, { method: 'DELETE' });
                    const resultado = await response.json();

                    gestionMessageDiv.textContent = resultado.message;
                    gestionMessageDiv.style.color = response.ok ? 'green' : 'red';

                    if (response.ok) event.target.closest('tr').remove();
                } catch (error) {
                    gestionMessageDiv.textContent = 'Error de conexión al intentar cancelar la reserva.';
                    gestionMessageDiv.style.color = 'red';
                }
            }
        }
    });
});
