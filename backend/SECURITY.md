# Inicio de sesión seguro de administradores

El backend HTTPS sirve la aplicación web y la API. Para abrirla directamente, inicia el backend y visita `https://localhost:3443/`. En desarrollo, también expone la API por HTTP en `http://localhost:3000`, enlazada solo a localhost. Así puedes abrir primero el backend con `npm start` y luego abrir `frontend/index.html` con VS Code Live Server, sin visitar manualmente la URL HTTPS ni aceptar su certificado local.

Al usar Live Server, las páginas detectan automáticamente su origen local y envían las peticiones a `http://localhost:3000`. El acceso HTTP solo se activa cuando `NODE_ENV` no es `production`; el servidor HTTPS sigue disponible. El puerto predeterminado de Live Server, `5500`, está autorizado. Si usas otro puerto, añádelo a `HOTEL_CORS_ORIGINS` como un origen completo antes de iniciar el backend.

En el primer inicio de sesión de cada administrador, se mostrará una clave secreta una sola vez. Añádela manualmente a una aplicación compatible con TOTP y confirma el código de seis dígitos para completar la configuración. Los inicios de sesión posteriores solicitan el código actual.

Las contraseñas existentes en texto plano se convierten a PBKDF2 al comprobar correctamente la contraseña. Las nuevas cuentas se guardan con hash y requieren una contraseña de al menos 12 caracteres. Después de tres fallos de contraseña o MFA, la cuenta se bloquea durante 30 segundos.

El backend crea las tablas `AdminSecurity` y `AdminSecurityAudit` si aún no existen. La clave de cifrado MFA se genera y conserva en `backend/security/hotel-mfa.key` para el entorno local; no la elimines ni la compartas, porque se necesita para descifrar los secretos TOTP ya registrados. Mantén la misma clave mientras haya MFA configurado. En producción, configura `HOTEL_MFA_ENCRYPTION_KEY` con una clave de 32 bytes codificada en hexadecimal (64 caracteres) y resguárdala en el gestor de secretos del entorno.

Los cambios de habitaciones y la gestión de administradores requieren una sesión autenticada. Las sesiones usan una cookie `HttpOnly` y `Secure`; las solicitudes administrativas que modifican datos también validan el origen permitido para proteger contra CSRF. Las sesiones se invalidan al reiniciar el servidor.

Para ejecutar las pruebas desde `backend`, usa `npm test`.
