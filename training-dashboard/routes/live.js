import express from "express";

import trainingDatabase, { ensureQuestionGuidanceColumn } from "../services/database.js";

import {
    canAccessDepartment,
    renderAccessDenied
} from "../services/permissions.js";


const router =
    express.Router();


// ======================================================
// HELPERS
// ======================================================

function requireLogin(
    req,
    res,
    next
) {
    if (!req.session?.trainingUser) {
        return res.redirect("/login");
    }

    next();
}


function getUser(
    req
) {
    const user =
        req.session.trainingUser;

    return {
        id:
            user.id,

        username:
            user.username,

        displayName:
            user.global_name ||
            user.username ||
            "Discord User",

        avatar:
            user.avatar
                ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`
                : "https://cdn.discordapp.com/embed/avatars/0.png"
    };
}


function safeJson(
    value,
    fallback
) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return fallback;
    }

    if (
        typeof value ===
        "object"
    ) {
        return value;
    }

    try {
        return JSON.parse(
            value
        );
    } catch {
        return fallback;
    }
}


async function ensureLiveTables() {
    await trainingDatabase.execute(
        `
            CREATE TABLE IF NOT EXISTS training_live_state
            (
                session_id BIGINT UNSIGNED NOT NULL,
                current_section_id BIGINT UNSIGNED NULL,
                quiz_open TINYINT(1) NOT NULL DEFAULT 0,
                revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                    ON UPDATE CURRENT_TIMESTAMP,

                PRIMARY KEY (session_id)
            )
            ENGINE=InnoDB
            DEFAULT CHARSET=utf8mb4
            COLLATE=utf8mb4_unicode_ci
        `
    );


    const [
        quizColumn
    ] =
        await trainingDatabase.execute(
            `
                SELECT COLUMN_NAME

                FROM information_schema.COLUMNS

                WHERE
                    TABLE_SCHEMA = DATABASE()
                    AND TABLE_NAME = 'training_live_state'
                    AND COLUMN_NAME = 'quiz_open'
            `
        );


    if (
        !quizColumn.length
    ) {
        await trainingDatabase.execute(
            `
                ALTER TABLE training_live_state

                ADD COLUMN quiz_open
                TINYINT(1) NOT NULL DEFAULT 0
                AFTER current_section_id
            `
        );
    }


    await trainingDatabase.execute(
        `
            CREATE TABLE IF NOT EXISTS training_live_answers
            (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                session_id BIGINT UNSIGNED NOT NULL,
                user_id BIGINT UNSIGNED NOT NULL,
                question_id BIGINT UNSIGNED NOT NULL,
                section_id BIGINT UNSIGNED NOT NULL,
                question_type VARCHAR(40) NOT NULL,
                answer_text TEXT NULL,
                answer_json JSON NULL,
                is_correct TINYINT(1) NULL,
                awarded_marks DECIMAL(10,2) NULL,
                max_marks DECIMAL(10,2) NOT NULL DEFAULT 0,
                requires_manual_marking TINYINT(1) NOT NULL DEFAULT 0,
                fto_notes TEXT NULL,
                reviewed_by_user_id BIGINT UNSIGNED NULL,
                answered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                reviewed_at TIMESTAMP NULL DEFAULT NULL,

                PRIMARY KEY (id),

                UNIQUE KEY unique_live_answer
                (
                    session_id,
                    user_id,
                    question_id
                ),

                KEY idx_live_answers_session_section
                (
                    session_id,
                    section_id
                ),

                KEY idx_live_answers_user
                (
                    user_id
                )
            )
            ENGINE=InnoDB
            DEFAULT CHARSET=utf8mb4
            COLLATE=utf8mb4_unicode_ci
        `
    );
}


async function getSession(
    sessionId
) {
    const [
        rows
    ] =
        await trainingDatabase.execute(
            `
                SELECT
                    s.id,
                    s.assessment_id,
                    s.department_id,
                    s.host_user_id,
                    s.join_code,
                    s.status,
                    s.scheduled_for,
                    s.started_at,
                    s.ended_at,

                    a.name AS assessment_name,
                    a.description AS assessment_description,
                    a.pass_mark_percent,

                    d.name AS department_name,
                    d.short_code AS department_code,

                    u.display_name AS host_display_name,
                    u.username AS host_username

                FROM training_sessions s

                INNER JOIN training_assessments a
                    ON a.id = s.assessment_id

                INNER JOIN training_departments d
                    ON d.id = s.department_id

                INNER JOIN training_users u
                    ON u.id = s.host_user_id

                WHERE s.id = ?

                LIMIT 1
            `,
            [
                sessionId
            ]
        );


    return rows[0] ||
        null;
}


async function getSections(
    assessmentId
) {
    const [
        rows
    ] =
        await trainingDatabase.execute(
            `
                SELECT
                    id,
                    title,
                    subtitle,
                    section_type,
                    trainee_content,
                    fto_notes,
                    display_order

                FROM training_sections

                WHERE
                    assessment_id = ?
                    AND is_active = 1

                ORDER BY
                    display_order ASC,
                    id ASC
            `,
            [
                assessmentId
            ]
        );


    return rows;
}


async function getQuestions(
    assessmentId
) {

    await ensureQuestionGuidanceColumn();

    const [
        rows
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
            [
                assessmentId
            ]
        );


    return rows.map(
        question => ({
            ...question,

            options:
                safeJson(
                    question.options_json,
                    []
                ),

            correctAnswer:
                safeJson(
                    question.correct_answer_json,
                    {}
                )
        })
    );
}


function groupQuestions(
    questions
) {
    const grouped =
        {};


    for (
        const question
        of questions
    ) {
        const key =
            String(
                question.section_id
            );


        if (!grouped[key]) {
            grouped[key] =
                [];
        }


        grouped[key].push(
            question
        );
    }


    return grouped;
}


async function getLiveState(
    sessionId,
    sections
) {
    await ensureLiveTables();


    const [
        rows
    ] =
        await trainingDatabase.execute(
            `
                SELECT
                    current_section_id,
                    quiz_open,
                    revision,
                    updated_at

                FROM training_live_state

                WHERE session_id = ?

                LIMIT 1
            `,
            [
                sessionId
            ]
        );


    if (rows.length) {
        return rows[0];
    }


    const firstSectionId =
        sections.length
            ? Number(
                sections[0].id
            )
            : null;


    await trainingDatabase.execute(
        `
            INSERT INTO training_live_state
            (
                session_id,
                current_section_id,
                quiz_open,
                revision
            )

            VALUES
            (
                ?,
                ?,
                0,
                1
            )
        `,
        [
            sessionId,
            firstSectionId
        ]
    );


    return {
        current_section_id:
            firstSectionId,

        quiz_open:
            0,

        revision:
            1
    };
}


async function markPresent(
    sessionId,
    userId,
    participantRole
) {
    await trainingDatabase.execute(
        `
            INSERT INTO training_session_users
            (
                session_id,
                user_id,
                participant_role,
                attendance_status
            )

            VALUES
            (
                ?,
                ?,
                ?,
                'present'
            )

            ON DUPLICATE KEY UPDATE
                participant_role =
                    VALUES(participant_role),

                attendance_status =
                    'present'
        `,
        [
            sessionId,
            userId,
            participantRole
        ]
    );
}


async function getParticipants(
    sessionId
) {
    const [
        rows
    ] =
        await trainingDatabase.execute(
            `
                SELECT
                    su.user_id,
                    su.participant_role,
                    su.attendance_status,

                    u.discord_id,
                    u.username,
                    u.display_name,
                    u.avatar_url

                FROM training_session_users su

                INNER JOIN training_users u
                    ON u.id = su.user_id

                WHERE su.session_id = ?

                ORDER BY
                    FIELD(
                        su.participant_role,
                        'fto',
                        'trainee'
                    ),
                    u.display_name ASC,
                    u.username ASC
            `,
            [
                sessionId
            ]
        );


    return rows;
}


async function getSubmittedSections(
    sessionId,
    userId
) {
    const [
        rows
    ] =
        await trainingDatabase.execute(
            `
                SELECT DISTINCT section_id

                FROM training_live_answers

                WHERE
                    session_id = ?
                    AND user_id = ?
            `,
            [
                sessionId,
                userId
            ]
        );


    return rows.map(
        row =>
            Number(
                row.section_id
            )
    );
}


// ======================================================
// OFFICIAL ATTEMPT / RESULT HELPERS
// ======================================================

const LIVE_PASS_ROLE_MAPPINGS = {
    HCSO: {
        needsTrainingRoleId:
            "1533636130791096393",

        passedRoleId:
            "1533636073975054427"
    },

    CPD: {
        needsTrainingRoleId:
            "1533641168775151728",

        passedRoleId:
            "1533641069151916213"
    },

    FHP: {
        needsTrainingRoleId:
            "1533634185854718042",

        passedRoleId:
            "1533634104979881994"
    }
};


function getDiscordBotToken() {

    return (
        process.env.DISCORD_TOKEN ||
        process.env.BOT_TOKEN ||
        process.env.TOKEN ||
        ""
    );
}


function getTrainingGuildId() {

    return (
        process.env.TRAINING_GUILD_ID ||
        process.env.GUILD_ID ||
        ""
    );
}


async function updatePassedRoleFromLiveResult(
    traineeDiscordId,
    departmentCode
) {

    const mapping =
        LIVE_PASS_ROLE_MAPPINGS[
            String(
                departmentCode ||
                ""
            ).toUpperCase()
        ];


    if (!mapping) {

        return {
            ok:
                false,

            skipped:
                true,

            message:
                `No passed-role mapping exists for ${departmentCode}.`
        };
    }


    const botToken =
        getDiscordBotToken();


    const guildId =
        getTrainingGuildId();


    if (
        !botToken ||
        !guildId ||
        !traineeDiscordId
    ) {

        return {
            ok:
                false,

            skipped:
                true,

            message:
                "Discord role update configuration is incomplete."
        };
    }


    const headers = {
        Authorization:
            `Bot ${botToken}`
    };


    const addResponse =
        await fetch(
            `https://discord.com/api/v10/guilds/${guildId}/members/${traineeDiscordId}/roles/${mapping.passedRoleId}`,
            {
                method:
                    "PUT",

                headers
            }
        );


    if (!addResponse.ok) {

        console.error(
            "[LIVE RESULT ROLE] Could not add passed role:",
            {
                traineeDiscordId,
                departmentCode,
                roleId:
                    mapping.passedRoleId,
                status:
                    addResponse.status
            }
        );


        return {
            ok:
                false,

            skipped:
                false,

            message:
                "PASS was saved, but Discord could not add the passed role."
        };
    }


    const removeResponse =
        await fetch(
            `https://discord.com/api/v10/guilds/${guildId}/members/${traineeDiscordId}/roles/${mapping.needsTrainingRoleId}`,
            {
                method:
                    "DELETE",

                headers
            }
        );


    if (!removeResponse.ok) {

        console.error(
            "[LIVE RESULT ROLE] Passed role added, but Needs Training role could not be removed:",
            {
                traineeDiscordId,
                departmentCode,
                roleId:
                    mapping.needsTrainingRoleId,
                status:
                    removeResponse.status
            }
        );


        return {
            ok:
                false,

            skipped:
                false,

            message:
                "Passed role was added, but Needs Training could not be removed."
        };
    }


    console.log(
        `[LIVE RESULT ROLE] ${departmentCode}: added ${mapping.passedRoleId} and removed ${mapping.needsTrainingRoleId} for ${traineeDiscordId}.`
    );


    return {
        ok:
            true,

        skipped:
            false,

        message:
            "Discord training roles updated."
    };
}


async function ensureOfficialAttemptTables() {

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
                PRIMARY KEY (id)
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
                UNIQUE KEY unique_attempt_question
                (
                    attempt_id,
                    question_id
                )
            )
            ENGINE=InnoDB
            DEFAULT CHARSET=utf8mb4
            COLLATE=utf8mb4_unicode_ci
        `
    );


    const [
        sourceSessionColumn
    ] =
        await trainingDatabase.execute(
            `
                SELECT COLUMN_NAME

                FROM information_schema.COLUMNS

                WHERE
                    TABLE_SCHEMA = DATABASE()
                    AND TABLE_NAME = 'training_attempts'
                    AND COLUMN_NAME = 'source_session_id'
            `
        );


    if (
        !sourceSessionColumn.length
    ) {

        await trainingDatabase.execute(
            `
                ALTER TABLE training_attempts

                ADD COLUMN source_session_id
                BIGINT UNSIGNED NULL
                AFTER assessment_id
            `
        );
    }


    const [
        sourceUserColumn
    ] =
        await trainingDatabase.execute(
            `
                SELECT COLUMN_NAME

                FROM information_schema.COLUMNS

                WHERE
                    TABLE_SCHEMA = DATABASE()
                    AND TABLE_NAME = 'training_attempts'
                    AND COLUMN_NAME = 'source_live_user_id'
            `
        );


    if (
        !sourceUserColumn.length
    ) {

        await trainingDatabase.execute(
            `
                ALTER TABLE training_attempts

                ADD COLUMN source_live_user_id
                BIGINT UNSIGNED NULL
                AFTER source_session_id
            `
        );
    }
}


async function buildOfficialAttemptFromLiveSession(
    connection,
    liveSession,
    trainee,
    allQuestions,
    reviewerDiscordId
) {

    const [
        existingRows
    ] =
        await connection.execute(
            `
                SELECT
                    id,
                    status,
                    percentage,
                    final_outcome

                FROM training_attempts

                WHERE
                    source_session_id = ?
                    AND source_live_user_id = ?

                LIMIT 1
            `,
            [
                liveSession.id,
                trainee.user_id
            ]
        );


    if (existingRows.length) {

        return {
            attemptId:
                Number(
                    existingRows[0].id
                ),

            status:
                existingRows[0].status,

            percentage:
                existingRows[0].percentage,

            finalOutcome:
                existingRows[0].final_outcome,

            existing:
                true,

            trainee
        };
    }


    const [
        liveAnswerRows
    ] =
        await connection.execute(
            `
                SELECT
                    la.question_id,
                    la.question_type,
                    la.answer_text,
                    la.answer_json,
                    la.is_correct,
                    la.awarded_marks,
                    la.max_marks,
                    la.requires_manual_marking,
                    la.fto_notes,
                    la.reviewed_at

                FROM training_live_answers la

                WHERE
                    la.session_id = ?
                    AND la.user_id = ?
            `,
            [
                liveSession.id,
                trainee.user_id
            ]
        );


    const liveAnswers =
        new Map(
            liveAnswerRows.map(
                answer => [
                    Number(
                        answer.question_id
                    ),
                    answer
                ]
            )
        );


    let autoMarks =
        0;


    let manualMarks =
        0;


    let autoPossibleMarks =
        0;


    let maxMarks =
        0;


    let unresolvedManual =
        false;


    const attemptAnswers =
        [];


    for (
        const question
        of allQuestions
    ) {

        const questionId =
            Number(
                question.id
            );


        const questionMaxMarks =
            Number(
                question.max_marks ||
                0
            );


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
                String(
                    question.question_type
                )
            );


        maxMarks +=
            questionMaxMarks;


        if (!manual) {

            autoPossibleMarks +=
                questionMaxMarks;
        }


        const liveAnswer =
            liveAnswers.get(
                questionId
            );


        if (!liveAnswer) {

            if (manual) {

                unresolvedManual =
                    true;


                attemptAnswers.push({
                    questionId,

                    questionText:
                        question.question_text,

                    questionType:
                        question.question_type,

                    answerText:
                        "No live response submitted",

                    answerJson:
                        null,

                    isCorrect:
                        null,

                    awardedMarks:
                        null,

                    maxMarks:
                        questionMaxMarks,

                    requiresManualMarking:
                        1,

                    reviewNotes:
                        null,

                    reviewedAt:
                        null
                });

            } else {

                attemptAnswers.push({
                    questionId,

                    questionText:
                        question.question_text,

                    questionType:
                        question.question_type,

                    answerText:
                        "No live response submitted",

                    answerJson:
                        null,

                    isCorrect:
                        0,

                    awardedMarks:
                        0,

                    maxMarks:
                        questionMaxMarks,

                    requiresManualMarking:
                        0,

                    reviewNotes:
                        null,

                    reviewedAt:
                        null
                });
            }


            continue;
        }


        const awardedMarks =
            liveAnswer.awarded_marks ===
            null
                ? null
                : Number(
                    liveAnswer.awarded_marks
                );


        if (manual) {

            if (
                awardedMarks ===
                null
            ) {

                unresolvedManual =
                    true;

            } else {

                manualMarks +=
                    awardedMarks;
            }

        } else {

            autoMarks +=
                awardedMarks ||
                0;
        }


        attemptAnswers.push({
            questionId,

            questionText:
                question.question_text,

            questionType:
                question.question_type,

            answerText:
                liveAnswer.answer_text,

            answerJson:
                liveAnswer.answer_json,

            isCorrect:
                liveAnswer.is_correct,

            awardedMarks,

            maxMarks:
                questionMaxMarks,

            requiresManualMarking:
                manual
                    ? 1
                    : 0,

            reviewNotes:
                liveAnswer.fto_notes,

            reviewedAt:
                liveAnswer.reviewed_at
        });
    }


    const totalMarks =
        Number(
            (
                autoMarks +
                manualMarks
            ).toFixed(
                2
            )
        );


    const passMark =
        Number(
            liveSession.pass_mark_percent ||
            70
        );


    const percentage =
        unresolvedManual
            ? null
            : (
                maxMarks > 0
                    ? Number(
                        (
                            totalMarks /
                            maxMarks *
                            100
                        ).toFixed(
                            2
                        )
                    )
                    : 0
            );


    const finalOutcome =
        unresolvedManual
            ? "pending"
            : (
                percentage >=
                passMark
                    ? "pass"
                    : "fail"
            );


    const status =
        unresolvedManual
            ? "pending_review"
            : "completed";


    const [
        attemptResult
    ] =
        await connection.execute(
            `
                INSERT INTO training_attempts
                (
                    assessment_id,
                    source_session_id,
                    source_live_user_id,
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
                    final_outcome,
                    fto_notes,
                    reviewed_by_discord_id,
                    reviewed_at
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
                liveSession.assessment_id,
                liveSession.id,
                trainee.user_id,
                trainee.discord_id,
                trainee.display_name ||
                    trainee.username ||
                    "Trainee",
                status,
                autoMarks,
                manualMarks,
                totalMarks,
                maxMarks,
                autoPossibleMarks,
                passMark,
                percentage,
                finalOutcome,
                `Generated from Live Training session #${liveSession.id}.`,
                unresolvedManual
                    ? null
                    : reviewerDiscordId,
                unresolvedManual
                    ? null
                    : new Date()
            ]
        );


    const attemptId =
        Number(
            attemptResult.insertId
        );


    for (
        const answer
        of attemptAnswers
    ) {

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
                    requires_manual_marking,
                    review_notes,
                    reviewed_by_discord_id,
                    reviewed_at
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
                    ?,
                    ?,
                    ?,
                    ?
                )
            `,
            [
                attemptId,
                answer.questionId,
                answer.questionText,
                answer.questionType,
                answer.answerText,
                answer.answerJson,
                answer.isCorrect,
                answer.awardedMarks,
                answer.maxMarks,
                answer.requiresManualMarking,
                answer.reviewNotes,
                (
                    answer.requiresManualMarking &&
                    answer.awardedMarks !==
                    null
                )
                    ? reviewerDiscordId
                    : null,
                (
                    answer.requiresManualMarking &&
                    answer.awardedMarks !==
                    null
                )
                    ? (
                        answer.reviewedAt ||
                        new Date()
                    )
                    : null
            ]
        );
    }


    return {
        attemptId,
        status,
        percentage,
        finalOutcome,
        existing:
            false,
        trainee
    };
}


// ======================================================
// JOIN LIVE SESSION
// ======================================================

router.get(
    "/training/live/join",
    requireLogin,
    (
        req,
        res
    ) => {
        return res.render(
            "live-join",
            {
                user:
                    getUser(req),

                error:
                    req.query.error ||
                    ""
            }
        );
    }
);


router.post(
    "/training/live/join",
    requireLogin,
    async (
        req,
        res
    ) => {
        try {
            const joinCode =
                String(
                    req.body.join_code ||
                    ""
                )
                    .replace(
                        /\D/g,
                        ""
                    )
                    .slice(
                        0,
                        6
                    );


            if (
                joinCode.length !==
                6
            ) {
                return res.redirect(
                    "/training/live/join?error=" +
                    encodeURIComponent(
                        "Enter the 6-digit session code."
                    )
                );
            }


            const [
                rows
            ] =
                await trainingDatabase.execute(
                    `
                        SELECT
                            s.id,
                            s.status,
                            d.short_code
                                AS department_code

                        FROM training_sessions s

                        INNER JOIN training_departments d
                            ON d.id =
                            s.department_id

                        WHERE s.join_code = ?

                        LIMIT 1
                    `,
                    [
                        joinCode
                    ]
                );


            if (!rows.length) {
                return res.redirect(
                    "/training/live/join?error=" +
                    encodeURIComponent(
                        "That training code does not exist."
                    )
                );
            }


            const liveSession =
                rows[0];


            if (
                liveSession.status !==
                "live"
            ) {
                return res.redirect(
                    "/training/live/join?error=" +
                    encodeURIComponent(
                        "That training session is not live yet."
                    )
                );
            }


            const isFto =
                canAccessDepartment(
                    req,
                    liveSession.department_code,
                    "fto"
                );


            const isTrainee =
                canAccessDepartment(
                    req,
                    liveSession.department_code,
                    "trainee"
                );


            if (
                !isFto &&
                !isTrainee
            ) {
                return renderAccessDenied(
                    req,
                    res,
                    "You do not belong to the department running this training session."
                );
            }


            const userId =
                Number(
                    req.session.trainingDatabaseUserId
                );


            if (!userId) {
                return res.redirect(
                    "/login/reset"
                );
            }


            await markPresent(
                liveSession.id,
                userId,
                isFto
                    ? "fto"
                    : "trainee"
            );


            return res.redirect(
                `/training/live/${liveSession.id}/${isFto ? "fto" : "trainee"}`
            );


        } catch (error) {
            console.error(
                "[LIVE TRAINING] Join error:",
                error
            );


            return res.redirect(
                "/training/live/join?error=" +
                encodeURIComponent(
                    "Could not join that training session."
                )
            );
        }
    }
);


// ======================================================
// FTO VIEW
// ======================================================

router.get(
    "/training/live/:sessionId/fto",
    requireLogin,
    async (
        req,
        res
    ) => {
        try {
            const sessionId =
                Number(
                    req.params.sessionId
                );


            const liveSession =
                await getSession(
                    sessionId
                );


            if (!liveSession) {
                return res
                    .status(404)
                    .send(
                        "Training session not found."
                    );
            }


            if (
                !canAccessDepartment(
                    req,
                    liveSession.department_code,
                    "fto"
                )
            ) {
                return renderAccessDenied(
                    req,
                    res,
                    "You cannot lead training for this department."
                );
            }


            if (
                ![
                    "live",
                    "completed"
                ].includes(
                    liveSession.status
                )
            ) {
                return res.redirect(
                    `/training/schedule/${liveSession.id}?error=` +
                    encodeURIComponent(
                        "Start the scheduled session before opening Live Training."
                    )
                );
            }


            const sections =
                await getSections(
                    liveSession.assessment_id
                );


            const questions =
                await getQuestions(
                    liveSession.assessment_id
                );


            const state =
                await getLiveState(
                    liveSession.id,
                    sections
                );


            const participants =
                await getParticipants(
                    liveSession.id
                );


            const userId =
                Number(
                    req.session.trainingDatabaseUserId
                );


            if (userId) {
                await markPresent(
                    liveSession.id,
                    userId,
                    "fto"
                );
            }


            return res.render(
                "live-fto",
                {
                    user:
                        getUser(req),

                    session:
                        liveSession,

                    sections,

                    questionsBySection:
                        groupQuestions(
                            questions
                        ),

                    state,

                    participants,

                    error:
                        req.query.error ||
                        ""
                }
            );


        } catch (error) {
            console.error(
                "[LIVE TRAINING] FTO page error:",
                error
            );


            return res
                .status(500)
                .send(
                    "Could not load the live FTO session."
                );
        }
    }
);


// ======================================================
// TRAINEE VIEW
// ======================================================

router.get(
    "/training/live/:sessionId/trainee",
    requireLogin,
    async (
        req,
        res
    ) => {
        try {
            const sessionId =
                Number(
                    req.params.sessionId
                );


            const liveSession =
                await getSession(
                    sessionId
                );


            if (!liveSession) {
                return res
                    .status(404)
                    .send(
                        "Training session not found."
                    );
            }


            const isFto =
                canAccessDepartment(
                    req,
                    liveSession.department_code,
                    "fto"
                );


            const isTrainee =
                canAccessDepartment(
                    req,
                    liveSession.department_code,
                    "trainee"
                );


            if (
                !isFto &&
                !isTrainee
            ) {
                return renderAccessDenied(
                    req,
                    res,
                    "You cannot join live training for this department."
                );
            }


            if (
                ![
                    "live",
                    "completed"
                ].includes(
                    liveSession.status
                )
            ) {
                return res.redirect(
                    "/training/live/join?error=" +
                    encodeURIComponent(
                        "That session is not live."
                    )
                );
            }


            const sections =
                await getSections(
                    liveSession.assessment_id
                );


            const questions =
                await getQuestions(
                    liveSession.assessment_id
                );


            const state =
                await getLiveState(
                    liveSession.id,
                    sections
                );


            const userId =
                Number(
                    req.session.trainingDatabaseUserId
                );


            if (userId) {
                await markPresent(
                    liveSession.id,
                    userId,
                    isFto
                        ? "fto"
                        : "trainee"
                );
            }


            const submittedSections =
                userId
                    ? await getSubmittedSections(
                        liveSession.id,
                        userId
                    )
                    : [];


            return res.render(
                "live-trainee",
                {
                    user:
                        getUser(req),

                    session:
                        liveSession,

                    sections,

                    questionsBySection:
                        groupQuestions(
                            questions
                        ),

                    state,

                    submittedSections
                }
            );


        } catch (error) {
            console.error(
                "[LIVE TRAINING] Trainee page error:",
                error
            );


            return res
                .status(500)
                .send(
                    "Could not load the live training session."
                );
        }
    }
);


// ======================================================
// FTO CHANGE SECTION
// ======================================================

router.post(
    "/training/live/:sessionId/section",
    requireLogin,
    async (
        req,
        res
    ) => {
        try {
            const sessionId =
                Number(
                    req.params.sessionId
                );


            const sectionId =
                Number(
                    req.body.section_id
                );


            const liveSession =
                await getSession(
                    sessionId
                );


            if (!liveSession) {
                return res
                    .status(404)
                    .json({
                        ok:
                            false,

                        message:
                            "Session not found."
                    });
            }


            if (
                !canAccessDepartment(
                    req,
                    liveSession.department_code,
                    "fto"
                )
            ) {
                return res
                    .status(403)
                    .json({
                        ok:
                            false,

                        message:
                            "No permission."
                    });
            }


            if (
                liveSession.status !==
                "live"
            ) {
                return res
                    .status(409)
                    .json({
                        ok:
                            false,

                        message:
                            "Session is not live."
                    });
            }


            const [
                validRows
            ] =
                await trainingDatabase.execute(
                    `
                        SELECT id

                        FROM training_sections

                        WHERE
                            id = ?
                            AND assessment_id = ?
                            AND is_active = 1

                        LIMIT 1
                    `,
                    [
                        sectionId,
                        liveSession.assessment_id
                    ]
                );


            if (!validRows.length) {
                return res
                    .status(400)
                    .json({
                        ok:
                            false,

                        message:
                            "That section does not belong to this assessment."
                    });
            }


            await ensureLiveTables();


            await trainingDatabase.execute(
                `
                    INSERT INTO training_live_state
                    (
                        session_id,
                        current_section_id,
                        quiz_open,
                        revision
                    )

                    VALUES
                    (
                        ?,
                        ?,
                        0,
                        1
                    )

                    ON DUPLICATE KEY UPDATE
                        current_section_id =
                            VALUES(current_section_id),

                        quiz_open =
                            0,

                        revision =
                            revision + 1
                `,
                [
                    sessionId,
                    sectionId
                ]
            );


            return res.json({
                ok:
                    true,

                sectionId,

                quizOpen:
                    false
            });


        } catch (error) {
            console.error(
                "[LIVE TRAINING] Change section error:",
                error
            );


            return res
                .status(500)
                .json({
                    ok:
                        false,

                    message:
                        "Could not change section."
                });
        }
    }
);


// ======================================================
// FTO OPEN / CLOSE SECTION QUESTIONS
// ======================================================

router.post(
    "/training/live/:sessionId/quiz",
    requireLogin,
    async (
        req,
        res
    ) => {
        try {
            const sessionId =
                Number(
                    req.params.sessionId
                );


            const liveSession =
                await getSession(
                    sessionId
                );


            if (!liveSession) {
                return res
                    .status(404)
                    .json({
                        ok:
                            false
                    });
            }


            if (
                !canAccessDepartment(
                    req,
                    liveSession.department_code,
                    "fto"
                )
            ) {
                return res
                    .status(403)
                    .json({
                        ok:
                            false
                    });
            }

            if (
                liveSession.status !==
                "live"
            ) {

                return res
                    .status(409)
                    .json({
                        ok:
                            false,

                        message:
                            "This live training session is no longer active."
                    });
            }




            const open =
                String(
                    req.body.open
                ) ===
                "1";


            await ensureLiveTables();


            await trainingDatabase.execute(
                `
                    UPDATE training_live_state

                    SET
                        quiz_open = ?,
                        revision = revision + 1

                    WHERE session_id = ?
                `,
                [
                    open
                        ? 1
                        : 0,

                    sessionId
                ]
            );


            return res.json({
                ok:
                    true,

                quizOpen:
                    open
            });


        } catch (error) {
            console.error(
                "[LIVE TRAINING] Quiz toggle error:",
                error
            );


            return res
                .status(500)
                .json({
                    ok:
                        false
                });
        }
    }
);


// ======================================================
// TRAINEE SUBMIT CURRENT SECTION QUESTIONS
// ======================================================

router.post(
    "/training/live/:sessionId/answers",
    requireLogin,
    async (
        req,
        res
    ) => {
        let connection;


        try {
            const sessionId =
                Number(
                    req.params.sessionId
                );


            const liveSession =
                await getSession(
                    sessionId
                );


            if (!liveSession) {
                return res
                    .status(404)
                    .json({
                        ok:
                            false,

                        message:
                            "Session not found."
                    });
            }


            if (
                !canAccessDepartment(
                    req,
                    liveSession.department_code,
                    "trainee"
                )
            ) {
                return res
                    .status(403)
                    .json({
                        ok:
                            false,

                        message:
                            "You are not a trainee for this department."
                    });
            }

            if (
                liveSession.status !==
                "live"
            ) {

                return res
                    .status(409)
                    .json({
                        ok:
                            false,

                        message:
                            "This live training session is no longer active."
                    });
            }




            const sections =
                await getSections(
                    liveSession.assessment_id
                );


            const liveState =
                await getLiveState(
                    liveSession.id,
                    sections
                );


            const sectionId =
                Number(
                    liveState.current_section_id
                );


            if (
                !sectionId ||
                !Number(
                    liveState.quiz_open
                )
            ) {
                return res
                    .status(409)
                    .json({
                        ok:
                            false,

                        message:
                            "The FTO has not opened this section's questions."
                    });
            }


            const allQuestions =
                await getQuestions(
                    liveSession.assessment_id
                );


            const questions =
                allQuestions.filter(
                    question =>
                        Number(
                            question.section_id
                        ) ===
                        sectionId
                );


            if (!questions.length) {
                return res.json({
                    ok:
                        true,

                    message:
                        "This section has no questions."
                });
            }


            const userId =
                Number(
                    req.session.trainingDatabaseUserId
                );


            if (!userId) {
                return res
                    .status(401)
                    .json({
                        ok:
                            false,

                        message:
                            "Your training account could not be resolved."
                    });
            }


            const prepared =
                [];


            const missing =
                [];


            for (
                const question
                of questions
            ) {
                const type =
                    String(
                        question.question_type
                    );


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
                        type
                    );


                const raw =
                    req.body[
                        `question_${question.id}`
                    ];


                if (
                    type ===
                    "practical"
                ) {
                    prepared.push({
                        question,

                        answerText:
                            "Pending practical assessment by FTO",

                        answerJson:
                            null,

                        isCorrect:
                            null,

                        awardedMarks:
                            null,

                        manual:
                            1
                    });

                    continue;
                }


                if (
                    raw ===
                    undefined ||
                    raw ===
                    null ||
                    String(raw).trim() ===
                    ""
                ) {
                    missing.push(
                        question.question_text
                    );

                    continue;
                }


                if (manual) {
                    prepared.push({
                        question,

                        answerText:
                            String(raw).trim(),

                        answerJson:
                            null,

                        isCorrect:
                            null,

                        awardedMarks:
                            null,

                        manual:
                            1
                    });

                    continue;
                }


                let isCorrect =
                    false;


                let answerText =
                    String(raw);


                let answerJson =
                    null;


                if (
                    type ===
                    "multiple_choice"
                ) {
                    const selectedIndex =
                        Number(raw);


                    const correctIndex =
                        Number(
                            question.correctAnswer?.index
                        );


                    isCorrect =
                        Number.isInteger(
                            selectedIndex
                        ) &&
                        Number.isInteger(
                            correctIndex
                        ) &&
                        selectedIndex ===
                        correctIndex;


                    answerJson =
                        JSON.stringify({
                            index:
                                selectedIndex
                        });
                }


                if (
                    type ===
                    "yes_no"
                ) {
                    const selected =
                        String(raw)
                            .toLowerCase();


                    const correct =
                        String(
                            question.correctAnswer?.value ||
                            ""
                        )
                            .toLowerCase();


                    isCorrect =
                        selected ===
                        correct;


                    answerText =
                        selected;


                    answerJson =
                        JSON.stringify({
                            value:
                                selected
                        });
                }


                prepared.push({
                    question,

                    answerText,

                    answerJson,

                    isCorrect:
                        isCorrect
                            ? 1
                            : 0,

                    awardedMarks:
                        isCorrect
                            ? Number(
                                question.max_marks ||
                                0
                            )
                            : 0,

                    manual:
                        0
                });
            }


            if (missing.length) {
                return res
                    .status(400)
                    .json({
                        ok:
                            false,

                        message:
                            `Answer every question first. Missing: ${missing[0]}`
                    });
            }


            connection =
                await trainingDatabase.getConnection();


            await connection.beginTransaction();


            for (
                const answer
                of prepared
            ) {
                await connection.execute(
                    `
                        INSERT INTO training_live_answers
                        (
                            session_id,
                            user_id,
                            question_id,
                            section_id,
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
                            ?,
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

                        ON DUPLICATE KEY UPDATE
                            answer_text =
                                VALUES(answer_text),

                            answer_json =
                                VALUES(answer_json),

                            is_correct =
                                VALUES(is_correct),

                            awarded_marks =
                                VALUES(awarded_marks),

                            max_marks =
                                VALUES(max_marks),

                            requires_manual_marking =
                                VALUES(requires_manual_marking),

                            answered_at =
                                CURRENT_TIMESTAMP
                    `,
                    [
                        sessionId,
                        userId,
                        answer.question.id,
                        sectionId,
                        answer.question.question_type,
                        answer.answerText,
                        answer.answerJson,
                        answer.isCorrect,
                        answer.awardedMarks,
                        Number(
                            answer.question.max_marks ||
                            0
                        ),
                        answer.manual
                    ]
                );
            }


            await connection.commit();


            return res.json({
                ok:
                    true,

                message:
                    "Answers submitted to your FTO."
            });


        } catch (error) {
            if (connection) {
                try {
                    await connection.rollback();
                } catch {
                    // Ignore rollback errors.
                }
            }


            console.error(
                "[LIVE TRAINING] Answer submission error:",
                error
            );


            return res
                .status(500)
                .json({
                    ok:
                        false,

                    message:
                        "Could not submit your live answers."
                });


        } finally {
            if (connection) {
                connection.release();
            }
        }
    }
);


// ======================================================
// FTO RESPONSE DATA FOR CURRENT SECTION
// ======================================================

router.get(
    "/training/live/:sessionId/responses",
    requireLogin,
    async (
        req,
        res
    ) => {
        try {
            const sessionId =
                Number(
                    req.params.sessionId
                );


            const sectionId =
                Number(
                    req.query.section_id
                );


            const liveSession =
                await getSession(
                    sessionId
                );


            if (
                !liveSession ||
                !canAccessDepartment(
                    req,
                    liveSession.department_code,
                    "fto"
                )
            ) {
                return res
                    .status(403)
                    .json({
                        ok:
                            false
                    });
            }


            const [
                rows
            ] =
                await trainingDatabase.execute(
                    `
                        SELECT
                            la.id,
                            la.user_id,
                            la.question_id,
                            la.question_type,
                            la.answer_text,
                            la.is_correct,
                            la.awarded_marks,
                            la.max_marks,
                            la.requires_manual_marking,
                            la.fto_notes,

                            q.question_text,
                            q.fto_marking_guidance,

                            u.username,
                            u.display_name,
                            u.avatar_url

                        FROM training_live_answers la

                        INNER JOIN training_questions q
                            ON q.id =
                            la.question_id

                        INNER JOIN training_users u
                            ON u.id =
                            la.user_id

                        WHERE
                            la.session_id = ?
                            AND la.section_id = ?

                        ORDER BY
                            q.display_order ASC,
                            q.id ASC,
                            u.display_name ASC,
                            u.username ASC
                    `,
                    [
                        sessionId,
                        sectionId
                    ]
                );


            return res.json({
                ok:
                    true,

                responses:
                    rows
            });


        } catch (error) {
            console.error(
                "[LIVE TRAINING] Response load error:",
                error
            );


            return res
                .status(500)
                .json({
                    ok:
                        false
                });
        }
    }
);


// ======================================================
// FTO LIVE MANUAL MARK
// ======================================================

router.post(
    "/training/live/:sessionId/mark",
    requireLogin,
    async (
        req,
        res
    ) => {
        try {
            const sessionId =
                Number(
                    req.params.sessionId
                );


            const answerId =
                Number(
                    req.body.answer_id
                );


            const liveSession =
                await getSession(
                    sessionId
                );


            if (
                !liveSession ||
                !canAccessDepartment(
                    req,
                    liveSession.department_code,
                    "fto"
                )
            ) {
                return res
                    .status(403)
                    .json({
                        ok:
                            false
                    });
            }

            if (
                liveSession.status !==
                "live"
            ) {

                return res
                    .status(409)
                    .json({
                        ok:
                            false,

                        message:
                            "This live training session is no longer active."
                    });
            }




            const [
                answerRows
            ] =
                await trainingDatabase.execute(
                    `
                        SELECT
                            id,
                            max_marks,
                            requires_manual_marking

                        FROM training_live_answers

                        WHERE
                            id = ?
                            AND session_id = ?

                        LIMIT 1
                    `,
                    [
                        answerId,
                        sessionId
                    ]
                );


            if (!answerRows.length) {
                return res
                    .status(404)
                    .json({
                        ok:
                            false,

                        message:
                            "Live answer not found."
                    });
            }


            const answer =
                answerRows[0];


            if (
                !Number(
                    answer.requires_manual_marking
                )
            ) {
                return res
                    .status(400)
                    .json({
                        ok:
                            false,

                        message:
                            "That question is automatically marked."
                    });
            }


            const marks =
                Number(
                    req.body.marks
                );


            const maxMarks =
                Number(
                    answer.max_marks ||
                    0
                );


            if (
                Number.isNaN(
                    marks
                ) ||
                marks < 0 ||
                marks > maxMarks
            ) {
                return res
                    .status(400)
                    .json({
                        ok:
                            false,

                        message:
                            `Marks must be between 0 and ${maxMarks}.`
                    });
            }


            const notes =
                String(
                    req.body.notes ||
                    ""
                ).trim();


            const reviewerId =
                Number(
                    req.session.trainingDatabaseUserId
                ) ||
                null;


            await trainingDatabase.execute(
                `
                    UPDATE training_live_answers

                    SET
                        awarded_marks = ?,
                        fto_notes = ?,
                        reviewed_by_user_id = ?,
                        reviewed_at = CURRENT_TIMESTAMP

                    WHERE
                        id = ?
                        AND session_id = ?
                `,
                [
                    marks,
                    notes ||
                    null,
                    reviewerId,
                    answerId,
                    sessionId
                ]
            );


            return res.json({
                ok:
                    true,

                marks
            });


        } catch (error) {
            console.error(
                "[LIVE TRAINING] Marking error:",
                error
            );


            return res
                .status(500)
                .json({
                    ok:
                        false
                });
        }
    }
);


// ======================================================
// STEP 9 - FINALIZATION PREFLIGHT / ROBUSTNESS
// ======================================================

async function getLiveFinalizationPreflight(
    liveSession
) {

    const [
        traineeRows
    ] =
        await trainingDatabase.execute(
            `
                SELECT
                    su.user_id,
                    su.attendance_status,

                    u.discord_id,
                    u.username,
                    u.display_name

                FROM training_session_users su

                INNER JOIN training_users u
                    ON u.id =
                    su.user_id

                WHERE
                    su.session_id = ?
                    AND su.participant_role = 'trainee'
                    AND su.attendance_status = 'present'

                ORDER BY
                    u.display_name ASC,
                    u.username ASC
            `,
            [
                liveSession.id
            ]
        );


    const questions =
        await getQuestions(
            liveSession.assessment_id
        );


    const [
        answerRows
    ] =
        await trainingDatabase.execute(
            `
                SELECT
                    user_id,
                    question_id,
                    awarded_marks,
                    requires_manual_marking

                FROM training_live_answers

                WHERE session_id = ?
            `,
            [
                liveSession.id
            ]
        );


    const answersByUser =
        new Map();


    for (
        const answer
        of answerRows
    ) {

        const userId =
            Number(
                answer.user_id
            );


        if (
            !answersByUser.has(
                userId
            )
        ) {

            answersByUser.set(
                userId,
                new Map()
            );
        }


        answersByUser
            .get(
                userId
            )
            .set(
                Number(
                    answer.question_id
                ),
                answer
            );
    }


    const trainees =
        traineeRows.map(
            trainee => {

                const userAnswers =
                    answersByUser.get(
                        Number(
                            trainee.user_id
                        )
                    ) ||
                    new Map();


                let answered =
                    0;


                let missingAutomatic =
                    0;


                let unmarkedManual =
                    0;


                let manualQuestions =
                    0;


                for (
                    const question
                    of questions
                ) {

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
                            String(
                                question.question_type
                            )
                        );


                    const answer =
                        userAnswers.get(
                            Number(
                                question.id
                            )
                        );


                    if (answer) {

                        answered +=
                            1;
                    }


                    if (manual) {

                        manualQuestions +=
                            1;


                        if (
                            !answer ||
                            answer.awarded_marks ===
                            null
                        ) {

                            unmarkedManual +=
                                1;
                        }

                    } else if (!answer) {

                        missingAutomatic +=
                            1;
                    }
                }


                const projectedStatus =
                    unmarkedManual > 0
                        ? "pending_review"
                        : "ready";


                return {
                    ...trainee,

                    answered,

                    questionCount:
                        questions.length,

                    missingAutomatic,

                    manualQuestions,

                    unmarkedManual,

                    projectedStatus
                };
            }
        );


    return {
        trainees,

        questionCount:
            questions.length
    };
}


// ======================================================
// FINALIZE LIVE SESSION -> OFFICIAL RESULTS
// ======================================================

router.get(
    "/training/live/:sessionId/preflight",
    requireLogin,
    async (
        req,
        res
    ) => {

        try {

            const sessionId =
                Number(
                    req.params.sessionId
                );


            const liveSession =
                await getSession(
                    sessionId
                );


            if (
                !liveSession ||
                !canAccessDepartment(
                    req,
                    liveSession.department_code,
                    "fto"
                )
            ) {

                return res
                    .status(403)
                    .json({
                        ok:
                            false
                    });
            }


            const preflight =
                await getLiveFinalizationPreflight(
                    liveSession
                );


            return res.json({
                ok:
                    true,

                ...preflight
            });


        } catch (error) {

            console.error(
                "[LIVE RESULT] Preflight error:",
                error
            );


            return res
                .status(500)
                .json({
                    ok:
                        false
                });
        }
    }
);


router.post(
    "/training/live/:sessionId/finalize",
    requireLogin,
    async (
        req,
        res
    ) => {

        let connection;

        let finalizationLockName =
            null;

        let finalizationLockAcquired =
            false;


        try {

            await ensureLiveTables();

            await ensureOfficialAttemptTables();


            const sessionId =
                Number(
                    req.params.sessionId
                );


            finalizationLockName =
                `hcp_training_finalize_${sessionId}`;


            const [
                lockRows
            ] =
                await trainingDatabase.execute(
                    `
                        SELECT GET_LOCK(?, 10)
                            AS acquired
                    `,
                    [
                        finalizationLockName
                    ]
                );


            finalizationLockAcquired =
                Number(
                    lockRows?.[0]?.acquired
                ) ===
                1;


            if (
                !finalizationLockAcquired
            ) {

                return res.redirect(
                    `/training/live/${sessionId}/fto?error=` +
                    encodeURIComponent(
                        "This session is already being finalized. Wait a few seconds and try again."
                    )
                );
            }


            const liveSession =
                await getSession(
                    sessionId
                );


            if (!liveSession) {

                return res
                    .status(404)
                    .send(
                        "Training session not found."
                    );
            }


            if (
                !canAccessDepartment(
                    req,
                    liveSession.department_code,
                    "fto"
                )
            ) {

                return renderAccessDenied(
                    req,
                    res,
                    "You cannot finalize training for this department."
                );
            }


            if (
                ![
                    "live",
                    "completed"
                ].includes(
                    liveSession.status
                )
            ) {

                return res.redirect(
                    `/training/schedule/${sessionId}?error=` +
                    encodeURIComponent(
                        "The session must be live before it can be finalized."
                    )
                );
            }


            const preflight =
                await getLiveFinalizationPreflight(
                    liveSession
                );


            const traineeRows =
                preflight.trainees;


            for (
                const trainee
                of traineeRows
            ) {

                console.log(
                    `[LIVE RESULT PREFLIGHT] ${trainee.display_name || trainee.username}: ${trainee.answered}/${trainee.questionCount} answered, ${trainee.missingAutomatic} missing auto, ${trainee.unmarkedManual} unmarked manual, projected ${trainee.projectedStatus}.`
                );
            }


            if (!traineeRows.length) {

                return res.redirect(
                    `/training/live/${sessionId}/fto?error=` +
                    encodeURIComponent(
                        "No trainees are marked Present. Join the trainee to the live session before finalizing."
                    )
                );
            }


            const questions =
                await getQuestions(
                    liveSession.assessment_id
                );


            if (!questions.length) {

                return res.redirect(
                    `/training/live/${sessionId}/fto?error=` +
                    encodeURIComponent(
                        "This assessment has no active questions."
                    )
                );
            }


            const reviewer =
                getUser(req);


            connection =
                await trainingDatabase.getConnection();


            await connection.beginTransaction();


            const generated =
                [];


            for (
                const trainee
                of traineeRows
            ) {

                const result =
                    await buildOfficialAttemptFromLiveSession(
                        connection,
                        liveSession,
                        trainee,
                        questions,
                        reviewer.id
                    );


                generated.push(
                    result
                );
            }


            await connection.execute(
                `
                    UPDATE training_sessions

                    SET
                        status = 'completed',
                        ended_at = COALESCE(
                            ended_at,
                            CURRENT_TIMESTAMP
                        )

                    WHERE id = ?
                `,
                [
                    sessionId
                ]
            );


            await connection.commit();


            for (
                const result
                of generated
            ) {

                console.log(
                    `[LIVE RESULT TRAINEE] ${result.trainee.display_name || result.trainee.username}: attempt ${result.attemptId}, ${String(result.finalOutcome).toUpperCase()}, status ${result.status}${result.existing ? " (existing attempt)" : ""}.`
                );


                if (
                    !result.existing &&
                    result.status ===
                    "completed" &&
                    result.finalOutcome ===
                    "pass"
                ) {

                    const roleResult =
                        await updatePassedRoleFromLiveResult(
                            result.trainee.discord_id,
                            liveSession.department_code
                        );


                    if (
                        !roleResult.ok &&
                        !roleResult.skipped
                    ) {

                        console.error(
                            `[LIVE RESULT] Attempt ${result.attemptId} passed but Discord role update was incomplete: ${roleResult.message}`
                        );
                    }


                } else if (
                    !result.existing &&
                    result.finalOutcome ===
                    "fail"
                ) {

                    console.log(
                        `[LIVE RESULT ROLE] ${result.trainee.display_name || result.trainee.username} failed. No Discord training roles were changed.`
                    );


                } else if (
                    !result.existing &&
                    result.status ===
                    "pending_review"
                ) {

                    console.log(
                        `[LIVE RESULT ROLE] ${result.trainee.display_name || result.trainee.username} is pending FTO review. No Discord training roles were changed yet.`
                    );
                }
            }


            console.log(
                `[LIVE RESULT] Finalized session ${sessionId}. Created/resolved ${generated.length} official attempt(s).`
            );


            return res.redirect(
                `/training/live/${sessionId}/summary`
            );


        } catch (error) {

            if (connection) {

                try {

                    await connection.rollback();

                } catch {
                    // Ignore rollback errors.
                }
            }


            console.error(
                "[LIVE RESULT] Finalize error:",
                error
            );


            return res.redirect(
                `/training/live/${req.params.sessionId}/fto?error=` +
                encodeURIComponent(
                    "The live session could not be finalized into official results."
                )
            );


        } finally {

            if (
                finalizationLockAcquired &&
                finalizationLockName
            ) {

                try {

                    await trainingDatabase.execute(
                        `
                            SELECT RELEASE_LOCK(?)
                                AS released
                        `,
                        [
                            finalizationLockName
                        ]
                    );

                } catch (lockError) {

                    console.error(
                        "[LIVE RESULT] Could not release finalization lock:",
                        lockError
                    );
                }
            }


            if (connection) {

                connection.release();
            }
        }
    }
);


// ======================================================
// FTO LIVE RESULT SUMMARY
// ======================================================

router.get(
    "/training/live/:sessionId/summary",
    requireLogin,
    async (
        req,
        res
    ) => {

        try {

            await ensureOfficialAttemptTables();


            const sessionId =
                Number(
                    req.params.sessionId
                );


            const liveSession =
                await getSession(
                    sessionId
                );


            if (!liveSession) {

                return res
                    .status(404)
                    .send(
                        "Training session not found."
                    );
            }


            if (
                !canAccessDepartment(
                    req,
                    liveSession.department_code,
                    "fto"
                )
            ) {

                return renderAccessDenied(
                    req,
                    res,
                    "You cannot view results for this department."
                );
            }


            const [
                attempts
            ] =
                await trainingDatabase.execute(
                    `
                        SELECT
                            id,
                            trainee_discord_id,
                            trainee_username,
                            status,
                            auto_marks,
                            manual_marks,
                            total_marks,
                            max_marks,
                            pass_mark_percent,
                            percentage,
                            final_outcome,
                            submitted_at

                        FROM training_attempts

                        WHERE source_session_id = ?

                        ORDER BY
                            trainee_username ASC,
                            id ASC
                    `,
                    [
                        sessionId
                    ]
                );


            return res.render(
                "live-summary",
                {
                    user:
                        getUser(req),

                    session:
                        liveSession,

                    attempts
                }
            );


        } catch (error) {

            console.error(
                "[LIVE RESULT] Summary error:",
                error
            );


            return res
                .status(500)
                .send(
                    "Could not load the live-session result summary."
                );
        }
    }
);


// ======================================================
// LIVE STATE API
// ======================================================

router.get(
    "/training/live/:sessionId/state",
    requireLogin,
    async (
        req,
        res
    ) => {
        try {
            const sessionId =
                Number(
                    req.params.sessionId
                );


            const liveSession =
                await getSession(
                    sessionId
                );


            if (!liveSession) {
                return res
                    .status(404)
                    .json({
                        ok:
                            false
                    });
            }


            const canView =
                canAccessDepartment(
                    req,
                    liveSession.department_code,
                    "trainee"
                ) ||
                canAccessDepartment(
                    req,
                    liveSession.department_code,
                    "fto"
                );


            if (!canView) {
                return res
                    .status(403)
                    .json({
                        ok:
                            false
                    });
            }


            const sections =
                await getSections(
                    liveSession.assessment_id
                );


            const liveState =
                await getLiveState(
                    liveSession.id,
                    sections
                );


            const participants =
                await getParticipants(
                    liveSession.id
                );


            return res.json({
                ok:
                    true,

                status:
                    liveSession.status,

                currentSectionId:
                    liveState.current_section_id
                        ? Number(
                            liveState.current_section_id
                        )
                        : null,

                quizOpen:
                    Boolean(
                        Number(
                            liveState.quiz_open
                        )
                    ),

                revision:
                    Number(
                        liveState.revision ||
                        0
                    ),

                participants:
                    participants.map(
                        person => ({
                            displayName:
                                person.display_name ||
                                person.username,

                            avatarUrl:
                                person.avatar_url ||
                                "https://cdn.discordapp.com/embed/avatars/0.png",

                            role:
                                person.participant_role,

                            attendance:
                                person.attendance_status
                        })
                    )
            });


        } catch (error) {
            console.error(
                "[LIVE TRAINING] State error:",
                error
            );


            return res
                .status(500)
                .json({
                    ok:
                        false
                });
        }
    }
);


// ======================================================
// STEP 10 - SYSTEM HEALTH CHECK
// ======================================================

router.get(
    "/training/system/health",
    requireLogin,
    async (
        req,
        res
    ) => {

        try {

            const [
                databaseRows
            ] =
                await trainingDatabase.execute(
                    `
                        SELECT
                            1 AS database_ok
                    `
                );


            const [
                liveRows
            ] =
                await trainingDatabase.execute(
                    `
                        SELECT
                            COUNT(*) AS live_sessions

                        FROM training_sessions

                        WHERE status = 'live'
                    `
                );


            const [
                pendingRows
            ] =
                await trainingDatabase.execute(
                    `
                        SELECT
                            COUNT(*) AS pending_reviews

                        FROM training_attempts

                        WHERE status = 'pending_review'
                    `
                );


            return res.json({
                ok:
                    true,

                database:
                    Number(
                        databaseRows?.[0]?.database_ok
                    ) ===
                    1,

                liveSessions:
                    Number(
                        liveRows?.[0]?.live_sessions ||
                        0
                    ),

                pendingReviews:
                    Number(
                        pendingRows?.[0]?.pending_reviews ||
                        0
                    ),

                timestamp:
                    new Date()
                        .toISOString()
            });


        } catch (error) {

            console.error(
                "[TRAINING HEALTH] Health check failed:",
                error
            );


            return res
                .status(500)
                .json({
                    ok:
                        false,

                    database:
                        false,

                    timestamp:
                        new Date()
                            .toISOString()
                });
        }
    }
);


export default router;
