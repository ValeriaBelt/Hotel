document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('form-login-admin');
    const messageDiv = document.createElement('div');
    const mfaSection = document.createElement('section');
    const mfaLabel = document.createElement('label');
    const mfaInput = document.createElement('input');
    const mfaInstructions = document.createElement('p');
    const submitButton = loginForm.querySelector('button[type="submit"]');
    const frontendPath = window.location.pathname.includes('/frontend/') ? '/frontend/' : '/';
    let challengeToken = null;

    messageDiv.setAttribute('role', 'alert');
    mfaSection.hidden = true;
    mfaLabel.htmlFor = 'mfa-code';
    mfaLabel.textContent = 'Código de autenticación:';
    mfaInput.id = 'mfa-code';
    mfaInput.name = 'mfa-code';
    mfaInput.type = 'text';
    mfaInput.inputMode = 'numeric';
    mfaInput.autocomplete = 'one-time-code';
    mfaInput.pattern = '[0-9]{6}';
    mfaInput.maxLength = 6;
    mfaInput.required = false;
    mfaInput.placeholder = 'Código de 6 dígitos';
    mfaInstructions.setAttribute('aria-live', 'polite');
    mfaSection.append(mfaLabel, document.createElement('br'), mfaInput, mfaInstructions);
    loginForm.prepend(messageDiv, mfaSection);

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        messageDiv.textContent = '';

        try {
            if (!challengeToken) {
                const correo = document.getElementById('correo').value;
                const clave = document.getElementById('contrasena').value;
                const response = await fetch(window.hotelApiUrl('/api/admin/login'), {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ correo, clave })
                });
                const data = await response.json();

                if (!response.ok) {
                    messageDiv.textContent = data.message || 'Error al iniciar sesión.';
                    messageDiv.style.color = 'red';
                    return;
                }

                challengeToken = data.challengeToken;
                mfaSection.hidden = false;
                mfaInput.required = true;
                document.getElementById('correo').disabled = true;
                const passwordInput = document.getElementById('contrasena');
                passwordInput.value = '';
                passwordInput.disabled = true;
                submitButton.textContent = 'Verificar código';
                mfaInput.focus();

                if (data.mfaSetupRequired) {
                    mfaInstructions.textContent =
                        ` Configura una aplicación Authenticator con esta clave (solo se muestra ahora): ${data.mfaSecret}`;
                } else {
                    mfaInstructions.textContent = ' Ingresa el código actual de tu aplicación Authenticator.';
                }
                return;
            }

            const response = await fetch(window.hotelApiUrl('/api/admin/verify-mfa'), {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ challengeToken, code: mfaInput.value })
            });
            const data = await response.json();

            if (response.ok) {
                window.location.href = `${frontendPath}panelAdmin.html`;
            } else {
                messageDiv.textContent = data.message || 'No se pudo verificar el código.';
                messageDiv.style.color = 'red';
                mfaInput.value = '';
                mfaInput.focus();
                if (response.status === 401 && typeof data.message === 'string' && data.message.includes('expiró')) {
                    challengeToken = null;
                    mfaInput.required = false;
                    mfaSection.hidden = true;
                    document.getElementById('correo').disabled = false;
                    document.getElementById('contrasena').disabled = false;
                    submitButton.textContent = 'Iniciar Sesión';
                }
            }
        } catch (error) {
            console.error('Error de conexión:', error);
            messageDiv.textContent = 'No se pudo conectar con el servidor. Inténtalo más tarde.';
            messageDiv.style.color = 'red';
        }
    });
});
