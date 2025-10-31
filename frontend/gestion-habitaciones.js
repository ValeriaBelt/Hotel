document.addEventListener('DOMContentLoaded', () => {
    const editForm = document.getElementById('form-edit-habitacion');
    const messageDiv = document.getElementById('edit-message');
    const habitacionSelect = document.getElementById('habitacion-select');
    const tipoInput = document.getElementById('tipo');
    const precioInput = document.getElementById('precio');
    const serviciosCheckboxes = document.querySelectorAll('input[name="servicios"]');    
    let habitaciones = []; 

    // Función para limpiar todos los campos del formulario
    const limpiarFormulario = () => {
        habitacionSelect.value = '';
        tipoInput.value = '';
        precioInput.value = '';
        serviciosCheckboxes.forEach(checkbox => checkbox.checked = false);
    };
    const cargarHabitaciones = async () => {
        try {
            const response = await fetch('http://localhost:3000/api/habitaciones/all');
            if (!response.ok) {
                messageDiv.textContent = 'Error al cargar las habitaciones.';
                messageDiv.style.color = 'red';
                return;
            }
            habitaciones = await response.json();
            habitaciones.forEach(hab => {
                const option = document.createElement('option');
                option.value = hab.idHabitacion;
                option.textContent = `Habitación N° ${hab.NumeroHabitacion}`;
                habitacionSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Error de conexión al cargar habitaciones:', error);
            messageDiv.textContent = 'No se pudo conectar con el servidor para cargar las habitaciones.';
            messageDiv.style.color = 'red';
        }
    };

    habitacionSelect.addEventListener('change', () => {
        const selectedId = habitacionSelect.value;
        messageDiv.textContent = ''; 
        if (!selectedId) {
            limpiarFormulario();
            return;
        }
        const habitacionSeleccionada = habitaciones.find(h => h.idHabitacion.toString() === selectedId);
        if (habitacionSeleccionada) {
            tipoInput.value = habitacionSeleccionada.Tipo;
            precioInput.value = habitacionSeleccionada.PrecioPorNoche;

            // Limpiar checkboxes antes de setear los nuevos
            serviciosCheckboxes.forEach(checkbox => checkbox.checked = false);

            // Marcar los checkboxes según la descripción
            const serviciosGuardados = habitacionSeleccionada.Descripcion.split(',').map(s => s.trim());
            serviciosCheckboxes.forEach(checkbox => {
                if (serviciosGuardados.includes(checkbox.value)) {
                    checkbox.checked = true;
                }
            });
        }
    });

    editForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const idHabitacion = habitacionSelect.value;

        if (!idHabitacion) {
            messageDiv.textContent = 'Por favor, selecciona una habitación para actualizar.';
            messageDiv.style.color = 'red';
            return;
        }

        // Recolectar los servicios seleccionados
        const serviciosSeleccionados = Array.from(serviciosCheckboxes)
            .filter(checkbox => checkbox.checked)
            .map(checkbox => checkbox.value);

        const habitacionData = {
            tipo: tipoInput.value,
            descripcion: serviciosSeleccionados.join(', '), 
            precio: parseFloat(precioInput.value),
        };

        try {
            const response = await fetch(`http://localhost:3000/api/habitaciones/${idHabitacion}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(habitacionData),
            });
            const result = await response.json();
            messageDiv.textContent = result.message;
            messageDiv.style.color = response.ok ? 'green' : 'red';

            if (response.ok) {
                // Si la actualización fue exitosa, limpiamos el formulario
                limpiarFormulario();
            }

        } catch (error) {
            console.error('Error de conexión al actualizar:', error);
            messageDiv.textContent = 'No se pudo conectar con el servidor para actualizar.';
            messageDiv.style.color = 'red';
        }
    });

    cargarHabitaciones();
});
