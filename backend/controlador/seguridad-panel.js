document.addEventListener('DOMContentLoaded', () => {
    const logoutButton = document.getElementById('admin-logout');
    const refreshButton = document.getElementById('refresh-security-audit');
    const closeButton = document.getElementById('close-security-audit');
    const auditSection = document.getElementById('seccion-bitacora-seguridad');
    const auditEntries = document.getElementById('security-audit-entries');
    const auditMessage = document.getElementById('security-audit-message');
    const auditFilters = document.getElementById('security-audit-filters');
    const filterButtons = [...auditFilters.querySelectorAll('[data-audit-category]')];
    let activeCategory = 'all';
    let auditRequestController;
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
        if (auditSection.hidden) {
            return;
        }

        auditRequestController?.abort();
        const requestController = new AbortController();
        auditRequestController = requestController;
        auditMessage.textContent = 'Cargando bitácora…';
        auditMessage.style.color = '';
        auditEntries.replaceChildren();

        try {
            const url = new URL(window.hotelApiUrl('/api/admin/security/audit'));
            url.searchParams.set('category', activeCategory);
            const response = await fetch(url, {
                credentials: 'include',
                signal: requestController.signal
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'No se pudo consultar la bitácora.');
            }
            if (auditSection.hidden || requestController.signal.aborted) {
                return;
            }

            if (data.length === 0) {
                auditMessage.textContent = activeCategory === 'attacks'
                    ? 'No hay ataques registrados.'
                    : activeCategory === 'logins'
                        ? 'No hay inicios de sesión registrados.'
                        : 'Todavía no hay eventos registrados.';
                return;
            }

            const table = document.createElement('table');
            const header = document.createElement('tr');
            for (const label of ['Fecha', 'Evento', 'Perfil que inició/cerró sesión', 'Perfil/cuenta objetivo', 'Detalle', 'Integridad']) {
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
                    event.ActorProfile || '—',
                    event.TargetProfile || '—',
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
            if (error.name === 'AbortError') {
                return;
            }
            console.error('Error al cargar la bitácora de seguridad:', error);
            auditMessage.textContent = error.message;
            auditMessage.style.color = 'red';
        }
    }

    auditSection.addEventListener('security-audit-open', loadAuditEvents);
    closeButton.addEventListener('click', () => {
        auditRequestController?.abort();
        auditSection.hidden = true;
        auditEntries.replaceChildren();
        auditMessage.textContent = '';
        auditMessage.style.color = '';
    });

    auditFilters.addEventListener('click', event => {
        const button = event.target.closest('[data-audit-category]');
        if (!button || !auditFilters.contains(button)) {
            return;
        }
        activeCategory = button.dataset.auditCategory;
        for (const filterButton of filterButtons) {
            filterButton.setAttribute('aria-pressed', String(filterButton === button));
        }
        loadAuditEvents();
    });
    refreshButton.addEventListener('click', loadAuditEvents);
    refreshButton.addEventListener('click', loadAuditEvents);
});
