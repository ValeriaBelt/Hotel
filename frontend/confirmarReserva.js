document.addEventListener('DOMContentLoaded', async () => {
    const detalleContainer = document.getElementById('detalle-reserva-container'); // Corregido el ID
    const mensajeConfirmacion = document.getElementById('mensaje-confirmacion');
    const formConfirmar = document.getElementById('form-confirmar-reserva');

    // 1. Obtener los parámetros de la URL
    const params = new URLSearchParams(window.location.search);
    const idHabitacion = params.get('id');
    const fechaLlegada = params.get('llegada');
    const fechaSalida = params.get('salida');

    if (!idHabitacion || !fechaLlegada || !fechaSalida) {
        detalleContainer.innerHTML = '<p style="color: red;">Faltan datos para mostrar la reserva. Por favor, vuelve a intentarlo.</p>';
        return;
    }

    // 2. Cargar y mostrar los detalles de la habitación y la reserva
    try {
        const response = await fetch(`http://localhost:3000/api/habitaciones/${idHabitacion}`);
        if (!response.ok) {
            throw new Error('No se pudo cargar la información de la habitación.');
        }
        const habitacion = await response.json();

        // Calcular el número de noches
        const llegada = new Date(fechaLlegada);
        const salida = new Date(fechaSalida);
        const diffTime = Math.abs(salida - llegada);
        const noches = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const precioTotal = noches * habitacion.PrecioPorNoche;

        const detalleHTML = `
            <p><strong>Habitación:</strong> N° ${habitacion.NumeroHabitacion} - ${habitacion.Tipo}</p>
            <p><strong>Fecha de Llegada:</strong> ${fechaLlegada}</p>
            <p><strong>Fecha de Salida:</strong> ${fechaSalida}</p>
            <p><strong>Total Noches:</strong> ${noches}</p>
            <p><strong>Precio por Noche:</strong> $${new Intl.NumberFormat('es-CO').format(habitacion.PrecioPorNoche)}</p>
            <hr>
            <p><strong>Precio Total de la Estancia:</strong> $${new Intl.NumberFormat('es-CO').format(precioTotal)}</p>
        `;
        detalleContainer.innerHTML = detalleHTML;

    } catch (error) {
        console.error('Error:', error);
        detalleContainer.innerHTML = `<p style="color: red;">${error.message}</p>`;
    }

    // 3. Manejar el envío del formulario de confirmación
    formConfirmar.addEventListener('submit', async (event) => {
        event.preventDefault();
        
        const nombreCliente = document.getElementById('nombre-cliente').value;
        const emailCliente = document.getElementById('email-cliente').value;
        const telefonoCliente = document.getElementById('telefono').value;

        const datosReserva = {
            idHabitacion: idHabitacion,
            fechaLlegada: fechaLlegada,
            fechaSalida: fechaSalida,
            nombre: nombreCliente,
            email: emailCliente,
            telefono: telefonoCliente
        };

        try {
            const response = await fetch('http://localhost:3000/api/reservas', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(datosReserva),
            });

            const resultado = await response.json();

            if (response.ok) {
                mensajeConfirmacion.innerHTML = `<p style="color: green; font-weight: bold;">${resultado.message} ¡Gracias por su reserva!</p>`;
                formConfirmar.reset(); // Limpiar el formulario
                formConfirmar.style.display = 'none'; // Ocultar el formulario
            } else {
                mensajeConfirmacion.innerHTML = `<p style="color: red;">Error: ${resultado.message}</p>`;
            }
        } catch (error) {
            console.error('Error al confirmar la reserva:', error);
            mensajeConfirmacion.innerHTML = '<p style="color: red;">No se pudo conectar con el servidor para confirmar la reserva.</p>';
        }
    });
});