document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('form-buscar-disponibilidad');
    const resultadosDiv = document.getElementById('resultados-disponibilidad');
    const tipoHabitacionSelect = document.getElementById('tipo-habitacion');

    // --- 1. Cargar los tipos de habitación en el filtro ---
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

    // --- 2. Manejar la búsqueda de disponibilidad ---
    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const fechaLlegada = document.getElementById('fecha-llegada').value;
        const fechaSalida = document.getElementById('fecha-salida').value;
        const tipo = tipoHabitacionSelect.value;

        if (!fechaLlegada || !fechaSalida) {
            resultadosDiv.innerHTML = '<p style="color: red; text-align: center;">Debes seleccionar una fecha de llegada y de salida.</p>';
            return;
        }

        // Construir la URL con los parámetros de búsqueda
        const url = new URL('http://localhost:3000/api/habitaciones/disponibles');
        url.searchParams.append('llegada', fechaLlegada);
        url.searchParams.append('salida', fechaSalida);
        if (tipo) {
            url.searchParams.append('tipo', tipo);
        }

        try {
            resultadosDiv.innerHTML = '<p style="text-align: center;">Buscando...</p>';
            const response = await fetch(url);
            const habitaciones = await response.json();

            mostrarResultados(habitaciones);

        } catch (error) {
            console.error('Error al buscar disponibilidad:', error);
            resultadosDiv.innerHTML = '<p style="color: red; text-align: center;">Error al conectar con el servidor.</p>';
        }
    });

    // --- 3. Mostrar los resultados en la página ---
    const mostrarResultados = (habitaciones) => {
        if (habitaciones.length === 0) {
            resultadosDiv.innerHTML = '<p style="text-align: center;">No hay habitaciones disponibles para las fechas o el tipo seleccionado.</p>';
            return;
        }

        resultadosDiv.innerHTML = ''; // Limpiar resultados anteriores

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
                        <a href="#" class="btn-reservar">Reservar ahora</a>
                    </div>
                </div>
            `;
            resultadosDiv.innerHTML += habitacionHTML;
        });
    };

    // --- Inicialización ---
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('fecha-llegada').setAttribute('min', today);
    document.getElementById('fecha-salida').setAttribute('min', today);

    cargarTiposHabitacion();
});
