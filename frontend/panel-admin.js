document.addEventListener('DOMContentLoaded', () => {
    const adminDataString = sessionStorage.getItem('admin');
    const welcomeMessageContainer = document.getElementById('welcome-message');

    if (adminDataString) {
        const admin = JSON.parse(adminDataString);
        // Mostramos el mensaje de bienvenida con el nombre del administrador
        welcomeMessageContainer.textContent = `¡Bienvenido, ${admin.Nombre}!`;
    } else {
        // Si no hay datos de admin, es porque no ha iniciado sesión.
        // Lo redirigimos a la página de login. Esto es una medida de seguridad básica.
        window.location.href = 'administrador.html';
    }

    // --- Funcionalidad para Crear Reservas desde el Panel de Admin ---

    const formBuscarDisponibilidad = document.getElementById('form-buscar-disponibilidad-admin');
    const resultadosContainer = document.getElementById('resultados-disponibilidad-admin');
    const tipoHabitacionSelect = document.getElementById('tipo-habitacion-admin');
    const reservaMessageDiv = document.getElementById('reserva-message');

    // Modal y sus elementos
    const modal = document.getElementById('modal-reserva');
    const modalCloseButton = document.querySelector('.close-button');
    const detalleReservaModal = document.getElementById('detalle-reserva-modal');
    const formConfirmarReserva = document.getElementById('form-confirmar-reserva-admin');
    const mensajeConfirmacionModal = document.getElementById('mensaje-confirmacion-modal');

    let datosReservaActual = {}; // Para guardar temporalmente los datos de la reserva

    // Cargar tipos de habitación en el select
    const cargarTiposHabitacion = async () => {
        try {
            const response = await fetch('http://localhost:3000/api/habitaciones/tipos');
            if (!response.ok) return;
            const tipos = await response.json();
            tipos.forEach(tipoObj => {
                const option = document.createElement('option');
                option.value = tipoObj.Tipo;
                option.textContent = tipoObj.Tipo;
                tipoHabitacionSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Error al cargar tipos de habitación:', error);
        }
    };

    // Buscar disponibilidad
    formBuscarDisponibilidad.addEventListener('submit', async (event) => {
        event.preventDefault();
        const llegada = document.getElementById('fecha-llegada').value;
        const salida = document.getElementById('fecha-salida').value;
        const tipo = tipoHabitacionSelect.value;

        if (new Date(llegada) >= new Date(salida)) {
            reservaMessageDiv.textContent = 'La fecha de salida debe ser posterior a la de llegada.';
            reservaMessageDiv.style.color = 'red';
            return;
        }

        const query = new URLSearchParams({ llegada, salida, tipo }).toString();

        try {
            const response = await fetch(`http://localhost:3000/api/habitaciones/disponibles?${query}`);
            const habitaciones = await response.json();

            reservaMessageDiv.textContent = '';
            resultadosContainer.innerHTML = '';

            if (habitaciones.length === 0) {
                resultadosContainer.innerHTML = '<p>No hay habitaciones disponibles para las fechas y tipo seleccionados.</p>';
                return;
            }

            habitaciones.forEach(hab => {
                const card = document.createElement('div');
                card.className = 'muestra';
                card.innerHTML = `
                    <div class="descripcion">
                        <p><strong>Habitación N° ${hab.NumeroHabitacion}</strong></p>
                        <p>${hab.Tipo}</p>
                        <p>Precio: $${new Intl.NumberFormat('es-CO').format(hab.PrecioPorNoche)} / noche</p>
                        <button class="btn-reservar-admin" data-id="${hab.idHabitacion}">Reservar</button>
                    </div>
                `;
                resultadosContainer.appendChild(card);
            });

        } catch (error) {
            console.error('Error al buscar disponibilidad:', error);
            reservaMessageDiv.textContent = 'Error al conectar con el servidor para buscar disponibilidad.';
            reservaMessageDiv.style.color = 'red';
        }
    });

    // Abrir modal al hacer clic en "Reservar"
    resultadosContainer.addEventListener('click', async (event) => {
        if (event.target.classList.contains('btn-reservar-admin')) {
            const idHabitacion = event.target.dataset.id;
            const fechaLlegada = document.getElementById('fecha-llegada').value;
            const fechaSalida = document.getElementById('fecha-salida').value;

            datosReservaActual = { idHabitacion, fechaLlegada, fechaSalida };

            try {
                const response = await fetch(`http://localhost:3000/api/habitaciones/${idHabitacion}`);
                const habitacion = await response.json();

                const llegada = new Date(fechaLlegada);
                const salida = new Date(fechaSalida);
                const noches = Math.ceil(Math.abs(salida - llegada) / (1000 * 60 * 60 * 24));
                const precioTotal = noches * habitacion.PrecioPorNoche;

                detalleReservaModal.innerHTML = `
                    <p><strong>Habitación:</strong> N° ${habitacion.NumeroHabitacion} - ${habitacion.Tipo}</p>
                    <p><strong>Fecha de Llegada:</strong> ${fechaLlegada}</p>
                    <p><strong>Fecha de Salida:</strong> ${fechaSalida}</p>
                    <p><strong>Total Noches:</strong> ${noches}</p>
                    <p><strong>Precio Total:</strong> $${new Intl.NumberFormat('es-CO').format(precioTotal)}</p>
                `;

                formConfirmarReserva.reset();
                mensajeConfirmacionModal.innerHTML = '';
                modal.style.display = 'block';

            } catch (error) {
                console.error('Error al cargar detalles para el modal:', error);
                reservaMessageDiv.textContent = 'No se pudieron cargar los detalles de la habitación.';
                reservaMessageDiv.style.color = 'red';
            }
        }
    });

    // Cerrar modal
    modalCloseButton.onclick = () => {
        modal.style.display = 'none';
    };
    window.onclick = (event) => {
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    };

    // Enviar formulario de confirmación de reserva
    formConfirmarReserva.addEventListener('submit', async (event) => {
        event.preventDefault();

        const datosCliente = {
            nombre: document.getElementById('nombre-cliente').value,
            email: document.getElementById('email-cliente').value,
            telefono: document.getElementById('telefono').value,
        };

        const payload = { ...datosReservaActual, ...datosCliente };

        try {
            const response = await fetch('http://localhost:3000/api/reservas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const resultado = await response.json();

            if (response.ok) {
                mensajeConfirmacionModal.innerHTML = `<p style="color: green; font-weight: bold;">${resultado.message}</p>`;
                formConfirmarReserva.reset();
                // Opcional: cerrar modal y refrescar búsqueda después de un tiempo
                setTimeout(() => {
                    modal.style.display = 'none';
                    formBuscarDisponibilidad.dispatchEvent(new Event('submit')); // Refresca la búsqueda
                }, 2000);
            } else {
                mensajeConfirmacionModal.innerHTML = `<p style="color: red;">Error: ${resultado.message}</p>`;
            }
        } catch (error) {
            console.error('Error al crear la reserva:', error);
            mensajeConfirmacionModal.innerHTML = '<p style="color: red;">No se pudo conectar con el servidor para crear la reserva.</p>';
        }
    });

    // Cargar todo lo necesario al iniciar
    cargarTiposHabitacion();
});
