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
app.use(express.json()); 
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
            const { numero, tipo, descripcion, precio } = req.body;
        
            if (numero === undefined || numero === null || numero === '' ||
                precio === undefined || precio === null || precio === '' ||
                !tipo || tipo.trim() === '' || !descripcion || descripcion.trim() === '') {
                return res.status(400).json({ message: 'Todos los campos son obligatorios.' });
            }
        
            try {
        
                const result = await pool.request()
                    .input('numero', sql.Int, numero)
                    .input('tipo', sql.NVarChar, tipo)
                    .input('descripcion', sql.NVarChar, descripcion)
                    .input('precio', sql.Decimal(10, 2), precio)
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
            const { tipo, descripcion, precio } = req.body;
            
            let updateFields = [];
            let request = pool.request().input('id', sql.Int, id);
        
            if (tipo !== undefined && tipo !== null && tipo.trim() !== '') {
                updateFields.push('Tipo = @tipo');
                request.input('tipo', sql.NVarChar, tipo);
            }
            if (descripcion !== undefined && descripcion !== null) { 
                updateFields.push('Descripcion = @descripcion');
                request.input('descripcion', sql.NVarChar, descripcion);
            }
            if (precio !== undefined && precio !== null && precio !== '') {
                updateFields.push('PrecioPorNoche = @precio');
                request.input('precio', sql.Decimal(10, 2), precio);
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
        
            if (!llegada || !salida) {
                return res.status(400).json({ message: 'Las fechas de llegada y salida son obligatorias.' });
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
            try {
                const result = await pool.request()
                    .input('id', sql.Int, id)
                    .query('SELECT * FROM Habitaciones WHERE idHabitacion = @id');
        
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
            const { idHabitacion, fechaLlegada, fechaSalida, nombre, email, telefono } = req.body;

            if (!idHabitacion || !fechaLlegada || !fechaSalida || !nombre || !email || !telefono) {
                return res.status(400).json({ message: 'Todos los campos son obligatorios para la reserva.' });
            }

            const transaction = new sql.Transaction(pool);
            try {
                await transaction.begin();
                const request = new sql.Request(transaction);

                // Busca si el cliente ya existe por su correo
                let clienteResult = await request.input('email', sql.NVarChar, email)
                .query('SELECT idCliente FROM Clientes WHERE Email = @email');
                
                let idCliente;

                if (clienteResult.recordset.length > 0) {
                    // Si el cliente existe, se usa su ID
                    idCliente = clienteResult.recordset[0].idCliente;
                } else {
                    // Si el cliente no existe, se crea y obtiene su nuevo ID
                    const insertClienteResult = await request.input('nombre', sql.NVarChar, nombre)
                    .input('telefono', sql.NVarChar, telefono)
                    .query('INSERT INTO Clientes (Nombre, Email, Telefono) OUTPUT INSERTED.idCliente VALUES (@nombre, @email, @telefono)');
                    idCliente = insertClienteResult.recordset[0].idCliente;
                }

                // Crear la reserva con el idCliente obtenido
                const reservaRequest = new sql.Request(transaction); 
                const resultReserva = await reservaRequest
                    .input('idHabitacion', sql.Int, idHabitacion)
                    .input('idCliente', sql.Int, idCliente)
                    .input('fechaEntrada', sql.Date, fechaLlegada)
                    .input('fechaSalida', sql.Date, fechaSalida)
                    .query('INSERT INTO Reservas (idHabitacion, idCliente, FechaEntrada, FechaSalida) VALUES (@idHabitacion, @idCliente, @fechaEntrada, @fechaSalida)');

                if (resultReserva.rowsAffected[0] > 0) {
                    await transaction.commit();
                    res.status(201).json({ message: 'Reserva creada exitosamente.' });
                } else {
                    throw new Error('No se pudo crear la reserva.');
                }

            } catch (err) {
                console.error('Error en la transacción de reserva:', err.stack);
                try {
                    await transaction.rollback();
                } catch (rollbackErr) {
                    console.error('Error al hacer rollback de la transacción:', rollbackErr.stack);
                }
                // Verificar si es un error de clave única
                if (err.number === 2627 || err.number === 2601) {
                    return res.status(409).json({ message: 'Error de conflicto. Posiblemente un dato duplicado.' });
                }
                res.status(500).json({ message: 'Error interno del servidor al crear la reserva.' });
            }
        });

        // Endpoint para buscar reservas por email o teléfono del cliente
        app.get('/api/reservas/buscar', async (req, res) => {
            const { termino } = req.query;
        
            if (!termino) {
                return res.status(400).json({ message: 'Se requiere un término de búsqueda (email o teléfono).' });
            }
        
            try {
                const request = pool.request();
                const result = await request.input('termino', sql.NVarChar, `%${termino}%`)
                    .query(`
                        SELECT 
                            r.idReserva, r.FechaEntrada, r.FechaSalida,
                            h.NumeroHabitacion, h.Tipo,
                            c.Nombre, c.Email, c.Telefono
                        FROM Reservas r
                        JOIN Habitaciones h ON r.idHabitacion = h.idHabitacion
                        JOIN Clientes c ON r.idCliente = c.idCliente
                        WHERE c.Email LIKE @termino OR c.Telefono LIKE @termino
                        ORDER BY r.FechaEntrada DESC
                    `);
                
                res.json(result.recordset);
        
            } catch (err) {
                console.error('Error al buscar reservas:', err.stack);
                res.status(500).json({ message: 'Error interno del servidor al buscar reservas.' });
            }
        });

        // Endpoint para cancelar una reserva
        app.delete('/api/reservas/:id', async (req, res) => {
            const { id } = req.params;
            try {
                const result = await pool.request().input('id', sql.Int, id).query('DELETE FROM Reservas WHERE idReserva = @id');
                if (result.rowsAffected[0] > 0) res.json({ message: 'Reserva cancelada exitosamente.' });
                else res.status(404).json({ message: 'No se encontró la reserva para cancelar.' });
            } catch (err) {
                console.error('Error al cancelar la reserva:', err.stack);
                res.status(500).json({ message: 'Error interno del servidor.' });
            }
        });

        // Endpoint para registrar un nuevo administrador
        app.post('/api/admin/register', adminSecurity.requireRoles('Administrador'), async (req, res) => {
            const { nombre, telefono, correo, clave, rol } = req.body;

            if (typeof nombre !== 'string' || typeof telefono !== 'string' ||
                typeof correo !== 'string' || typeof clave !== 'string' ||
                !nombre.trim() || !telefono.trim() || !correo.trim() ||
                clave.length < 12 || clave.length > 128 ||
                !['Administrador', 'Operador'].includes(rol)) {
                return res.status(400).json({
                    message: 'Completa todos los campos, elige un rol válido y usa una contraseña de 12 a 128 caracteres.'
                });
            }

            try {
                const request = pool.request();
                const result = await request
                    .input('nombre', sql.NVarChar, nombre)
                    .input('telefono', sql.NVarChar, telefono)
                    .input('correo', sql.NVarChar, correo)
                    .input('clave', sql.VarChar(255), await hashPassword(clave))
                    .query(`
                        INSERT INTO Administrador (Nombre, Telefono, Correo, Clave)
                        OUTPUT INSERTED.idAdministrador
                        VALUES (@nombre, @telefono, @correo, @clave)
                    `);

                if (result.rowsAffected[0] > 0) {
                    await adminSecurity.recordAdminCreated(result.recordset[0].idAdministrador, rol);
                    res.status(201).json({ message: 'Administrador creado exitosamente.' });
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
                res.json(result.recordset);
            } catch (err) {
                console.error('Error al obtener todos los administradores:', err.stack);
                res.status(500).json({ message: 'Error interno del servidor.' });
            }
        });

        // Endpoint para eliminar un administrador
        app.delete('/api/admin/:id', adminSecurity.requireRoles('Administrador'), async (req, res) => {
            const { id } = req.params;
            if (!/^\d+$/.test(id)) {
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
            cert: fs.readFileSync(path.join(sslPath, 'server.crt'))
        };

        const port = 3443; 
        https.createServer(sslOptions, app).listen(port, () => {
            console.log('----------------------------------------------------');
            console.log(`SERVIDOR HotelSys OPERANDO EN MODO SEGURO (HTTPS)`);
            console.log(`URL: https://localhost:${port}`);
            console.log('Protecciones activas: TLS 1.3, Rate-Limit, Helmet');
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
