import "dotenv/config";



import express from "express";
import session from "express-session";
import path from "node:path";

import {
    fileURLToPath
} from "node:url";

import trainingDatabase, {
    testTrainingDatabase
} from "./services/database.js";

import assessmentsRouter from "./routes/assessments.js";

import traineeRouter from "./routes/trainee.js";

import ftoRouter from "./routes/fto.js";

import scheduleRouter from "./routes/schedule.js";

import liveRouter from "./routes/live.js";

import {
    getPermissions,
    requireManagement,
    isTrainingOwner,
    requireTrainingOwner
} from "./services/permissions.js";

const __filename =
    fileURLToPath(import.meta.url);

const __dirname =
    path.dirname(__filename);


const app =
    express();


const TRAINING_PORT =
    Number(
        process.env.TRAINING_PORT ||
        8112
    );


// ======================================================
// EXPRESS
// ======================================================

app.set(
    "view engine",
    "ejs"
);

app.set(
    "views",
    path.join(
        __dirname,
        "views"
    )
);

app.use(
    express.json()
);

app.use(
    express.urlencoded({
        extended: true
    })
);

app.use(
    "/public",
    express.static(
        path.join(
            __dirname,
            "public"
        )
    )
);


// ======================================================
// SESSION
// ======================================================

app.use(
    session({
        secret:
            process.env.TRAINING_SESSION_SECRET ||
            "CHANGE-ME-HCP-TRAINING",

        resave:
            false,

        saveUninitialized:
            false,

        cookie: {
            maxAge:
                1000 *
                60 *
                60 *
                24,

            httpOnly:
                true,

            sameSite:
                "lax"
        }
    })
);


// ======================================================
// TRAINING ROUTERS
// ======================================================

// ======================================================
// VIEW PERMISSIONS
// ======================================================

app.use(
    (
        req,
        res,
        next
    ) => {

        res.locals.permissions =
            getPermissions(req);

        next();
    }
);


// ======================================================
// TRAINING ROUTERS
// ======================================================

app.use(
    assessmentsRouter
);

app.use(
    traineeRouter
);


app.use(
    ftoRouter
);


app.use(
    scheduleRouter
);


app.use(
    liveRouter
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
// MYSQL USER SYNC
// ======================================================

async function syncTrainingUser(
    discordUser
) {

    const user =
        getTrainingUserDetails(
            discordUser
        );


    await trainingDatabase.execute(
        `
            INSERT INTO training_users
            (
                discord_id,
                username,
                display_name,
                avatar_url
            )

            VALUES (?, ?, ?, ?)

            ON DUPLICATE KEY UPDATE
                username = VALUES(username),
                display_name = VALUES(display_name),
                avatar_url = VALUES(avatar_url),
                last_seen_at = CURRENT_TIMESTAMP
        `,
        [
            user.id,
            user.username,
            user.displayName,
            user.avatar
        ]
    );


    const [
        rows
    ] =
        await trainingDatabase.execute(
            `
                SELECT *
                FROM training_users
                WHERE discord_id = ?
                LIMIT 1
            `,
            [
                user.id
            ]
        );


    return rows[0];
}


// ======================================================
// CHECK HCP DISCORD MEMBERSHIP
// ======================================================

async function isMemberOfTrainingGuild(
    accessToken
) {

    const response =
        await fetch(
            "https://discord.com/api/users/@me/guilds",
            {
                headers: {
                    Authorization:
                        `Bearer ${accessToken}`
                }
            }
        );


    if (!response.ok) {
        return false;
    }


    const guilds =
        await response.json();


    return guilds.some(
        guild =>
            guild.id ===
            process.env.TRAINING_GUILD_ID
    );
}


// ======================================================
// DASHBOARD STATS
// ======================================================

async function getTrainingStats() {

    const [
        departmentRows
    ] =
        await trainingDatabase.execute(
            `
                SELECT COUNT(*) AS total
                FROM training_departments
                WHERE is_active = 1
            `
        );


    const [
        assessmentRows
    ] =
        await trainingDatabase.execute(
            `
                SELECT COUNT(*) AS total
                FROM training_assessments
                WHERE is_active = 1
            `
        );


    const [
        sessionRows
    ] =
        await trainingDatabase.execute(
            `
                SELECT COUNT(*) AS total
                FROM training_sessions
                WHERE status = 'live'
            `
        );


    return {
        departments:
            Number(
                departmentRows[0].total
            ),

        assessments:
            Number(
                assessmentRows[0].total
            ),

        liveSessions:
            Number(
                sessionRows[0].total
            )
    };
}


// ======================================================
// ROOT
// ======================================================

app.get(
    "/",
    (
        req,
        res
    ) => {

        if (
            req.session.trainingUser
        ) {

            return res.redirect(
                "/training"
            );
        }


        return res.redirect(
            "/login"
        );
    }
);


// ======================================================
// LOGIN PAGE
// ======================================================

app.get(
    "/login",
    (
        req,
        res
    ) => {

        // Always render the login page.
        //
        // Previously this route redirected an existing session to
        // /training. If the browser had a stale/partially-upgraded
        // session from before role permissions were added, that could
        // bounce between /login and a protected training route and
        // produce ERR_TOO_MANY_REDIRECTS.
        //
        // Rendering the login page here also lets the user explicitly
        // re-authorize Discord so trainingRoles can be refreshed.
        return res.render(
            "login"
        );
    }
);


// ======================================================
// RESET TRAINING LOGIN SESSION
// ======================================================

app.get(
    "/login/reset",
    (
        req,
        res
    ) => {

        req.session.destroy(
            () => {

                res.clearCookie(
                    "connect.sid"
                );

                return res.redirect(
                    "/login"
                );
            }
        );
    }
);


// ======================================================
// START DISCORD LOGIN
// ======================================================

app.get(
    "/auth/discord",
    (
        req,
        res
    ) => {

        const params =
            new URLSearchParams({
                client_id:
                    process.env.CLIENT_ID,

                response_type:
                    "code",

                redirect_uri:
                    process.env.TRAINING_REDIRECT_URI,

                scope:
                    "identify guilds guilds.members.read"
            });


        return res.redirect(
            `https://discord.com/oauth2/authorize?${params.toString()}`
        );
    }
);


// ======================================================
// DISCORD CALLBACK
// ======================================================

app.get(
    "/auth/discord/callback",
    async (
        req,
        res
    ) => {

        const code =
            req.query.code;


        if (!code) {

            return res.redirect(
                "/login"
            );
        }


        try {

            const tokenResponse =
                await fetch(
                    "https://discord.com/api/oauth2/token",
                    {
                        method:
                            "POST",

                        headers: {
                            "Content-Type":
                                "application/x-www-form-urlencoded"
                        },

                        body:
                            new URLSearchParams({
                                client_id:
                                    process.env.CLIENT_ID,

                                client_secret:
                                    process.env.CLIENT_SECRET,

                                grant_type:
                                    "authorization_code",

                                code,

                                redirect_uri:
                                    process.env.TRAINING_REDIRECT_URI
                            })
                    }
                );


            const tokenData =
                await tokenResponse.json();


            if (
                !tokenResponse.ok
            ) {

                console.error(
                    "[TRAINING AUTH] Token error:",
                    tokenData
                );


                return res
                    .status(500)
                    .send(
                        "Discord authentication failed."
                    );
            }


            const inGuild =
                await isMemberOfTrainingGuild(
                    tokenData.access_token
                );


            if (!inGuild) {

                return res
                    .status(403)
                    .send(
                        "You must be a member of the Hendry County Project Discord server."
                    );
            }


            const userResponse =
                await fetch(
                    "https://discord.com/api/users/@me",
                    {
                        headers: {
                            Authorization:
                                `Bearer ${tokenData.access_token}`
                        }
                    }
                );


            const discordUser =
                await userResponse.json();


            if (
                !userResponse.ok
            ) {

                return res
                    .status(500)
                    .send(
                        "Could not retrieve Discord user."
                    );
            }


            // Fetch the member record so we can securely read current Discord role IDs.
            //
            // Prefer the bot's guild-member endpoint because it reads the member
            // directly from the configured HCP Discord server. Fall back to the
            // OAuth guild-member endpoint if a bot token is not available.
            const botToken =
                process.env.DISCORD_TOKEN ||
                process.env.BOT_TOKEN ||
                process.env.TOKEN ||
                "";

            let guildMember =
                null;


            if (botToken) {

                const botMemberResponse =
                    await fetch(
                        `https://discord.com/api/v10/guilds/${process.env.TRAINING_GUILD_ID}/members/${discordUser.id}`,
                        {
                            headers: {
                                Authorization:
                                    `Bot ${botToken}`
                            }
                        }
                    );


                if (botMemberResponse.ok) {

                    guildMember =
                        await botMemberResponse.json();

                } else {

                    console.error(
                        "[TRAINING AUTH] Bot member lookup failed:",
                        botMemberResponse.status
                    );
                }
            }


            if (!guildMember) {

                const memberResponse =
                    await fetch(
                        `https://discord.com/api/users/@me/guilds/${process.env.TRAINING_GUILD_ID}/member`,
                        {
                            headers: {
                                Authorization:
                                    `Bearer ${tokenData.access_token}`
                            }
                        }
                    );


                if (!memberResponse.ok) {

                    console.error(
                        "[TRAINING AUTH] OAuth member lookup failed:",
                        memberResponse.status
                    );


                    return res
                        .status(403)
                        .send(
                            "Could not verify your Hendry County training roles. Please log in again."
                        );
                }


                guildMember =
                    await memberResponse.json();
            }


            const databaseUser =
                await syncTrainingUser(
                    discordUser
                );


            req.session.trainingUser =
                discordUser;


            req.session.trainingDatabaseUserId =
                databaseUser.id;

            req.session.trainingRoles = Array.isArray(guildMember.roles)
                ? guildMember.roles
                : [];


            const resolvedPermissions =
                getPermissions(req);


            console.log(
                `[TRAINING AUTH] ${discordUser.username} logged in.`
            );


            console.log(
                `[TRAINING AUTH] Discord roles for ${discordUser.username}:`,
                req.session.trainingRoles
            );


            console.log(
                `[TRAINING AUTH] Matched permissions for ${discordUser.username}:`,
                {
                    management:
                        resolvedPermissions.isManagement,

                    ftoDepartments:
                        resolvedPermissions.ftoDepartments,

                    traineeDepartments:
                        resolvedPermissions.traineeDepartments
                }
            );


            return res.redirect(
                "/training"
            );


        } catch (error) {

            console.error(
                "[TRAINING AUTH] OAuth error:",
                error
            );


            return res
                .status(500)
                .send(
                    "Something went wrong while logging in."
                );
        }
    }
);


// ======================================================
// LOGOUT
// ======================================================

app.get(
    "/logout",
    (
        req,
        res
    ) => {

        req.session.destroy(
            () => {

                res.redirect(
                    "/login"
                );

            }
        );
    }
);


// ======================================================
// TRAINING HOME
// ======================================================

app.get(
    "/training",
    requireTrainingLogin,
    async (
        req,
        res
    ) => {

        try {

            const user =
                getTrainingUserDetails(
                    req.session.trainingUser
                );


            const stats =
                await getTrainingStats();


            return res.render(
                "training-home",
                {
                    user,
                    stats,
                    permissions: getPermissions(req),

                    isOwner:
                        isTrainingOwner(
                            req
                        )
                }
            );


        } catch (error) {

            console.error(
                "[TRAINING HOME] Error:",
                error
            );


            return res
                .status(500)
                .send(
                    "Could not load the training dashboard."
                );
        }
    }
);


// Department management is staff-only.
app.use("/training/departments", requireManagement);

// ======================================================
// DEPARTMENTS PAGE
// ======================================================

app.get(
    "/training/departments",
    requireTrainingLogin,
    async (
        req,
        res
    ) => {

        try {

            const user =
                getTrainingUserDetails(
                    req.session.trainingUser
                );


            const [
                departments
            ] =
                await trainingDatabase.execute(
                    `
                        SELECT
                            id,
                            name,
                            short_code,
                            description,
                            logo_url,
                            accent_color,
                            scheduling_channel_id,
                            results_channel_id,
                            display_order,
                            is_active,
                            created_at,
                            updated_at

                        FROM training_departments

                        ORDER BY
                            display_order ASC,
                            name ASC
                    `
                );


            return res.render(
                "departments",
                {
                    user,
                    departments,

                    message:
                        req.query.message || "",

                    error:
                        req.query.error || ""
                }
            );


        } catch (error) {

            console.error(
                "[TRAINING DEPARTMENTS] Load error:",
                error
            );


            return res
                .status(500)
                .send(
                    "Could not load departments."
                );
        }
    }
);


// ======================================================
// CREATE DEPARTMENT
// ======================================================

app.post(
    "/training/departments/create",
    requireTrainingLogin,
    async (
        req,
        res
    ) => {

        try {

            const name =
                String(
                    req.body.name || ""
                ).trim();


            const shortCode =
                String(
                    req.body.short_code || ""
                )
                    .trim()
                    .toUpperCase();


            const description =
                String(
                    req.body.description || ""
                ).trim();


            const logoUrl =
                String(
                    req.body.logo_url || ""
                ).trim();


            const accentColor =
                /^#[0-9A-Fa-f]{6}$/.test(
                    req.body.accent_color
                )

                    ? req.body.accent_color

                    : "#BFC2C7";


            const schedulingChannelId =
                String(
                    req.body.scheduling_channel_id || ""
                ).trim();


            const resultsChannelId =
                String(
                    req.body.results_channel_id || ""
                ).trim();


            if (
                !name ||
                !shortCode
            ) {

                return res.redirect(
                    "/training/departments?error=" +
                    encodeURIComponent(
                        "Department name and short code are required."
                    )
                );
            }


            if (
                name.length > 150 ||
                shortCode.length > 20
            ) {

                return res.redirect(
                    "/training/departments?error=" +
                    encodeURIComponent(
                        "Department name or short code is too long."
                    )
                );
            }


            await trainingDatabase.execute(
                `
                    INSERT INTO training_departments
                    (
                        name,
                        short_code,
                        description,
                        logo_url,
                        accent_color,
                        scheduling_channel_id,
                        results_channel_id,
                        created_by_discord_id
                    )

                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `,
                [
                    name,
                    shortCode,
                    description || null,
                    logoUrl || null,
                    accentColor,
                    schedulingChannelId || null,
                    resultsChannelId || null,
                    req.session.trainingUser.id
                ]
            );


            console.log(
                `[TRAINING] ${req.session.trainingUser.username} created department ${shortCode}.`
            );


            return res.redirect(
                "/training/departments?message=" +
                encodeURIComponent(
                    `${name} was created successfully.`
                )
            );


        } catch (error) {

            console.error(
                "[TRAINING DEPARTMENT] Create error:",
                error
            );


            if (
                error.code ===
                "ER_DUP_ENTRY"
            ) {

                return res.redirect(
                    "/training/departments?error=" +
                    encodeURIComponent(
                        "A department with that short code already exists."
                    )
                );
            }


            return res.redirect(
                "/training/departments?error=" +
                encodeURIComponent(
                    "Could not create that department."
                )
            );
        }
    }
);


// ======================================================
// UPDATE DEPARTMENT
// ======================================================

app.post(
    "/training/departments/:id/update",
    requireTrainingLogin,
    async (
        req,
        res
    ) => {

        try {

            const departmentId =
                Number(
                    req.params.id
                );


            const name =
                String(
                    req.body.name || ""
                ).trim();


            const shortCode =
                String(
                    req.body.short_code || ""
                )
                    .trim()
                    .toUpperCase();


            const description =
                String(
                    req.body.description || ""
                ).trim();


            const logoUrl =
                String(
                    req.body.logo_url || ""
                ).trim();


            const accentColor =
                /^#[0-9A-Fa-f]{6}$/.test(
                    req.body.accent_color
                )

                    ? req.body.accent_color

                    : "#BFC2C7";


            const schedulingChannelId =
                String(
                    req.body.scheduling_channel_id || ""
                ).trim();


            const resultsChannelId =
                String(
                    req.body.results_channel_id || ""
                ).trim();


            const isActive =
                req.body.is_active === "1"
                    ? 1
                    : 0;


            if (
                !departmentId ||
                !name ||
                !shortCode
            ) {

                return res.redirect(
                    "/training/departments?error=" +
                    encodeURIComponent(
                        "Invalid department information."
                    )
                );
            }


            await trainingDatabase.execute(
                `
                    UPDATE training_departments

                    SET
                        name = ?,
                        short_code = ?,
                        description = ?,
                        logo_url = ?,
                        accent_color = ?,
                        scheduling_channel_id = ?,
                        results_channel_id = ?,
                        is_active = ?

                    WHERE id = ?
                `,
                [
                    name,
                    shortCode,
                    description || null,
                    logoUrl || null,
                    accentColor,
                    schedulingChannelId || null,
                    resultsChannelId || null,
                    isActive,
                    departmentId
                ]
            );


            return res.redirect(
                "/training/departments?message=" +
                encodeURIComponent(
                    `${name} was updated successfully.`
                )
            );


        } catch (error) {

            console.error(
                "[TRAINING DEPARTMENT] Update error:",
                error
            );


            return res.redirect(
                "/training/departments?error=" +
                encodeURIComponent(
                    "Could not update that department."
                )
            );
        }
    }
);


// ======================================================
// DELETE DEPARTMENT
// ======================================================

app.post(
    "/training/departments/:id/delete",
    requireTrainingLogin,
    async (
        req,
        res
    ) => {

        try {

            const departmentId =
                Number(
                    req.params.id
                );


            if (!departmentId) {

                return res.redirect(
                    "/training/departments?error=" +
                    encodeURIComponent(
                        "Invalid department."
                    )
                );
            }


            await trainingDatabase.execute(
                `
                    DELETE FROM training_departments
                    WHERE id = ?
                `,
                [
                    departmentId
                ]
            );


            return res.redirect(
                "/training/departments?message=" +
                encodeURIComponent(
                    "Department deleted successfully."
                )
            );


        } catch (error) {

            console.error(
                "[TRAINING DEPARTMENT] Delete error:",
                error
            );


            return res.redirect(
                "/training/departments?error=" +
                encodeURIComponent(
                    "That department could not be deleted. It may already have assessments or training records attached to it."
                )
            );
        }
    }
);


// ======================================================
// HEALTH
// ======================================================

app.get(
    "/health",
    (
        req,
        res
    ) => {

        res.json({
            status:
                "online",

            service:
                "HCP Interactive Training",

            port:
                TRAINING_PORT
        });
    }
);


// ======================================================
// START SERVER
// ======================================================

async function startTrainingDashboard() {

    try {

        console.log(
            "🎓 Starting HCP Interactive Training..."
        );


        await testTrainingDatabase();


        

// ======================================================
// STEP 10 - MANAGEMENT SYSTEM CHECK PAGE
// ======================================================

app.get(
    "/training/system-check",
    (
        req,
        res
    ) => {

        if (
            !req.session?.trainingUser
        ) {

            return res.redirect(
                "/login"
            );
        }


        const permissions =
            getPermissions(
                req
            );


        if (
            !permissions.isManagement
        ) {

            return res
                .status(403)
                .send(
                    "Training Management permission required."
                );
        }


        const user =
            req.session.trainingUser;


        return res.render(
            "system-check",
            {
                user: {
                    id:
                        user.id,

                    username:
                        user.username,

                    displayName:
                        user.global_name ||
                        user.username,

                    avatar:
                        user.avatar
                            ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`
                            : "https://cdn.discordapp.com/embed/avatars/0.png"
                }
            }
        );
    }
);




// ======================================================
// STEP 12 - OWNER CONTROL PANEL
// ======================================================

async function ensureOwnerScheduleArchiveColumn() {

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


app.get(
    "/training/owner",
    requireTrainingOwner,
    async (
        req,
        res
    ) => {

        try {

            await ensureOwnerScheduleArchiveColumn();


            const user =
                getTrainingUserDetails(
                    req.session.trainingUser
                );


            const [
                history
            ] =
                await trainingDatabase.execute(
                    `
                        SELECT
                            s.id,
                            s.status,
                            s.scheduled_for,
                            s.started_at,
                            s.ended_at,
                            s.created_at,
                            s.is_archived,

                            a.name
                                AS assessment_name,

                            d.name
                                AS department_name,

                            d.short_code
                                AS department_code,

                            u.display_name
                                AS host_display_name,

                            u.username
                                AS host_username

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

                        WHERE
                            s.status IN
                            (
                                'completed',
                                'cancelled'
                            )

                        ORDER BY
                            COALESCE(
                                s.ended_at,
                                s.scheduled_for,
                                s.created_at
                            ) DESC,
                            s.id DESC
                    `
                );


            return res.render(
                "owner",
                {
                    user,

                    history,

                    ownerStrictMode:
                        Boolean(
                            String(
                                process.env.TRAINING_OWNER_ROLE_ID ||
                                ""
                            ).trim()
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
                "[TRAINING OWNER] Load error:",
                error
            );


            return res
                .status(500)
                .send(
                    "Could not load the Owner panel."
                );
        }
    }
);


app.post(
    "/training/owner/archive-finished",
    requireTrainingOwner,
    async (
        req,
        res
    ) => {

        try {

            await ensureOwnerScheduleArchiveColumn();


            const [
                result
            ] =
                await trainingDatabase.execute(
                    `
                        UPDATE training_sessions

                        SET is_archived = 1

                        WHERE
                            status IN
                            (
                                'completed',
                                'cancelled'
                            )
                            AND is_archived = 0
                    `
                );


            console.log(
                `[TRAINING OWNER] ${req.session.trainingUser.username} archived ${result.affectedRows} completed/cancelled schedule record(s).`
            );


            return res.redirect(
                "/training/owner?message=" +
                encodeURIComponent(
                    `${result.affectedRows} completed/cancelled schedule record(s) cleared from the Schedule tab.`
                )
            );


        } catch (error) {

            console.error(
                "[TRAINING OWNER] Archive all error:",
                error
            );


            return res.redirect(
                "/training/owner?error=" +
                encodeURIComponent(
                    "Could not clear finished schedule records."
                )
            );
        }
    }
);


app.post(
    "/training/owner/archive/:sessionId",
    requireTrainingOwner,
    async (
        req,
        res
    ) => {

        try {

            await ensureOwnerScheduleArchiveColumn();


            const sessionId =
                Number(
                    req.params.sessionId
                );


            if (!sessionId) {

                return res.redirect(
                    "/training/owner?error=" +
                    encodeURIComponent(
                        "Invalid schedule record."
                    )
                );
            }


            const [
                result
            ] =
                await trainingDatabase.execute(
                    `
                        UPDATE training_sessions

                        SET is_archived = 1

                        WHERE
                            id = ?
                            AND status IN
                            (
                                'completed',
                                'cancelled'
                            )
                    `,
                    [
                        sessionId
                    ]
                );


            if (
                !result.affectedRows
            ) {

                return res.redirect(
                    "/training/owner?error=" +
                    encodeURIComponent(
                        "Only completed or cancelled sessions can be cleared."
                    )
                );
            }


            return res.redirect(
                "/training/owner?message=" +
                encodeURIComponent(
                    `Schedule record #${sessionId} cleared.`
                )
            );


        } catch (error) {

            console.error(
                "[TRAINING OWNER] Archive one error:",
                error
            );


            return res.redirect(
                "/training/owner?error=" +
                encodeURIComponent(
                    "Could not clear that schedule record."
                )
            );
        }
    }
);


app.post(
    "/training/owner/restore/:sessionId",
    requireTrainingOwner,
    async (
        req,
        res
    ) => {

        try {

            await ensureOwnerScheduleArchiveColumn();


            const sessionId =
                Number(
                    req.params.sessionId
                );


            await trainingDatabase.execute(
                `
                    UPDATE training_sessions

                    SET is_archived = 0

                    WHERE
                        id = ?
                        AND status IN
                        (
                            'completed',
                            'cancelled'
                        )
                `,
                [
                    sessionId
                ]
            );


            return res.redirect(
                "/training/owner?message=" +
                encodeURIComponent(
                    `Schedule record #${sessionId} restored.`
                )
            );


        } catch (error) {

            console.error(
                "[TRAINING OWNER] Restore error:",
                error
            );


            return res.redirect(
                "/training/owner?error=" +
                encodeURIComponent(
                    "Could not restore that schedule record."
                )
            );
        }
    }
);


app.listen(
            TRAINING_PORT,
            "0.0.0.0",
            () => {

                console.log(
                    `🎓 HCP Interactive Training running on port ${TRAINING_PORT}`
                );

            }
        );


    } catch (error) {

        console.error(
            "❌ HCP Interactive Training failed to start:",
            error
        );


        process.exit(
            1
        );
    }
}


startTrainingDashboard();