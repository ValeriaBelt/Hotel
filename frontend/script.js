document.addEventListener('DOMContentLoaded', function() {
    // Seleccionamos TODOS los botones de detalles
    const botonesDetalles = document.querySelectorAll('.btn-detalles');

    // Recorremos cada botón para agregarle el evento de clic
    botonesDetalles.forEach(function(boton) {
        boton.addEventListener('click', async function() {
            // 'this' se refiere al botón que fue presionado
            // Buscamos el contenedor de detalles dentro del mismo padre '.descripcion'
            const detalles = this.parentElement.querySelector('.detalles-habitacion');
            const habitacionId = this.dataset.habitacionId;

            // Verificamos si los detalles ya están visibles
            const isVisible = detalles.style.maxHeight && detalles.style.maxHeight !== "0px";

            if (isVisible) {
                // Si ya está visible, simplemente lo ocultamos
                detalles.style.maxHeight = "0px";
                detalles.style.padding = "0 15px";
                this.textContent = 'Ver más detalles';
            } else {
                // Si está oculto, verificamos si ya tiene contenido
                if (detalles.innerHTML.trim() === '') {
                    // Si está vacío, vamos a buscar el contenido
                    try {
                        // CAMBIO: Apuntamos a nuestro nuevo backend
                        const response = await fetch(`http://localhost:3000/api/habitaciones/${habitacionId}`);
                        
                        if (response.ok) {
                            const data = await response.json(); // Obtenemos los datos como JSON
                            // Creamos el HTML a partir de los datos de la base de datos
                            // Asegúrate que los nombres (data.Tipo, data.Precio, etc.) coincidan con tus columnas en la BD
                            detalles.innerHTML = `
                                <h4>Detalles de la ${data.Tipo || 'habitación'}:</h4>
                                <ul>
                                    <li>Precio: $${data.Precio || 'N/A'}/noche</li>
                                    <li>Capacidad: ${data.Capacidad || 'N/A'} personas</li>
                                    <li>Servicios: ${data.Servicios || 'N/A'}</li>
                                </ul>
                            `;
                        } else {
                            detalles.innerHTML = '<p>Detalles no disponibles en este momento.</p>';
                        }
                    } catch (error) {
                        console.error('Error al cargar los detalles:', error);
                        detalles.innerHTML = '<p>No se pudo cargar la información.</p>';
                    }
                }
                // Mostramos el contenedor (ya sea con contenido nuevo o existente)
                detalles.style.maxHeight = detalles.scrollHeight + "px";
                detalles.style.padding = "15px";
                this.textContent = 'Ocultar detalles';
            }
        });
    });
});
