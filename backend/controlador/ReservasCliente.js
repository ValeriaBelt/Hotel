document.addEventListener('DOMContentLoaded', () => {
    const formBuscarReservas = document.getElementById('form-buscar-reservas-cliente');
    const gestionMessageDiv = document.getElementById('gestion-message');
    const resultadosReservasContainer = document.getElementById('resultados-reservas-cliente');
    const managementCodeInput = document.getElementById('codigo-gestion-reserva');
    let activeManagementCode = null;

    formBuscarReservas.addEventListener('submit', async (event) => {
        event.preventDefault();
        const managementCode = managementCodeInput.value.trim();
        activeManagementCode = null;

        try {
            resultadosReservasContainer.replaceChildren();
            resultadosReservasContainer.textContent = 'Consultando la reserva…';
            gestionMessageDiv.textContent = '';

            const response = await fetch(window.hotelApiUrl('/api/reservas/consultar'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ managementCode })
            });
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'No se pudo consultar la reserva.');
            }

            activeManagementCode = managementCode;
            const reservation = result[0];

            const tabla = document.createElement('table');
            tabla.className = 'tabla-reservas';
            const header = document.createElement('tr');
            for (const label of ['Habitación', 'Tipo', 'Fecha de Llegada', 'Fecha de Salida', 'Acción']) {
                const cell = document.createElement('th');
                cell.textContent = label;
                header.appendChild(cell);
            }
            const tableHead = document.createElement('thead');
            tableHead.appendChild(header);
            tabla.appendChild(tableHead);

            const row = document.createElement('tr');
            row.dataset.idReserva = reservation.idReserva;
            const values = [
                `N° ${reservation.NumeroHabitacion}`,
                reservation.Tipo,
                new Date(reservation.FechaEntrada).toLocaleDateString(),
                new Date(reservation.FechaSalida).toLocaleDateString()
            ];
            for (const value of values) {
                const cell = document.createElement('td');
                cell.textContent = value;
                row.appendChild(cell);
            }
            const actionCell = document.createElement('td');
            const cancelButton = document.createElement('button');
            cancelButton.className = 'btn-cancelar';
            cancelButton.dataset.id = reservation.idReserva;
            cancelButton.textContent = 'Cancelar Reserva';
            actionCell.appendChild(cancelButton);
            row.appendChild(actionCell);
            const tableBody = document.createElement('tbody');
            tableBody.appendChild(row);
            tabla.appendChild(tableBody);
            resultadosReservasContainer.appendChild(tabla);
            gestionMessageDiv.textContent = 'Reserva encontrada. El código permanece solo en esta página; no lo compartas.';
            gestionMessageDiv.style.color = '';
        } catch (error) {
            activeManagementCode = null;
            console.error('Error al consultar reserva:', error);
            gestionMessageDiv.textContent = `Error: ${error.message}`;
            gestionMessageDiv.style.color = 'red';
            resultadosReservasContainer.replaceChildren();
        }
    });

    resultadosReservasContainer.addEventListener('click', async (event) => {
        const button = event.target.closest('.btn-cancelar');
        if (button && resultadosReservasContainer.contains(button) && activeManagementCode) {
            if (confirm('¿Estás seguro de que deseas cancelar esta reserva? Esta acción no se puede deshacer.')) {
                try {
                    const response = await fetch(window.hotelApiUrl(`/api/reservas/${button.dataset.id}/cancelar`), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ managementCode: activeManagementCode })
                    });
                    const resultado = await response.json();

                    gestionMessageDiv.textContent = resultado.message;
                    gestionMessageDiv.style.color = response.ok ? 'green' : 'red';

                    if (response.ok) {
                        activeManagementCode = null;
                        resultadosReservasContainer.replaceChildren();
                        formBuscarReservas.reset();
                    }
                } catch (error) {
                    console.error('Error al cancelar la reserva:', error);
                    gestionMessageDiv.textContent = 'Error de conexión al intentar cancelar la reserva.';
                    gestionMessageDiv.style.color = 'red';
                }
            }
        }
    });
});
