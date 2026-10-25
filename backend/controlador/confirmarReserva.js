document.addEventListener('DOMContentLoaded', async () => {
    const detalleContainer = document.getElementById('detalle-reserva-container'); 
    const mensajeConfirmacion = document.getElementById('mensaje-confirmacion');
    const formConfirmar = document.getElementById('form-confirmar-reserva');    
    const params = new URLSearchParams(window.location.search);
    const idHabitacion = params.get('id');
    const fechaLlegada = params.get('llegada');
    const fechaSalida = params.get('salida');

    if (!idHabitacion || !fechaLlegada || !fechaSalida) {
        detalleContainer.innerHTML = '<p style="color: red;">Faltan datos para mostrar la reserva. Por favor, vuelve a intentarlo.</p>';
        return;
    }

    
    try {
        const response = await fetch(window.hotelApiUrl(`/api/habitaciones/${idHabitacion}`));
        if (!response.ok) {
            throw new Error('No se pudo cargar la información de la habitación.');
        }
        const habitacion = await response.json();

        
        const llegada = new Date(fechaLlegada);
        const salida = new Date(fechaSalida);
        const diffTime = Math.abs(salida - llegada);
        const noches = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const precioTotal = noches * habitacion.PrecioPorNoche;

        const createDetail = (label, value) => {
            const paragraph = document.createElement('p');
            const heading = document.createElement('strong');
            heading.textContent = `${label}: `;
            paragraph.append(heading, value);
            return paragraph;
        };
        const roomDetail = createDetail(
            'Habitación',
            `N° ${habitacion.NumeroHabitacion} - ${habitacion.Tipo}`
        );
        const priceBreak = document.createElement('hr');
        detalleContainer.replaceChildren(
            roomDetail,
            createDetail('Fecha de Llegada', fechaLlegada),
            createDetail('Fecha de Salida', fechaSalida),
            createDetail('Total Noches', String(noches)),
            createDetail('Precio por Noche', `$${new Intl.NumberFormat('es-CO').format(habitacion.PrecioPorNoche)}`),
            priceBreak,
            createDetail('Precio Total de la Estancia', `$${new Intl.NumberFormat('es-CO').format(precioTotal)}`)
        );

    } catch (error) {
        console.error('Error:', error);
        detalleContainer.textContent = error.message;
        detalleContainer.style.color = 'red';
    }

    
    formConfirmar.addEventListener('submit', async (event) => {
        event.preventDefault();
        
        const nombreCliente = document.getElementById('nombre-cliente').value;
        const emailCliente = document.getElementById('email-cliente').value;
        const telefonoCliente = document.getElementById('telefono').value;

        
        const telefonoRegex = /^\d{10}$/;
        if (!telefonoRegex.test(telefonoCliente)) {
            mensajeConfirmacion.textContent = 'El teléfono debe contener exactamente 10 dígitos numéricos.';
            mensajeConfirmacion.style.color = 'red';
            return;
        }

        const datosReserva = {
            idHabitacion: idHabitacion,
            fechaLlegada: fechaLlegada,
            fechaSalida: fechaSalida,
            nombre: nombreCliente,
            email: emailCliente,
            telefono: telefonoCliente
        };

        try {
            const response = await fetch(window.hotelApiUrl('/api/reservas'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(datosReserva),
            });

            const resultado = await response.json();

            if (response.ok) {
                const message = document.createElement('p');
                message.style.color = 'green';
                message.style.fontWeight = 'bold';
                message.textContent = `${resultado.message} ¡Gracias por su reserva! Guarda el código siguiente: solo se muestra una vez y lo necesitarás para consultar o cancelar.`;
                const codeLabel = document.createElement('p');
                codeLabel.textContent = 'Código de gestión:';
                const code = document.createElement('code');
                code.textContent = resultado.managementCode;
                code.style.wordBreak = 'break-all';
                codeLabel.appendChild(document.createElement('br'));
                codeLabel.appendChild(code);
                const warning = document.createElement('p');
                warning.textContent = 'Guárdalo ahora. Sin este código, no podrás consultar ni cancelar la reserva desde la página.';
                mensajeConfirmacion.replaceChildren(message, codeLabel, warning);
                formConfirmar.reset(); 
                formConfirmar.style.display = 'none'; 
            } else {
                mensajeConfirmacion.textContent = `Error: ${resultado.message}`;
                mensajeConfirmacion.style.color = 'red';
            }
        } catch (error) {
            console.error('Error al confirmar la reserva:', error);
            mensajeConfirmacion.textContent = 'No se pudo conectar con el servidor para confirmar la reserva.';
            mensajeConfirmacion.style.color = 'red';
        }
    });
});