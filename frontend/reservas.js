document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('form-buscar-disponibilidad');
    const resultadosDiv = document.getElementById('resultados-disponibilidad');
    const tipoHabitacionSelect = document.getElementById('tipo-habitacion');

    
    const cargarTiposHabitacion = async () => {
        try {
            const response = await fetch('http://localhost:3000/api/habitaciones/tipos');
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
            resultadosDiv.innerHTML = '<p style="color: red; text-align: center;">Debes seleccionar una fecha de llegada y de salida.</p>';
            return;
        }


        const url = new URL('http://localhost:3000/api/habitaciones/disponibles');
        url.searchParams.append('llegada', fechaLlegada);
        url.searchParams.append('salida', fechaSalida);
        if (tipo) {
            url.searchParams.append('tipo', tipo);
        }

        try {
            resultadosDiv.innerHTML = '<p style="text-align: center;">Buscando...</p>';
            const response = await fetch(url);

            
            if (!response.ok) {
                const errorData = await response.json(); 
                throw new Error(errorData.message || `Error del servidor: ${response.status}`);
            }

            const habitaciones = await response.json();
            mostrarResultados(habitaciones, fechaLlegada, fechaSalida);

        } catch (error) {
            console.error('Error al buscar disponibilidad:', error);
            resultadosDiv.innerHTML = `<p style="color: red; text-align: center;">${error.message || 'Error al conectar con el servidor.'}</p>`;
        }
    });

    
    const mostrarResultados = (habitaciones, fechaLlegada, fechaSalida) => {
        if (habitaciones.length === 0) {
            resultadosDiv.innerHTML = '<p style="text-align: center;">No hay habitaciones disponibles para las fechas o el tipo seleccionado.</p>';
            return;
        }

        resultadosDiv.innerHTML = ''; 

        habitaciones.forEach(hab => {
            const habitacionHTML = `
                <div class="muestra">
                    <a target="_blank" href="img/Habitacion1CamaDoble.jpg">
                        <img src="img/Habitacion1CamaDoble.jpg" alt="${hab.Tipo}" width="500" height="300">
                    </a>
                    <div class="descripcion">
                        <p><b>Habitación N° ${hab.NumeroHabitacion}</b> - ${hab.Tipo}</p>
                        <p>${hab.Descripcion}</p>
                        <p><b>Precio:</b> $${new Intl.NumberFormat('es-CO').format(hab.PrecioPorNoche)}/noche</p>
                        <a href="javascript:void(0)" class="btn-reservar"
                        data-habitacion-id="${hab.idHabitacion}"
                        data-fecha-llegada="${fechaLlegada}"
                        data-fecha-salida="${fechaSalida}">Reservar ahora</a>
                    </div>
                </div>
            `;
            resultadosDiv.innerHTML += habitacionHTML;
        });
    };

    // Event listener para los botones "Reservar ahora" usando delegación de eventos
    resultadosDiv.addEventListener('click', (event) => {
        if (event.target.classList.contains('btn-reservar')) {
            event.preventDefault(); // Previene el comportamiento por defecto del enlace

            const habitacionId = event.target.dataset.habitacionId;
            const fechaLlegada = event.target.dataset.fechaLlegada;
            const fechaSalida = event.target.dataset.fechaSalida;
            window.location.href = `confirmarReserva.html?id=${habitacionId}&llegada=${fechaLlegada}&salida=${fechaSalida}`;
        }
    });

    
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('fecha-llegada').setAttribute('min', today);
    document.getElementById('fecha-salida').setAttribute('min', today);

    cargarTiposHabitacion();
});
