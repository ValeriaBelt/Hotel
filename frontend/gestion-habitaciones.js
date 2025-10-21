document.addEventListener('DOMContentLoaded', () => {
    const addForm = document.getElementById('form-add-habitacion');
    const messageDiv = document.getElementById('add-message');

    if (addForm) {
        addForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const habitacionData = {
                numero: document.getElementById('numero').value, 
                tipo: document.getElementById('tipo').value, 
                descripcion: document.getElementById('descripcion').value,
                precio: document.getElementById('precio').value,
                
            };

            try {
                const response = await fetch('http://localhost:3000/api/habitaciones', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(habitacionData),
                });

                const result = await response.json();

                if (response.ok) {
                    messageDiv.textContent = result.message;
                    messageDiv.style.color = 'green';
                    addForm.reset(); 
                } else {
                    messageDiv.textContent = result.message || 'Error al añadir la habitación.';
                    messageDiv.style.color = 'red';
                }

            } catch (error) {
                console.error('Error de conexión:', error);
                messageDiv.textContent = 'No se pudo conectar con el servidor.';
                messageDiv.style.color = 'red';
            }
        });
    }
});
