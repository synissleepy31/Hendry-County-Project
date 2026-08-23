import express from "express";

import trainingDatabase, { ensureSpecialTrainingDepartments, ensureQuestionGuidanceColumn } from "../services/database.js";
import { requireManagement } from "../services/permissions.js";


const router =
    express.Router();

// Assessment creation/editing is restricted to Training Management/Admin.
//
// IMPORTANT:
// This router is mounted globally with app.use(assessmentsRouter).
// A blanket router.use(requireManagement) would also catch /login,
// /auth/discord, /training, etc. and redirect unauthenticated users
// back to /login forever.
//
// Only protect routes that actually belong to /training/assessments.
router.use(
    (req, res, next) => {

        if (
            req.path === "/training/assessments" ||
            req.path.startsWith("/training/assessments/")
        ) {
            return requireManagement(
                req,
                res,
                next
            );
        }

        next();
    }
);


// ======================================================
// HELPERS
// ======================================================

function requireTrainingLogin(
    req,
    res,
    next
) {

    if (
        !req.session.trainingUser
    ) {

        return res.redirect(
            "/login"
        );

    }


    next();

}


function getTrainingUserDetails(
    user
) {

    const displayName =
        user.global_name ||
        user.username ||
        "Discord User";


    const avatar =
        user.avatar

            ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`

            : "https://cdn.discordapp.com/embed/avatars/0.png";


    return {

        id:
            user.id,

        username:
            user.username,

        displayName,

        avatar

    };

}


// ======================================================
// ASSESSMENTS PAGE
// ======================================================

router.get(
    "/training/assessments",
    requireTrainingLogin,
    async (
        req,
        res
    ) => {

        try {

            await ensureQuestionGuidanceColumn();


            await ensureSpecialTrainingDepartments();


            const user =
                getTrainingUserDetails(
                    req.session.trainingUser
                );


            // ------------------------------------------
            // GET DEPARTMENTS
            // ------------------------------------------

            const [
                departments
            ] =
                await trainingDatabase.execute(
                    `
                        SELECT
                            id,
                            name,
                            short_code,
                            accent_color

                        FROM training_departments

                        WHERE is_active = 1

                        ORDER BY
                            display_order ASC,
                            name ASC
                    `
                );


            // ------------------------------------------
            // GET ASSESSMENTS
            // ------------------------------------------

            const [
                assessments
            ] =
                await trainingDatabase.execute(
                    `
                        SELECT
                            a.id,
                            a.department_id,
                            a.name,
                            a.description,
                            a.pass_mark_percent,
                            a.is_active,
                            a.created_at,
                            a.updated_at,

                            d.name
                                AS department_name,

                            d.short_code
                                AS department_code,

                            d.accent_color
                                AS department_color,

                            d.logo_url
                                AS department_logo,

                            (
                                SELECT COUNT(*)

                                FROM training_sections s

                                WHERE
                                    s.assessment_id =
                                    a.id
                            )
                                AS section_count,

                            (
                                SELECT COUNT(*)

                                FROM training_questions q

                                INNER JOIN training_sections s
                                    ON s.id =
                                    q.section_id

                                WHERE
                                    s.assessment_id =
                                    a.id
                            )
                                AS question_count

                        FROM training_assessments a

                        INNER JOIN training_departments d
                            ON d.id =
                            a.department_id

                        WHERE a.is_active = 1

                        ORDER BY
                            d.name ASC,
                            a.name ASC
                    `
                );


            return res.render(
                "assessments",
                {

                    user,

                    departments,

                    assessments,

                    message:
                        req.query.message ||
                        "",

                    error:
                        req.query.error ||
                        ""

                }
            );


        } catch (error) {

            console.error(
                "[TRAINING ASSESSMENTS] Load error:",
                error
            );


            return res
                .status(500)
                .send(
                    "Could not load assessments."
                );

        }

    }
);


// ======================================================
// CREATE ASSESSMENT
// ======================================================

router.post(
    "/training/assessments/create",
    requireTrainingLogin,
    async (
        req,
        res
    ) => {

        try {

            const departmentId =
                Number(
                    req.body.department_id
                );


            const name =
                String(
                    req.body.name ||
                    ""
                ).trim();


            const description =
                String(
                    req.body.description ||
                    ""
                ).trim();


            let passMark =
                Number(
                    req.body.pass_mark_percent
                );


            if (
                !departmentId ||
                !name
            ) {

                return res.redirect(
                    "/training/assessments?error=" +
                    encodeURIComponent(
                        "Department and assessment name are required."
                    )
                );

            }


            if (
                Number.isNaN(
                    passMark
                )
            ) {

                passMark =
                    70;

            }


            passMark =
                Math.min(
                    100,
                    Math.max(
                        0,
                        passMark
                    )
                );


            // ------------------------------------------
            // CHECK DEPARTMENT
            // ------------------------------------------

            const [
                departmentRows
            ] =
                await trainingDatabase.execute(
                    `
                        SELECT id

                        FROM training_departments

                        WHERE
                            id = ?
                            AND is_active = 1

                        LIMIT 1
                    `,
                    [
                        departmentId
                    ]
                );


            if (
                departmentRows.length ===
                0
            ) {

                return res.redirect(
                    "/training/assessments?error=" +
                    encodeURIComponent(
                        "That department does not exist or is disabled."
                    )
                );

            }


            // ------------------------------------------
            // CREATE
            // ------------------------------------------

            await trainingDatabase.execute(
                `
                    INSERT INTO training_assessments
                    (
                        department_id,
                        name,
                        description,
                        pass_mark_percent,
                        is_active,
                        created_by_discord_id
                    )

                    VALUES
                    (
                        ?,
                        ?,
                        ?,
                        ?,
                        1,
                        ?
                    )
                `,
                [

                    departmentId,

                    name,

                    description ||
                    null,

                    passMark,

                    req.session
                        .trainingUser
                        .id

                ]
            );


            console.log(
                `[TRAINING] ${req.session.trainingUser.username} created assessment "${name}".`
            );


            return res.redirect(
                "/training/assessments?message=" +
                encodeURIComponent(
                    `${name} was created successfully.`
                )
            );


        } catch (error) {

            console.error(
                "[TRAINING ASSESSMENT] Create error:",
                error
            );


            return res.redirect(
                "/training/assessments?error=" +
                encodeURIComponent(
                    "Could not create that assessment."
                )
            );

        }

    }
);


// ======================================================
// UPDATE ASSESSMENT
// ======================================================

router.post(
    "/training/assessments/:id/update",
    requireTrainingLogin,
    async (
        req,
        res
    ) => {

        try {

            const assessmentId =
                Number(
                    req.params.id
                );


            const departmentId =
                Number(
                    req.body.department_id
                );


            const name =
                String(
                    req.body.name ||
                    ""
                ).trim();


            const description =
                String(
                    req.body.description ||
                    ""
                ).trim();


            let passMark =
                Number(
                    req.body.pass_mark_percent
                );


            const isActive =
                req.body.is_active ===
                "1"

                    ? 1

                    : 0;


            if (
                !assessmentId ||
                !departmentId ||
                !name
            ) {

                return res.redirect(
                    "/training/assessments?error=" +
                    encodeURIComponent(
                        "Invalid assessment information."
                    )
                );

            }


            if (
                Number.isNaN(
                    passMark
                )
            ) {

                passMark =
                    70;

            }


            passMark =
                Math.min(
                    100,
                    Math.max(
                        0,
                        passMark
                    )
                );


            await trainingDatabase.execute(
                `
                    UPDATE training_assessments

                    SET
                        department_id = ?,
                        name = ?,
                        description = ?,
                        pass_mark_percent = ?,
                        is_active = ?

                    WHERE id = ?
                `,
                [

                    departmentId,

                    name,

                    description ||
                    null,

                    passMark,

                    isActive,

                    assessmentId

                ]
            );


            return res.redirect(
                "/training/assessments?message=" +
                encodeURIComponent(
                    `${name} was updated successfully.`
                )
            );


        } catch (error) {

            console.error(
                "[TRAINING ASSESSMENT] Update error:",
                error
            );


            return res.redirect(
                "/training/assessments?error=" +
                encodeURIComponent(
                    "Could not update that assessment."
                )
            );

        }

    }
);


// ======================================================
// CLONE ASSESSMENT
// ======================================================

router.post(
    "/training/assessments/:id/clone",
    requireTrainingLogin,
    async (
        req,
        res
    ) => {

        let connection;


        try {

            await ensureQuestionGuidanceColumn();


            const sourceAssessmentId =
                Number(
                    req.params.id
                );


            const departmentId =
                Number(
                    req.body.department_id
                );


            const newName =
                String(
                    req.body.name ||
                    ""
                ).trim();


            if (
                !sourceAssessmentId ||
                !departmentId ||
                !newName
            ) {

                return res.redirect(
                    "/training/assessments?error=" +
                    encodeURIComponent(
                        "Choose a department and enter a name for the copied assessment."
                    )
                );
            }


            const [
                sourceRows
            ] =
                await trainingDatabase.execute(
                    `
                        SELECT
                            id,
                            description,
                            pass_mark_percent

                        FROM training_assessments

                        WHERE id = ?

                        LIMIT 1
                    `,
                    [
                        sourceAssessmentId
                    ]
                );


            if (!sourceRows.length) {

                return res.redirect(
                    "/training/assessments?error=" +
                    encodeURIComponent(
                        "Source assessment not found."
                    )
                );
            }


            connection =
                await trainingDatabase.getConnection();


            await connection.beginTransaction();


            const source =
                sourceRows[0];


            const [
                assessmentResult
            ] =
                await connection.execute(
                    `
                        INSERT INTO training_assessments
                        (
                            department_id,
                            name,
                            description,
                            pass_mark_percent,
                            is_active
                        )

                        VALUES
                        (
                            ?,
                            ?,
                            ?,
                            ?,
                            1
                        )
                    `,
                    [
                        departmentId,
                        newName,
                        source.description,
                        source.pass_mark_percent
                    ]
                );


            const newAssessmentId =
                Number(
                    assessmentResult.insertId
                );


            const [
                sections
            ] =
                await connection.execute(
                    `
                        SELECT *

                        FROM training_sections

                        WHERE assessment_id = ?

                        ORDER BY
                            display_order ASC,
                            id ASC
                    `,
                    [
                        sourceAssessmentId
                    ]
                );


            for (
                const section
                of sections
            ) {

                const [
                    sectionResult
                ] =
                    await connection.execute(
                        `
                            INSERT INTO training_sections
                            (
                                assessment_id,
                                title,
                                subtitle,
                                trainee_content,
                                fto_notes,
                                section_type,
                                display_order,
                                is_active
                            )

                            VALUES
                            (
                                ?,
                                ?,
                                ?,
                                ?,
                                ?,
                                ?,
                                ?,
                                ?
                            )
                        `,
                        [
                            newAssessmentId,
                            section.title,
                            section.subtitle,
                            section.trainee_content,
                            section.fto_notes,
                            section.section_type,
                            section.display_order,
                            section.is_active
                        ]
                    );


                const newSectionId =
                    Number(
                        sectionResult.insertId
                    );


                const [
                    questions
                ] =
                    await connection.execute(
                        `
                            SELECT *

                            FROM training_questions

                            WHERE section_id = ?

                            ORDER BY
                                display_order ASC,
                                id ASC
                        `,
                        [
                            section.id
                        ]
                    );


                for (
                    const question
                    of questions
                ) {

                    await connection.execute(
                        `
                            INSERT INTO training_questions
                            (
                                section_id,
                                question_text,
                                question_type,
                                options_json,
                                correct_answer_json,
                                max_marks,
                                requires_manual_marking,
                                fto_marking_guidance,
                                display_order,
                                is_active
                            )

                            VALUES
                            (
                                ?,
                                ?,
                                ?,
                                ?,
                                ?,
                                ?,
                                ?,
                                ?,
                                ?,
                                ?
                            )
                        `,
                        [
                            newSectionId,
                            question.question_text,
                            question.question_type,
                            question.options_json,
                            question.correct_answer_json,
                            question.max_marks,
                            question.requires_manual_marking,
                            question.fto_marking_guidance,
                            question.display_order,
                            question.is_active
                        ]
                    );
                }
            }


            await connection.commit();


            return res.redirect(
                `/training/assessments/${newAssessmentId}?message=` +
                encodeURIComponent(
                    "Assessment copied successfully. You can now edit the copy."
                )
            );


        } catch (error) {

            if (connection) {

                try {
                    await connection.rollback();
                } catch {
                    // Ignore rollback failure.
                }
            }


            console.error(
                "[TRAINING ASSESSMENT] Clone error:",
                error
            );


            return res.redirect(
                "/training/assessments?error=" +
                encodeURIComponent(
                    "Could not copy that assessment."
                )
            );


        } finally {

            if (connection) {
                connection.release();
            }
        }
    }
);


// ======================================================
// DELETE / ARCHIVE ASSESSMENT
// ======================================================

router.post(
    "/training/assessments/:id/delete",
    requireTrainingLogin,
    async (
        req,
        res
    ) => {

        let connection;


        try {

            const assessmentId =
                Number(
                    req.params.id
                );


            if (!assessmentId) {

                return res.redirect(
                    "/training/assessments?error=" +
                    encodeURIComponent(
                        "Invalid assessment."
                    )
                );
            }


            const [
                assessmentRows
            ] =
                await trainingDatabase.execute(
                    `
                        SELECT
                            id,
                            name

                        FROM training_assessments

                        WHERE id = ?

                        LIMIT 1
                    `,
                    [
                        assessmentId
                    ]
                );


            if (
                !assessmentRows.length
            ) {

                return res.redirect(
                    "/training/assessments?error=" +
                    encodeURIComponent(
                        "That assessment no longer exists."
                    )
                );
            }


            const assessment =
                assessmentRows[0];


            const [
                referenceRows
            ] =
                await trainingDatabase.execute(
                    `
                        SELECT
                            (
                                SELECT COUNT(*)

                                FROM training_sessions

                                WHERE assessment_id = ?
                            )
                                AS session_count,

                            (
                                SELECT COUNT(*)

                                FROM training_attempts

                                WHERE assessment_id = ?
                            )
                                AS attempt_count
                    `,
                    [
                        assessmentId,
                        assessmentId
                    ]
                );


            const sessionCount =
                Number(
                    referenceRows[0]?.session_count ||
                    0
                );


            const attemptCount =
                Number(
                    referenceRows[0]?.attempt_count ||
                    0
                );


            // Preserve historical results/sessions instead of breaking foreign keys.
            if (
                sessionCount > 0 ||
                attemptCount > 0
            ) {

                await trainingDatabase.execute(
                    `
                        UPDATE training_assessments

                        SET is_active = 0

                        WHERE id = ?
                    `,
                    [
                        assessmentId
                    ]
                );


                return res.redirect(
                    "/training/assessments?message=" +
                    encodeURIComponent(
                        `${assessment.name} had existing training history, so it was safely archived instead of permanently deleted.`
                    )
                );
            }


            connection =
                await trainingDatabase.getConnection();


            await connection.beginTransaction();


            await connection.execute(
                `
                    DELETE q

                    FROM training_questions q

                    INNER JOIN training_sections s
                        ON s.id =
                        q.section_id

                    WHERE s.assessment_id = ?
                `,
                [
                    assessmentId
                ]
            );


            await connection.execute(
                `
                    DELETE FROM training_sections

                    WHERE assessment_id = ?
                `,
                [
                    assessmentId
                ]
            );


            await connection.execute(
                `
                    DELETE FROM training_assessments

                    WHERE id = ?
                `,
                [
                    assessmentId
                ]
            );


            await connection.commit();


            return res.redirect(
                "/training/assessments?message=" +
                encodeURIComponent(
                    `${assessment.name} was deleted successfully.`
                )
            );


        } catch (error) {

            if (connection) {

                try {

                    await connection.rollback();

                } catch {
                    // Ignore rollback failure.
                }
            }


            console.error(
                "[TRAINING ASSESSMENT] Delete error:",
                error
            );


            return res.redirect(
                "/training/assessments?error=" +
                encodeURIComponent(
                    "Could not delete that assessment. Check the server console for the database error."
                )
            );


        } finally {

            if (connection) {

                connection.release();
            }
        }
    }
);


// ======================================================
// ASSESSMENT BUILDER
// ======================================================

router.get(
    "/training/assessments/:id",
    requireTrainingLogin,
    async (req, res) => {

        try {

            await ensureQuestionGuidanceColumn();


            const assessmentId =
                Number(req.params.id);

            if (!assessmentId) {

                return res.redirect(
                    "/training/assessments?error=" +
                    encodeURIComponent(
                        "Invalid assessment."
                    )
                );
            }


            const user =
                getTrainingUserDetails(
                    req.session.trainingUser
                );


            const [
                assessmentRows
            ] =
                await trainingDatabase.execute(
                    `
                        SELECT
                            a.id,
                            a.department_id,
                            a.name,
                            a.description,
                            a.pass_mark_percent,
                            a.is_active,
                            d.name AS department_name,
                            d.short_code AS department_code,
                            d.accent_color AS department_color

                        FROM training_assessments a

                        INNER JOIN training_departments d
                            ON d.id = a.department_id

                        WHERE a.id = ?

                        LIMIT 1
                    `,
                    [
                        assessmentId
                    ]
                );


            if (!assessmentRows.length) {

                return res.redirect(
                    "/training/assessments?error=" +
                    encodeURIComponent(
                        "Assessment not found."
                    )
                );
            }


            const assessment =
                assessmentRows[0];


            const [
                sections
            ] =
                await trainingDatabase.execute(
                    `
                        SELECT
                            id,
                            assessment_id,
                            title,
                            subtitle,
                            trainee_content,
                            fto_notes,
                            section_type,
                            display_order,
                            is_active,
                            created_at,
                            updated_at

                        FROM training_sections

                        WHERE assessment_id = ?

                        ORDER BY
                            display_order ASC,
                            id ASC
                    `,
                    [
                        assessmentId
                    ]
                );


            const [
                questions
            ] =
                await trainingDatabase.execute(
                    `
                        SELECT
                            q.id,
                            q.section_id,
                            q.question_text,
                            q.question_type,
                            q.options_json,
                            q.correct_answer_json,
                            q.max_marks,
                            q.requires_manual_marking,
                            q.fto_marking_guidance,
                            q.display_order,
                            q.is_active

                        FROM training_questions q

                        INNER JOIN training_sections s
                            ON s.id = q.section_id

                        WHERE s.assessment_id = ?

                        ORDER BY
                            s.display_order ASC,
                            q.display_order ASC,
                            q.id ASC
                    `,
                    [
                        assessmentId
                    ]
                );


            const questionsBySection = {};

            for (const question of questions) {

                let options = [];
                let correctAnswer = null;

                try {

                    if (
                        question.options_json !== null &&
                        question.options_json !== undefined
                    ) {

                        options =
                            typeof question.options_json === "string"

                                ? JSON.parse(
                                    question.options_json
                                )

                                : question.options_json;
                    }

                } catch {

                    options = [];
                }


                try {

                    if (
                        question.correct_answer_json !== null &&
                        question.correct_answer_json !== undefined
                    ) {

                        correctAnswer =
                            typeof question.correct_answer_json === "string"

                                ? JSON.parse(
                                    question.correct_answer_json
                                )

                                : question.correct_answer_json;
                    }

                } catch {

                    correctAnswer = null;
                }


                const preparedQuestion = {
                    ...question,
                    options,
                    correctAnswer
                };


                if (
                    !questionsBySection[
                        question.section_id
                    ]
                ) {

                    questionsBySection[
                        question.section_id
                    ] = [];
                }


                questionsBySection[
                    question.section_id
                ].push(
                    preparedQuestion
                );
            }


            let totalMarks = 0;

            for (const question of questions) {

                totalMarks +=
                    Number(
                        question.max_marks || 0
                    );
            }


            return res.render(
                "assessment-builder",
                {
                    user,
                    assessment,
                    sections,
                    questionsBySection,
                    totalMarks,

                    message:
                        req.query.message ||
                        "",

                    error:
                        req.query.error ||
                        ""
                }
            );


        } catch (error) {

            console.error(
                "[ASSESSMENT BUILDER] Load error:",
                error
            );


            return res
                .status(500)
                .send(
                    "Could not load the assessment builder."
                );
        }
    }
);


// ======================================================
// CREATE SECTION
// ======================================================

router.post(
    "/training/assessments/:id/sections/create",
    requireTrainingLogin,
    async (req, res) => {

        const assessmentId =
            Number(req.params.id);


        try {

            const title =
                String(
                    req.body.title || ""
                ).trim();


            const subtitle =
                String(
                    req.body.subtitle || ""
                ).trim();


            const traineeContent =
                String(
                    req.body.trainee_content || ""
                ).trim();


            const ftoNotes =
                String(
                    req.body.fto_notes || ""
                ).trim();


            const allowedTypes =
                new Set([
                    "content",
                    "quiz",
                    "practical",
                    "mixed"
                ]);


            const sectionType =
                allowedTypes.has(
                    req.body.section_type
                )

                    ? req.body.section_type

                    : "content";


            if (
                !assessmentId ||
                !title
            ) {

                return res.redirect(
                    `/training/assessments/${assessmentId}?error=` +
                    encodeURIComponent(
                        "Section title is required."
                    )
                );
            }


            const [
                orderRows
            ] =
                await trainingDatabase.execute(
                    `
                        SELECT
                            COALESCE(
                                MAX(display_order),
                                -1
                            ) + 1 AS next_order

                        FROM training_sections

                        WHERE assessment_id = ?
                    `,
                    [
                        assessmentId
                    ]
                );


            await trainingDatabase.execute(
                `
                    INSERT INTO training_sections
                    (
                        assessment_id,
                        title,
                        subtitle,
                        trainee_content,
                        fto_notes,
                        section_type,
                        display_order,
                        is_active
                    )

                    VALUES
                    (
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        1
                    )
                `,
                [
                    assessmentId,
                    title,
                    subtitle || null,
                    traineeContent || null,
                    ftoNotes || null,
                    sectionType,
                    Number(
                        orderRows[0].next_order || 0
                    )
                ]
            );


            return res.redirect(
                `/training/assessments/${assessmentId}?message=` +
                encodeURIComponent(
                    `${title} was added.`
                )
            );


        } catch (error) {

            console.error(
                "[ASSESSMENT BUILDER] Create section error:",
                error
            );


            return res.redirect(
                `/training/assessments/${assessmentId}?error=` +
                encodeURIComponent(
                    "Could not create that section."
                )
            );
        }
    }
);


// ======================================================
// UPDATE SECTION
// ======================================================

router.post(
    "/training/assessments/:assessmentId/sections/:sectionId/update",
    requireTrainingLogin,
    async (req, res) => {

        const assessmentId =
            Number(req.params.assessmentId);

        const sectionId =
            Number(req.params.sectionId);


        try {

            const title =
                String(
                    req.body.title || ""
                ).trim();


            const subtitle =
                String(
                    req.body.subtitle || ""
                ).trim();


            const traineeContent =
                String(
                    req.body.trainee_content || ""
                ).trim();


            const ftoNotes =
                String(
                    req.body.fto_notes || ""
                ).trim();


            const allowedTypes =
                new Set([
                    "content",
                    "quiz",
                    "practical",
                    "mixed"
                ]);


            const sectionType =
                allowedTypes.has(
                    req.body.section_type
                )

                    ? req.body.section_type

                    : "content";


            const isActive =
                req.body.is_active === "0"
                    ? 0
                    : 1;


            if (
                !assessmentId ||
                !sectionId ||
                !title
            ) {

                return res.redirect(
                    `/training/assessments/${assessmentId}?error=` +
                    encodeURIComponent(
                        "Invalid section information."
                    )
                );
            }


            await trainingDatabase.execute(
                `
                    UPDATE training_sections

                    SET
                        title = ?,
                        subtitle = ?,
                        trainee_content = ?,
                        fto_notes = ?,
                        section_type = ?,
                        is_active = ?

                    WHERE
                        id = ?
                        AND assessment_id = ?
                `,
                [
                    title,
                    subtitle || null,
                    traineeContent || null,
                    ftoNotes || null,
                    sectionType,
                    isActive,
                    sectionId,
                    assessmentId
                ]
            );


            return res.redirect(
                `/training/assessments/${assessmentId}?message=` +
                encodeURIComponent(
                    `${title} was updated.`
                )
            );


        } catch (error) {

            console.error(
                "[ASSESSMENT BUILDER] Update section error:",
                error
            );


            return res.redirect(
                `/training/assessments/${assessmentId}?error=` +
                encodeURIComponent(
                    "Could not update that section."
                )
            );
        }
    }
);


// ======================================================
// DELETE SECTION
// ======================================================

router.post(
    "/training/assessments/:assessmentId/sections/:sectionId/delete",
    requireTrainingLogin,
    async (req, res) => {

        const assessmentId =
            Number(req.params.assessmentId);

        const sectionId =
            Number(req.params.sectionId);


        try {

            await trainingDatabase.execute(
                `
                    DELETE FROM training_sections

                    WHERE
                        id = ?
                        AND assessment_id = ?
                `,
                [
                    sectionId,
                    assessmentId
                ]
            );


            return res.redirect(
                `/training/assessments/${assessmentId}?message=` +
                encodeURIComponent(
                    "Section deleted."
                )
            );


        } catch (error) {

            console.error(
                "[ASSESSMENT BUILDER] Delete section error:",
                error
            );


            return res.redirect(
                `/training/assessments/${assessmentId}?error=` +
                encodeURIComponent(
                    "Could not delete that section."
                )
            );
        }
    }
);


// ======================================================
// CREATE QUESTION
// ======================================================

router.post(
    "/training/assessments/:assessmentId/sections/:sectionId/questions/create",
    requireTrainingLogin,
    async (req, res) => {

        const assessmentId =
            Number(req.params.assessmentId);

        const sectionId =
            Number(req.params.sectionId);


        try {

            await ensureQuestionGuidanceColumn();


            const questionText =
                String(
                    req.body.question_text || ""
                ).trim();


            const allowedTypes =
                new Set([
                    "yes_no",
                    "multiple_choice",
                    "text",
                    "practical"
                ]);


            const questionType =
                allowedTypes.has(
                    req.body.question_type
                )

                    ? req.body.question_type

                    : "multiple_choice";


            let maxMarks =
                Number(
                    req.body.max_marks
                );


            if (
                Number.isNaN(maxMarks) ||
                maxMarks <= 0
            ) {

                maxMarks = 1;
            }


            maxMarks =
                Math.min(
                    9999,
                    maxMarks
                );


            if (
                !assessmentId ||
                !sectionId ||
                !questionText
            ) {

                return res.redirect(
                    `/training/assessments/${assessmentId}?error=` +
                    encodeURIComponent(
                        "Question text is required."
                    )
                );
            }


            const [
                sectionRows
            ] =
                await trainingDatabase.execute(
                    `
                        SELECT id

                        FROM training_sections

                        WHERE
                            id = ?
                            AND assessment_id = ?

                        LIMIT 1
                    `,
                    [
                        sectionId,
                        assessmentId
                    ]
                );


            if (!sectionRows.length) {

                return res.redirect(
                    `/training/assessments/${assessmentId}?error=` +
                    encodeURIComponent(
                        "That section does not belong to this assessment."
                    )
                );
            }


            let optionsJson = null;
            let correctAnswerJson = null;
            let requiresManualMarking = 0;


            if (
                questionType ===
                "multiple_choice"
            ) {

                const options = [
                    req.body.option_1,
                    req.body.option_2,
                    req.body.option_3,
                    req.body.option_4
                ]
                    .map(
                        option =>
                            String(
                                option || ""
                            ).trim()
                    )
                    .filter(Boolean);


                if (
                    options.length < 2
                ) {

                    return res.redirect(
                        `/training/assessments/${assessmentId}?error=` +
                        encodeURIComponent(
                            "Multiple-choice questions need at least two answers."
                        )
                    );
                }


                let correctIndex =
                    Number(
                        req.body.correct_option
                    );


                if (
                    Number.isNaN(correctIndex) ||
                    correctIndex < 0 ||
                    correctIndex >= options.length
                ) {

                    correctIndex = 0;
                }


                optionsJson =
                    JSON.stringify(options);


                correctAnswerJson =
                    JSON.stringify({
                        index:
                            correctIndex
                    });
            }


            if (
                questionType ===
                "yes_no"
            ) {

                const correctYesNo =
                    req.body.correct_yes_no === "no"
                        ? "no"
                        : "yes";


                optionsJson =
                    JSON.stringify([
                        "Yes",
                        "No"
                    ]);


                correctAnswerJson =
                    JSON.stringify({
                        value:
                            correctYesNo
                    });
            }


            if (
                questionType === "text" ||
                questionType === "practical"
            ) {

                requiresManualMarking =
                    1;
            }


            const ftoMarkingGuidance =
                (
                    questionType === "text" ||
                    questionType === "practical"
                )
                    ? String(
                        req.body.fto_marking_guidance ||
                        ""
                    ).trim()
                    : "";


            const [
                orderRows
            ] =
                await trainingDatabase.execute(
                    `
                        SELECT
                            COALESCE(
                                MAX(display_order),
                                -1
                            ) + 1 AS next_order

                        FROM training_questions

                        WHERE section_id = ?
                    `,
                    [
                        sectionId
                    ]
                );


            await trainingDatabase.execute(
                `
                    INSERT INTO training_questions
                    (
                        section_id,
                        question_text,
                        question_type,
                        options_json,
                        correct_answer_json,
                        max_marks,
                        requires_manual_marking,
                        fto_marking_guidance,
                        display_order,
                        is_active
                    )

                    VALUES
                    (
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        1
                    )
                `,
                [
                    sectionId,
                    questionText,
                    questionType,
                    optionsJson,
                    correctAnswerJson,
                    maxMarks,
                    requiresManualMarking,
                    ftoMarkingGuidance || null,
                    Number(
                        orderRows[0].next_order || 0
                    )
                ]
            );


            return res.redirect(
                `/training/assessments/${assessmentId}?message=` +
                encodeURIComponent(
                    "Question added."
                )
            );


        } catch (error) {

            console.error(
                "[ASSESSMENT BUILDER] Create question error:",
                error
            );


            return res.redirect(
                `/training/assessments/${assessmentId}?error=` +
                encodeURIComponent(
                    "Could not create that question."
                )
            );
        }
    }
);


// ======================================================
// DELETE QUESTION
// ======================================================

router.post(
    "/training/assessments/:assessmentId/questions/:questionId/delete",
    requireTrainingLogin,
    async (req, res) => {

        const assessmentId =
            Number(req.params.assessmentId);

        const questionId =
            Number(req.params.questionId);


        try {

            await trainingDatabase.execute(
                `
                    DELETE q

                    FROM training_questions q

                    INNER JOIN training_sections s
                        ON s.id = q.section_id

                    WHERE
                        q.id = ?
                        AND s.assessment_id = ?
                `,
                [
                    questionId,
                    assessmentId
                ]
            );


            return res.redirect(
                `/training/assessments/${assessmentId}?message=` +
                encodeURIComponent(
                    "Question deleted."
                )
            );


        } catch (error) {

            console.error(
                "[ASSESSMENT BUILDER] Delete question error:",
                error
            );


            return res.redirect(
                `/training/assessments/${assessmentId}?error=` +
                encodeURIComponent(
                    "Could not delete that question."
                )
            );
        }
    }
);


export default router;