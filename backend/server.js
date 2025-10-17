const express = require('express');
const sql = require('mssql/msnodesqlv8'); // FORZAMOS el uso del driver correcto
const cors = require('cors');

const app = express();
app.use(cors()); // Habilita CORS para permitir peticiones desde el frontend
app.use(express.json()); // Habilita el parseo de bodies en formato JSON

// Configuración de la base de datos usando una cadena de conexión para msnodesqlv8
const dbConfig = {
    connectionString: 'Driver={ODBC Driver 17 for SQL Server};Server=(localdb)\\valeriat;Database=HotelSys;Trusted_Connection=yes;'
};


let pool; // Declaramos el pool de conexiones aquí para que sea accesible globalmente

app.get('/api/habitaciones/:id', async (req, res) => {
    const habitacionId = req.params.id;

    try { // Usamos el pool de conexiones para ejecutar la consulta
        const result = await pool.request()
            .input('id', sql.NVarChar, habitacionId)
            .query('SELECT * FROM Habitaciones WHERE HabitacionID = @id');

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
    const { correo, clave } = req.body; // Cambiamos 'contrasena' por 'clave' para consistencia

    if (!correo || !clave) {
        return res.status(400).json({ message: 'El correo y la contraseña son obligatorios.' });
    }

    try {
        const result = await pool.request()
            .input('correo', sql.NVarChar, correo)
            .input('clave', sql.NVarChar, clave) // Usamos el parámetro @clave
            .query('SELECT Nombre, Correo FROM Administrador WHERE Correo = @correo AND Clave = @clave');

        if (result.recordset.length > 0) {
            res.json({ message: 'Inicio de sesión exitoso', admin: result.recordset[0] });
        } else {
            res.status(401).json({ message: 'Credenciales incorrectas.' });
        }
    } catch (err) {
        console.error('Error en el login:', err); // Cambiamos err.stack por err para un mensaje más conciso
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});

app.post('/api/habitaciones', async (req, res) => {
    const { tipo, precio, capacidad, servicios } = req.body;

    if (!tipo || !precio || !capacidad || !servicios) {
        return res.status(400).json({ message: 'Todos los campos son obligatorios.' });
    }

    try {
        // Asumimos que HabitacionID es autoincremental y no necesitamos insertarlo.
        const result = await pool.request()
            .input('tipo', sql.NVarChar, tipo)
            .input('precio', sql.Decimal(10, 2), precio)
            .input('capacidad', sql.Int, capacidad)
            .input('servicios', sql.NVarChar, servicios)
            .query('INSERT INTO Habitaciones (Tipo, Precio, Capacidad, Servicios) VALUES (@tipo, @precio, @capacidad, @servicios)');

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
