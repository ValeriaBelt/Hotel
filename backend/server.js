const express = require('express');
const sql = require('mssql/msnodesqlv8'); 
const cors = require('cors');
const rateLimit = require('express-rate-limit'); 
const helmet = require('helmet');               
const morgan = require('morgan');               
const https = require('https');                 
const http = require('http');
const fs = require('fs');                       
const path = require('path');
const { randomBytes } = require('node:crypto');
const { createAdminSecurity } = require('./admin-security');
const { hashPassword } = require('./security-service');
const {
    createReservationManagementCode,
    hashReservationManagementCode,
    isValidDate,
    validateReservationInput
} = require('./reservation-security');

function loadMfaEncryptionKey() {
    const configuredKey = process.env.HOTEL_MFA_ENCRYPTION_KEY;
    if (configuredKey) {
        if (!/^[0-9a-fA-F]{64}$/.test(configuredKey)) {
            throw new Error('HOTEL_MFA_ENCRYPTION_KEY debe contener exactamente 64 caracteres hexadecimales.');
        }
        return Buffer.from(configuredKey, 'hex');
    }

    const keyPath = path.join(__dirname, 'security', 'hotel-mfa.key');
    try {
        const key = fs.readFileSync(keyPath);
        if (key.length !== 32) {
            throw new Error('El archivo de clave MFA debe contener exactamente 32 bytes.');
        }
        return key;
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error;
        }
    }

    const key = randomBytes(32);
    try {
        fs.writeFileSync(keyPath, key, { flag: 'wx', mode: 0o600 });
        return key;
    } catch (error) {
        if (error.code !== 'EEXIST') {
            throw error;
        }
        const existingKey = fs.readFileSync(keyPath);
        if (existingKey.length !== 32) {
            throw new Error('El archivo de clave MFA debe contener exactamente 32 bytes.');
        }
        return existingKey;
    }
}

const mfaEncryptionKey = loadMfaEncryptionKey();
const allowedOrigins = new Set(
    (process.env.HOTEL_CORS_ORIGINS ||
        'http://localhost:5500,http://127.0.0.1:5500,http://localhost:5501,http://127.0.0.1:5501,https://localhost:3443')
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean)
);

const app = express();
app.use(helmet());
app.use(cors({
    origin(origin, callback) {
        callback(null, !origin || allowedOrigins.has(origin));
    },
    credentials: true
}));
app.use(express.json({ limit: '32kb' }));
app.use(morgan('combined')); 
app.use('/backend/controlador', express.static(path.join(__dirname, 'controlador')));
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use('/api/admin', (req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) &&
        !allowedOrigins.has(req.get('Origin'))) {
        return res.status(403).json({ message: 'Origen no autorizado.' });
    }
    next();
});

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: {message: 'Bloqueado por seguridad (Mitigación DoS).'}
});

app.use('/api', apiLimiter);

const dbConfig = {
    connectionString: 'Driver={ODBC Driver 17 for SQL Server};Server=(localdb)\\valeriat;Database=HotelSys;Trusted_Connection=yes;'
};


const startServer = async () => {
    try {
        const pool = await new sql.ConnectionPool(dbConfig).connect(); 
        console.log('Conectado a la base de datos SQL Server.');
        const adminSecurity = createAdminSecurity({ pool, sql, encryptionKey: mfaEncryptionKey });
        await adminSecurity.initialize();
        await pool.request().query(`
            IF OBJECT_ID('dbo.ReservationManagementAccess', 'U') IS NULL
            BEGIN
                CREATE TABLE dbo.ReservationManagementAccess (
                    ReservationId INT NOT NULL
                        CONSTRAINT PK_ReservationManagementAccess PRIMARY KEY,
                    TokenHash CHAR(64) NOT NULL,
                    CreatedAt DATETIME2 NOT NULL
                        CONSTRAINT DF_ReservationManagementAccess_CreatedAt DEFAULT SYSUTCDATETIME(),
                    CONSTRAINT FK_ReservationManagementAccess_Reservas
                        FOREIGN KEY (ReservationId) REFERENCES dbo.Reservas (idReserva) ON DELETE CASCADE
                );
            END;

            IF NOT EXISTS (
                SELECT 1
                FROM sys.indexes
                WHERE object_id = OBJECT_ID('dbo.ReservationManagementAccess')
                    AND name = 'UX_ReservationManagementAccess_TokenHash'
            )
            BEGIN
                CREATE UNIQUE INDEX UX_ReservationManagementAccess_TokenHash
                    ON dbo.ReservationManagementAccess (TokenHash);
            END;
        `);



        app.get('/api/habitaciones/all', async (req, res) => {
            try {
                const result = await pool.request().query('SELECT idHabitacion, NumeroHabitacion, Tipo, Descripcion, PrecioPorNoche FROM Habitaciones ORDER BY NumeroHabitacion');
                res.json(result.recordset);
            } catch (err) {
                console.error('Error al obtener todas las habitaciones:', err.stack);
                res.status(500).json({ message: 'Error interno del servidor.' });
            }
        });
        
        app.post('/api/admin/login', adminSecurity.login);
        app.post('/api/admin/verify-mfa', adminSecurity.verifyMfa);
        app.get('/api/admin/session', adminSecurity.requireSession, adminSecurity.getCurrentSession);
        app.post('/api/admin/logout', adminSecurity.logout);
        app.use('/api/admin', adminSecurity.requireSession);
        app.get(
            '/api/admin/security/audit',
            adminSecurity.requireRoles('Administrador'),
            adminSecurity.listAuditEvents
        );
        
        app.post(
            '/api/habitaciones',
            adminSecurity.requireSession,
            adminSecurity.requireRoles('Administrador', 'Operador'),
            async (req, res) => {
            const { numero, tipo, descripcion, precio } = req.body || {};
            const roomNumber = Number(numero);
            const nightlyPrice = Number(precio);
            if (!Number.isSafeInteger(roomNumber) || roomNumber <= 0 || roomNumber > 2147483647 ||
                typeof tipo !== 'string' || !tipo.trim() || tipo.trim().length > 50 ||
                typeof descripcion !== 'string' || !descripcion.trim() || descripcion.length > 4000 ||
                !Number.isFinite(nightlyPrice) || nightlyPrice < 0 || nightlyPrice > 99999999.99) {
                return res.status(400).json({ message: 'Todos los campos son obligatorios.' });
            }
        
            try {
        
                const result = await pool.request()
                    .input('numero', sql.Int, roomNumber)
                    .input('tipo', sql.NVarChar(50), tipo.trim())
                    .input('descripcion', sql.NVarChar(4000), descripcion.trim())
                    .input('precio', sql.Decimal(10, 2), nightlyPrice)
                    .query('INSERT INTO Habitaciones (NumeroHabitacion, Tipo, Descripcion, PrecioPorNoche) VALUES (@numero, @tipo, @descripcion, @precio)');
        
                if (result.rowsAffected[0] > 0) {
                    res.status(201).json({ message: 'Habitación añadida correctamente.' });
                } else {
                    res.status(500).json({ message: 'No se pudo añadir la habitación.' });
                }
            } catch (err) {
                console.error('Error al insertar en la base de datos:', err.stack);
                res.status(500).json({ message: 'Error interno del servidor al añadir habitación.' });
            }
            }
        );
        
        app.put(
            '/api/habitaciones/:id',
            adminSecurity.requireSession,
            adminSecurity.requireRoles('Administrador', 'Operador'),
            async (req, res) => {
            const { id } = req.params;
            const { tipo, descripcion, precio } = req.body || {};
            if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) > 2147483647 ||
                (tipo !== undefined && (typeof tipo !== 'string' || tipo.trim().length > 50)) ||
                (descripcion !== undefined && (typeof descripcion !== 'string' || descripcion.length > 4000)) ||
                (precio !== undefined && (!Number.isFinite(Number(precio)) ||
                    Number(precio) < 0 || Number(precio) > 99999999.99))) {
                return res.status(400).json({ message: 'Los datos de la habitación no son válidos.' });
            }

            let updateFields = [];
            let request = pool.request().input('id', sql.Int, id);
        
            if (tipo !== undefined && tipo !== null && tipo.trim() !== '') {
                updateFields.push('Tipo = @tipo');
                request.input('tipo', sql.NVarChar(50), tipo.trim());
            }
            if (descripcion !== undefined && descripcion !== null) { 
                updateFields.push('Descripcion = @descripcion');
                request.input('descripcion', sql.NVarChar(4000), descripcion.trim());
            }
            if (precio !== undefined && precio !== null && precio !== '') {
                updateFields.push('PrecioPorNoche = @precio');
                request.input('precio', sql.Decimal(10, 2), Number(precio));
            }
        
            if (updateFields.length === 0) {
                return res.status(400).json({ message: 'No se proporcionaron campos para actualizar.' });
            }
        
            const query = `UPDATE Habitaciones SET ${updateFields.join(', ')} WHERE idHabitacion = @id`;
        
            try {
                const result = await request.query(query);
        
                if (result.rowsAffected[0] > 0) {
                    res.json({ message: 'Habitación actualizada correctamente.' });
                } else {
                    res.status(404).json({ message: 'No se encontró la habitación para actualizar.' });
                }
            } catch (err) {
                console.error('Error al actualizar la habitación:', err.stack);
                res.status(500).json({ message: 'Error interno del servidor al actualizar la habitación.' });
            }
            }
        );
        
        app.get('/api/habitaciones/tipos', async (req, res) => {
            try {
                const result = await pool.request().query('SELECT DISTINCT Tipo FROM Habitaciones ORDER BY Tipo');
                res.json(result.recordset);
            } catch (err) {
                console.error('Error al obtener tipos de habitación:', err.stack);
                res.status(500).json({ message: 'Error interno del servidor.' });
            }
        });
        
        app.get('/api/habitaciones/disponibles', async (req, res) => {
            const { llegada, salida, tipo } = req.query;
            if (!isValidDate(llegada) || !isValidDate(salida) || llegada >= salida ||
                (tipo !== undefined && (typeof tipo !== 'string' || tipo.length > 50))) {
                return res.status(400).json({ message: 'Las fechas y el tipo de habitación no son válidos.' });
            }
        
            try {
                let query = `
                    SELECT * FROM Habitaciones h
                    WHERE NOT EXISTS (
                        SELECT 1 FROM Reservas r
                        WHERE r.idHabitacion = h.idHabitacion
                        AND (
                            (r.FechaEntrada < @salida AND r.FechaSalida > @llegada)
                        )
                    )
                `.trim();
        
                const request = pool.request()
                    .input('llegada', sql.Date, llegada)
                    .input('salida', sql.Date, salida);
        
                if (tipo) {
                    query += ' AND h.Tipo = @tipo';
                    request.input('tipo', sql.NVarChar, tipo);
                }
        
                const result = await request.query(query);
                res.json(result.recordset);
            } catch (err) {
                console.error('Error al buscar disponibilidad:', err.stack);
                res.status(500).json({ message: 'Error interno del servidor.' });
            }
        });

        app.get('/api/habitaciones/:id', async (req, res) => {
            const { id } = req.params;
            if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) > 2147483647) {
                return res.status(400).json({ message: 'El identificador de habitación no es válido.' });
            }
            try {
                const result = await pool.request()
                    .input('id', sql.Int, id)
                    .query(`
                        SELECT idHabitacion, NumeroHabitacion, Tipo, Descripcion, PrecioPorNoche
                        FROM Habitaciones
                        WHERE idHabitacion = @id
                    `);
        
                if (result.recordset.length > 0) {
                    res.json(result.recordset[0]);
                } else {
                    res.status(404).json({ message: 'Habitación no encontrada' });
                }
            } catch (err) {
                console.error('Error al obtener la habitación:', err.stack);
                res.status(500).json({ message: 'Error interno del servidor.' });
            }
        });

        app.post('/api/reservas', async (req, res) => {
            const reservation = validateReservationInput(req.body);
            if (!reservation) {
                return res.status(400).json({ message: 'Revisa los datos de la reserva: fechas válidas, habitación, correo y teléfono de 10 dígitos.' });
            }

            const managementCode = createReservationManagementCode();
            const managementCodeHash = hashReservationManagementCode(managementCode);
            const transaction = new sql.Transaction(pool);
            try {
                await transaction.begin();

                const roomRequest = new sql.Request(transaction)
                    .input('idHabitacion', sql.Int, reservation.idHabitacion)
                    .input('fechaLlegada', sql.Date, reservation.fechaLlegada)
                    .input('fechaSalida', sql.Date, reservation.fechaSalida);
                const roomResult = await roomRequest.query(`
                    SELECT h.idHabitacion
                    FROM Habitaciones AS h WITH (UPDLOCK, HOLDLOCK)
                    WHERE h.idHabitacion = @idHabitacion;

                    IF EXISTS (
                        SELECT 1
                        FROM Reservas
                        WHERE idHabitacion = @idHabitacion
                            AND FechaEntrada < @fechaSalida
                            AND FechaSalida > @fechaLlegada
                    )
                        SELECT CONVERT(bit, 1) AS IsUnavailable;
                    ELSE
                        SELECT CONVERT(bit, 0) AS IsUnavailable;
                `);
                if (roomResult.recordsets[0].length === 0) {
                    await transaction.rollback();
                    return res.status(404).json({ message: 'La habitación seleccionada no existe.' });
                }
                const availability = roomResult.recordsets[1]?.[0];
                if (!availability) {
                    throw new Error('No se pudo verificar la disponibilidad de la habitación.');
                }
                if (availability.IsUnavailable) {
                    await transaction.rollback();
                    return res.status(409).json({ message: 'La habitación ya no está disponible para esas fechas.' });
                }

                const clientRequest = new sql.Request(transaction)
                    .input('email', sql.VarChar(100), reservation.email)
                    .input('nombre', sql.VarChar(100), reservation.nombre)
                    .input('telefono', sql.VarChar(20), reservation.telefono);
                const clientResult = await clientRequest.query(
                    'SELECT idCliente FROM Clientes WHERE Email = @email'
                );
                let idCliente = clientResult.recordset[0]?.idCliente;
                if (!idCliente) {
                    const insertClientResult = await new sql.Request(transaction)
                        .input('email', sql.VarChar(100), reservation.email)
                        .input('nombre', sql.VarChar(100), reservation.nombre)
                        .input('telefono', sql.VarChar(20), reservation.telefono)
                        .query(`
                            INSERT INTO Clientes (Nombre, Email, Telefono)
                            OUTPUT INSERTED.idCliente
                            VALUES (@nombre, @email, @telefono)
                        `);
                    idCliente = insertClientResult.recordset[0]?.idCliente;
                }
                if (!idCliente) {
                    throw new Error('No se pudo identificar al cliente de la reserva.');
                }

                const resultReserva = await new sql.Request(transaction)
                    .input('idHabitacion', sql.Int, reservation.idHabitacion)
                    .input('idCliente', sql.Int, idCliente)
                    .input('fechaEntrada', sql.Date, reservation.fechaLlegada)
                    .input('fechaSalida', sql.Date, reservation.fechaSalida)
                    .query(`
                        INSERT INTO Reservas (idHabitacion, idCliente, FechaEntrada, FechaSalida)
                        OUTPUT INSERTED.idReserva
                        VALUES (@idHabitacion, @idCliente, @fechaEntrada, @fechaSalida)
                    `);
                const reservationId = resultReserva.recordset[0]?.idReserva;
                if (!reservationId) {
                    throw new Error('No se pudo crear la reserva.');
                }

                await new sql.Request(transaction)
                    .input('reservationId', sql.Int, reservationId)
                    .input('tokenHash', sql.Char(64), managementCodeHash)
                    .query(`
                        INSERT INTO dbo.ReservationManagementAccess (ReservationId, TokenHash)
                        VALUES (@reservationId, @tokenHash)
                    `);
                await transaction.commit();
                res.setHeader('Cache-Control', 'no-store');
                res.status(201).json({
                    message: 'Reserva creada exitosamente.',
                    managementCode
                });
            } catch (err) {
                console.error('Error en la transacción de reserva:', err.stack);
                try {
                    await transaction.rollback();
                } catch (rollbackErr) {
                    console.error('Error al hacer rollback de la transacción:', rollbackErr.stack);
                }
                if (err.number === 2627 || err.number === 2601) {
                    return res.status(409).json({ message: 'Error de conflicto. Posiblemente un dato duplicado.' });
                }
                res.status(500).json({ message: 'Error interno del servidor al crear la reserva.' });
            }
        });

        app.post('/api/reservas/consultar', async (req, res) => {
            const tokenHash = hashReservationManagementCode(req.body?.managementCode);
            if (!tokenHash) {
                return res.status(400).json({ message: 'Ingresa el código de gestión completo.' });
            }

            try {
                const result = await pool.request()
                    .input('tokenHash', sql.Char(64), tokenHash)
                    .query(`
                        SELECT TOP (1)
                            r.idReserva,
                            r.FechaEntrada,
                            r.FechaSalida,
                            h.NumeroHabitacion,
                            h.Tipo
                        FROM dbo.ReservationManagementAccess AS access
                        INNER JOIN Reservas AS r ON r.idReserva = access.ReservationId
                        INNER JOIN Habitaciones AS h ON h.idHabitacion = r.idHabitacion
                        WHERE access.TokenHash = @tokenHash
                    `);
                if (result.recordset.length === 0) {
                    return res.status(404).json({ message: 'No se encontró una reserva con ese código.' });
                }
                res.setHeader('Cache-Control', 'no-store');
                res.json(result.recordset);
            } catch (err) {
                console.error('Error al consultar reserva con código de gestión:', err.stack);
                res.status(500).json({ message: 'No se pudo consultar la reserva.' });
            }
        });

        app.post('/api/reservas/:id/cancelar', async (req, res) => {
            const { id } = req.params;
            const tokenHash = hashReservationManagementCode(req.body?.managementCode);
            if (!/^\d+$/.test(id) || Number(id) > 2147483647 || !tokenHash) {
                return res.status(400).json({ message: 'El identificador de reserva o el código de gestión no son válidos.' });
            }

            const transaction = new sql.Transaction(pool);
            try {
                await transaction.begin();
                const accessResult = await new sql.Request(transaction)
                    .input('reservationId', sql.Int, id)
                    .input('tokenHash', sql.Char(64), tokenHash)
                    .query(`
                        DELETE FROM dbo.ReservationManagementAccess
                        WHERE ReservationId = @reservationId AND TokenHash = @tokenHash;
                        SELECT @@ROWCOUNT AS AccessRevoked;
                    `);
                if (accessResult.recordset[0]?.AccessRevoked !== 1) {
                    await transaction.rollback();
                    return res.status(404).json({ message: 'No se encontró una reserva con ese código.' });
                }
                await new sql.Request(transaction)
                    .input('reservationId', sql.Int, id)
                    .query('DELETE FROM Reservas WHERE idReserva = @reservationId');
                await transaction.commit();
                res.json({ message: 'Reserva cancelada exitosamente.' });
            } catch (err) {
                console.error('Error al cancelar reserva con código de gestión:', err.stack);
                try {
                    await transaction.rollback();
                } catch (rollbackErr) {
                    console.error('Error al revertir cancelación de reserva:', rollbackErr.stack);
                }
                res.status(500).json({ message: 'No se pudo cancelar la reserva.' });
            }
        });

        app.post(
            '/api/admin/reservas/buscar',
            adminSecurity.requireRoles('Administrador', 'Operador'),
            async (req, res) => {
                const { termino } = req.body || {};
                if (typeof termino !== 'string' || !termino.trim() || termino.length > 100) {
                    return res.status(400).json({ message: 'Ingresa un correo o teléfono válido para buscar reservas.' });
                }
                try {
                    const result = await pool.request()
                        .input('termino', sql.VarChar(102), `%${termino.trim()}%`)
                        .query(`
                            SELECT
                                r.idReserva,
                                r.FechaEntrada,
                                r.FechaSalida,
                                h.NumeroHabitacion,
                                h.Tipo,
                                c.Nombre,
                                c.Email,
                                c.Telefono
                            FROM Reservas AS r
                            INNER JOIN Habitaciones AS h ON h.idHabitacion = r.idHabitacion
                            INNER JOIN Clientes AS c ON c.idCliente = r.idCliente
                            WHERE c.Email LIKE @termino OR c.Telefono LIKE @termino
                            ORDER BY r.FechaEntrada DESC
                        `);
                    res.setHeader('Cache-Control', 'no-store');
                    res.json(result.recordset);
                } catch (err) {
                    console.error('Error al buscar reservas desde el panel:', err.stack);
                    res.status(500).json({ message: 'No se pudieron buscar las reservas.' });
                }
            }
        );

        app.delete(
            '/api/admin/reservas/:id',
            adminSecurity.requireRoles('Administrador', 'Operador'),
            async (req, res) => {
                const { id } = req.params;
                const tokenHash = hashReservationManagementCode(req.body?.managementCode);
                if (!/^\d+$/.test(id) || Number(id) > 2147483647 || !tokenHash) {
                    return res.status(400).json({ message: 'El identificador o el código de gestión no son válidos.' });
                }
                const transaction = new sql.Transaction(pool);
                try {
                    await transaction.begin();
                    const accessResult = await new sql.Request(transaction)
                        .input('reservationId', sql.Int, id)
                        .input('tokenHash', sql.Char(64), tokenHash)
                        .query(`
                            SELECT TOP (1) ReservationId
                            FROM dbo.ReservationManagementAccess WITH (UPDLOCK, HOLDLOCK)
                            WHERE ReservationId = @reservationId AND TokenHash = @tokenHash
                        `);
                    if (accessResult.recordset.length === 0) {
                        await transaction.rollback();
                        return res.status(403).json({ message: 'El código de gestión no es válido para esta reserva.' });
                    }
                    const result = await new sql.Request(transaction)
                        .input('reservationId', sql.Int, id)
                        .query('DELETE FROM Reservas WHERE idReserva = @reservationId');
                    if (result.rowsAffected[0] === 0) {
                        await transaction.rollback();
                        return res.status(404).json({ message: 'No se encontró la reserva para cancelar.' });
                    }
                    await transaction.commit();
                    res.json({ message: 'Reserva cancelada exitosamente.' });
                } catch (err) {
                    console.error('Error al cancelar reserva desde el panel:', err.stack);
                    try {
                        await transaction.rollback();
                    } catch (rollbackErr) {
                        console.error('Error al revertir cancelación de reserva:', rollbackErr.stack);
                    }
                    res.status(500).json({ message: 'No se pudo cancelar la reserva.' });
                }
            }
        );

        // Endpoint para registrar un nuevo administrador
        app.post('/api/admin/register', adminSecurity.requireRoles('Administrador'), async (req, res) => {
            const { nombre, telefono, correo, clave, rol } = req.body || {};

            if (typeof nombre !== 'string' || typeof telefono !== 'string' ||
                typeof correo !== 'string' || typeof clave !== 'string' ||
                !nombre.trim() || nombre.trim().length > 100 ||
                !/^\d{10}$/.test(telefono) ||
                !correo.trim() || correo.trim().length > 100 ||
                !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim()) ||
                clave.length < 12 || clave.length > 128 ||
                !['Administrador', 'Operador'].includes(rol)) {
                return res.status(400).json({
                    message: 'Completa todos los campos, elige un rol válido y usa una contraseña de 12 a 128 caracteres.'
                });
            }

            try {
                const request = pool.request();
                const result = await request
                    .input('nombre', sql.VarChar(100), nombre.trim())
                    .input('telefono', sql.VarChar(20), telefono)
                    .input('correo', sql.VarChar(100), correo.trim())
                    .input('clave', sql.VarChar(255), await hashPassword(clave))
                    .query(`
                        INSERT INTO Administrador (Nombre, Telefono, Correo, Clave)
                        OUTPUT INSERTED.idAdministrador
                        VALUES (@nombre, @telefono, @correo, @clave)
                    `);

                if (result.rowsAffected[0] > 0) {
                    await adminSecurity.recordAdminCreated(result.recordset[0].idAdministrador, rol);
                    res.status(201).json({ message: 'Administrador creado exitosamente.', rol });
                } else {
                    throw new Error('No se pudo crear el administrador.');
                }
            } catch (err) {
                console.error('Error al registrar administrador:', err.stack);
                if (err.number === 2627) { 
                    return res.status(409).json({ message: 'El correo electrónico ya está registrado.' });
                }
                res.status(500).json({ message: 'Error interno del servidor al registrar el administrador.' });
            }
        });

        // Endpoint para obtener todos los administradores
        app.get('/api/admin/all', adminSecurity.requireRoles('Administrador'), async (req, res) => {
            try {
                const result = await pool.request().query(`
                    SELECT
                        a.idAdministrador,
                        a.Nombre,
                        a.Correo,
                        COALESCE(s.Role, 'Administrador') AS Rol
                    FROM Administrador a
                    LEFT JOIN dbo.AdminSecurity s ON s.AdminId = a.idAdministrador
                    ORDER BY a.Nombre, a.Correo
                `);
                res.setHeader('Cache-Control', 'no-store');
                res.json(result.recordset);
            } catch (err) {
                console.error('Error al obtener todos los administradores:', err.stack);
                res.status(500).json({ message: 'Error interno del servidor.' });
            }
        });

        app.put('/api/admin/:id/role', adminSecurity.requireRoles('Administrador'), async (req, res) => {
            const { id } = req.params;
            const { rol } = req.body || {};
            if (!/^\d+$/.test(id) || Number(id) > 2147483647 ||
                !['Administrador', 'Operador'].includes(rol)) {
                return res.status(400).json({ message: 'El identificador o el rol no son válidos.' });
            }
            if (Number(id) === req.admin.id) {
                return res.status(400).json({ message: 'No puedes cambiar el rol de la cuenta con la que tienes la sesión activa.' });
            }

            try {
                const updated = await adminSecurity.setAdminRole(Number(id), rol, req.admin.id);
                if (!updated) {
                    return res.status(404).json({ message: 'No se encontró el perfil que deseas actualizar.' });
                }
                res.json({ message: `Rol actualizado a ${rol}.`, rol });
            } catch (err) {
                console.error('Error al actualizar el rol del administrador:', err.stack);
                res.status(500).json({ message: 'No se pudo actualizar el rol del perfil.' });
            }
        });

        // Endpoint para eliminar un administrador
        app.delete('/api/admin/:id', adminSecurity.requireRoles('Administrador'), async (req, res) => {
            const { id } = req.params;
            if (!/^\d+$/.test(id) || Number(id) > 2147483647) {
                return res.status(400).json({ message: 'El identificador de administrador no es válido.' });
            }
            if (Number(id) === req.admin.id) {
                return res.status(400).json({ message: 'No puedes eliminar la cuenta con la que tienes la sesión activa.' });
            }

            try {
                const result = await pool.request()
                    .input('id', sql.Int, id)
                    .query('DELETE FROM Administrador WHERE idAdministrador = @id');

                if (result.rowsAffected[0] > 0) {
                    await adminSecurity.recordAdminDeleted(Number(id));
                    res.json({ message: 'Administrador eliminado exitosamente.' });
                } else {
                    res.status(404).json({ message: 'No se encontró el administrador para eliminar.' });
                }
            } catch (err) {
                console.error('Error al eliminar administrador:', err.stack);
                res.status(500).json({ message: 'Error interno del servidor.' });
            }
});

        const sslPath = path.join(__dirname, 'security');
        const sslOptions = {
            key: fs.readFileSync(path.join(sslPath, 'server.key')),
            cert: fs.readFileSync(path.join(sslPath, 'server.crt')),
            minVersion: 'TLSv1.2'
        };

        const port = 3443; 
        https.createServer(sslOptions, app).listen(port, () => {
            console.log('----------------------------------------------------');
            console.log(`SERVIDOR HotelSys OPERANDO EN MODO SEGURO (HTTPS)`);
            console.log(`URL: https://localhost:${port}`);
            console.log('Protecciones activas: TLS 1.2+, Rate-Limit, Helmet');
            console.log('----------------------------------------------------');
        });

        if (process.env.NODE_ENV !== 'production') {
            for (const host of ['127.0.0.1', '::1']) {
                const localApi = http.createServer(app);
                localApi.on('error', error => {
                    console.error(`No se pudo iniciar la API local en http://${host}:3000:`, error);
                });
                localApi.listen(3000, host, () => {
                    console.log(`API local para Live Server disponible en http://${host}:3000`);
                });
            }
        }

    } catch (err) {
        console.error('Error al conectar a la base de datos:', err.stack);
        process.exitCode = 1;
    }
};

startServer();
