document.addEventListener('DOMContentLoaded', () => {
    const logoutButton = document.getElementById('admin-logout');
    const refreshButton = document.getElementById('refresh-security-audit');
    const auditEntries = document.getElementById('security-audit-entries');
    const auditMessage = document.getElementById('security-audit-message');
    const frontendPath = window.location.pathname.includes('/frontend/') ? '/frontend/' : '/';

    logoutButton.addEventListener('click', async () => {
        try {
            const response = await fetch(window.hotelApiUrl('/api/admin/logout'), {
                method: 'POST',
                credentials: 'include'
            });
            if (!response.ok) {
                throw new Error('No se pudo cerrar la sesión.');
            }
            window.location.href = `${frontendPath}administrador.html`;
        } catch (error) {
            console.error('Error al cerrar sesión:', error);
            auditMessage.textContent = 'No se pudo cerrar la sesión. Inténtalo de nuevo.';
            auditMessage.style.color = 'red';
        }
    });

    async function loadAuditEvents() {
        auditMessage.textContent = 'Cargando bitácora…';
        auditMessage.style.color = '';
        auditEntries.replaceChildren();

        try {
            const response = await fetch(window.hotelApiUrl('/api/admin/security/audit'), {
                credentials: 'include'
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'No se pudo consultar la bitácora.');
            }

            if (data.length === 0) {
                auditMessage.textContent = 'Todavía no hay eventos registrados.';
                return;
            }

            const table = document.createElement('table');
            const header = document.createElement('tr');
            for (const label of ['Fecha', 'Evento', 'Detalle', 'Integridad']) {
                const cell = document.createElement('th');
                cell.textContent = label;
                header.appendChild(cell);
            }
            table.appendChild(header);

            for (const event of data) {
                const row = document.createElement('tr');
                const values = [
                    new Date(event.CreatedAt).toLocaleString(),
                    event.EventType,
                    event.Details,
                    event.IntegrityValid ? 'Válida' : 'ALTERADA'
                ];
                for (const value of values) {
                    const cell = document.createElement('td');
                    cell.textContent = value;
                    row.appendChild(cell);
                }
                table.appendChild(row);
            }

            auditEntries.appendChild(table);
            auditMessage.textContent = '';
        } catch (error) {
            console.error('Error al cargar la bitácora de seguridad:', error);
            auditMessage.textContent = error.message;
            auditMessage.style.color = 'red';
        }
    }

    refreshButton.addEventListener('click', loadAuditEvents);
});
