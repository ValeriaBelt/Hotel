const express = require('express');
const sql = require('mssql/msnodesqlv8'); 
const cors = require('cors');

const app = express();
app.use(cors()); 
app.use(express.json()); 



const dbConfig = {
    connectionString: 'Driver={ODBC Driver 17 for SQL Server};Server=(localdb)\\valeriat;Database=HotelSys;Trusted_Connection=yes;'
};


let pool; 

app.get('/api/habitaciones/all', async (req, res) => {
    try {
        const result = await pool.request().query('SELECT idHabitacion, NumeroHabitacion, Tipo, Descripcion, PrecioPorNoche FROM Habitaciones ORDER BY NumeroHabitacion');
        res.json(result.recordset);
    } catch (err) {
        console.error('Error al obtener todas las habitaciones:', err.stack);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});
app.get('/api/habitaciones/:id', async (req, res) => {
    const idHabitacion = req.params.id;

    try { 
        const result = await pool.request()
            .input('id', sql.NVarChar, idHabitacion)
            .query('SELECT * FROM Habitaciones WHERE idHabitacion = @id');

        if (result.recordset.length > 0) {
            res.json(result.recordset[0]); 
        } else {
            res.status(404).json({ message: 'Habitación no encontrada' });
        }
    } catch (err) {
        console.error('Error en la consulta a la base de datos:', err.stack);
        res.status(500).json({ message: 'Error interno del servidor' });
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

    if (!tipo || tipo.trim() === '' || precio === undefined || precio === null || precio === '') {
        return res.status(400).json({ message: 'Todos los campos (tipo, descripción y precio) son obligatorios.' });
    }

    try {
        const result = await pool.request()
            .input('id', sql.Int, id)
            .input('tipo', sql.NVarChar, tipo)
            .input('descripcion', sql.NVarChar, descripcion)
            .input('precio', sql.Decimal(10, 2), precio)
            .query('UPDATE Habitaciones SET Tipo = @tipo, Descripcion = @descripcion, PrecioPorNoche = @precio WHERE idHabitacion = @id');

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
                    (r.FechaLlegada < @salida AND r.FechaSalida > @llegada)
                )
            )
        `;

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

const startServer = async () => {
    try {
        pool = await new sql.ConnectionPool(dbConfig).connect(); 
        console.log('Conectado a la base de datos SQL Server.');

        const port = 3000;
        app.listen(port, () => {
            console.log(`Servidor corriendo en http://localhost:${port}`);
        });        
    } catch (err) {
        console.error('Error al conectar a la base de datos:', err.stack);
    }
};

startServer();
