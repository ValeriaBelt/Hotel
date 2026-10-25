document.addEventListener('DOMContentLoaded', () => {
    const welcomeMessageContainer = document.getElementById('welcome-message');
    const panelNavegacion = document.getElementById('panel-navegacion');
    const panelContent = document.getElementById('admin-content');
    const frontendPath = window.location.pathname.includes('/frontend/') ? '/frontend/' : '/';

    
    if (panelNavegacion) {
        panelNavegacion.addEventListener('click', (event) => {
            
            if (event.target.tagName === 'BUTTON' && event.target.dataset.target) {
                const targetId = event.target.dataset.target; 
                const seccion = document.getElementById(targetId);

                if (seccion) {
                    if (targetId === 'seccion-bitacora-seguridad') {
                        seccion.hidden = false;
                        seccion.dispatchEvent(new Event('security-audit-open'));
                    }
                    seccion.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }
        });
    }

    fetch(window.hotelApiUrl('/api/admin/session'), { credentials: 'include' })
        .then(async response => {
            if (!response.ok) {
                window.location.href = `${frontendPath}administrador.html`;
                return null;
            }
            return response.json();
        })
        .then(data => {
            if (!data) return;
            currentAdminId = Number(data.admin.id);
            const role = data.admin.Rol || 'Administrador';
            welcomeMessageContainer.textContent = `¡Bienvenido, ${data.admin.Nombre}! | Perfil: ${role}`;
            panelContent.hidden = false;

            if (role === 'Administrador') {
                if (selectAdminEliminar) {
                    cargarAdministradoresParaEliminar();
                    cargarPerfilesAdministrador();
                }
            } else {
                for (const sectionId of [
                    'seccion-bitacora-seguridad',
                    'seccion-crear-admin',
                    'seccion-eliminar-admin'
                ]) {
                    const section = document.getElementById(sectionId);
                    const navigationButton = panelNavegacion.querySelector(`[data-target="${sectionId}"]`);
                    if (section) section.hidden = true;
                    if (navigationButton) navigationButton.closest('.form-submit-container').hidden = true;
                }
            }
        })
        .catch(error => {
            console.error('No se pudo comprobar la sesión del administrador:', error);
            window.location.href = `${frontendPath}administrador.html`;
        });

    //Crear Reservas desde el Panel de Admin 

    const formBuscarDisponibilidad = document.getElementById('form-buscar-disponibilidad-admin');
    const resultadosContainer = document.getElementById('resultados-disponibilidad-admin');
    const tipoHabitacionSelect = document.getElementById('tipo-habitacion-admin');
    const reservaMessageDiv = document.getElementById('reserva-message');    
    const modal = document.getElementById('modal-reserva');
    const modalCloseButton = document.querySelector('.close-button');
    const detalleReservaModal = document.getElementById('detalle-reserva-modal');
    const formConfirmarReserva = document.getElementById('form-confirmar-reserva-admin');
    const mensajeConfirmacionModal = document.getElementById('mensaje-confirmacion-modal');

    let datosReservaActual = {}; 

    // Cargar tipos de habitación en el select
    const cargarTiposHabitacion = async () => {
        try {
            const response = await fetch(window.hotelApiUrl('/api/habitaciones/tipos'));
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
            const response = await fetch(window.hotelApiUrl(`/api/habitaciones/disponibles?${query}`));
            const habitaciones = await response.json();

            reservaMessageDiv.textContent = '';
            resultadosContainer.innerHTML = '';

            if (habitaciones.length === 0) {
                resultadosContainer.textContent = 'No hay habitaciones disponibles para las fechas y tipo seleccionados.';
                return;
            }

            habitaciones.forEach(hab => {
                const card = document.createElement('div');
                card.className = 'muestra';
                const imageLink = document.createElement('a');
                imageLink.href = 'img/Habitacion1CamaDoble.jpg';
                imageLink.target = '_blank';
                imageLink.rel = 'noopener';
                const image = document.createElement('img');
                image.src = 'img/Habitacion1CamaDoble.jpg';
                image.alt = hab.Tipo;
                image.width = 500;
                image.height = 300;
                imageLink.appendChild(image);

                const description = document.createElement('div');
                description.className = 'descripcion';
                const title = document.createElement('p');
                const roomNumber = document.createElement('b');
                roomNumber.textContent = `Habitación N° ${hab.NumeroHabitacion}`;
                title.append(roomNumber, ` - ${hab.Tipo}`);
                const details = document.createElement('p');
                details.textContent = hab.Descripcion || '';
                const price = document.createElement('p');
                const priceLabel = document.createElement('b');
                priceLabel.textContent = 'Precio: ';
                price.append(priceLabel, `$${new Intl.NumberFormat('es-CO').format(hab.PrecioPorNoche)} / noche`);
                const reserveButton = document.createElement('button');
                reserveButton.type = 'button';
                reserveButton.className = 'btn-reservar-admin';
                reserveButton.dataset.id = hab.idHabitacion;
                reserveButton.textContent = 'Reservar';
                description.append(title, details, price, reserveButton);
                card.append(imageLink, description);
                resultadosContainer.appendChild(card);
            });

        } catch (error) {
            console.error('Error al buscar disponibilidad:', error);
            reservaMessageDiv.textContent = 'Ocurrió un error al buscar la disponibilidad. Inténtalo de nuevo.';
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
                const response = await fetch(window.hotelApiUrl(`/api/habitaciones/${idHabitacion}`));
                const habitacion = await response.json();

                const llegada = new Date(fechaLlegada);
                const salida = new Date(fechaSalida);
                const noches = Math.ceil(Math.abs(salida - llegada) / (1000 * 60 * 60 * 24));
                const precioTotal = noches * habitacion.PrecioPorNoche;

                const createDetail = (label, value) => {
                    const paragraph = document.createElement('p');
                    const heading = document.createElement('strong');
                    heading.textContent = `${label}: `;
                    paragraph.append(heading, value);
                    return paragraph;
                };
                detalleReservaModal.replaceChildren(
                    createDetail('Habitación', `N° ${habitacion.NumeroHabitacion} - ${habitacion.Tipo}`),
                    createDetail('Fecha de Llegada', fechaLlegada),
                    createDetail('Fecha de Salida', fechaSalida),
                    createDetail('Total Noches', String(noches)),
                    createDetail('Precio Total', `$${new Intl.NumberFormat('es-CO').format(precioTotal)}`)
                );

                formConfirmarReserva.reset();
                mensajeConfirmacionModal.replaceChildren();
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
            mensajeConfirmacionModal.textContent = 'El teléfono debe contener exactamente 10 dígitos numéricos.';
            mensajeConfirmacionModal.style.color = 'red';
            return;
        }

        const payload = { ...datosReservaActual, ...datosCliente };

        try {
            const response = await fetch(window.hotelApiUrl('/api/reservas'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const resultado = await response.json();

            if (response.ok) {
                const message = document.createElement('p');
                message.textContent = resultado.message;
                message.style.color = 'green';
                mensajeConfirmacionModal.replaceChildren(message);
                if (resultado.managementCode) {
                    const codeLabel = document.createElement('p');
                    codeLabel.textContent = 'Código de gestión para entregar al cliente (se muestra una sola vez):';
                    const code = document.createElement('code');
                    code.textContent = resultado.managementCode;
                    code.style.wordBreak = 'break-all';
                    codeLabel.append(document.createElement('br'), code);
                    mensajeConfirmacionModal.appendChild(codeLabel);
                }
                formConfirmarReserva.reset();
            } else {
                mensajeConfirmacionModal.textContent = `Error: ${resultado.message}`;
                mensajeConfirmacionModal.style.color = 'red';
            }
        } catch (error) {
            console.error('Error al crear la reserva:', error);
            mensajeConfirmacionModal.textContent = 'No se pudo conectar con el servidor para crear la reserva.';
            mensajeConfirmacionModal.style.color = 'red';
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
            const response = await fetch(window.hotelApiUrl('/api/admin/reservas/buscar'), {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ termino })
            });
            const reservas = await response.json();
            if (!response.ok) {
                throw new Error(reservas.message || 'No se pudieron buscar las reservas.');
            }

            gestionMessageDiv.textContent = '';
            resultadosReservasContainer.replaceChildren();

            if (reservas.length === 0) {
                resultadosReservasContainer.textContent = 'No se encontraron reservas para el término de búsqueda proporcionado.';
                return;
            }

            const tabla = document.createElement('table');
            tabla.className = 'tabla-reservas';
            const header = document.createElement('tr');
            for (const label of ['Cliente', 'Email', 'Teléfono', 'Habitación', 'Llegada', 'Salida', 'Acción']) {
                const cell = document.createElement('th');
                cell.textContent = label;
                header.appendChild(cell);
            }
            const tableHead = document.createElement('thead');
            tableHead.appendChild(header);
            tabla.appendChild(tableHead);

            const tableBody = document.createElement('tbody');
            for (const reservation of reservas) {
                const row = document.createElement('tr');
                row.dataset.idReserva = reservation.idReserva;
                const values = [
                    reservation.Nombre,
                    reservation.Email,
                    reservation.Telefono,
                    `N° ${reservation.NumeroHabitacion} (${reservation.Tipo})`,
                    new Date(reservation.FechaEntrada).toLocaleDateString(),
                    new Date(reservation.FechaSalida).toLocaleDateString()
                ];
                for (const value of values) {
                    const cell = document.createElement('td');
                    cell.textContent = value ?? '';
                    row.appendChild(cell);
                }
                const actionCell = document.createElement('td');
                const cancelButton = document.createElement('button');
                cancelButton.className = 'btn-cancelar';
                cancelButton.dataset.id = reservation.idReserva;
                cancelButton.textContent = 'Cancelar';
                actionCell.appendChild(cancelButton);
                row.appendChild(actionCell);
                tableBody.appendChild(row);
            }
            tabla.appendChild(tableBody);
            resultadosReservasContainer.appendChild(tabla);

            // Limpiamos el formulario de búsqueda de reservas
            formBuscarReservas.reset();

        } catch (error) {
            console.error('Error al buscar reservas:', error);
            gestionMessageDiv.textContent = error.message || 'Error al conectar con el servidor para buscar reservas.';
            gestionMessageDiv.style.color = 'red';
        }
    });

    // Event listener para los botones de cancelar (usando delegación de eventos)
    resultadosReservasContainer.addEventListener('click', async (event) => {
        const button = event.target.closest('.btn-cancelar');
        if (button && resultadosReservasContainer.contains(button)) {
            const idReserva = button.dataset.id;
            
            if (confirm('¿Estás seguro de que deseas cancelar esta reserva? Esta acción no se puede deshacer.')) {
                const managementCode = prompt('Ingresa el código de gestión que entregó el cliente para esta reserva:');
                if (managementCode === null) {
                    return;
                }
                try {
                    const response = await fetch(window.hotelApiUrl(`/api/admin/reservas/${idReserva}`), {
                        method: 'DELETE',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ managementCode: managementCode.trim() })
                    });
                    const resultado = await response.json();

                    if (response.ok) {
                        gestionMessageDiv.textContent = resultado.message;
                        gestionMessageDiv.style.color = 'green';
                        // Eliminar la fila de la tabla
                        button.closest('tr').remove();
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
            const rol = document.getElementById('rol-admin').value;

            if (!nombre || !telefono || !correo || !clave) {
                adminMessageDiv.textContent = 'Todos los campos son obligatorios.';
                adminMessageDiv.style.color = 'red';
                return;
            }

            // Validar la fortaleza de la contraseña
            if (clave.length < 12 || clave.length > 128) {
                adminMessageDiv.textContent = 'La contraseña debe tener entre 12 y 128 caracteres.';
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
                const response = await fetch(window.hotelApiUrl('/api/admin/register'), {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nombre, telefono, correo, clave, rol }),
                });

                const resultado = await response.json();

                adminMessageDiv.textContent = response.ok && resultado.rol
                    ? `${resultado.message} Rol asignado: ${resultado.rol}.`
                    : resultado.message;
                adminMessageDiv.style.color = response.ok ? 'green' : 'red';

                if (response.ok) {
                    formCrearAdmin.reset();
                    await cargarPerfilesAdministrador();
                    await cargarAdministradoresParaEliminar();
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
    const adminList = document.getElementById('admin-list');
    const adminListMessage = document.getElementById('admin-list-message');
    let currentAdminId = null;

    const cargarPerfilesAdministrador = async () => {
        try {
            const response = await fetch(window.hotelApiUrl('/api/admin/all'), { credentials: 'include' });
            const administradores = await response.json();
            if (!response.ok) {
                throw new Error(administradores.message || 'No se pudieron cargar los perfiles.');
            }

            const table = document.createElement('table');
            const header = document.createElement('tr');
            for (const label of ['Nombre', 'Correo', 'Rol', 'Acción']) {
                const cell = document.createElement('th');
                cell.textContent = label;
                header.appendChild(cell);
            }
            table.appendChild(header);

            administradores.forEach(admin => {
                const row = document.createElement('tr');
                for (const value of [admin.Nombre, admin.Correo]) {
                    const cell = document.createElement('td');
                    cell.textContent = value || '';
                    row.appendChild(cell);
                }

                const roleCell = document.createElement('td');
                const roleSelect = document.createElement('select');
                roleSelect.setAttribute('aria-label', `Rol de ${admin.Nombre}`);
                for (const role of ['Administrador', 'Operador']) {
                    const option = document.createElement('option');
                    option.value = role;
                    option.textContent = role;
                    option.selected = role === admin.Rol;
                    roleSelect.appendChild(option);
                }
                roleCell.appendChild(roleSelect);
                row.appendChild(roleCell);

                const actionCell = document.createElement('td');
                const saveButton = document.createElement('button');
                saveButton.type = 'button';
                saveButton.textContent = 'Guardar rol';
                saveButton.dataset.adminId = admin.idAdministrador;
                saveButton.disabled = Number(admin.idAdministrador) === Number(currentAdminId);
                actionCell.appendChild(saveButton);
                row.appendChild(actionCell);
                table.appendChild(row);
            });
            adminList.replaceChildren(table);
            adminListMessage.textContent = '';

            table.addEventListener('click', async event => {
                const button = event.target.closest('button[data-admin-id]');
                if (!button || !table.contains(button)) {
                    return;
                }

                const row = button.closest('tr');
                const selectedRole = row.querySelector('select').value;
                button.disabled = true;
                adminListMessage.textContent = 'Guardando rol…';
                adminListMessage.style.color = '';
                try {
                    const response = await fetch(window.hotelApiUrl(`/api/admin/${button.dataset.adminId}/role`), {
                        method: 'PUT',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ rol: selectedRole })
                    });
                    const result = await response.json();
                    if (!response.ok) {
                        throw new Error(result.message || 'No se pudo actualizar el rol.');
                    }

                    adminListMessage.textContent = result.message;
                    adminListMessage.style.color = 'green';
                    await cargarPerfilesAdministrador();
                    await cargarAdministradoresParaEliminar();
                } catch (error) {
                    console.error('Error al actualizar el rol:', error);
                    adminListMessage.textContent = error.message;
                    adminListMessage.style.color = 'red';
                    button.disabled = false;
                }
            });
        } catch (error) {
            console.error('Error al cargar perfiles y roles:', error);
            adminListMessage.textContent = error.message;
            adminListMessage.style.color = 'red';
        }
    };

    // Función para cargar todos los administradores en el select
    const cargarAdministradoresParaEliminar = async () => {
        try {
            const response = await fetch(window.hotelApiUrl('/api/admin/all'), { credentials: 'include' });
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
                option.textContent = `${admin.Nombre} (${admin.Correo}) - ${admin.Rol}`;
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
                    const response = await fetch(window.hotelApiUrl(`/api/admin/${idAdministrador}`), {
                        method: 'DELETE',
                        credentials: 'include'
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
});
