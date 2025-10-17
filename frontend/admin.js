document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.querySelector('form.admin');
    const messageDiv = document.createElement('div');
    loginForm.prepend(messageDiv); 

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault(); 

        const correo = document.getElementById('correo').value;
        const clave = document.getElementById('contrasena').value;

        try {
            const response = await fetch('http://localhost:3000/api/admin/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ correo, clave }), 
            });

            const data = await response.json();

            if (response.ok) {
            
                sessionStorage.setItem('admin', JSON.stringify(data.admin));

            
                window.location.href = 'panel-admin.html';
            } else {
                messageDiv.textContent = data.message || 'Error al iniciar sesión.';
                messageDiv.style.color = 'red';
            }
        } catch (error) {
            console.error('Error de conexión:', error);
            messageDiv.textContent = 'No se pudo conectar con el servidor. Inténtalo más tarde.';
            messageDiv.style.color = 'red';
        }
    });
});
