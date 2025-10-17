const express = require('express');
const sql = require('mssql/msnodesqlv8'); // FORZAMOS el uso del driver correcto
const cors = require('cors');

const app = express();
app.use(cors()); // Habilita CORS para permitir peticiones desde el frontend

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
