document.addEventListener('DOMContentLoaded', () => {
    // Elementos para la sección de actualización
    const updateForm = document.getElementById('form-update-habitacion');
    const tipoSelect = document.getElementById('update-tipo');
    const serviciosCheckboxes = document.querySelectorAll('#update-servicios-container input[name="servicios"]');
    const updateMessageDiv = document.getElementById('update-message');
    const selectHabitacionUpdate = document.getElementById('select-habitacion-update');
    let currentHabitacionIdToUpdate = null; // Para almacenar el ID de la habitación seleccionada

    // --- Funcionalidad para Actualizar Habitación ---

    // Función para cargar todas las habitaciones en el select
    const cargarHabitacionesParaUpdate = async () => {
        try {
            const response = await fetch('http://localhost:3000/api/habitaciones/all');
            if (!response.ok) {
                console.error('No se pudieron cargar las habitaciones para actualizar.');
                return;
            }
            const habitaciones = await response.json();
            selectHabitacionUpdate.innerHTML = '<option value="">-- Seleccione una habitación --</option>'; // Limpiar y añadir opción por defecto
            habitaciones.forEach(hab => {
                const option = document.createElement('option');
                option.value = hab.idHabitacion;
                option.textContent = `Habitación N° ${hab.NumeroHabitacion}`;
                selectHabitacionUpdate.appendChild(option);
            });
        } catch (error) {
            console.error('Error de conexión al cargar habitaciones para update:', error);
            updateMessageDiv.textContent = 'Error al cargar habitaciones.';
            updateMessageDiv.style.color = 'red';
        }
    };

    // Función para limpiar y reiniciar el formulario de actualización
    const limpiarFormulario = () => {
        selectHabitacionUpdate.value = ''; // Reinicia el selector principal
        document.getElementById('update-numero').value = '';
        tipoSelect.value = '';
        serviciosCheckboxes.forEach(checkbox => checkbox.checked = false);
        document.getElementById('update-precio').value = '';
        document.getElementById('update-id-habitacion').value = '';
        currentHabitacionIdToUpdate = null;
    };

    // Función para cargar los detalles de una habitación seleccionada en el formulario
    const cargarDetallesHabitacionParaUpdate = async (idHabitacion) => {
        if (!idHabitacion) { // Si se deselecciona una habitación
            limpiarFormulario();
            return;
        }

        try {
            const response = await fetch(`http://localhost:3000/api/habitaciones/${idHabitacion}`);
            if (!response.ok) {
                updateMessageDiv.textContent = 'No se pudieron cargar los detalles de la habitación.';
                updateMessageDiv.style.color = 'red';
                return;
            }
            const habitacion = await response.json();
            document.getElementById('update-numero').value = habitacion.NumeroHabitacion;
            
            // --- Lógica mejorada para seleccionar el tipo de habitación ---
            const tipoGuardado = habitacion.Tipo || '';
            let tipoEncontrado = false;
            // Recorremos las opciones del select
            for (let i = 0; i < tipoSelect.options.length; i++) {
                // Si el texto de la opción (ej: "1 Cama Doble") incluye el tipo guardado (ej: "Doble")
                if (tipoGuardado && tipoSelect.options[i].value.includes(tipoGuardado)) {
                    tipoSelect.value = tipoSelect.options[i].value;
                    tipoEncontrado = true;
                    break; // Salimos del bucle una vez encontrado
                }
            }
            if (!tipoEncontrado) tipoSelect.value = ''; // Si no se encuentra, se deja en blanco

            // Limpiar checkboxes antes de marcar los correctos
            serviciosCheckboxes.forEach(checkbox => checkbox.checked = false);
            // Marcar los checkboxes según la descripción de la BD
            if (habitacion.Descripcion) {
                const serviciosGuardados = habitacion.Descripcion.split(',').map(s => s.trim());
                serviciosCheckboxes.forEach(checkbox => {
                    if (serviciosGuardados.includes(checkbox.value)) checkbox.checked = true;
                });
            }
            document.getElementById('update-precio').value = habitacion.PrecioPorNoche;
            document.getElementById('update-id-habitacion').value = habitacion.idHabitacion;
            currentHabitacionIdToUpdate = habitacion.idHabitacion;
            updateMessageDiv.textContent = ''; // Limpiar mensajes
        } catch (error) {
            console.error('Error al cargar detalles de habitación para update:', error);
            updateMessageDiv.textContent = 'Error al conectar con el servidor para cargar detalles.';
            updateMessageDiv.style.color = 'red';
        }
    };

    // Event listener para el cambio en el select de habitaciones
    if (selectHabitacionUpdate) {
        selectHabitacionUpdate.addEventListener('change', (event) => {
            cargarDetallesHabitacionParaUpdate(event.target.value);
        });
    }

    // Event listener para el envío del formulario de actualización
    if (updateForm) {
        updateForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            if (!currentHabitacionIdToUpdate) {
                updateMessageDiv.textContent = 'Por favor, seleccione una habitación para actualizar.';
                updateMessageDiv.style.color = 'red';
                return;
            }

            const updateData = {};
            const tipo = tipoSelect.value;
            // Recolectar los servicios seleccionados y unirlos en un string
            const serviciosSeleccionados = Array.from(serviciosCheckboxes)
                .filter(checkbox => checkbox.checked)
                .map(checkbox => checkbox.value)
                .join(', ');

            const precio = document.getElementById('update-precio').value;

            if (tipo !== null && tipo.trim() !== '') updateData.tipo = tipo;
            if (serviciosSeleccionados !== null) updateData.descripcion = serviciosSeleccionados;
            if (precio !== null && precio !== '') updateData.precio = precio;

            if (Object.keys(updateData).length === 0) {
                updateMessageDiv.textContent = 'No se proporcionaron campos para actualizar.';
                updateMessageDiv.style.color = 'orange';
                return;
            }

            try {
                const response = await fetch(`http://localhost:3000/api/habitaciones/${currentHabitacionIdToUpdate}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(updateData),
                });

                const result = await response.json();

                if (response.ok) {
                    updateMessageDiv.textContent = 'La habitación ha sido actualizada correctamente.';
                    updateMessageDiv.style.color = 'green';
                    
                    // Limpiamos el formulario para una nueva edición
                    limpiarFormulario();
                    cargarHabitacionesParaUpdate(); // Recargamos la lista por si cambió algún dato relevante
                } else {
                    updateMessageDiv.textContent = result.message || 'Error al actualizar la habitación.';
                    updateMessageDiv.style.color = 'red';
                }
            } catch (error) {
                console.error('Error de conexión al actualizar:', error);
                updateMessageDiv.textContent = 'No se pudo conectar con el servidor para actualizar.';
                updateMessageDiv.style.color = 'red';
            }
        });
    }

    // Cargar las habitaciones al iniciar la página para la sección de actualización
    if (selectHabitacionUpdate) {
        cargarHabitacionesParaUpdate();
    }
});
