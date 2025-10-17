document.addEventListener('DOMContentLoaded', () => {
    const adminDataString = sessionStorage.getItem('admin');
    const welcomeMessageContainer = document.getElementById('welcome-message');

    if (adminDataString) {
        const admin = JSON.parse(adminDataString);
        // Mostramos el mensaje de bienvenida con el nombre del administrador
        welcomeMessageContainer.textContent = `¡Bienvenido, ${admin.Nombre}!`;
    } else {
        // Si no hay datos de admin, es porque no ha iniciado sesión.
        // Lo redirigimos a la página de login. Esto es una medida de seguridad básica.
        window.location.href = 'administrador.html';
    }
});
