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


export async function ensureSpecialTrainingDepartments() {

    const specialDepartments = [
        {
            name:
                "Staff Training",

            shortCode:
                "STAFF",

            description:
                "Interactive training and assessments for Hendry County Project staff recruits.",

            accentColor:
                "#FF7A00"
        },

        {
            name:
                "Joint Department Training",

            shortCode:
                "JOINT",

            description:
                "Shared training sessions for HCSO, CPD and FHP trainees and FTOs.",

            accentColor:
                "#8E5BD9"
        }
    ];


    for (
        const department
        of specialDepartments
    ) {

        const [
            existing
        ] =
            await trainingDatabase.execute(
                `
                    SELECT id

                    FROM training_departments

                    WHERE UPPER(short_code) = ?

                    LIMIT 1
                `,
                [
                    department.shortCode
                ]
            );


        if (
            existing.length
        ) {

            await trainingDatabase.execute(
                `
                    UPDATE training_departments

                    SET
                        name = ?,
                        description = ?,
                        accent_color = ?,
                        is_active = 1

                    WHERE id = ?
                `,
                [
                    department.name,
                    department.description,
                    department.accentColor,
                    existing[0].id
                ]
            );


            continue;
        }


        await trainingDatabase.execute(
            `
                INSERT INTO training_departments
                (
                    name,
                    short_code,
                    description,
                    accent_color,
                    created_by_discord_id,
                    is_active
                )

                VALUES
                (
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    1
                )
            `,
            [
                department.name,
                department.shortCode,
                department.description,
                department.accentColor,
                "SYSTEM"
            ]
        );
    }
}


export async function ensureQuestionGuidanceColumn() {

    const [
        rows
    ] =
        await trainingDatabase.execute(
            `
                SELECT COLUMN_NAME

                FROM information_schema.COLUMNS

                WHERE
                    TABLE_SCHEMA = DATABASE()
                    AND TABLE_NAME = 'training_questions'
                    AND COLUMN_NAME = 'fto_marking_guidance'
            `
        );


    if (!rows.length) {

        await trainingDatabase.execute(
            `
                ALTER TABLE training_questions

                ADD COLUMN fto_marking_guidance
                TEXT NULL
                AFTER requires_manual_marking
            `
        );
    }
}


export default trainingDatabase;