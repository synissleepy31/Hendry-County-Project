import express from "express";
import trainingDatabase, { ensureQuestionGuidanceColumn } from "../services/database.js";
import { getPermissions, requireFtoAccess, canAccessDepartment, renderAccessDenied } from "../services/permissions.js";

const router = express.Router();


// ======================================================
// DEPARTMENT TRAINING ROLE SWAPS
// ======================================================

const DEPARTMENT_PASS_ROLES = {
    HCSO: {
        needsTrainingRoleId: "1533636130791096393",
        passedRoleId: "1533636073975054427"
    },

    CPD: {
        needsTrainingRoleId: "1533641168775151728",
        passedRoleId: "1533641069151916213"
    },

    FHP: {
        needsTrainingRoleId: "1533634185854718042",
        passedRoleId: "1533634104979881994"
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


async function updatePassedTrainingRoles(
    traineeDiscordId,
    departmentCode
) {
    const mapping =
        DEPARTMENT_PASS_ROLES[
            String(departmentCode || "").toUpperCase()
        ];

    if (!mapping) {
        return {
            ok: false,
            skipped: true,
            message:
                `No pass-role mapping exists for ${departmentCode}.`
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
            ok: false,
            skipped: true,
            message:
                "Discord bot token, guild ID, or trainee Discord ID is missing."
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
        let body = null;

        try {
            body =
                await addResponse.json();
        } catch {
            body =
                null;
        }

        console.error(
            "[TRAINING ROLE] Could not add passed role:",
            {
                traineeDiscordId,
                departmentCode,
                roleId:
                    mapping.passedRoleId,
                status:
                    addResponse.status,
                body
            }
        );

        return {
            ok: false,
            skipped: false,
            message:
                "Final result was saved, but the passed Discord role could not be added."
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
        let body = null;

        try {
            body =
                await removeResponse.json();
        } catch {
            body =
                null;
        }

        console.error(
            "[TRAINING ROLE] Passed role added, but Needs Training role could not be removed:",
            {
                traineeDiscordId,
                departmentCode,
                roleId:
                    mapping.needsTrainingRoleId,
                status:
                    removeResponse.status,
                body
            }
        );

        return {
            ok: false,
            skipped: false,
            message:
                "Passed role was added, but the Needs Training role could not be removed."
        };
    }


    console.log(
        `[TRAINING ROLE] ${departmentCode}: added ${mapping.passedRoleId} and removed ${mapping.needsTrainingRoleId} for ${traineeDiscordId}.`
    );


    return {
        ok: true,
        skipped: false,
        message:
            "Discord training roles updated."
    };
}


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
// FTO REVIEW QUEUE
// ======================================================

router.get(
    "/training/fto-review",
    requireTrainingLogin,
    requireFtoAccess,
    async (req, res) => {
        try {
            await ensureSubmissionTables();

            const user =
                getTrainingUserDetails(
                    req.session.trainingUser
                );

            const [pendingAttempts] =
                await trainingDatabase.execute(
                    `
                        SELECT
                            ta.id,
                            ta.trainee_username,
                            ta.auto_marks,
                            ta.max_marks,
                            ta.pass_mark_percent,
                            ta.submitted_at,
                            a.name AS assessment_name,
                            d.name AS department_name,
                            d.short_code AS department_code,
                            (
                                SELECT COUNT(*)
                                FROM training_attempt_answers taa
                                WHERE
                                    taa.attempt_id = ta.id
                                    AND taa.requires_manual_marking = 1
                            ) AS manual_question_count

                        FROM training_attempts ta

                        INNER JOIN training_assessments a
                            ON a.id = ta.assessment_id

                        INNER JOIN training_departments d
                            ON d.id = a.department_id

                        WHERE ta.status = 'pending_review'

                        ORDER BY ta.submitted_at ASC
                    `
                );

            const permissions = getPermissions(req);
            const visiblePendingAttempts = permissions.isManagement
                ? pendingAttempts
                : pendingAttempts.filter(a => permissions.ftoDepartments.includes(String(a.department_code).toUpperCase()));

            const [recentCompleted] =
                await trainingDatabase.execute(
                    `
                        SELECT
                            ta.id,
                            ta.trainee_username,
                            ta.total_marks,
                            ta.max_marks,
                            ta.percentage,
                            ta.final_outcome,
                            ta.submitted_at,
                            ta.reviewed_at,
                            a.name AS assessment_name,
                            d.short_code AS department_code

                        FROM training_attempts ta

                        INNER JOIN training_assessments a
                            ON a.id = ta.assessment_id

                        INNER JOIN training_departments d
                            ON d.id = a.department_id

                        WHERE ta.status = 'completed'

                        ORDER BY
                            COALESCE(ta.reviewed_at, ta.submitted_at) DESC

                        LIMIT 12
                    `
                );

            const visibleRecentCompleted = permissions.isManagement
                ? recentCompleted
                : recentCompleted.filter(a => permissions.ftoDepartments.includes(String(a.department_code).toUpperCase()));

            return res.render(
                "fto-review-list",
                {
                    user,
                    pendingAttempts: visiblePendingAttempts,
                    recentCompleted: visibleRecentCompleted,
                    message:
                        req.query.message || "",
                    error:
                        req.query.error || ""
                }
            );

        } catch (error) {
            console.error(
                "[FTO REVIEW] Queue load error:",
                error
            );

            return res
                .status(500)
                .send(
                    "Could not load the FTO review queue."
                );
        }
    }
);

// ======================================================
// FTO REVIEW ATTEMPT
// ======================================================

router.get(
    "/training/fto-review/:attemptId",
    requireTrainingLogin,
    requireFtoAccess,
    async (req, res) => {
        try {

            await ensureQuestionGuidanceColumn();

            await ensureSubmissionTables();

            const attemptId =
                Number(req.params.attemptId);

            if (!attemptId) {
                return res.redirect(
                    "/training/fto-review"
                );
            }

            const user =
                getTrainingUserDetails(
                    req.session.trainingUser
                );

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

                        WHERE ta.id = ?

                        LIMIT 1
                    `,
                    [attemptId]
                );

            if (!attemptRows.length) {
                return res
                    .status(404)
                    .send(
                        "That training attempt could not be found."
                    );
            }

            const attempt =
                attemptRows[0];

            if (!canAccessDepartment(req, attempt.department_code, "fto")) {
                return renderAccessDenied(
                    req,
                    res,
                    "You cannot review assessments for this department."
                );
            }

            const [answers] =
                await trainingDatabase.execute(
                    `
                        SELECT
                            taa.id,
                            taa.question_id,
                            taa.question_text,
                            taa.question_type,
                            taa.answer_text,
                            taa.answer_json,
                            taa.is_correct,
                            taa.awarded_marks,
                            taa.max_marks,
                            taa.requires_manual_marking,
                            taa.review_notes,
                            taa.reviewed_by_discord_id,
                            taa.reviewed_at,
                            q.fto_marking_guidance

                        FROM training_attempt_answers taa

                        LEFT JOIN training_questions q
                            ON q.id = taa.question_id

                        WHERE taa.attempt_id = ?

                        ORDER BY id ASC
                    `,
                    [attemptId]
                );

            const manualAnswers =
                answers.filter(
                    answer =>
                        Number(
                            answer.requires_manual_marking
                        ) === 1
                );

            const automaticAnswers =
                answers.filter(
                    answer =>
                        Number(
                            answer.requires_manual_marking
                        ) !== 1
                );

            return res.render(
                "fto-review-attempt",
                {
                    user,
                    attempt,
                    answers,
                    manualAnswers,
                    automaticAnswers,
                    message:
                        req.query.message || "",
                    error:
                        req.query.error || ""
                }
            );

        } catch (error) {
            console.error(
                "[FTO REVIEW] Attempt load error:",
                error
            );

            return res
                .status(500)
                .send(
                    "Could not load that training attempt."
                );
        }
    }
);

// ======================================================
// SAVE FTO REVIEW / FINAL RESULT
// ======================================================

router.post(
    "/training/fto-review/:attemptId/complete",
    requireTrainingLogin,
    requireFtoAccess,
    async (req, res) => {
        const attemptId =
            Number(req.params.attemptId);

        if (!attemptId) {
            return res.redirect(
                "/training/fto-review"
            );
        }

        let connection;

        try {
            await ensureSubmissionTables();

            const reviewer =
                getTrainingUserDetails(
                    req.session.trainingUser
                );

            const [attemptRows] =
                await trainingDatabase.execute(
                    `
                        SELECT ta.*, d.short_code AS department_code
                        FROM training_attempts ta
                        INNER JOIN training_assessments a ON a.id = ta.assessment_id
                        INNER JOIN training_departments d ON d.id = a.department_id
                        WHERE ta.id = ?
                        LIMIT 1
                    `,
                    [attemptId]
                );

            if (!attemptRows.length) {
                return res.redirect(
                    "/training/fto-review?error=" +
                    encodeURIComponent(
                        "That attempt no longer exists."
                    )
                );
            }

            const attempt =
                attemptRows[0];

            if (!canAccessDepartment(req, attempt.department_code, "fto")) {
                return renderAccessDenied(
                    req,
                    res,
                    "You cannot mark assessments for this department."
                );
            }

            const [manualAnswers] =
                await trainingDatabase.execute(
                    `
                        SELECT
                            id,
                            question_text,
                            max_marks

                        FROM training_attempt_answers

                        WHERE
                            attempt_id = ?
                            AND requires_manual_marking = 1

                        ORDER BY id ASC
                    `,
                    [attemptId]
                );

            const preparedMarks = [];
            let manualMarks = 0;

            for (const answer of manualAnswers) {
                const marksField =
                    `marks_${answer.id}`;

                const notesField =
                    `notes_${answer.id}`;

                const rawMarks =
                    req.body[marksField];

                const maxMarks =
                    Number(
                        answer.max_marks || 0
                    );

                if (
                    rawMarks === undefined ||
                    rawMarks === null ||
                    rawMarks === ""
                ) {
                    return res.redirect(
                        `/training/fto-review/${attemptId}?error=` +
                        encodeURIComponent(
                            `Please award marks for every manual question. Missing: ${answer.question_text}`
                        )
                    );
                }

                const marks =
                    Number(rawMarks);

                if (
                    Number.isNaN(marks) ||
                    marks < 0 ||
                    marks > maxMarks
                ) {
                    return res.redirect(
                        `/training/fto-review/${attemptId}?error=` +
                        encodeURIComponent(
                            `Marks for "${answer.question_text}" must be between 0 and ${maxMarks}.`
                        )
                    );
                }

                const notes =
                    String(
                        req.body[notesField] || ""
                    ).trim();

                manualMarks +=
                    marks;

                preparedMarks.push({
                    id:
                        answer.id,
                    marks,
                    notes
                });
            }

            const autoMarks =
                Number(
                    attempt.auto_marks || 0
                );

            const maxMarks =
                Number(
                    attempt.max_marks || 0
                );

            const totalMarks =
                Number(
                    (
                        autoMarks +
                        manualMarks
                    ).toFixed(2)
                );

            const percentage =
                maxMarks > 0
                    ? Number(
                        (
                            totalMarks /
                            maxMarks *
                            100
                        ).toFixed(2)
                    )
                    : 0;

            const passMark =
                Number(
                    attempt.pass_mark_percent || 70
                );

            const finalOutcome =
                percentage >= passMark
                    ? "pass"
                    : "fail";

            const ftoNotes =
                String(
                    req.body.fto_notes || ""
                ).trim();

            connection =
                await trainingDatabase.getConnection();

            await connection.beginTransaction();

            for (const mark of preparedMarks) {
                await connection.execute(
                    `
                        UPDATE training_attempt_answers

                        SET
                            awarded_marks = ?,
                            review_notes = ?,
                            reviewed_by_discord_id = ?,
                            reviewed_at = CURRENT_TIMESTAMP

                        WHERE
                            id = ?
                            AND attempt_id = ?
                    `,
                    [
                        mark.marks,
                        mark.notes || null,
                        reviewer.id,
                        mark.id,
                        attemptId
                    ]
                );
            }

            await connection.execute(
                `
                    UPDATE training_attempts

                    SET
                        status = 'completed',
                        manual_marks = ?,
                        total_marks = ?,
                        percentage = ?,
                        final_outcome = ?,
                        fto_notes = ?,
                        reviewed_by_discord_id = ?,
                        reviewed_at = CURRENT_TIMESTAMP

                    WHERE id = ?
                `,
                [
                    manualMarks,
                    totalMarks,
                    percentage,
                    finalOutcome,
                    ftoNotes || null,
                    reviewer.id,
                    attemptId
                ]
            );

            await connection.commit();

            let discordRoleMessage =
                "";


            if (
                finalOutcome ===
                "pass"
            ) {
                const roleResult =
                    await updatePassedTrainingRoles(
                        attempt.trainee_discord_id,
                        attempt.department_code
                    );

                if (
                    !roleResult.ok &&
                    !roleResult.skipped
                ) {
                    discordRoleMessage =
                        ` ${roleResult.message}`;
                }
            }


            console.log(
                `[FTO REVIEW] ${reviewer.username} reviewed attempt ${attemptId}: ${finalOutcome.toUpperCase()} ${percentage}%`
            );

            return res.redirect(
                `/training/fto-review/${attemptId}?message=` +
                encodeURIComponent(
                    `Review completed. Final result: ${finalOutcome.toUpperCase()} (${percentage}%).${discordRoleMessage}`
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
                "[FTO REVIEW] Complete review error:",
                error
            );

            return res.redirect(
                `/training/fto-review/${attemptId}?error=` +
                encodeURIComponent(
                    "The FTO review could not be saved."
                )
            );

        } finally {
            if (connection) {
                connection.release();
            }
        }
    }
);

export default router;
