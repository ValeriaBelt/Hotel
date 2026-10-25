document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('form-buscar-disponibilidad');
    const resultadosDiv = document.getElementById('resultados-disponibilidad');
    const tipoHabitacionSelect = document.getElementById('tipo-habitacion');

    
    const cargarTiposHabitacion = async () => {
        try {
            const response = await fetch(window.hotelApiUrl('/api/habitaciones/tipos'));
            if (!response.ok) {
                console.error('No se pudieron cargar los tipos de habitación.');
                return;
            }
            const tipos = await response.json();
            tipos.forEach(tipo => {
                const option = document.createElement('option');
                option.value = tipo.Tipo;
                option.textContent = tipo.Tipo;
                tipoHabitacionSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Error de conexión al cargar tipos:', error);
        }
    };

    
    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const fechaLlegada = document.getElementById('fecha-llegada').value;
        const fechaSalida = document.getElementById('fecha-salida').value;
        const tipo = tipoHabitacionSelect.value;

        if (!fechaLlegada || !fechaSalida) {
            resultadosDiv.textContent = 'Debes seleccionar una fecha de llegada y de salida.';
            resultadosDiv.style.color = 'red';
            return;
        }


        const url = new URL(window.hotelApiUrl('/api/habitaciones/disponibles'));
        url.searchParams.append('llegada', fechaLlegada);
        url.searchParams.append('salida', fechaSalida);
        if (tipo) {
            url.searchParams.append('tipo', tipo);
        }

        try {
            resultadosDiv.textContent = 'Buscando…';
            resultadosDiv.style.color = '';
            const response = await fetch(url);

            
            if (!response.ok) {
                const errorData = await response.json(); 
                throw new Error(errorData.message || `Error del servidor: ${response.status}`);
            }

            const habitaciones = await response.json();
            mostrarResultados(habitaciones, fechaLlegada, fechaSalida);

        } catch (error) {
            console.error('Error al buscar disponibilidad:', error);
            resultadosDiv.textContent = error.message || 'Error al conectar con el servidor.';
            resultadosDiv.style.color = 'red';
        }
    });

    
    const mostrarResultados = (habitaciones, fechaLlegada, fechaSalida) => {
        if (habitaciones.length === 0) {
            resultadosDiv.textContent = 'No hay habitaciones disponibles para las fechas o el tipo seleccionado.';
            return;
        }

        resultadosDiv.replaceChildren();
        resultadosDiv.style.color = '';

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
            price.append(priceLabel, `$${new Intl.NumberFormat('es-CO').format(hab.PrecioPorNoche)}/noche`);
            const reserveButton = document.createElement('button');
            reserveButton.type = 'button';
            reserveButton.className = 'btn-reservar';
            reserveButton.dataset.habitacionId = hab.idHabitacion;
            reserveButton.dataset.fechaLlegada = fechaLlegada;
            reserveButton.dataset.fechaSalida = fechaSalida;
            reserveButton.textContent = 'Reservar ahora';
            description.append(title, details, price, reserveButton);
            card.append(imageLink, description);
            resultadosDiv.appendChild(card);
        });
    };

    // Event listener para los botones "Reservar ahora" usando delegación de eventos
    resultadosDiv.addEventListener('click', (event) => {
        const button = event.target.closest('.btn-reservar');
        if (button && resultadosDiv.contains(button)) {

            const habitacionId = button.dataset.habitacionId;
            const fechaLlegada = button.dataset.fechaLlegada;
            const fechaSalida = button.dataset.fechaSalida;
            window.location.href = `confirmarReserva.html?id=${habitacionId}&llegada=${fechaLlegada}&salida=${fechaSalida}`;
        }
    });

    
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('fecha-llegada').setAttribute('min', today);
    document.getElementById('fecha-salida').setAttribute('min', today);

    cargarTiposHabitacion();
});
