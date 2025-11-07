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

        // Validar que el teléfono solo contenga 10 números
        const telefonoRegex = /^\d{10}$/;
        if (!telefonoRegex.test(datosCliente.telefono)) {
            mensajeConfirmacionModal.innerHTML = '<p style="color: red;">El teléfono debe contener exactamente 10 dígitos numéricos.</p>';
            return;
        }

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
                    formBuscarDisponibilidad.reset(); // Limpiamos el formulario de búsqueda de disponibilidad
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

    // --- Funcionalidad para Gestionar (Cancelar) Reservas ---

    const formBuscarReservas = document.getElementById('form-buscar-reservas');
    const gestionMessageDiv = document.getElementById('gestion-message');
    const resultadosReservasContainer = document.getElementById('resultados-reservas-admin');

    formBuscarReservas.addEventListener('submit', async (event) => {
        event.preventDefault();
        const termino = document.getElementById('termino-busqueda').value;

        try {
            const response = await fetch(`http://localhost:3000/api/reservas/buscar?termino=${encodeURIComponent(termino)}`);
            const reservas = await response.json();

            gestionMessageDiv.textContent = '';
            resultadosReservasContainer.innerHTML = '';

            if (reservas.length === 0) {
                resultadosReservasContainer.innerHTML = '<p>No se encontraron reservas para el término de búsqueda proporcionado.</p>';
                return;
            }

            const tabla = document.createElement('table');
            tabla.className = 'tabla-reservas';
            tabla.innerHTML = `
                <thead>
                    <tr>
                        <th>Cliente</th>
                        <th>Email</th>
                        <th>Teléfono</th>
                        <th>Habitación</th>
                        <th>Llegada</th>
                        <th>Salida</th>
                        <th>Acción</th>
                    </tr>
                </thead>
                <tbody>
                    ${reservas.map(res => `
                        <tr data-id-reserva="${res.idReserva}">
                            <td>${res.Nombre}</td>
                            <td>${res.Email}</td>
                            <td>${res.Telefono}</td>
                            <td>N° ${res.NumeroHabitacion} (${res.Tipo})</td>
                            <td>${new Date(res.FechaEntrada).toLocaleDateString()}</td>
                            <td>${new Date(res.FechaSalida).toLocaleDateString()}</td>
                            <td><button class="btn-cancelar" data-id="${res.idReserva}">Cancelar</button></td>
                        </tr>
                    `).join('')}
                </tbody>
            `;
            resultadosReservasContainer.appendChild(tabla);

            // Limpiamos el formulario de búsqueda de reservas
            formBuscarReservas.reset();

        } catch (error) {
            console.error('Error al buscar reservas:', error);
            gestionMessageDiv.textContent = 'Error al conectar con el servidor para buscar reservas.';
            gestionMessageDiv.style.color = 'red';
        }
    });

    // Event listener para los botones de cancelar (usando delegación de eventos)
    resultadosReservasContainer.addEventListener('click', async (event) => {
        if (event.target.classList.contains('btn-cancelar')) {
            const idReserva = event.target.dataset.id;
            
            if (confirm('¿Estás seguro de que deseas cancelar esta reserva? Esta acción no se puede deshacer.')) {
                try {
                    const response = await fetch(`http://localhost:3000/api/reservas/${idReserva}`, {
                        method: 'DELETE'
                    });
                    const resultado = await response.json();

                    if (response.ok) {
                        gestionMessageDiv.textContent = resultado.message;
                        gestionMessageDiv.style.color = 'green';
                        // Eliminar la fila de la tabla
                        event.target.closest('tr').remove();
                    } else {
                        gestionMessageDiv.textContent = `Error: ${resultado.message}`;
                        gestionMessageDiv.style.color = 'red';
                    }
                } catch (error) {
                    console.error('Error al cancelar reserva:', error);
                    gestionMessageDiv.textContent = 'Error de conexión al intentar cancelar la reserva.';
                    gestionMessageDiv.style.color = 'red';
                }
            }
        }
    });

    // --- Funcionalidad para Crear Administradores ---

    const formCrearAdmin = document.getElementById('form-crear-admin');
    const adminMessageDiv = document.getElementById('admin-message');


    if (formCrearAdmin) {
        formCrearAdmin.addEventListener('submit', async (event) => {
            event.preventDefault();

            const nombre = document.getElementById('nombre-admin').value;
            const telefono = document.getElementById('telefono-admin').value;
            const correo = document.getElementById('correo-admin').value;
            const clave = document.getElementById('clave-admin').value;

            if (!nombre || !telefono || !correo || !clave) {
                adminMessageDiv.textContent = 'Todos los campos son obligatorios.';
                adminMessageDiv.style.color = 'red';
                return;
            }

            // Validar la fortaleza de la contraseña
            const claveRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
            if (!claveRegex.test(clave)) {
                adminMessageDiv.textContent = `La contraseña debe tener al menos 8 caracteres, incluyendo una mayúscula, una minúscula, un número y un carácter especial.`;
                adminMessageDiv.style.color = 'red';
                return;
            }

            // Validar que el teléfono solo contenga números
            const telefonoRegex = /^\d{10}$/;
            if (!telefonoRegex.test(telefono)) {
                adminMessageDiv.textContent = 'El teléfono debe contener exactamente 10 dígitos numéricos.';
                adminMessageDiv.style.color = 'red';
                return;
            }

            try {
                const response = await fetch('http://localhost:3000/api/admin/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nombre, telefono, correo, clave }),
                });

                const resultado = await response.json();

                adminMessageDiv.textContent = resultado.message;
                adminMessageDiv.style.color = response.ok ? 'green' : 'red';

                if (response.ok) {
                    formCrearAdmin.reset();
                }
            } catch (error) {
                console.error('Error al crear administrador:', error);
                adminMessageDiv.textContent = 'No se pudo conectar con el servidor para crear el administrador.';
                adminMessageDiv.style.color = 'red';
            }
        });
    }    

    // --- Funcionalidad para Eliminar Administradores ---

    const formEliminarAdmin = document.getElementById('form-eliminar-admin');
    const adminEliminarMessageDiv = document.getElementById('admin-eliminar-message');
    const selectAdminEliminar = document.getElementById('select-admin-eliminar');

    // Función para cargar todos los administradores en el select
    const cargarAdministradoresParaEliminar = async () => {
        try {
            const response = await fetch('http://localhost:3000/api/admin/all');
            if (!response.ok) {
                console.error('No se pudieron cargar los administradores para eliminar.');
                return;
            }
            const administradores = await response.json();

            // Limpiar y añadir opción por defecto
            selectAdminEliminar.innerHTML = '<option value="">-- Seleccione un administrador --</option>';

            administradores.forEach(admin => {
                const option = document.createElement('option');
                option.value = admin.idAdministrador;
                option.textContent = `${admin.Nombre} (${admin.Correo})`;
                selectAdminEliminar.appendChild(option);
            });
        } catch (error) {
            console.error('Error de conexión al cargar administradores para eliminar:', error);
            adminEliminarMessageDiv.textContent = 'Error al cargar administradores.';
            adminEliminarMessageDiv.style.color = 'red';
        }
    };

    // Event listener para el envío del formulario de eliminación
    if (formEliminarAdmin) {
        formEliminarAdmin.addEventListener('submit', async (event) => {
            event.preventDefault();

            const idAdministrador = document.getElementById('select-admin-eliminar').value;

            if (!idAdministrador) {
                adminEliminarMessageDiv.textContent = 'Por favor, seleccione un administrador para eliminar.';
                adminEliminarMessageDiv.style.color = 'red';
                return;
            }

            if (confirm('¿Estás seguro de que deseas eliminar este administrador? Esta acción no se puede deshacer.')) {
                try {
                    const response = await fetch(`http://localhost:3000/api/admin/${idAdministrador}`, {
                        method: 'DELETE'
                    });

                    const resultado = await response.json();

                    if (response.ok) {
                        adminEliminarMessageDiv.textContent = resultado.message;
                        adminEliminarMessageDiv.style.color = 'green';

                        // Recargar la lista de administradores
                        cargarAdministradoresParaEliminar();
                    } else {
                        adminEliminarMessageDiv.textContent = `Error: ${resultado.message}`;
                        adminEliminarMessageDiv.style.color = 'red';
                    }
                } catch (error) {
                    console.error('Error al eliminar administrador:', error);
                    adminEliminarMessageDiv.textContent = 'Error de conexión al intentar eliminar el administrador.';
                    adminEliminarMessageDiv.style.color = 'red';
                }
            }
        });
    }

    // Cargar los administradores al iniciar la página para la sección de eliminación
    if (selectAdminEliminar) {
        cargarAdministradoresParaEliminar();
    }
});
