import mysql from "mysql2/promise";


const trainingDatabase = mysql.createPool({

    host: process.env.TRAINING_DB_HOST,

    port: Number(
        process.env.TRAINING_DB_PORT || 3306
    ),

    user: process.env.TRAINING_DB_USER,

    password: process.env.TRAINING_DB_PASSWORD,

    database: process.env.TRAINING_DB_NAME,

    waitForConnections: true,

    connectionLimit: 10,

    queueLimit: 0,

    charset: "utf8mb4"

});


export async function testTrainingDatabase() {

    const connection =
        await trainingDatabase.getConnection();

    try {

        await connection.query(
            "SELECT 1"
        );

        console.log(
            "✅ HCP Training MySQL connected."
        );

    } finally {

        connection.release();

    }

}


export default trainingDatabase;