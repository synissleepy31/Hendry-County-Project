import express from "express";
import crypto from "node:crypto";

import trainingDatabase, { ensureSpecialTrainingDepartments } from "../services/database.js";

import {
    getPermissions,
    canAccessDepartment,
    renderAccessDenied
} from "../services/permissions.js";


const router =
    express.Router();


// ======================================================
// HELPERS
// ======================================================

function requireTrainingLogin(
    req,
    res,
    next
) {

    if (
        !req.session?.trainingUser
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


function canManageSchedule(
    req
) {

    const permissions =
        getPermissions(req);


    return (
        permissions.isManagement ||
        permissions.ftoDepartments.length > 0
    );
}


function requireScheduleAccess(
    req,
    res,
    next
) {

    if (
        !req.session?.trainingUser
    ) {

        return res.redirect(
            "/login"
        );
    }


    if (
        !canManageSchedule(req)
    ) {

        return renderAccessDenied(
            req,
            res,
            "You do not have permission to manage training schedules."
        );
    }


    next();
}


function generateJoinCode() {

    return String(
        crypto.randomInt(
            100000,
            1000000
        )
    );
}


function getBotToken() {

    return (
        process.env.DISCORD_TOKEN ||
        process.env.BOT_TOKEN ||
        process.env.TOKEN ||
        ""
    );
}


function getPublicTrainingUrl() {

    const configured =
        String(
            process.env.TRAINING_PUBLIC_URL ||
            ""
        )
            .trim()
            .replace(/\/+$/, "");


    if (configured) {

        return configured;
    }


    return "";
}


async function ensureScheduleTables() {

    await trainingDatabase.execute(
        `
            CREATE TABLE IF NOT EXISTS training_session_schedule_meta
            (
                session_id BIGINT UNSIGNED NOT NULL,
                max_trainees INT UNSIGNED NULL,
                notes TEXT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                    ON UPDATE CURRENT_TIMESTAMP,

                PRIMARY KEY (session_id),

                CONSTRAINT fk_training_schedule_meta_session
                    FOREIGN KEY (session_id)
                    REFERENCES training_sessions(id)
                    ON DELETE CASCADE
            )
            ENGINE=InnoDB
            DEFAULT CHARSET=utf8mb4
            COLLATE=utf8mb4_unicode_ci
        `
    );


    const [
        archivedColumn
    ] =
        await trainingDatabase.execute(
            `
                SELECT COLUMN_NAME

                FROM information_schema.COLUMNS

                WHERE
                    TABLE_SCHEMA = DATABASE()
                    AND TABLE_NAME = 'training_sessions'
                    AND COLUMN_NAME = 'is_archived'
            `
        );


    if (
        !archivedColumn.length
    ) {

        await trainingDatabase.execute(
            `
                ALTER TABLE training_sessions

                ADD COLUMN is_archived
                TINYINT(1) NOT NULL DEFAULT 0
            `
        );
    }

}


async function getSessionById(
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
                    s.attendance_message_id,
                    s.attendance_channel_id,
                    s.created_at,

                    a.name
                        AS assessment_name,

                    a.description
                        AS assessment_description,

                    d.name
                        AS department_name,

                    d.short_code
                        AS department_code,

                    d.accent_color
                        AS department_color,

                    d.scheduling_channel_id,

                    u.discord_id
                        AS host_discord_id,

                    u.display_name
                        AS host_display_name,

                    u.username
                        AS host_username,

                    m.max_trainees,

                    m.notes

                FROM training_sessions s

                INNER JOIN training_assessments a
                    ON a.id =
                    s.assessment_id

                INNER JOIN training_departments d
                    ON d.id =
                    s.department_id

                INNER JOIN training_users u
                    ON u.id =
                    s.host_user_id

                LEFT JOIN training_session_schedule_meta m
                    ON m.session_id =
                    s.id

                WHERE
                    s.id = ?

                LIMIT 1
            `,
            [
                sessionId
            ]
        );


    return rows[0] || null;
}


async function getAttendance(
    sessionId
) {

    const [
        rows
    ] =
        await trainingDatabase.execute(
            `
                SELECT
                    su.id,
                    su.participant_role,
                    su.attendance_status,
                    su.created_at,

                    u.id
                        AS user_id,

                    u.discord_id,

                    u.username,

                    u.display_name,

                    u.avatar_url

                FROM training_session_users su

                INNER JOIN training_users u
                    ON u.id =
                    su.user_id

                WHERE
                    su.session_id = ?

                ORDER BY
                    FIELD(
                        su.attendance_status,
                        'attending',
                        'maybe',
                        'unavailable',
                        'pending',
                        'present',
                        'absent'
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


async function sendDiscordAttendanceMessage(
    session
) {

    const botToken =
        getBotToken();


    if (!botToken) {

        return {
            ok: false,
            message:
                "No Discord bot token was found. Set DISCORD_TOKEN, BOT_TOKEN, or TOKEN."
        };
    }


    const channelId =
        String(
            session.scheduling_channel_id ||
            session.attendance_channel_id ||
            ""
        ).trim();


    if (!channelId) {

        return {
            ok: false,
            message:
                "This department does not have a Scheduling Channel ID configured."
        };
    }


    const publicUrl =
        getPublicTrainingUrl();


    if (!publicUrl) {

        return {
            ok: false,
            message:
                "Set TRAINING_PUBLIC_URL before posting attendance to Discord."
        };
    }


    const attendingUrl =
        `${publicUrl}/training/schedule/${session.id}/attendance/attending`;


    const unavailableUrl =
        `${publicUrl}/training/schedule/${session.id}/attendance/unavailable`;


    const maybeUrl =
        `${publicUrl}/training/schedule/${session.id}/attendance/maybe`;


    const sessionUrl =
        `${publicUrl}/training/schedule/${session.id}`;


    const scheduledUnix =
        Math.floor(
            new Date(
                session.scheduled_for
            ).getTime() /
            1000
        );


    const payload = {

        content:
            session.department_code === "JOINT"

                ? [
                    "<@&1533636130791096393>",
                    "<@&1533641168775151728>",
                    "<@&1533634185854718042>"
                ].join(" ")

                : session.department_code === "STAFF"

                    ? "<@&1533590255834366065>"

                    : session.department_code === "HCSO"

                        ? "<@&1533636130791096393>"

                        : session.department_code === "CPD"

                            ? "<@&1533641168775151728>"

                            : session.department_code === "FHP"

                                ? "<@&1533634185854718042>"

                                : "",

        allowed_mentions: {
            parse: [
                "roles"
            ]
        },

        embeds: [
            {
                title:
                    `📚 ${session.department_code} Training Scheduled`,

                description:
                    `**${session.assessment_name}**\n\nA new training session has been scheduled. Please confirm your availability below.`,

                color:
                    0xFF7A00,

                fields: [
                    {
                        name:
                            "Department",

                        value:
                            session.department_name,

                        inline:
                            true
                    },

                    {
                        name:
                            "Host",

                        value:
                            session.host_display_name ||
                            session.host_username,

                        inline:
                            true
                    },

                    {
                        name:
                            "Date / Time",

                        value:
                            `<t:${scheduledUnix}:F>\n<t:${scheduledUnix}:R>`,

                        inline:
                            false
                    },

                    {
                        name:
                            "Join Code",

                        value:
                            `\`${session.join_code}\``,

                        inline:
                            true
                    },

                    {
                        name:
                            "Maximum Trainees",

                        value:
                            session.max_trainees
                                ? String(
                                    session.max_trainees
                                )
                                : "Unlimited",

                        inline:
                            true
                    }
                ],

                footer: {
                    text:
                        "Hendry County Project · Interactive Training"
                }
            }
        ],

        components: [
            {
                type:
                    1,

                components: [
                    {
                        type:
                            2,

                        style:
                            5,

                        label:
                            "✅ Attending",

                        url:
                            attendingUrl
                    },

                    {
                        type:
                            2,

                        style:
                            5,

                        label:
                            "❓ Maybe",

                        url:
                            maybeUrl
                    },

                    {
                        type:
                            2,

                        style:
                            5,

                        label:
                            "❌ Unavailable",

                        url:
                            unavailableUrl
                    },

                    {
                        type:
                            2,

                        style:
                            5,

                        label:
                            "View Session",

                        url:
                            sessionUrl
                    }
                ]
            }
        ]
    };


    const response =
        await fetch(
            `https://discord.com/api/v10/channels/${channelId}/messages`,
            {
                method:
                    "POST",

                headers: {
                    Authorization:
                        `Bot ${botToken}`,

                    "Content-Type":
                        "application/json"
                },

                body:
                    JSON.stringify(
                        payload
                    )
            }
        );


    let body = null;


    try {

        body =
            await response.json();

    } catch {

        body =
            null;
    }


    if (
        !response.ok
    ) {

        console.error(
            "[TRAINING SCHEDULE] Discord message error:",
            body
        );


        return {
            ok: false,

            message:
                body?.message ||
                `Discord returned HTTP ${response.status}.`
        };
    }


    await trainingDatabase.execute(
        `
            UPDATE training_sessions

            SET
                attendance_message_id = ?,
                attendance_channel_id = ?

            WHERE id = ?
        `,
        [
            body.id,
            channelId,
            session.id
        ]
    );


    return {
        ok: true,

        messageId:
            body.id,

        channelId
    };
}


// ======================================================
// SCHEDULE LIST
// ======================================================

router.get(
    "/training/schedule",
    requireTrainingLogin,
    requireScheduleAccess,
    async (
        req,
        res
    ) => {

        try {

            await ensureSpecialTrainingDepartments();


            await ensureScheduleTables();


            const user =
                getTrainingUserDetails(
                    req.session.trainingUser
                );


            const permissions =
                getPermissions(req);


            const [
                departments
            ] =
                await trainingDatabase.execute(
                    `
                        SELECT
                            id,
                            name,
                            short_code,
                            scheduling_channel_id

                        FROM training_departments

                        WHERE is_active = 1

                        ORDER BY
                            display_order ASC,
                            name ASC
                    `
                );


            const visibleDepartments =
                permissions.isManagement

                    ? departments

                    : departments.filter(
                        department =>
                            permissions.ftoDepartments.includes(
                                String(
                                    department.short_code
                                ).toUpperCase()
                            )
                    );


            const [
                assessments
            ] =
                await trainingDatabase.execute(
                    `
                        SELECT
                            a.id,
                            a.department_id,
                            a.name,

                            d.short_code
                                AS department_code

                        FROM training_assessments a

                        INNER JOIN training_departments d
                            ON d.id =
                            a.department_id

                        WHERE
                            a.is_active = 1
                            AND d.is_active = 1

                        ORDER BY
                            d.name ASC,
                            a.name ASC
                    `
                );


            const visibleAssessments =
                permissions.isManagement

                    ? assessments

                    : assessments.filter(
                        assessment =>
                            permissions.ftoDepartments.includes(
                                String(
                                    assessment.department_code
                                ).toUpperCase()
                            )
                    );


            const [
                sessions
            ] =
                await trainingDatabase.execute(
                    `
                        SELECT
                            s.id,
                            s.join_code,
                            s.status,
                            s.scheduled_for,
                            s.started_at,
                            s.ended_at,
                            s.attendance_message_id,

                            a.name
                                AS assessment_name,

                            d.name
                                AS department_name,

                            d.short_code
                                AS department_code,

                            u.display_name
                                AS host_display_name,

                            u.username
                                AS host_username,

                            m.max_trainees,

                            (
                                SELECT COUNT(*)

                                FROM training_session_users su

                                WHERE
                                    su.session_id = s.id
                                    AND su.attendance_status = 'attending'
                            )
                                AS attending_count,

                            (
                                SELECT COUNT(*)

                                FROM training_session_users su

                                WHERE
                                    su.session_id = s.id
                                    AND su.attendance_status = 'unavailable'
                            )
                                AS unavailable_count,

                            (
                                SELECT COUNT(*)

                                FROM training_session_users su

                                WHERE
                                    su.session_id = s.id
                                    AND su.attendance_status = 'maybe'
                            )
                                AS maybe_count

                        FROM training_sessions s

                        INNER JOIN training_assessments a
                            ON a.id =
                            s.assessment_id

                        INNER JOIN training_departments d
                            ON d.id =
                            s.department_id

                        INNER JOIN training_users u
                            ON u.id =
                            s.host_user_id

                        LEFT JOIN training_session_schedule_meta m
                            ON m.session_id =
                            s.id

                        
                        WHERE
                            COALESCE(s.is_archived, 0) = 0

                        ORDER BY
                            CASE
                                WHEN s.status = 'live'
                                    THEN 0

                                WHEN s.status = 'scheduled'
                                    THEN 1

                                WHEN s.status = 'completed'
                                    THEN 2

                                ELSE 3
                            END,
                            s.scheduled_for ASC,
                            s.id DESC
                    `
                );


            const visibleSessions =
                permissions.isManagement

                    ? sessions

                    : sessions.filter(
                        session =>
                            permissions.ftoDepartments.includes(
                                String(
                                    session.department_code
                                ).toUpperCase()
                            )
                    );


            return res.render(
                "schedule",
                {
                    user,

                    departments:
                        visibleDepartments,

                    assessments:
                        visibleAssessments,

                    sessions:
                        visibleSessions,

                    publicUrlConfigured:
                        Boolean(
                            getPublicTrainingUrl()
                        ),

                    botTokenConfigured:
                        Boolean(
                            getBotToken()
                        ),

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
                "[TRAINING SCHEDULE] Load error:",
                error
            );


            return res
                .status(500)
                .send(
                    "Could not load the training schedule."
                );
        }
    }
);


// ======================================================
// CREATE SCHEDULE
// ======================================================

router.post(
    "/training/schedule/create",
    requireTrainingLogin,
    requireScheduleAccess,
    async (
        req,
        res
    ) => {

        try {

            await ensureScheduleTables();


            const assessmentId =
                Number(
                    req.body.assessment_id
                );


            const departmentId =
                Number(
                    req.body.department_id
                );


            const scheduledFor =
                String(
                    req.body.scheduled_for ||
                    ""
                ).trim();


            const notes =
                String(
                    req.body.notes ||
                    ""
                ).trim();


            const maxTraineesRaw =
                Number(
                    req.body.max_trainees
                );


            const maxTrainees =
                Number.isFinite(
                    maxTraineesRaw
                ) &&
                maxTraineesRaw > 0

                    ? Math.min(
                        500,
                        Math.floor(
                            maxTraineesRaw
                        )
                    )

                    : null;


            if (
                !assessmentId ||
                !departmentId ||
                !scheduledFor
            ) {

                return res.redirect(
                    "/training/schedule?error=" +
                    encodeURIComponent(
                        "Department, assessment and date/time are required."
                    )
                );
            }


            const [
                assessmentRows
            ] =
                await trainingDatabase.execute(
                    `
                        SELECT
                            a.id,
                            a.department_id,

                            d.short_code
                                AS department_code

                        FROM training_assessments a

                        INNER JOIN training_departments d
                            ON d.id =
                            a.department_id

                        WHERE
                            a.id = ?
                            AND a.is_active = 1

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
                    "/training/schedule?error=" +
                    encodeURIComponent(
                        "That assessment could not be found."
                    )
                );
            }


            const assessment =
                assessmentRows[0];


            if (
                Number(
                    assessment.department_id
                ) !==
                departmentId
            ) {

                return res.redirect(
                    "/training/schedule?error=" +
                    encodeURIComponent(
                        "That assessment does not belong to the selected department."
                    )
                );
            }


            if (
                !canAccessDepartment(
                    req,
                    assessment.department_code,
                    "fto"
                )
            ) {

                return renderAccessDenied(
                    req,
                    res,
                    "You cannot schedule training for this department."
                );
            }


            const hostUserId =
                Number(
                    req.session.trainingDatabaseUserId
                );


            if (
                !hostUserId
            ) {

                return res.redirect(
                    "/training/schedule?error=" +
                    encodeURIComponent(
                        "Your training account could not be resolved. Please log out and back in."
                    )
                );
            }


            let joinCode = null;


            for (
                let attempt = 0;
                attempt < 10;
                attempt++
            ) {

                const candidate =
                    generateJoinCode();


                const [
                    existing
                ] =
                    await trainingDatabase.execute(
                        `
                            SELECT id

                            FROM training_sessions

                            WHERE join_code = ?

                            LIMIT 1
                        `,
                        [
                            candidate
                        ]
                    );


                if (
                    !existing.length
                ) {

                    joinCode =
                        candidate;

                    break;
                }
            }


            if (!joinCode) {

                throw new Error(
                    "Could not generate a unique training join code."
                );
            }


            const [
                result
            ] =
                await trainingDatabase.execute(
                    `
                        INSERT INTO training_sessions
                        (
                            assessment_id,
                            department_id,
                            host_user_id,
                            join_code,
                            status,
                            scheduled_for,
                            attendance_channel_id
                        )

                        SELECT
                            ?,
                            ?,
                            ?,
                            ?,
                            'scheduled',
                            ?,
                            d.scheduling_channel_id

                        FROM training_departments d

                        WHERE d.id = ?
                    `,
                    [
                        assessmentId,
                        departmentId,
                        hostUserId,
                        joinCode,
                        scheduledFor,
                        departmentId
                    ]
                );


            const sessionId =
                Number(
                    result.insertId
                );


            await trainingDatabase.execute(
                `
                    INSERT INTO training_session_schedule_meta
                    (
                        session_id,
                        max_trainees,
                        notes
                    )

                    VALUES
                    (
                        ?,
                        ?,
                        ?
                    )

                    ON DUPLICATE KEY UPDATE
                        max_trainees = VALUES(max_trainees),
                        notes = VALUES(notes)
                `,
                [
                    sessionId,
                    maxTrainees,
                    notes || null
                ]
            );


            let discordMessage =
                "";


            if (
                req.body.post_to_discord ===
                "1"
            ) {

                const session =
                    await getSessionById(
                        sessionId
                    );


                const result =
                    await sendDiscordAttendanceMessage(
                        session
                    );


                discordMessage =
                    result.ok

                        ? " Attendance was posted to Discord."

                        : ` Session created, but Discord was not posted: ${result.message}`;
            }


            return res.redirect(
                `/training/schedule/${sessionId}?message=` +
                encodeURIComponent(
                    `Training session scheduled.${discordMessage}`
                )
            );


        } catch (error) {

            console.error(
                "[TRAINING SCHEDULE] Create error:",
                error
            );


            return res.redirect(
                "/training/schedule?error=" +
                encodeURIComponent(
                    "Could not create the training session."
                )
            );
        }
    }
);


// ======================================================
// SESSION DETAILS
// ======================================================

router.get(
    "/training/schedule/:sessionId",
    requireTrainingLogin,
    requireScheduleAccess,
    async (
        req,
        res
    ) => {

        try {

            await ensureScheduleTables();


            const sessionId =
                Number(
                    req.params.sessionId
                );


            const session =
                await getSessionById(
                    sessionId
                );


            if (!session) {

                return res
                    .status(404)
                    .send(
                        "Training session not found."
                    );
            }


            if (
                !canAccessDepartment(
                    req,
                    session.department_code,
                    "fto"
                )
            ) {

                return renderAccessDenied(
                    req,
                    res,
                    "You cannot manage scheduled training for this department."
                );
            }


            const user =
                getTrainingUserDetails(
                    req.session.trainingUser
                );


            const attendance =
                await getAttendance(
                    sessionId
                );


            return res.render(
                "schedule-session",
                {
                    user,
                    session,
                    attendance,

                    publicUrlConfigured:
                        Boolean(
                            getPublicTrainingUrl()
                        ),

                    botTokenConfigured:
                        Boolean(
                            getBotToken()
                        ),

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
                "[TRAINING SCHEDULE] Session load error:",
                error
            );


            return res
                .status(500)
                .send(
                    "Could not load that training session."
                );
        }
    }
);


// ======================================================
// POST / REPOST TO DISCORD
// ======================================================

router.post(
    "/training/schedule/:sessionId/post-discord",
    requireTrainingLogin,
    requireScheduleAccess,
    async (
        req,
        res
    ) => {

        try {

            const sessionId =
                Number(
                    req.params.sessionId
                );


            const session =
                await getSessionById(
                    sessionId
                );


            if (!session) {

                return res.redirect(
                    "/training/schedule?error=" +
                    encodeURIComponent(
                        "Training session not found."
                    )
                );
            }


            if (
                !canAccessDepartment(
                    req,
                    session.department_code,
                    "fto"
                )
            ) {

                return renderAccessDenied(
                    req,
                    res,
                    "You cannot post attendance for this department."
                );
            }


            const result =
                await sendDiscordAttendanceMessage(
                    session
                );


            if (
                !result.ok
            ) {

                return res.redirect(
                    `/training/schedule/${sessionId}?error=` +
                    encodeURIComponent(
                        result.message
                    )
                );
            }


            return res.redirect(
                `/training/schedule/${sessionId}?message=` +
                encodeURIComponent(
                    "Attendance embed posted to Discord."
                )
            );


        } catch (error) {

            console.error(
                "[TRAINING SCHEDULE] Discord post error:",
                error
            );


            return res.redirect(
                `/training/schedule/${req.params.sessionId}?error=` +
                encodeURIComponent(
                    "Could not post attendance to Discord."
                )
            );
        }
    }
);


// ======================================================
// CANCEL SESSION
// ======================================================

router.post(
    "/training/schedule/:sessionId/cancel",
    requireTrainingLogin,
    requireScheduleAccess,
    async (
        req,
        res
    ) => {

        try {

            const sessionId =
                Number(
                    req.params.sessionId
                );


            const session =
                await getSessionById(
                    sessionId
                );


            if (!session) {

                return res.redirect(
                    "/training/schedule"
                );
            }


            if (
                !canAccessDepartment(
                    req,
                    session.department_code,
                    "fto"
                )
            ) {

                return renderAccessDenied(
                    req,
                    res,
                    "You cannot cancel training for this department."
                );
            }


            await trainingDatabase.execute(
                `
                    UPDATE training_sessions

                    SET status = 'cancelled'

                    WHERE
                        id = ?
                        AND status = 'scheduled'
                `,
                [
                    sessionId
                ]
            );


            return res.redirect(
                `/training/schedule/${sessionId}?message=` +
                encodeURIComponent(
                    "Training session cancelled."
                )
            );


        } catch (error) {

            console.error(
                "[TRAINING SCHEDULE] Cancel error:",
                error
            );


            return res.redirect(
                `/training/schedule/${req.params.sessionId}?error=` +
                encodeURIComponent(
                    "Could not cancel the training session."
                )
            );
        }
    }
);


// ======================================================
// START SESSION
// ======================================================

router.post(
    "/training/schedule/:sessionId/start",
    requireTrainingLogin,
    requireScheduleAccess,
    async (
        req,
        res
    ) => {

        try {

            const sessionId =
                Number(
                    req.params.sessionId
                );


            const session =
                await getSessionById(
                    sessionId
                );


            if (!session) {

                return res.redirect(
                    "/training/schedule"
                );
            }


            if (
                !canAccessDepartment(
                    req,
                    session.department_code,
                    "fto"
                )
            ) {

                return renderAccessDenied(
                    req,
                    res,
                    "You cannot start training for this department."
                );
            }


            await trainingDatabase.execute(
                `
                    UPDATE training_sessions

                    SET
                        status = 'live',
                        started_at = NOW()

                    WHERE
                        id = ?
                        AND status = 'scheduled'
                `,
                [
                    sessionId
                ]
            );


            return res.redirect(
                `/training/schedule/${sessionId}?message=` +
                encodeURIComponent(
                    "Training session is now LIVE."
                )
            );


        } catch (error) {

            console.error(
                "[TRAINING SCHEDULE] Start error:",
                error
            );


            return res.redirect(
                `/training/schedule/${req.params.sessionId}?error=` +
                encodeURIComponent(
                    "Could not start the training session."
                )
            );
        }
    }
);


// ======================================================
// COMPLETE SESSION
// ======================================================

router.post(
    "/training/schedule/:sessionId/complete",
    requireTrainingLogin,
    requireScheduleAccess,
    async (
        req,
        res
    ) => {

        try {

            const sessionId =
                Number(
                    req.params.sessionId
                );


            const session =
                await getSessionById(
                    sessionId
                );


            if (!session) {

                return res.redirect(
                    "/training/schedule"
                );
            }


            if (
                !canAccessDepartment(
                    req,
                    session.department_code,
                    "fto"
                )
            ) {

                return renderAccessDenied(
                    req,
                    res,
                    "You cannot complete training for this department."
                );
            }


            await trainingDatabase.execute(
                `
                    UPDATE training_sessions

                    SET
                        status = 'completed',
                        ended_at = NOW()

                    WHERE
                        id = ?
                        AND status = 'live'
                `,
                [
                    sessionId
                ]
            );


            return res.redirect(
                `/training/schedule/${sessionId}?message=` +
                encodeURIComponent(
                    "Training session completed."
                )
            );


        } catch (error) {

            console.error(
                "[TRAINING SCHEDULE] Complete error:",
                error
            );


            return res.redirect(
                `/training/schedule/${req.params.sessionId}?error=` +
                encodeURIComponent(
                    "Could not complete the training session."
                )
            );
        }
    }
);


// ======================================================
// ATTENDANCE RESPONSE
// ======================================================

router.get(
    "/training/schedule/:sessionId/attendance/:status",
    requireTrainingLogin,
    async (
        req,
        res
    ) => {

        try {

            await ensureScheduleTables();


            const sessionId =
                Number(
                    req.params.sessionId
                );


            const status =
                String(
                    req.params.status ||
                    ""
                ).toLowerCase();


            if (
                ![
                    "attending",
                    "maybe",
                    "unavailable"
                ].includes(status)
            ) {

                return res.redirect(
                    "/training"
                );
            }


            const session =
                await getSessionById(
                    sessionId
                );


            if (!session) {

                return res
                    .status(404)
                    .send(
                        "Training session not found."
                    );
            }


            if (
                !canAccessDepartment(
                    req,
                    session.department_code,
                    "trainee"
                ) &&
                !canAccessDepartment(
                    req,
                    session.department_code,
                    "fto"
                )
            ) {

                return renderAccessDenied(
                    req,
                    res,
                    "You do not belong to the department for this training session."
                );
            }


            if (
                ![
                    "scheduled",
                    "live"
                ].includes(
                    session.status
                )
            ) {

                return res.render(
                    "attendance-response",
                    {
                        session,
                        status:
                            "closed",

                        message:
                            "Attendance for this training session is closed."
                    }
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


            if (
                status ===
                "attending" &&
                session.max_trainees
            ) {

                const [
                    countRows
                ] =
                    await trainingDatabase.execute(
                        `
                            SELECT COUNT(*) AS total

                            FROM training_session_users

                            WHERE
                                session_id = ?
                                AND attendance_status = 'attending'
                                AND user_id <> ?
                        `,
                        [
                            sessionId,
                            userId
                        ]
                    );


                if (
                    Number(
                        countRows[0].total
                    ) >=
                    Number(
                        session.max_trainees
                    )
                ) {

                    return res.render(
                        "attendance-response",
                        {
                            session,
                            status:
                                "full",

                            message:
                                "This training session is currently full."
                        }
                    );
                }
            }


            const participantRole =
                canAccessDepartment(
                    req,
                    session.department_code,
                    "fto"
                )

                    ? "fto"

                    : "trainee";


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
                        ?
                    )

                    ON DUPLICATE KEY UPDATE
                        participant_role =
                            VALUES(participant_role),

                        attendance_status =
                            VALUES(attendance_status)
                `,
                [
                    sessionId,
                    userId,
                    participantRole,
                    status
                ]
            );


            return res.render(
                "attendance-response",
                {
                    session,
                    status,

                    message:
                        status === "attending"

                            ? "You are marked as Attending."

                            : status === "maybe"

                                ? "You are marked as Maybe."

                                : "You are marked as Unavailable."
                }
            );


        } catch (error) {

            console.error(
                "[TRAINING SCHEDULE] Attendance error:",
                error
            );


            return res
                .status(500)
                .send(
                    "Could not save your attendance response."
                );
        }
    }
);


export default router;
