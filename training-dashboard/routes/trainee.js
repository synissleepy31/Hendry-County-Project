import express from "express";
import trainingDatabase from "../services/database.js";
import { getPermissions, canAccessDepartment, renderAccessDenied } from "../services/permissions.js";

const router = express.Router();

function requireTrainingLogin(req, res, next) {
    if (!req.session.trainingUser) {
        return res.redirect("/login");
    }

    next();
}

function getTrainingUserDetails(user) {
    const displayName =
        user.global_name ||
        user.username ||
        "Discord User";

    const avatar = user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`
        : "https://cdn.discordapp.com/embed/avatars/0.png";

    return {
        id: user.id,
        username: user.username,
        displayName,
        avatar
    };
}

function safeJson(value, fallback = null) {
    if (value === null || value === undefined || value === "") {
        return fallback;
    }

    if (typeof value === "object") {
        return value;
    }

    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

async function ensureSubmissionTables() {
    await trainingDatabase.execute(
        `
            CREATE TABLE IF NOT EXISTS training_attempts
            (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                assessment_id BIGINT UNSIGNED NOT NULL,
                trainee_discord_id VARCHAR(32) NOT NULL,
                trainee_username VARCHAR(100) NOT NULL,
                status ENUM('pending_review', 'completed') NOT NULL DEFAULT 'pending_review',
                auto_marks DECIMAL(10,2) NOT NULL DEFAULT 0,
                manual_marks DECIMAL(10,2) NOT NULL DEFAULT 0,
                total_marks DECIMAL(10,2) NOT NULL DEFAULT 0,
                max_marks DECIMAL(10,2) NOT NULL DEFAULT 0,
                auto_possible_marks DECIMAL(10,2) NOT NULL DEFAULT 0,
                pass_mark_percent DECIMAL(5,2) NOT NULL DEFAULT 70,
                percentage DECIMAL(6,2) NULL,
                final_outcome ENUM('pending', 'pass', 'fail') NOT NULL DEFAULT 'pending',
                fto_notes TEXT NULL,
                reviewed_by_discord_id VARCHAR(32) NULL,
                submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                reviewed_at TIMESTAMP NULL DEFAULT NULL,
                PRIMARY KEY (id),
                KEY idx_training_attempts_assessment (assessment_id),
                KEY idx_training_attempts_trainee (trainee_discord_id),
                KEY idx_training_attempts_status (status)
            )
            ENGINE=InnoDB
            DEFAULT CHARSET=utf8mb4
            COLLATE=utf8mb4_unicode_ci
        `
    );

    await trainingDatabase.execute(
        `
            CREATE TABLE IF NOT EXISTS training_attempt_answers
            (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                attempt_id BIGINT UNSIGNED NOT NULL,
                question_id BIGINT UNSIGNED NOT NULL,
                question_text TEXT NOT NULL,
                question_type VARCHAR(40) NOT NULL,
                answer_text TEXT NULL,
                answer_json JSON NULL,
                is_correct TINYINT(1) NULL,
                awarded_marks DECIMAL(10,2) NULL,
                max_marks DECIMAL(10,2) NOT NULL DEFAULT 0,
                requires_manual_marking TINYINT(1) NOT NULL DEFAULT 0,
                review_notes TEXT NULL,
                reviewed_by_discord_id VARCHAR(32) NULL,
                reviewed_at TIMESTAMP NULL DEFAULT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE KEY unique_attempt_question (attempt_id, question_id),
                KEY idx_training_answers_attempt (attempt_id),
                KEY idx_training_answers_question (question_id),
                CONSTRAINT fk_training_attempt_answers_attempt
                    FOREIGN KEY (attempt_id)
                    REFERENCES training_attempts(id)
                    ON DELETE CASCADE
            )
            ENGINE=InnoDB
            DEFAULT CHARSET=utf8mb4
            COLLATE=utf8mb4_unicode_ci
        `
    );
}

// ======================================================
// MY TRAINING - AVAILABLE ASSESSMENTS
// ======================================================

router.get(
    "/training/my-training",
    requireTrainingLogin,
    async (req, res) => {
        try {
            await ensureSubmissionTables();

            const user =
                getTrainingUserDetails(
                    req.session.trainingUser
                );

            const [allAssessments] =
                await trainingDatabase.execute(
                    `
                        SELECT
                            a.id,
                            a.name,
                            a.description,
                            a.pass_mark_percent,
                            d.name AS department_name,
                            d.short_code AS department_code,
                            d.accent_color AS department_color,
                            (
                                SELECT COUNT(*)
                                FROM training_sections s
                                WHERE
                                    s.assessment_id = a.id
                                    AND s.is_active = 1
                            ) AS section_count,
                            (
                                SELECT COUNT(*)
                                FROM training_questions q
                                INNER JOIN training_sections s
                                    ON s.id = q.section_id
                                WHERE
                                    s.assessment_id = a.id
                                    AND s.is_active = 1
                                    AND q.is_active = 1
                            ) AS question_count,
                            (
                                SELECT COALESCE(SUM(q.max_marks), 0)
                                FROM training_questions q
                                INNER JOIN training_sections s
                                    ON s.id = q.section_id
                                WHERE
                                    s.assessment_id = a.id
                                    AND s.is_active = 1
                                    AND q.is_active = 1
                            ) AS total_marks

                        FROM training_assessments a

                        INNER JOIN training_departments d
                            ON d.id = a.department_id

                        WHERE
                            a.is_active = 1
                            AND d.is_active = 1

                        ORDER BY
                            d.name ASC,
                            a.name ASC
                    `
                );

            const permissions = getPermissions(req);
            const assessments = permissions.isManagement
                ? allAssessments
                : allAssessments.filter(a => permissions.traineeDepartments.includes(String(a.department_code).toUpperCase()));

            // Upcoming/live sessions are filtered on the server so trainees never
            // receive another department's sessions in the page HTML.
            const [allUpcomingSessions] = await trainingDatabase.execute(
                `
                    SELECT
                        s.id,
                        s.join_code,
                        s.status,
                        s.scheduled_for,
                        s.started_at,
                        a.name AS assessment_name,
                        a.description AS assessment_description,
                        d.name AS department_name,
                        d.short_code AS department_code,
                        d.accent_color AS department_color,
                        u.display_name AS host_display_name,
                        u.username AS host_username
                    FROM training_sessions s
                    INNER JOIN training_assessments a ON a.id = s.assessment_id
                    INNER JOIN training_departments d ON d.id = s.department_id
                    INNER JOIN training_users u ON u.id = s.host_user_id
                    WHERE s.status IN ('scheduled', 'live')
                    ORDER BY
                        CASE WHEN s.status = 'live' THEN 0 ELSE 1 END,
                        s.scheduled_for ASC,
                        s.id DESC
                `
            );

            const upcomingSessions = permissions.isManagement
                ? allUpcomingSessions
                : allUpcomingSessions.filter(session =>
                    permissions.traineeDepartments.includes(
                        String(session.department_code).toUpperCase()
                    )
                );

            const [recentAttempts] =
                await trainingDatabase.execute(
                    `
                        SELECT
                            ta.id,
                            ta.assessment_id,
                            ta.status,
                            ta.total_marks,
                            ta.max_marks,
                            ta.percentage,
                            ta.final_outcome,
                            ta.submitted_at,
                            a.name AS assessment_name,
                            d.short_code AS department_code

                        FROM training_attempts ta

                        INNER JOIN training_assessments a
                            ON a.id = ta.assessment_id

                        INNER JOIN training_departments d
                            ON d.id = a.department_id

                        WHERE ta.trainee_discord_id = ?

                        ORDER BY ta.submitted_at DESC

                        LIMIT 8
                    `,
                    [user.id]
                );

            return res.render(
                "trainee-training-list",
                {
                    user,
                    assessments,
                    upcomingSessions,
                    recentAttempts
                }
            );

        } catch (error) {
            console.error(
                "[MY TRAINING] Load error:",
                error
            );

            return res
                .status(500)
                .send(
                    "Could not load your training."
                );
        }
    }
);

// ======================================================
// TRAINEE ASSESSMENT VIEW
// ======================================================

router.get(
    "/training/my-training/:id",
    requireTrainingLogin,
    async (req, res) => {
        try {
            await ensureSubmissionTables();

            const assessmentId =
                Number(req.params.id);

            if (!assessmentId) {
                return res.redirect(
                    "/training/my-training"
                );
            }

            const user =
                getTrainingUserDetails(
                    req.session.trainingUser
                );

            const [assessmentRows] =
                await trainingDatabase.execute(
                    `
                        SELECT
                            a.id,
                            a.name,
                            a.description,
                            a.pass_mark_percent,
                            d.name AS department_name,
                            d.short_code AS department_code,
                            d.accent_color AS department_color

                        FROM training_assessments a

                        INNER JOIN training_departments d
                            ON d.id = a.department_id

                        WHERE
                            a.id = ?
                            AND a.is_active = 1
                            AND d.is_active = 1

                        LIMIT 1
                    `,
                    [assessmentId]
                );

            if (!assessmentRows.length) {
                return res
                    .status(404)
                    .send(
                        "That training assessment is not available."
                    );
            }

            const assessment =
                assessmentRows[0];

            if (!canAccessDepartment(req, assessment.department_code, "trainee")) {
                return renderAccessDenied(
                    req,
                    res,
                    "You do not have the trainee role required for this department."
                );
            }

            const [sections] =
                await trainingDatabase.execute(
                    `
                        SELECT
                            id,
                            title,
                            subtitle,
                            trainee_content,
                            section_type,
                            display_order

                        FROM training_sections

                        WHERE
                            assessment_id = ?
                            AND is_active = 1

                        ORDER BY
                            display_order ASC,
                            id ASC
                    `,
                    [assessmentId]
                );

            const [questions] =
                await trainingDatabase.execute(
                    `
                        SELECT
                            q.id,
                            q.section_id,
                            q.question_text,
                            q.question_type,
                            q.options_json,
                            q.max_marks,
                            q.requires_manual_marking,
                            q.display_order

                        FROM training_questions q

                        INNER JOIN training_sections s
                            ON s.id = q.section_id

                        WHERE
                            s.assessment_id = ?
                            AND s.is_active = 1
                            AND q.is_active = 1

                        ORDER BY
                            s.display_order ASC,
                            q.display_order ASC,
                            q.id ASC
                    `,
                    [assessmentId]
                );

            const questionsBySection = {};

            for (const question of questions) {
                let options = [];

                try {
                    if (
                        question.options_json !== null &&
                        question.options_json !== undefined
                    ) {
                        options =
                            typeof question.options_json === "string"
                                ? JSON.parse(question.options_json)
                                : question.options_json;
                    }
                } catch {
                    options = [];
                }

                const preparedQuestion = {
                    ...question,
                    options
                };

                if (!questionsBySection[question.section_id]) {
                    questionsBySection[question.section_id] = [];
                }

                questionsBySection[question.section_id].push(
                    preparedQuestion
                );
            }

            const totalMarks =
                questions.reduce(
                    (total, question) =>
                        total + Number(question.max_marks || 0),
                    0
                );

            return res.render(
                "trainee-assessment",
                {
                    user,
                    assessment,
                    sections,
                    questionsBySection,
                    totalMarks,
                    error:
                        req.query.error || ""
                }
            );

        } catch (error) {
            console.error(
                "[MY TRAINING] Assessment load error:",
                error
            );

            return res
                .status(500)
                .send(
                    "Could not load that training assessment."
                );
        }
    }
);

// ======================================================
// SUBMIT TRAINEE ASSESSMENT
// ======================================================

router.post(
    "/training/my-training/:id/submit",
    requireTrainingLogin,
    async (req, res) => {
        const assessmentId =
            Number(req.params.id);

        if (!assessmentId) {
            return res.redirect(
                "/training/my-training"
            );
        }

        let connection;

        try {
            await ensureSubmissionTables();

            const user =
                getTrainingUserDetails(
                    req.session.trainingUser
                );

            const [assessmentRows] =
                await trainingDatabase.execute(
                    `
                        SELECT
                            a.id,
                            a.name,
                            a.pass_mark_percent,
                            d.short_code AS department_code

                        FROM training_assessments a

                        INNER JOIN training_departments d
                            ON d.id = a.department_id

                        WHERE
                            a.id = ?
                            AND a.is_active = 1
                            AND d.is_active = 1

                        LIMIT 1
                    `,
                    [assessmentId]
                );

            if (!assessmentRows.length) {
                return res.redirect(
                    "/training/my-training?error=" +
                    encodeURIComponent(
                        "That assessment is no longer available."
                    )
                );
            }

            const assessment =
                assessmentRows[0];

            if (!canAccessDepartment(req, assessment.department_code, "trainee")) {
                return renderAccessDenied(
                    req,
                    res,
                    "You cannot submit an assessment for another department."
                );
            }

            const [questions] =
                await trainingDatabase.execute(
                    `
                        SELECT
                            q.id,
                            q.question_text,
                            q.question_type,
                            q.correct_answer_json,
                            q.max_marks,
                            q.requires_manual_marking

                        FROM training_questions q

                        INNER JOIN training_sections s
                            ON s.id = q.section_id

                        WHERE
                            s.assessment_id = ?
                            AND s.is_active = 1
                            AND q.is_active = 1

                        ORDER BY
                            s.display_order ASC,
                            q.display_order ASC,
                            q.id ASC
                    `,
                    [assessmentId]
                );

            if (!questions.length) {
                return res.redirect(
                    `/training/my-training/${assessmentId}?error=` +
                    encodeURIComponent(
                        "This assessment has no active questions to submit."
                    )
                );
            }

            const missingQuestions = [];
            const preparedAnswers = [];

            let autoMarks = 0;
            let autoPossibleMarks = 0;
            let maxMarks = 0;
            let hasManualQuestions = false;

            for (const question of questions) {
                const maxQuestionMarks =
                    Number(question.max_marks || 0);

                maxMarks +=
                    maxQuestionMarks;

                const fieldName =
                    `question_${question.id}`;

                const rawValue =
                    req.body[fieldName];

                const manual =
                    Boolean(
                        Number(
                            question.requires_manual_marking
                        )
                    ) ||
                    [
                        "text",
                        "practical"
                    ].includes(
                        question.question_type
                    );

                if (manual) {
                    hasManualQuestions = true;

                    if (
                        question.question_type === "text" &&
                        !String(rawValue || "").trim()
                    ) {
                        missingQuestions.push(
                            question.question_text
                        );
                    }

                    preparedAnswers.push({
                        question,
                        answerText:
                            question.question_type === "practical"
                                ? "Pending practical assessment by FTO"
                                : String(rawValue || "").trim(),
                        answerJson: null,
                        isCorrect: null,
                        awardedMarks: null,
                        manual: 1
                    });

                    continue;
                }

                if (
                    rawValue === undefined ||
                    rawValue === null ||
                    rawValue === ""
                ) {
                    missingQuestions.push(
                        question.question_text
                    );

                    continue;
                }

                autoPossibleMarks +=
                    maxQuestionMarks;

                const correctAnswer =
                    safeJson(
                        question.correct_answer_json,
                        {}
                    );

                let isCorrect = false;
                let answerText =
                    String(rawValue);
                let answerJson = null;

                if (
                    question.question_type ===
                    "multiple_choice"
                ) {
                    const selectedIndex =
                        Number(rawValue);

                    const correctIndex =
                        Number(
                            correctAnswer?.index
                        );

                    isCorrect =
                        Number.isInteger(selectedIndex) &&
                        Number.isInteger(correctIndex) &&
                        selectedIndex === correctIndex;

                    answerJson =
                        JSON.stringify({
                            index:
                                selectedIndex
                        });
                } else if (
                    question.question_type ===
                    "yes_no"
                ) {
                    const selected =
                        String(rawValue)
                            .toLowerCase();

                    const correct =
                        String(
                            correctAnswer?.value || ""
                        )
                            .toLowerCase();

                    isCorrect =
                        selected === correct;

                    answerText =
                        selected;

                    answerJson =
                        JSON.stringify({
                            value:
                                selected
                        });
                }

                const awardedMarks =
                    isCorrect
                        ? maxQuestionMarks
                        : 0;

                autoMarks +=
                    awardedMarks;

                preparedAnswers.push({
                    question,
                    answerText,
                    answerJson,
                    isCorrect:
                        isCorrect ? 1 : 0,
                    awardedMarks,
                    manual: 0
                });
            }

            if (missingQuestions.length) {
                return res.redirect(
                    `/training/my-training/${assessmentId}?error=` +
                    encodeURIComponent(
                        `Please answer all required questions before finishing. Missing: ${missingQuestions.slice(0, 3).join("; ")}${missingQuestions.length > 3 ? "..." : ""}`
                    )
                );
            }

            const passMark =
                Number(
                    assessment.pass_mark_percent || 70
                );

            let status =
                "pending_review";

            let finalOutcome =
                "pending";

            let totalMarks =
                autoMarks;

            let percentage =
                null;

            if (!hasManualQuestions) {
                status =
                    "completed";

                percentage =
                    maxMarks > 0
                        ? Number(
                            (
                                totalMarks /
                                maxMarks *
                                100
                            ).toFixed(2)
                        )
                        : 0;

                finalOutcome =
                    percentage >= passMark
                        ? "pass"
                        : "fail";
            }

            connection =
                await trainingDatabase.getConnection();

            await connection.beginTransaction();

            const [attemptResult] =
                await connection.execute(
                    `
                        INSERT INTO training_attempts
                        (
                            assessment_id,
                            trainee_discord_id,
                            trainee_username,
                            status,
                            auto_marks,
                            manual_marks,
                            total_marks,
                            max_marks,
                            auto_possible_marks,
                            pass_mark_percent,
                            percentage,
                            final_outcome
                        )

                        VALUES
                        (
                            ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?
                        )
                    `,
                    [
                        assessmentId,
                        user.id,
                        user.displayName,
                        status,
                        autoMarks,
                        totalMarks,
                        maxMarks,
                        autoPossibleMarks,
                        passMark,
                        percentage,
                        finalOutcome
                    ]
                );

            const attemptId =
                attemptResult.insertId;

            for (const answer of preparedAnswers) {
                await connection.execute(
                    `
                        INSERT INTO training_attempt_answers
                        (
                            attempt_id,
                            question_id,
                            question_text,
                            question_type,
                            answer_text,
                            answer_json,
                            is_correct,
                            awarded_marks,
                            max_marks,
                            requires_manual_marking
                        )

                        VALUES
                        (
                            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                        )
                    `,
                    [
                        attemptId,
                        answer.question.id,
                        answer.question.question_text,
                        answer.question.question_type,
                        answer.answerText || null,
                        answer.answerJson,
                        answer.isCorrect,
                        answer.awardedMarks,
                        Number(
                            answer.question.max_marks || 0
                        ),
                        answer.manual
                    ]
                );
            }

            await connection.commit();

            console.log(
                `[TRAINING SUBMISSION] ${user.username} submitted assessment ${assessmentId} as attempt ${attemptId}.`
            );

            return res.redirect(
                `/training/my-training/results/${attemptId}`
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
                "[TRAINING SUBMISSION] Error:",
                error
            );

            return res.redirect(
                `/training/my-training/${assessmentId}?error=` +
                encodeURIComponent(
                    "Your assessment could not be submitted. Please try again."
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
// RESULTS - ROLE FILTERED HISTORY
// ======================================================

router.get(
    "/training/results",
    requireTrainingLogin,
    async (
        req,
        res
    ) => {

        try {

            await ensureSubmissionTables();


            const user =
                getTrainingUserDetails(
                    req.session.trainingUser
                );


            const permissions =
                getPermissions(
                    req
                );


            const [
                allResults
            ] =
                await trainingDatabase.execute(
                    `
                        SELECT
                            ta.id,
                            ta.trainee_discord_id,
                            ta.trainee_username,
                            ta.status,
                            ta.auto_marks,
                            ta.manual_marks,
                            ta.total_marks,
                            ta.max_marks,
                            ta.pass_mark_percent,
                            ta.percentage,
                            ta.final_outcome,
                            ta.submitted_at,
                            ta.reviewed_at,

                            a.name
                                AS assessment_name,

                            a.description
                                AS assessment_description,

                            d.name
                                AS department_name,

                            d.short_code
                                AS department_code,

                            d.accent_color
                                AS department_color

                        FROM training_attempts ta

                        INNER JOIN training_assessments a
                            ON a.id =
                            ta.assessment_id

                        INNER JOIN training_departments d
                            ON d.id =
                            a.department_id

                        ORDER BY
                            COALESCE(
                                ta.reviewed_at,
                                ta.submitted_at
                            ) DESC,
                            ta.id DESC
                    `
                );


            let results =
                [];


            if (
                permissions.isManagement
            ) {

                results =
                    allResults;

            } else if (
                permissions.ftoDepartments.length >
                0
            ) {

                const allowedDepartments =
                    new Set(
                        permissions.ftoDepartments.map(
                            code =>
                                String(
                                    code
                                ).toUpperCase()
                        )
                    );


                results =
                    allResults.filter(
                        result =>
                            allowedDepartments.has(
                                String(
                                    result.department_code
                                ).toUpperCase()
                            )
                    );

            } else {

                results =
                    allResults.filter(
                        result =>
                            String(
                                result.trainee_discord_id
                            ) ===
                            String(
                                user.id
                            )
                    );
            }


            return res.render(
                "results",
                {
                    user,
                    permissions,
                    results,

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
                "[TRAINING RESULTS] Load error:",
                error
            );


            return res
                .status(500)
                .send(
                    "Could not load training results."
                );
        }
    }
);


// ======================================================
// TRAINEE RESULT PAGE
// ======================================================

router.get(
    "/training/my-training/results/:attemptId",
    requireTrainingLogin,
    async (req, res) => {
        try {
            await ensureSubmissionTables();

            const attemptId =
                Number(req.params.attemptId);

            const user =
                getTrainingUserDetails(
                    req.session.trainingUser
                );

            if (!attemptId) {
                return res.redirect(
                    "/training/my-training"
                );
            }

            const [attemptRows] =
                await trainingDatabase.execute(
                    `
                        SELECT
                            ta.*,
                            a.name AS assessment_name,
                            a.description AS assessment_description,
                            d.name AS department_name,
                            d.short_code AS department_code

                        FROM training_attempts ta

                        INNER JOIN training_assessments a
                            ON a.id = ta.assessment_id

                        INNER JOIN training_departments d
                            ON d.id = a.department_id

                        WHERE
                            ta.id = ?
                            AND ta.trainee_discord_id = ?

                        LIMIT 1
                    `,
                    [
                        attemptId,
                        user.id
                    ]
                );

            if (!attemptRows.length) {
                return res
                    .status(404)
                    .send(
                        "That training result could not be found."
                    );
            }

            const attempt =
                attemptRows[0];

            const [answers] =
                await trainingDatabase.execute(
                    `
                        SELECT
                            id,
                            question_text,
                            question_type,
                            answer_text,
                            answer_json,
                            is_correct,
                            awarded_marks,
                            max_marks,
                            requires_manual_marking,
                            review_notes,
                            reviewed_at

                        FROM training_attempt_answers

                        WHERE attempt_id = ?

                        ORDER BY id ASC
                    `,
                    [attemptId]
                );

            const autoPercentage =
                Number(attempt.auto_possible_marks) > 0
                    ? Number(
                        (
                            Number(attempt.auto_marks) /
                            Number(attempt.auto_possible_marks) *
                            100
                        ).toFixed(2)
                    )
                    : 0;

            return res.render(
                "trainee-result",
                {
                    user,
                    attempt,
                    answers,
                    autoPercentage,
                    permissions:
                        getPermissions(
                            req
                        )
                }
            );

        } catch (error) {
            console.error(
                "[TRAINING RESULT] Load error:",
                error
            );

            return res
                .status(500)
                .send(
                    "Could not load that training result."
                );
        }
    }
);

export default router;
