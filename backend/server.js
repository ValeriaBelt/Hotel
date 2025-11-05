const express = require('express');
const sql = require('mssql/msnodesqlv8'); 
const cors = require('cors');

const app = express();
app.use(cors()); 
app.use(express.json()); 



const dbConfig = {
    connectionString: 'Driver={ODBC Driver 17 for SQL Server};Server=(localdb)\\valeriat;Database=HotelSys;Trusted_Connection=yes;'
};


const startServer = async () => {
    try {
        const pool = await new sql.ConnectionPool(dbConfig).connect(); 
        console.log('Conectado a la base de datos SQL Server.');

        // --- Definición de rutas de la API ---

        app.get('/api/habitaciones/all', async (req, res) => {
            try {
                const result = await pool.request().query('SELECT idHabitacion, NumeroHabitacion, Tipo, Descripcion, PrecioPorNoche FROM Habitaciones ORDER BY NumeroHabitacion');
                res.json(result.recordset);
            } catch (err) {
                console.error('Error al obtener todas las habitaciones:', err.stack);
                res.status(500).json({ message: 'Error interno del servidor.' });
            }
        });
        
        app.post('/api/admin/login', async (req, res) => {
            const { correo, clave } = req.body; 
            if (!correo || !clave) {
                return res.status(400).json({ message: 'El correo y la contraseña son obligatorios.' });
            }
        
            try {
                const result = await pool.request()
                    .input('correo', sql.NVarChar, correo)
                    .input('clave', sql.NVarChar, clave) 
                    .query('SELECT Nombre, Correo FROM Administrador WHERE Correo = @correo AND Clave = @clave');
        
                if (result.recordset.length > 0) {
                    res.json({ message: 'Inicio de sesión exitoso', admin: result.recordset[0] });
                } else {
                    res.status(401).json({ message: 'Credenciales incorrectas.' });
                }
            } catch (err) {
                console.error('Error en el login:', err); 
                res.status(500).json({ message: 'Error interno del servidor' });
            }
        });
        
        app.post('/api/habitaciones', async (req, res) => {
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
        });
        
        app.put('/api/habitaciones/:id', async (req, res) => {
            const { id } = req.params;
            const { tipo, descripcion, precio } = req.body;
            
            let updateFields = [];
            let request = pool.request().input('id', sql.Int, id);
        
            if (tipo !== undefined && tipo !== null && tipo.trim() !== '') {
                updateFields.push('Tipo = @tipo');
                request.input('tipo', sql.NVarChar, tipo);
            }
            if (descripcion !== undefined && descripcion !== null) { // Permite que la descripción sea una cadena vacía
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
        });
        
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

                // 1. Buscar si el cliente ya existe por su email
                let clienteResult = await request.input('email', sql.NVarChar, email)
                .query('SELECT idCliente FROM Clientes WHERE Email = @email');
                
                let idCliente;

                if (clienteResult.recordset.length > 0) {
                    // Si el cliente existe, usamos su ID
                    idCliente = clienteResult.recordset[0].idCliente;
                } else {
                    // Si el cliente no existe, lo creamos y obtenemos su nuevo ID
                    const insertClienteResult = await request.input('nombre', sql.NVarChar, nombre)
                    .input('telefono', sql.NVarChar, telefono)
                    .query('INSERT INTO Clientes (Nombre, Email, Telefono) OUTPUT INSERTED.idCliente VALUES (@nombre, @email, @telefono)');
                    idCliente = insertClienteResult.recordset[0].idCliente;
                }

                // 2. Crear la reserva con el idCliente obtenido
                const reservaRequest = new sql.Request(transaction); // Nuevo request para la inserción final
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
                // Verificar si es un error de clave única (cliente duplicado por email, aunque ya lo manejamos)
                if (err.number === 2627 || err.number === 2601) {
                    return res.status(409).json({ message: 'Error de conflicto. Posiblemente un dato duplicado.' });
                }
                res.status(500).json({ message: 'Error interno del servidor al crear la reserva.' });
            }
        });

        const port = 3000;
        app.listen(port, () => {
            console.log(`Servidor corriendo en http://localhost:${port}`);
        });        
    } catch (err) {
        console.error('Error al conectar a la base de datos:', err.stack);
    }
};

startServer();
