import "dotenv/config";

import { loadEvents } from "./handlers/eventHandler.js";
import { loadCommands } from "./handlers/commandHandler.js";
import {
    getDashboardPermissions,
    saveDashboardPermissions
} from "./services/dashboardPermissions.js";


// your other imports below


import {
    Client,
    GatewayIntentBits,
    Collection,
    Events,
    Partials,
    EmbedBuilder
} from "discord.js";

import {
    addWarning,
    getWarnings,
    addTempBan,
    addBlacklist
} from "./services/moderationStore.js";

import express from "express";
import session from "express-session";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import {
    getRoleManagementSettings,
    saveRoleManagementSettings,
    addRoleAuditEntry,
    getRoleAuditLog
} from "./services/roleManagementStore.js";

import {
    getBotStatusSettings,
    saveBotStatusSettings
} from "./services/botStatusStore.js";

import {
    getDashboardSettings,
    saveDashboardSettings
} from "./services/dashboardSettingsStore.js";

import {
    getNewsPosts,
    getPublishedNews,
    getNewsPostBySlug,
    saveNewsPosts,
    createNewsSlug
} from "./services/newsStore.js";

// ======================================================
// DISCORD BOT
// ======================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildVoiceStates
    ],

    partials: [
        Partials.Channel
    ]
});

client.commands = new Collection();

 

client.once(Events.ClientReady, (readyClient) => {

    const savedStatus =
        getBotStatusSettings();

    const presenceTypeMap = {
        Playing: 0,
        Listening: 2,
        Watching: 3,
        Competing: 5
    };

    readyClient.user.setPresence({
        status:
            savedStatus.status,

        activities: [
            {
                name:
                    savedStatus.activityText,

                type:
                    presenceTypeMap[
                        savedStatus.activityType
                    ] ?? 3
            }
        ]
    });

    console.log(
        `[BOT STATUS] ${savedStatus.status} | ${savedStatus.activityType} ${savedStatus.activityText}`
    );

    console.log("======================================");
    console.log("🔥 HENDRY COUNTY PROJECT BOT");
    console.log(`✅ Logged in as ${readyClient.user.tag}`);
    console.log(`✅ Bot ID: ${readyClient.user.id}`);
    console.log(`✅ Servers: ${readyClient.guilds.cache.size}`);
    console.log("======================================");
});

await loadEvents(client);
await loadCommands(client);


client.login(process.env.DISCORD_TOKEN);

// ======================================================
// EXPRESS
// ======================================================

const app = express();
const PORT = process.env.PORT || 8199;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "dashboard", "views"));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
    session({
        secret: process.env.SESSION_SECRET || "CHANGE-ME-HCP-SESSION",
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 1000 * 60 * 60 * 24
        }
    })
);

app.use(
    "/public",
    express.static(path.join(__dirname, "dashboard", "public"))
);

// ======================================================
// HELPERS
// ======================================================

function requireLogin(req, res, next) {
    if (!req.session.user) {
        if (req.path.startsWith("/api/")) {
            return res.status(401).json({
                error: "Your dashboard session has expired. Please log in again."
            });
        }
        return res.redirect("/");
    }
    next();
}

async function getDashboardMember(req) {
    if (!req.session.user?.id) return null;

    const guild = client.guilds.cache.first();
    if (!guild) return null;

    return guild.members.fetch(req.session.user.id).catch(() => null);
}

async function getDashboardAccess(req) {

    const permissions =
        getDashboardPermissions();

    const guild =
        client.guilds.cache.first();

    const member =
        await getDashboardMember(req);


    const emptyAccess = {
        allowed: false,

        isOwner: false,

        sections: {
            bot: false,
            moderation: false,
            management: false,
            configuration: false,
            owner: false
        }
    };


    if (
        !guild ||
        !member
    ) {
        return emptyAccess;
    }


    const userId =
        member.id;


    const roleIds =
        member.roles.cache.map(
            role => role.id
        );


    // Permanent dashboard owners.
    // These Discord user IDs always have access to the Owner menu
    // and every other protected dashboard section.
    const permanentOwnerUserIds = [
        "967375704486449222",
        "814203429064146994",
        "327951443090735104"
    ];

    // Keep any owners that were also added through dashboard permissions.
    const ownerUserIds = [
        ...new Set([
            ...permanentOwnerUserIds,
            ...(permissions.ownerUserIds || [])
        ])
    ];

    const allowedUserIds =
        permissions.allowedUserIds || [];

    const allowedRoleIds =
        permissions.allowedRoleIds || [];

    const permissionSections =
        permissions.sections || {};


    // ==================================================
    // OWNER
    // ==================================================

    const isOwner =
        guild.ownerId === userId ||
        ownerUserIds.includes(
            userId
        );


    // Owner automatically has everything
    if (isOwner) {
        return {
            allowed: true,

            isOwner: true,

            sections: {
                bot: true,
                moderation: true,
                management: true,
                configuration: true,
                owner: true
            }
        };
    }


    // ==================================================
    // GENERAL DASHBOARD ACCESS
    // ==================================================

    const allowedByUser =
        allowedUserIds.includes(
            userId
        );


    const allowedByRole =
        roleIds.some(
            roleId =>
                allowedRoleIds.includes(
                    roleId
                )
        );


// ==================================================
// SECTION ROLE ACCESS
// ==================================================

const hasSectionRole =
    [
        "bot",
        "moderation",
        "management",
        "configuration"
    ].some(section => {

        const sectionRoles =
            permissionSections[section] || [];

        return roleIds.some(
            roleId =>
                sectionRoles.includes(roleId)
        );
    });


// ==================================================
// GENERAL DASHBOARD ACCESS
// ==================================================

const dashboardAllowed =
    allowedByUser ||
    allowedByRole ||
    hasSectionRole;


// No dashboard roles, users or section permissions
if (!dashboardAllowed) {
    return emptyAccess;
}

    // ==================================================
    // SECTION ACCESS
    // ==================================================

    const sections = {
        bot: false,
        moderation: false,
        management: false,
        configuration: false,
        owner: false
    };


    for (
        const section
        of [
            "bot",
            "moderation",
            "management",
            "configuration"
        ]
    ) {

        const sectionRoles =
            permissionSections[
                section
            ] || [];


        // IMPORTANT:
        //
        // If NO roles are configured for a section,
        // nobody except Owner gets that section.
        if (
            sectionRoles.length === 0
        ) {
            sections[section] =
                false;

            continue;
        }


        sections[section] =
            roleIds.some(
                roleId =>
                    sectionRoles.includes(
                        roleId
                    )
            );
    }


    return {
        allowed:
            dashboardAllowed,

        isOwner:
            false,

        sections
    };
}


function requireSection(section = null) {
    return async (req, res, next) => {
        try {
            const access = await getDashboardAccess(req);

            // User has no dashboard access at all
            if (!access.allowed) {
                if (req.path.startsWith("/api/")) {
                    return res.status(403).json({
                        error: "You do not have access to the HCP dashboard."
                    });
                }

                return res.status(403).render("no-permission", {
                    user: req.session.user || null
                });
            }

            // User can access dashboard, but not this section
            if (section && !access.sections[section]) {
                if (req.path.startsWith("/api/")) {
                    return res.status(403).json({
                        error: "You do not have permission to use this dashboard section."
                    });
                }

                return res.status(403).render("no-permission", {
                    user: req.session.user || null
                });
            }

            // Store permissions so the rest of the dashboard can use them
            req.dashboardAccess = access;

            next();

        } catch (error) {
            console.error(
                "[DASHBOARD ACCESS] Error:",
                error
            );

            if (req.path.startsWith("/api/")) {
                return res.status(500).json({
                    error: "Could not check dashboard permissions."
                });
            }

            return res.status(500).send(
                "Could not check dashboard permissions."
            );
        }
    };
}

function getUserDetails(user) {
    const displayName =
        user.global_name ||
        user.username ||
        "Discord User";

    const avatar = user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
        : "https://cdn.discordapp.com/embed/avatars/0.png";

    return {
        displayName,
        avatar
    };
}

function dashboardData(
    req,
    activePage
) {

    return {

        user:
            getUserDetails(
                req.session.user
            ),


        activePage,


        dashboardAccess:
            req.dashboardAccess || {
                allowed: false,

                isOwner: false,

                sections: {
                    bot: false,
                    moderation: false,
                    management: false,
                    configuration: false,
                    owner: false
                }
            },


        bot: {

            online:
                client.isReady(),

            username:
                client.user?.username ||
                "Loading...",

            servers:
                client.guilds.cache.size,

            commands:
                client.commands.size
        }
    };
}

// ======================================================
// LOGIN
// ======================================================

app.get("/", (req, res) => {
    if (req.session.user) {
        return res.redirect("/dashboard");
    }

    res.render("login");
});

app.get("/login", (req, res) => {
    const params = new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        response_type: "code",
        redirect_uri: process.env.DISCORD_REDIRECT_URI,
        scope: "identify guilds"
    });

    res.redirect(
        `https://discord.com/oauth2/authorize?${params.toString()}`
    );
});

// ======================================================
// DISCORD CALLBACK
// ======================================================

app.get("/auth/discord/callback", async (req, res) => {
    const code = req.query.code;

    if (!code) {
        return res.redirect("/");
    }

    try {
        const tokenResponse = await fetch(
            "https://discord.com/api/oauth2/token",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded"
                },

                body: new URLSearchParams({
                    client_id: process.env.CLIENT_ID,
                    client_secret: process.env.CLIENT_SECRET,
                    grant_type: "authorization_code",
                    code,
                    redirect_uri:
                        process.env.DISCORD_REDIRECT_URI
                })
            }
        );

        const tokenData = await tokenResponse.json();

        if (!tokenResponse.ok) {
            console.error("Discord token error:", tokenData);

            return res
                .status(500)
                .send("Discord authentication failed.");
        }

        const userResponse = await fetch(
            "https://discord.com/api/users/@me",
            {
                headers: {
                    Authorization:
                        `Bearer ${tokenData.access_token}`
                }
            }
        );

        const user = await userResponse.json();

        if (!userResponse.ok) {
            console.error("Discord user error:", user);

            return res
                .status(500)
                .send("Could not retrieve Discord user.");
        }

        req.session.user = user;

        res.redirect("/dashboard");

    } catch (error) {
        console.error("OAuth Error:", error);

        res
            .status(500)
            .send("Something went wrong while logging in.");
    }
});

app.get("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/");
    });
});

// ======================================================
// PUBLIC NEWS
// ======================================================


// NEWS ARCHIVE
app.get("/news", (req, res) => {

    try {

        const posts =
            getPublishedNews();

        res.render(
            "news",
            {
                user:
                    req.session.user
                        ? getUserDetails(req.session.user)
                        : null,

                activePage:
                    "public",

                bot: {
                    online:
                        client.isReady(),

                    username:
                        client.user?.username ||
                        "HCP Bot",

                    servers:
                        client.guilds.cache.size,

                    commands:
                        client.commands.size
                },

                posts
            }
        );

    } catch (error) {

        console.error(
            "[NEWS] Failed to load news:",
            error
        );

        res
            .status(500)
            .send(
                "Could not load HCP News."
            );
    }
});


// INDIVIDUAL NEWS ARTICLE
app.get("/news/:slug", (req, res) => {

    try {

        const post =
            getNewsPostBySlug(
                req.params.slug
            );

        if (!post) {

            return res
                .status(404)
                .send(
                    "That news article could not be found."
                );
        }


        res.render(
            "news-article",
            {
                user:
                    req.session.user
                        ? getUserDetails(req.session.user)
                        : null,

                activePage:
                    "public",

                bot: {
                    online:
                        client.isReady(),

                    username:
                        client.user?.username ||
                        "HCP Bot",

                    servers:
                        client.guilds.cache.size,

                    commands:
                        client.commands.size
                },

                post
            }
        );

    } catch (error) {

        console.error(
            "[NEWS ARTICLE] Failed to load article:",
            error
        );

        res
            .status(500)
            .send(
                "Could not load that news article."
            );
    }
});

// ======================================================
// DASHBOARD ROUTES
// ======================================================

// MAIN DASHBOARD
// Staff members see the dashboard. Users with no dashboard permissions go to Public News.
app.get("/dashboard", requireLogin, async (req, res) => {
    try {
        const access = await getDashboardAccess(req);

        if (!access.allowed) {
            return res.redirect("/news");
        }

        req.dashboardAccess = access;

        return res.render(
            "dashboard",
            dashboardData(req, "home")
        );
    } catch (error) {
        console.error("[DASHBOARD] Failed to check dashboard access:", error);
        return res.status(500).send("Could not load the dashboard.");
    }
});

// ======================================================
// PATROL ANNOUNCEMENTS DASHBOARD
// ======================================================

const patrolSettingsPath =
    path.join(
        __dirname,
        "data",
        "patrol-settings.json"
    );


function getPatrolSettings() {

    try {

        return JSON.parse(
            fs.readFileSync(
                patrolSettingsPath,
                "utf8"
            )
        );

    } catch (error) {

        console.error(
            "[PATROL SETTINGS] Read error:",
            error
        );

        return {};
    }
}


app.get(
    "/dashboard/patrol-announcements",
    requireLogin,
    requireSection("moderation"),
    async (req, res) => {

        try {

            const settings =
                getPatrolSettings();


            const guild =
                client.guilds.cache.first();


            if (!guild) {

                return res
                    .status(500)
                    .send(
                        "The Discord bot is not connected to a server."
                    );
            }


            await guild.channels.fetch();

            await guild.roles.fetch();


            const channels =
                guild.channels.cache

                    .filter(channel =>
                        channel.isTextBased() &&
                        !channel.isThread()
                    )

                    .map(channel => ({
                        id: channel.id,
                        name: channel.name
                    }))

                    .sort(
                        (a, b) =>
                            a.name.localeCompare(
                                b.name
                            )
                    );


            const roles =
                guild.roles.cache

                    .filter(role =>
                        role.name !== "@everyone"
                    )

                    .map(role => ({
                        id: role.id,
                        name: role.name
                    }))

                    .sort(
                        (a, b) =>
                            a.name.localeCompare(
                                b.name
                            )
                    );


            res.render(
                "patrol-announcements",
                {
                    ...dashboardData(
                        req,
                        "moderation"
                    ),

                    settings,
                    channels,
                    roles
                }
            );

        } catch (error) {

            console.error(
                "[PATROL DASHBOARD] Error:",
                error
            );

            res
                .status(500)
                .send(
                    "Failed to load patrol announcement settings."
                );
        }
    }
);


// ======================================================
// SAVE PATROL SETTINGS
// ======================================================

app.post(
    "/api/patrol-settings",
    requireLogin,
    requireSection("moderation"),
    (req, res) => {

        try {

            const settings = {

                channelId:
                    String(
                        req.body.channelId || ""
                    ),

                roleId:
                    String(
                        req.body.roleId || ""
                    ),

                title:
                    String(
                        req.body.title ||
                        "🚓 Patrol Announcement 🚓"
                    ),

                description:
                    String(
                        req.body.description || ""
                    ),

                color:
                    /^#[0-9A-Fa-f]{6}$/.test(
                        req.body.color
                    )
                        ? req.body.color
                        : "#ff8534",

                footer:
                    String(
                        req.body.footer || ""
                    ),

                timezone:
                    String(
                        req.body.timezone ||
                        "CST"
                    ),

                cadMessage:
                    String(
                        req.body.cadMessage || ""
                    ),

                patrolAreas:
                    Array.isArray(
                        req.body.patrolAreas
                    )
                        ? req.body.patrolAreas
                            .map(String)
                            .map(value =>
                                value.trim()
                            )
                            .filter(Boolean)
                            .slice(0, 9)

                        : [],

                attendanceYes:
                    String(
                        req.body.attendanceYes ||
                        "Yes"
                    ),

                attendanceMaybe:
                    String(
                        req.body.attendanceMaybe ||
                        "Maybe / Late"
                    ),

                attendanceNo:
                    String(
                        req.body.attendanceNo ||
                        "No"
                    ),

                pingRole:
                    req.body.pingRole === true,

                showTimestamp:
                    req.body.showTimestamp === true,

                addReactions:
                    req.body.addReactions === true
            };


            fs.mkdirSync(
                path.dirname(
                    patrolSettingsPath
                ),
                {
                    recursive: true
                }
            );


            fs.writeFileSync(
                patrolSettingsPath,
                JSON.stringify(
                    settings,
                    null,
                    4
                )
            );


            console.log(
                "[PATROL SETTINGS] Settings saved."
            );


            res.json({
                success: true
            });

        } catch (error) {

            console.error(
                "[PATROL SETTINGS] Save error:",
                error
            );


            res
                .status(500)
                .json({
                    success: false,
                    error:
                        "Could not save settings."
                });
        }
    }
);

app.get(
    "/dashboard/status",
    requireLogin,
    requireSection("bot"),
    async (req, res) => {
        try {
            const guild =
                client.guilds.cache.first();

            const botSettings =
                getBotStatusSettings();

            let memberCount = 0;

            if (guild) {
                memberCount =
                    guild.memberCount || 0;
            }

            res.render(
                "status",
                {
                    ...dashboardData(
                        req,
                        "bot"
                    ),

                    statusData: {
                        online:
                            client.isReady(),

                        ping:
                            Math.round(
                                client.ws.ping
                            ),

                        uptime:
                            client.uptime || 0,

                        servers:
                            client.guilds.cache.size,

                        commands:
                            client.commands.size,

                        members:
                            memberCount,

                        username:
                            client.user?.username ||
                            "Bot",

                        avatar:
                            client.user?.displayAvatarURL({
                                size: 256
                            }) || ""
                    },

                    botSettings
                }
            );

        } catch (error) {
            console.error(
                "[BOT STATUS PAGE] Error:",
                error
            );

            res
                .status(500)
                .send(
                    "Could not load bot status."
                );
        }
    }
);

app.post(
    "/api/bot-status",
    requireLogin,
    requireSection("bot"),
    async (req, res) => {
        try {
            const allowedStatuses =
                [
                    "online",
                    "idle",
                    "dnd",
                    "invisible"
                ];

            const allowedTypes =
                [
                    "Playing",
                    "Watching",
                    "Listening",
                    "Competing"
                ];

            const status =
                allowedStatuses.includes(
                    req.body.status
                )
                    ? req.body.status
                    : "online";

            const activityType =
                allowedTypes.includes(
                    req.body.activityType
                )
                    ? req.body.activityType
                    : "Watching";

            const activityText =
                String(
                    req.body.activityText ||
                    "Hendry County Project"
                )
                .trim()
                .slice(
                    0,
                    128
                );

            const settings = {
                status,
                activityType,
                activityText
            };

            saveBotStatusSettings(
                settings
            );

            const typeMap = {
                Playing: 0,
                Listening: 2,
                Watching: 3,
                Competing: 5
            };

            client.user.setPresence({
                status,

                activities: [
                    {
                        name:
                            activityText,

                        type:
                            typeMap[
                                activityType
                            ]
                    }
                ]
            });

            res.json({
                success: true,
                settings
            });

        } catch (error) {
            console.error(
                "[BOT STATUS] Save error:",
                error
            );

            res
                .status(500)
                .json({
                    error:
                        "Could not update bot presence."
                });
        }
    }
);

app.get("/dashboard/commands", requireLogin, requireSection("bot"), (req, res) => {
    res.render(
        "commands",
        dashboardData(req, "bot")
    );
});

app.get(
    "/dashboard/moderation",
    requireLogin,
    requireSection("moderation"),
    async (req, res) => {

        try {

            const guild =
                client.guilds.cache.first();

            if (!guild) {
                return res
                    .status(500)
                    .send(
                        "Discord server could not be found."
                    );
            }

            await guild.members.fetch();

            const members =
                guild.members.cache

                    .filter(member =>
                        !member.user.bot
                    )

                    .map(member => ({
                        id:
                            member.id,

                        username:
                            member.user.username,

                        displayName:
                            member.displayName
                    }))

                    .sort(
                        (a, b) =>
                            a.displayName.localeCompare(
                                b.displayName
                            )
                    );

                    


            res.render(
                "moderation",
                {
                    ...dashboardData(
                        req,
                        "moderation"
                    ),

                    members
                }
            );

        } catch (error) {

            console.error(
                "[MODERATION DASHBOARD] Error:",
                error
            );

            res
                .status(500)
                .send(
                    "Could not load moderation dashboard."
                );
        }
    }
);

// ======================================================
// MODERATION API HELPERS
// ======================================================

function getDashboardGuild() {
    return client.guilds.cache.first();
}


function getDashboardModerator(req) {
    return {
        id:
            req.session.user.id,

        username:
            req.session.user.username
    };
}


function parseModerationDuration(value) {

    const match =
        /^(\d+)(m|h|d|w)$/i.exec(
            String(value).trim()
        );

    if (!match) {
        return null;
    }

    const amount =
        Number(match[1]);

    const unit =
        match[2].toLowerCase();

    const multipliers = {
        m:
            60 * 1000,

        h:
            60 * 60 * 1000,

        d:
            24 * 60 * 60 * 1000,

        w:
            7 * 24 * 60 * 60 * 1000
    };

    return amount *
        multipliers[unit];
}


// ======================================================
// WARNING
// ======================================================

app.post(
    "/api/moderation/warning",
    requireLogin,
    requireSection("moderation"),
    async (req, res) => {

        try {

            const {
                userId,
                reason
            } = req.body;

            if (
                !userId ||
                !reason
            ) {
                return res
                    .status(400)
                    .json({
                        error:
                            "Member and reason are required."
                    });
            }


            const guild =
                getDashboardGuild();

            if (!guild) {
                return res
                    .status(500)
                    .json({
                        error:
                            "Discord server not found."
                    });
            }


            const member =
                await guild.members.fetch(
                    userId
                );


            const moderator =
                getDashboardModerator(req);


            const warning =
                addWarning({

                    guildId:
                        guild.id,

                    userId:
                        member.id,

                    username:
                        member.user.username,

                    moderatorId:
                        moderator.id,

                    moderatorName:
                        moderator.username,

                    reason
                });


            try {

                await member.send({

                    embeds: [
                        {
                            color:
                                0xff8534,

                            title:
                                "⚠️ You have received a warning",

                            description:
                                `You have received a warning in **${guild.name}**.`,

                            fields: [
                                {
                                    name:
                                        "Reason",

                                    value:
                                        reason
                                }
                            ],

                            footer: {
                                text:
                                    "Hendry County Project"
                            },

                            timestamp:
                                new Date().toISOString()
                        }
                    ]
                });

            } catch {}


            res.json({
                success:
                    true,

                message:
                    `✅ ${member.displayName} has been warned.`,

                warning
            });

        } catch (error) {

            console.error(
                "[DASHBOARD WARNING] Error:",
                error
            );

            res
                .status(500)
                .json({
                    error:
                        "Could not warn that member."
                });
        }
    }
);


// ======================================================
// CHECK WARNINGS
// ======================================================

app.get(
    "/api/moderation/warnings/:userId",
    requireLogin,
    requireSection("moderation"),
    async (req, res) => {

        try {

            const guild =
                getDashboardGuild();

            if (!guild) {
                return res
                    .status(500)
                    .json({
                        error:
                            "Discord server not found."
                    });
            }


            const warnings =
                getWarnings(
                    guild.id,
                    req.params.userId
                );


            res.json({
                success:
                    true,

                warnings
            });

        } catch (error) {

            console.error(
                "[DASHBOARD WARNINGS] Error:",
                error
            );

            res
                .status(500)
                .json({
                    error:
                        "Could not retrieve warnings."
                });
        }
    }
);


// ======================================================
// KICK
// ======================================================

app.post(
    "/api/moderation/kick",
    requireLogin,
    requireSection("moderation"),
    async (req, res) => {

        try {

            const {
                userId,
                reason
            } = req.body;


            const guild =
                getDashboardGuild();


            const member =
                await guild.members.fetch(
                    userId
                );


            if (!member.kickable) {
                return res
                    .status(400)
                    .json({
                        error:
                            "The bot cannot kick that member. Check role hierarchy."
                    });
            }


            try {

                await member.send({

                    embeds: [
                        {
                            color:
                                0xff8534,

                            title:
                                "👢 You have been kicked",

                            description:
                                `You were kicked from **${guild.name}**.`,

                            fields: [
                                {
                                    name:
                                        "Reason",

                                    value:
                                        reason
                                }
                            ],

                            timestamp:
                                new Date().toISOString()
                        }
                    ]
                });

            } catch {}


            await member.kick(
                reason
            );


            res.json({
                success:
                    true,

                message:
                    `✅ ${member.user.username} has been kicked.`
            });

        } catch (error) {

            console.error(
                "[DASHBOARD KICK] Error:",
                error
            );

            res
                .status(500)
                .json({
                    error:
                        "Could not kick that member."
                });
        }
    }
);


// ======================================================
// BAN
// ======================================================

app.post(
    "/api/moderation/ban",
    requireLogin,
    requireSection("moderation"),
    async (req, res) => {

        try {

            const {
                userId,
                reason
            } = req.body;


            const guild =
                getDashboardGuild();


            const member =
                await guild.members.fetch(
                    userId
                );


            try {

                await member.send({

                    embeds: [
                        {
                            color:
                                0xef4444,

                            title:
                                "🔨 You have been banned",

                            description:
                                `You were banned from **${guild.name}**.`,

                            fields: [
                                {
                                    name:
                                        "Reason",

                                    value:
                                        reason
                                }
                            ],

                            timestamp:
                                new Date().toISOString()
                        }
                    ]
                });

            } catch {}


            await guild.members.ban(
                userId,
                {
                    reason
                }
            );


            res.json({
                success:
                    true,

                message:
                    `✅ ${member.user.username} has been banned.`
            });

        } catch (error) {

            console.error(
                "[DASHBOARD BAN] Error:",
                error
            );

            res
                .status(500)
                .json({
                    error:
                        "Could not ban that member."
                });
        }
    }
);


// ======================================================
// TEMP BAN
// ======================================================

app.post(
    "/api/moderation/temp-ban",
    requireLogin,
    requireSection("moderation"),
    async (req, res) => {

        try {

            const {
                userId,
                reason,
                duration
            } = req.body;


            const durationMs =
                parseModerationDuration(
                    duration
                );


            if (!durationMs) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Invalid duration. Use 30m, 6h, 2d or 1w."
                    });
            }


            const guild =
                getDashboardGuild();


            const member =
                await guild.members.fetch(
                    userId
                );


            const moderator =
                getDashboardModerator(req);


            const expiresAt =
                Date.now() +
                durationMs;


            try {

                await member.send({

                    embeds: [
                        {
                            color:
                                0xff8534,

                            title:
                                "⏳ You have been temporarily banned",

                            description:
                                `You were temporarily banned from **${guild.name}**.`,

                            fields: [
                                {
                                    name:
                                        "Duration",

                                    value:
                                        duration
                                },

                                {
                                    name:
                                        "Reason",

                                    value:
                                        reason
                                },

                                {
                                    name:
                                        "Expires",

                                    value:
                                        `<t:${Math.floor(
                                            expiresAt / 1000
                                        )}:F>`
                                }
                            ],

                            timestamp:
                                new Date().toISOString()
                        }
                    ]
                });

            } catch {}


            await guild.members.ban(
                userId,
                {
                    reason:
                        `TEMP BAN (${duration}) - ${reason}`
                }
            );


            addTempBan({

                guildId:
                    guild.id,

                userId:
                    member.id,

                username:
                    member.user.username,

                moderatorId:
                    moderator.id,

                moderatorName:
                    moderator.username,

                reason,

                expiresAt
            });


            res.json({
                success:
                    true,

                message:
                    `✅ ${member.user.username} has been temporarily banned for ${duration}.`
            });

        } catch (error) {

            console.error(
                "[DASHBOARD TEMP BAN] Error:",
                error
            );

            res
                .status(500)
                .json({
                    error:
                        "Could not temporarily ban that member."
                });
        }
    }
);


// ======================================================
// BLACKLIST
// ======================================================

app.post(
    "/api/moderation/blacklist",
    requireLogin,
    requireSection("moderation"),
    async (req, res) => {

        try {

            const {
                userId,
                reason
            } = req.body;


            const guild =
                getDashboardGuild();


            const member =
                await guild.members.fetch(
                    userId
                );


            const moderator =
                getDashboardModerator(req);


            addBlacklist({

                guildId:
                    guild.id,

                userId:
                    member.id,

                username:
                    member.user.username,

                moderatorId:
                    moderator.id,

                moderatorName:
                    moderator.username,

                reason
            });


            try {

                await member.send({

                    embeds: [
                        {
                            color:
                                0xef4444,

                            title:
                                "🚫 Community Blacklist",

                            description:
                                `You have been blacklisted from **${guild.name}**.`,

                            fields: [
                                {
                                    name:
                                        "Reason",

                                    value:
                                        reason
                                }
                            ],

                            timestamp:
                                new Date().toISOString()
                        }
                    ]
                });

            } catch {}


            await guild.members.ban(
                userId,
                {
                    reason:
                        `BLACKLISTED - ${reason}`
                }
            );


            res.json({
                success:
                    true,

                message:
                    `✅ ${member.user.username} has been blacklisted.`
            });

        } catch (error) {

            console.error(
                "[DASHBOARD BLACKLIST] Error:",
                error
            );

            res
                .status(500)
                .json({
                    error:
                        "Could not blacklist that member."
                });
        }
    }
);

app.get("/dashboard/cases", requireLogin, requireSection("moderation"), (req, res) => {
    res.render(
        "cases",
        dashboardData(req, "moderation")
    );
});

app.get("/dashboard/logs", requireLogin, requireSection("moderation"), (req, res) => {
    res.render(
        "logs",
        dashboardData(req, "moderation")
    );
});

// ======================================================
// ANNOUNCEMENT BUILDER
// ======================================================

app.get(
    "/dashboard/announcements",
    requireLogin,
    requireSection("management"),
    async (req, res) => {

        try {

            const guild =
                client.guilds.cache.first();


            if (!guild) {

                return res
                    .status(500)
                    .send(
                        "Discord server could not be found."
                    );
            }


            await guild.channels.fetch();
            await guild.roles.fetch();


            const channels =
                guild.channels.cache

                    .filter(
                        channel =>
                            channel.isTextBased() &&
                            !channel.isThread()
                    )

                    .map(
                        channel => ({
                            id:
                                channel.id,

                            name:
                                channel.name
                        })
                    )

                    .sort(
                        (a, b) =>
                            a.name.localeCompare(
                                b.name
                            )
                    );


            const roles =
                guild.roles.cache

                    .filter(
                        role =>
                            role.name !== "@everyone"
                    )

                    .map(
                        role => ({
                            id:
                                role.id,

                            name:
                                role.name
                        })
                    )

                    .sort(
                        (a, b) =>
                            a.name.localeCompare(
                                b.name
                            )
                    );


            res.render(
                "announcements",
                {
                    ...dashboardData(
                        req,
                        "management"
                    ),

                    channels,
                    roles
                }
            );


        } catch (error) {

            console.error(
                "[ANNOUNCEMENT DASHBOARD] Error:",
                error
            );


            res
                .status(500)
                .send(
                    "Could not load Announcement Builder."
                );
        }
    }
);

// ======================================================
// SEND ANNOUNCEMENT
// ======================================================

app.post(
    "/api/announcement",
    requireLogin,
    requireSection("management"),
    async (req, res) => {

        try {

            const {
                channelId,
                roleId,
                title,
                description,
                color,
                footer,
                image,
                thumbnail,
                timestamp
            } = req.body;


            if (!channelId) {

                return res
                    .status(400)
                    .json({
                        error:
                            "A destination channel is required."
                    });
            }


            if (
                !title &&
                !description
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            "The announcement needs a title or description."
                    });
            }


            const guild =
                client.guilds.cache.first();


            if (!guild) {

                return res
                    .status(500)
                    .json({
                        error:
                            "Discord server could not be found."
                    });
            }


            const channel =
                await guild.channels.fetch(
                    channelId
                );


            if (
                !channel ||
                !channel.isTextBased()
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            "That announcement channel could not be found."
                    });
            }


            const embed =
                new EmbedBuilder();


            if (
                /^#[0-9A-Fa-f]{6}$/.test(
                    color
                )
            ) {

                embed.setColor(
                    color
                );

            } else {

                embed.setColor(
                    "#ff8534"
                );
            }


            if (title) {

                embed.setTitle(
                    String(title).slice(
                        0,
                        256
                    )
                );
            }


            if (description) {

                embed.setDescription(
                    String(description).slice(
                        0,
                        4096
                    )
                );
            }


            if (footer) {

                embed.setFooter({
                    text:
                        String(footer).slice(
                            0,
                            2048
                        )
                });
            }


            if (image) {

                try {

                    embed.setImage(
                        image
                    );

                } catch {

                    return res
                        .status(400)
                        .json({
                            error:
                                "The large image URL is invalid."
                        });
                }
            }


            if (thumbnail) {

                try {

                    embed.setThumbnail(
                        thumbnail
                    );

                } catch {

                    return res
                        .status(400)
                        .json({
                            error:
                                "The thumbnail URL is invalid."
                        });
                }
            }


            if (
                timestamp === true
            ) {

                embed.setTimestamp();
            }


            let content;
            const allowedRoles = [];


            if (roleId) {

                const role =
                    await guild.roles.fetch(
                        roleId
                    );


                if (!role) {

                    return res
                        .status(400)
                        .json({
                            error:
                                "The selected role could not be found."
                        });
                }


                content =
                    `<@&${role.id}>`;

                allowedRoles.push(
                    role.id
                );
            }


            await channel.send({

                content,

                embeds: [
                    embed
                ],

                allowedMentions: {
                    roles:
                        allowedRoles
                }
            });


            console.log(
                `[ANNOUNCEMENT] ${req.session.user.username} sent an announcement to #${channel.name}`
            );


            res.json({

                success:
                    true,

                channelName:
                    channel.name
            });


        } catch (error) {

            console.error(
                "[ANNOUNCEMENT] Send error:",
                error
            );


            res
                .status(500)
                .json({
                    error:
                        "Could not send the announcement."
                });
        }
    }
);

// ======================================================
// ROLE MANAGEMENT
// ======================================================

app.get(
    "/dashboard/roles",
    requireLogin,
    requireSection("management"),
    async (req, res) => {
        try {
            const guild =
                client.guilds.cache.first();

            if (!guild) {
                return res
                    .status(500)
                    .send(
                        "Discord server could not be found."
                    );
            }

            // Do NOT full-fetch every member whenever this page is opened.
            // guild.members.fetch() uses Discord Gateway opcode 8 and repeated
            // dashboard refreshes can trigger a GatewayRateLimitError.
            //
            // Members already available to the bot are used from cache here.
            // When a specific member is selected, the API below fetches only
            // that one member by ID.
            await guild.roles.fetch();

            const botMember =
                guild.members.me ||
                await guild.members.fetchMe();

            const settings =
                getRoleManagementSettings();

            const manageableRoleIds =
                settings.manageableRoleIds || [];

            const members =
                guild.members.cache
                    .filter(
                        member =>
                            member &&
                            member.user &&
                            !member.user.bot
                    )
                    .map(
                        member => ({
                            id:
                                member.id,

                            username:
                                member.user.username,

                            displayName:
                                member.displayName
                        })
                    )
                    .sort(
                        (a, b) =>
                            a.displayName.localeCompare(
                                b.displayName
                            )
                    );

            const roles =
                guild.roles.cache
                    .filter(
                        role =>
                            role.id !== guild.id
                    )
                    .map(
                        role => {
                            const protectedRole =
                                role.managed ||
                                role.position >=
                                    botMember.roles.highest.position ||
                                role.permissions.has(
                                    "Administrator"
                                );

                            return {
                                id:
                                    role.id,

                                name:
                                    role.name,

                                color:
                                    role.hexColor === "#000000"
                                        ? "#7f8c8d"
                                        : role.hexColor,

                                position:
                                    role.position,

                                memberCount:
                                    role.members.size,

                                protected:
                                    protectedRole,

                                editable:
                                    role.editable,

                                manageable:
                                    manageableRoleIds.includes(
                                        role.id
                                    )
                            };
                        }
                    )
                    .sort(
                        (a, b) =>
                            b.position -
                            a.position
                    );

            const auditLog =
                getRoleAuditLog()
                    .slice(
                        0,
                        20
                    );

            res.render(
                "roles",
                {
                    ...dashboardData(
                        req,
                        "management"
                    ),

                    roles,
                    members,
                    settings,
                    auditLog,

                    isOwner:
                        req.dashboardAccess?.isOwner === true
                }
            );

        } catch (error) {
            console.error(
                "[ROLE DASHBOARD] Error:",
                error
            );

            res
                .status(500)
                .send(
                    "Could not load Role Management."
                );
        }
    }
);


// ======================================================
// ROLE MANAGEMENT API HELPERS
// ======================================================

function getSafeRoleForDashboard(
    guild,
    roleId
) {
    const role =
        guild.roles.cache.get(
            String(roleId)
        );

    if (!role) {
        return {
            ok: false,
            error:
                "That role could not be found."
        };
    }

    if (
        role.id === guild.id ||
        role.managed
    ) {
        return {
            ok: false,
            error:
                "That role is protected and cannot be managed."
        };
    }

    if (
        role.permissions.has(
            "Administrator"
        )
    ) {
        return {
            ok: false,
            error:
                "Administrator roles are protected."
        };
    }

    if (!role.editable) {
        return {
            ok: false,
            error:
                "The bot cannot manage that role. Move the bot role above it in Discord."
        };
    }

    const settings =
        getRoleManagementSettings();

    if (
        !settings.manageableRoleIds.includes(
            role.id
        )
    ) {
        return {
            ok: false,
            error:
                "That role has not been approved as a manageable dashboard role."
        };
    }

    return {
        ok: true,
        role
    };
}


// ======================================================
// GET MEMBER ROLES
// ======================================================

app.get(
    "/api/roles/member/:userId",
    requireLogin,
    requireSection("management"),
    async (req, res) => {
        try {
            const guild =
                client.guilds.cache.first();

            if (!guild) {
                return res
                    .status(500)
                    .json({
                        error:
                            "Discord server not found."
                    });
            }

            const member =
                await guild.members.fetch(
                    req.params.userId
                );

            const roles =
                member.roles.cache
                    .filter(
                        role =>
                            role.id !== guild.id
                    )
                    .map(
                        role => ({
                            id:
                                role.id,

                            name:
                                role.name,

                            color:
                                role.hexColor === "#000000"
                                    ? "#7f8c8d"
                                    : role.hexColor
                        })
                    );

            res.json({
                success: true,

                member: {
                    id:
                        member.id,

                    username:
                        member.user.username,

                    displayName:
                        member.displayName,

                    avatar:
                        member.user.displayAvatarURL({
                            size: 128
                        }),

                    roles
                }
            });

        } catch (error) {
            console.error(
                "[ROLE MEMBER INFO] Error:",
                error
            );

            res
                .status(404)
                .json({
                    error:
                        "That member could not be found."
                });
        }
    }
);


// ======================================================
// ADD ROLE
// ======================================================

app.post(
    "/api/roles/add",
    requireLogin,
    requireSection("management"),
    async (req, res) => {
        try {
            const {
                userId,
                roleId
            } = req.body;

            if (
                !userId ||
                !roleId
            ) {
                return res
                    .status(400)
                    .json({
                        error:
                            "Member and role are required."
                    });
            }

            const guild =
                client.guilds.cache.first();

            if (!guild) {
                return res
                    .status(500)
                    .json({
                        error:
                            "Discord server not found."
                    });
            }

            await guild.roles.fetch();

            const member =
                await guild.members.fetch(
                    String(userId)
                );

            const safeRole =
                getSafeRoleForDashboard(
                    guild,
                    roleId
                );

            if (!safeRole.ok) {
                return res
                    .status(400)
                    .json({
                        error:
                            safeRole.error
                    });
            }

            if (
                member.roles.cache.has(
                    safeRole.role.id
                )
            ) {
                return res
                    .status(400)
                    .json({
                        error:
                            "That member already has this role."
                    });
            }

            await member.roles.add(
                safeRole.role,
                `Dashboard role added by ${req.session.user.username}`
            );

            addRoleAuditEntry({
                action:
                    "ADD",

                guildId:
                    guild.id,

                userId:
                    member.id,

                username:
                    member.user.username,

                roleId:
                    safeRole.role.id,

                roleName:
                    safeRole.role.name,

                moderatorId:
                    req.session.user.id,

                moderatorName:
                    req.session.user.username
            });

            res.json({
                success: true,

                message:
                    `✅ Added @${safeRole.role.name} to ${member.displayName}.`
            });

        } catch (error) {
            console.error(
                "[ROLE ADD] Error:",
                error
            );

            res
                .status(500)
                .json({
                    error:
                        "Could not add that role."
                });
        }
    }
);


// ======================================================
// REMOVE ROLE
// ======================================================

app.post(
    "/api/roles/remove",
    requireLogin,
    requireSection("management"),
    async (req, res) => {
        try {
            const {
                userId,
                roleId
            } = req.body;

            if (
                !userId ||
                !roleId
            ) {
                return res
                    .status(400)
                    .json({
                        error:
                            "Member and role are required."
                    });
            }

            const guild =
                client.guilds.cache.first();

            if (!guild) {
                return res
                    .status(500)
                    .json({
                        error:
                            "Discord server not found."
                    });
            }

            await guild.roles.fetch();

            const member =
                await guild.members.fetch(
                    String(userId)
                );

            const safeRole =
                getSafeRoleForDashboard(
                    guild,
                    roleId
                );

            if (!safeRole.ok) {
                return res
                    .status(400)
                    .json({
                        error:
                            safeRole.error
                    });
            }

            if (
                !member.roles.cache.has(
                    safeRole.role.id
                )
            ) {
                return res
                    .status(400)
                    .json({
                        error:
                            "That member does not have this role."
                    });
            }

            await member.roles.remove(
                safeRole.role,
                `Dashboard role removed by ${req.session.user.username}`
            );

            addRoleAuditEntry({
                action:
                    "REMOVE",

                guildId:
                    guild.id,

                userId:
                    member.id,

                username:
                    member.user.username,

                roleId:
                    safeRole.role.id,

                roleName:
                    safeRole.role.name,

                moderatorId:
                    req.session.user.id,

                moderatorName:
                    req.session.user.username
            });

            res.json({
                success: true,

                message:
                    `✅ Removed @${safeRole.role.name} from ${member.displayName}.`
            });

        } catch (error) {
            console.error(
                "[ROLE REMOVE] Error:",
                error
            );

            res
                .status(500)
                .json({
                    error:
                        "Could not remove that role."
                });
        }
    }
);


// ======================================================
// SAVE MANAGEABLE ROLE SETTINGS
// OWNER ONLY
// ======================================================

app.post(
    "/api/roles/settings",
    requireLogin,
    requireSection("owner"),
    async (req, res) => {
        try {
            const guild =
                client.guilds.cache.first();

            if (!guild) {
                return res
                    .status(500)
                    .json({
                        error:
                            "Discord server not found."
                    });
            }

            await guild.roles.fetch();

            const requestedIds =
                Array.isArray(
                    req.body.manageableRoleIds
                )
                    ? [
                        ...new Set(
                            req.body.manageableRoleIds
                                .map(String)
                        )
                    ]
                    : [];

            const safeIds =
                [];

            for (
                const roleId
                of requestedIds
            ) {
                const role =
                    guild.roles.cache.get(
                        roleId
                    );

                if (
                    !role ||
                    role.id === guild.id ||
                    role.managed ||
                    role.permissions.has(
                        "Administrator"
                    ) ||
                    !role.editable
                ) {
                    continue;
                }

                safeIds.push(
                    role.id
                );
            }

            saveRoleManagementSettings({
                manageableRoleIds:
                    safeIds
            });

            res.json({
                success: true,

                manageableRoleIds:
                    safeIds
            });

        } catch (error) {
            console.error(
                "[ROLE SETTINGS] Error:",
                error
            );

            res
                .status(500)
                .json({
                    error:
                        "Could not save manageable role settings."
                });
        }
    }
);

app.get(
    "/dashboard/owner",
    requireLogin,
    requireSection("owner"),
    async (req, res) => {
        try {
            const guild = client.guilds.cache.first();

            if (!guild) {
                return res.status(500).send(
                    "Discord server could not be found."
                );
            }

            await guild.roles.fetch();
            await guild.members.fetch();

            const permissions = getDashboardPermissions();

            const roles = guild.roles.cache
                .filter(role => role.name !== "@everyone")
                .map(role => ({
                    id: role.id,
                    name: role.name,
                    position: role.position
                }))
                .sort((a, b) => b.position - a.position);

            const members = guild.members.cache
                .filter(member => !member.user.bot)
                .map(member => ({
                    id: member.id,
                    username: member.user.username,
                    displayName: member.displayName
                }))
                .sort((a, b) =>
                    a.displayName.localeCompare(b.displayName)
                );

            res.render("owner", {
                ...dashboardData(req, "management"),
                permissions,
                roles,
                members
            });
        } catch (error) {
            console.error("[OWNER DASHBOARD] Error:", error);
            res.status(500).send(
                "Could not load the Owner Control Center."
            );
        }
    }
);
// ======================================================
// OWNER NEWS MANAGEMENT
// ======================================================


app.get(
    "/dashboard/owner/news",
    requireLogin,
    requireSection("owner"),
    (req, res) => {

        try {

            const posts =
                getNewsPosts()
                    .sort(
                        (a, b) =>
                            new Date(b.createdAt) -
                            new Date(a.createdAt)
                    );


            res.render(
                "owner-news",
                {
                    ...dashboardData(
                        req,
                        "management"
                    ),

                    posts,

                    isOwner:
                        true
                }
            );

        } catch (error) {

            console.error(
                "[OWNER NEWS] Failed to load:",
                error
            );

            res
                .status(500)
                .send(
                    "Could not load News Management."
                );
        }
    }
);

// ======================================================
// CREATE NEWS ARTICLE
// ======================================================


app.post(
    "/api/owner/news",
    requireLogin,
    requireSection("owner"),
    (req, res) => {

        try {

            const {
                title,
                summary,
                content,
                image,
                published
            } = req.body;


            if (
                !title ||
                !String(title).trim()
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Article title is required."
                    });
            }


            if (
                !content ||
                !String(content).trim()
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Article content is required."
                    });
            }


            const posts =
                getNewsPosts();


            const baseSlug =
                createNewsSlug(
                    title
                ) || "news";


            let slug =
                baseSlug;


            let number =
                2;


            while (
                posts.some(
                    post =>
                        post.slug === slug
                )
            ) {

                slug =
                    `${baseSlug}-${number}`;

                number++;
            }


            const now =
                new Date()
                    .toISOString();


            const post = {

                id:
                    `${Date.now()}-${Math.random()
                        .toString(36)
                        .slice(2, 8)}`,

                slug,

                title:
                    String(title)
                        .trim()
                        .slice(0, 150),

                summary:
                    String(summary || "")
                        .trim()
                        .slice(0, 500),

                content:
                    String(content)
                        .trim(),

                image:
                    String(image || "")
                        .trim(),

                author:
                    req.session.user.global_name ||
                    req.session.user.username ||
                    "Hendry County Project",

                authorId:
                    req.session.user.id,

                published:
                    published === true,

                createdAt:
                    now,

                updatedAt:
                    now
            };


            posts.push(
                post
            );


            saveNewsPosts(
                posts
            );


            console.log(
                `[NEWS] ${req.session.user.username} created "${post.title}"`
            );


            res.json({
                success:
                    true,

                message:
                    "News article created successfully.",

                post
            });


        } catch (error) {

            console.error(
                "[NEWS CREATE] Error:",
                error
            );


            res
                .status(500)
                .json({
                    error:
                        "Could not create the news article."
                });
        }
    }
);

// ======================================================
// UPDATE NEWS ARTICLE
// ======================================================


app.put(
    "/api/owner/news/:id",
    requireLogin,
    requireSection("owner"),
    (req, res) => {

        try {

            const posts =
                getNewsPosts();


            const index =
                posts.findIndex(
                    post =>
                        post.id ===
                        req.params.id
                );


            if (index === -1) {

                return res
                    .status(404)
                    .json({
                        error:
                            "News article not found."
                    });
            }


            const existing =
                posts[index];


            const title =
                String(
                    req.body.title ||
                    existing.title
                )
                    .trim()
                    .slice(0, 150);


            if (!title) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Article title is required."
                    });
            }


            posts[index] = {

                ...existing,

                title,

                summary:
                    String(
                        req.body.summary ?? existing.summary
                    )
                        .trim()
                        .slice(0, 500),

                content:
                    String(
                        req.body.content ?? existing.content
                    )
                        .trim(),

                image:
                    String(
                        req.body.image ?? existing.image
                    )
                        .trim(),

                published:
                    req.body.published === true,

                updatedAt:
                    new Date()
                        .toISOString()
            };


            saveNewsPosts(
                posts
            );


            res.json({
                success:
                    true,

                message:
                    "News article updated.",

                post:
                    posts[index]
            });


        } catch (error) {

            console.error(
                "[NEWS UPDATE] Error:",
                error
            );


            res
                .status(500)
                .json({
                    error:
                        "Could not update the news article."
                });
        }
    }
);

// ======================================================
// DELETE NEWS ARTICLE
// ======================================================


app.delete(
    "/api/owner/news/:id",
    requireLogin,
    requireSection("owner"),
    (req, res) => {

        try {

            const posts =
                getNewsPosts();


            const post =
                posts.find(
                    item =>
                        item.id ===
                        req.params.id
                );


            if (!post) {

                return res
                    .status(404)
                    .json({
                        error:
                            "News article not found."
                    });
            }


            const remainingPosts =
                posts.filter(
                    item =>
                        item.id !==
                        req.params.id
                );


            saveNewsPosts(
                remainingPosts
            );


            console.log(
                `[NEWS] ${req.session.user.username} deleted "${post.title}"`
            );


            res.json({
                success:
                    true,

                message:
                    "News article deleted."
            });


        } catch (error) {

            console.error(
                "[NEWS DELETE] Error:",
                error
            );


            res
                .status(500)
                .json({
                    error:
                        "Could not delete the news article."
                });
        }
    }
);

// ======================================================
// OWNER PERMISSIONS API
// ======================================================

app.get(
    "/api/owner/permissions",
    requireLogin,
    requireSection("owner"),
    (req, res) => {
        res.json({
            success: true,
            permissions: getDashboardPermissions()
        });
    }
);

app.post(
    "/api/owner/permissions",
    requireLogin,
    requireSection("owner"),
    (req, res) => {
        try {
            const body = req.body || {};

            const cleanIds = value =>
                Array.isArray(value)
                    ? [...new Set(
                        value
                            .map(String)
                            .map(id => id.trim())
                            .filter(Boolean)
                    )]
                    : [];

            const permissions = {
                ownerUserIds: cleanIds(body.ownerUserIds),
                allowedUserIds: cleanIds(body.allowedUserIds),
                allowedRoleIds: cleanIds(body.allowedRoleIds),
                sections: {
                    bot: cleanIds(body.sections?.bot),
                    moderation: cleanIds(body.sections?.moderation),
                    management: cleanIds(body.sections?.management),
                    configuration: cleanIds(body.sections?.configuration)
                }
            };

            saveDashboardPermissions(permissions);

            res.json({
                success: true,
                permissions
            });
        } catch (error) {
            console.error("[OWNER PERMISSIONS] Save error:", error);
            res.status(500).json({
                success: false,
                error: "Could not save dashboard permissions."
            });
        }
    }
);

// ======================================================
// WELCOME EDITOR
// ======================================================

const welcomeSettingsPath =
    path.join(
        __dirname,
        "data",
        "welcome-settings.json"
    );


function getWelcomeSettings() {

    const defaults = {

        enabled:
            true,

        channelId:
            "",

        embedColor:
            "#ff8534",

        embedTitle:
            "Welcome {username}",

        embedDescription:
            "Welcome **{mention}**! You are our **{memberNumber} Member**. Please look around and talk to some of our members.",

        embedFooter:
            "Hendry County Project",

        showTimestamp:
            true,

        showImage:
            true,

        avatarX:
            107,

        avatarY:
            99,

        avatarSize:
            245,

        usernameX:
            450,

        usernameY:
            225,

        usernameFontSize:
            42,

        pingUser:
            true
    };


    try {

        if (
            !fs.existsSync(
                welcomeSettingsPath
            )
        ) {
            return defaults;
        }


        return {
            ...defaults,

            ...JSON.parse(
                fs.readFileSync(
                    welcomeSettingsPath,
                    "utf8"
                )
            )
        };


    } catch (error) {

        console.error(
            "[WELCOME SETTINGS] Read error:",
            error
        );

        return defaults;
    }
}


app.get(
    "/dashboard/welcome",
    requireLogin,
    requireSection("configuration"),
    async (req, res) => {

        try {

            const guild =
                client.guilds.cache.first();


            if (!guild) {

                return res
                    .status(500)
                    .send(
                        "Discord server could not be found."
                    );
            }


            await guild.channels.fetch();


            const channels =
                guild.channels.cache

                    .filter(
                        channel =>
                            channel.isTextBased() &&
                            !channel.isThread()
                    )

                    .map(
                        channel => ({
                            id:
                                channel.id,

                            name:
                                channel.name
                        })
                    )

                    .sort(
                        (a, b) =>
                            a.name.localeCompare(
                                b.name
                            )
                    );


            res.render(
                "welcome",
                {
                    ...dashboardData(
                        req,
                        "configuration"
                    ),

                    settings:
                        getWelcomeSettings(),

                    channels
                }
            );


        } catch (error) {

            console.error(
                "[WELCOME DASHBOARD] Error:",
                error
            );


            res
                .status(500)
                .send(
                    "Could not load the Welcome Editor."
                );
        }
    }
);


// ======================================================
// SAVE WELCOME SETTINGS
// ======================================================

app.post(
    "/api/welcome-settings",
    requireLogin,
    requireSection("configuration"),
    (req, res) => {

        try {

            const data = {

                enabled:
                    req.body.enabled === true,

                channelId:
                    String(
                        req.body.channelId || ""
                    ),

                embedColor:
                    /^#[0-9A-Fa-f]{6}$/.test(
                        req.body.embedColor
                    )
                        ? req.body.embedColor
                        : "#ff8534",

                embedTitle:
                    String(
                        req.body.embedTitle ||
                        "Welcome {username}"
                    ),

                embedDescription:
                    String(
                        req.body.embedDescription ||
                        ""
                    ),

                embedFooter:
                    String(
                        req.body.embedFooter ||
                        ""
                    ),

                showTimestamp:
                    req.body.showTimestamp === true,

                showImage:
                    req.body.showImage === true,

                avatarX:
                    Number(
                        req.body.avatarX ?? 107
                    ),

                avatarY:
                    Number(
                        req.body.avatarY ?? 99
                    ),

                avatarSize:
                    Math.min(
                        500,
                        Math.max(
                            50,
                            Number(
                                req.body.avatarSize ||
                                245
                            )
                        )
                    ),

                usernameX:
                    Number(
                        req.body.usernameX ?? 450
                    ),

                usernameY:
                    Number(
                        req.body.usernameY ?? 225
                    ),

                usernameFontSize:
                    Math.min(
                        90,
                        Math.max(
                            15,
                            Number(
                                req.body.usernameFontSize ||
                                42
                            )
                        )
                    ),

                pingUser:
                    req.body.pingUser === true
            };


            fs.mkdirSync(
                path.dirname(
                    welcomeSettingsPath
                ),
                {
                    recursive:
                        true
                }
            );


            fs.writeFileSync(
                welcomeSettingsPath,

                JSON.stringify(
                    data,
                    null,
                    4
                )
            );


            console.log(
                "[WELCOME SETTINGS] Saved."
            );


            res.json({
                success:
                    true
            });


        } catch (error) {

            console.error(
                "[WELCOME SETTINGS] Save error:",
                error
            );


            res
                .status(500)
                .json({
                    success:
                        false,

                    error:
                        "Could not save welcome settings."
                });
        }
    }
);

app.get(
    "/dashboard/settings",
    requireLogin,
    requireSection("configuration"),
    async (req, res) => {
        try {
            const guild =
                client.guilds.cache.first();

            let channels = [];

            if (guild) {
                channels =
                    guild.channels.cache
                        .filter(
                            channel =>
                                channel.isTextBased()
                        )
                        .map(
                            channel => ({
                                id:
                                    channel.id,

                                name:
                                    channel.name
                            })
                        )
                        .sort(
                            (a, b) =>
                                a.name.localeCompare(
                                    b.name
                                )
                        );
            }

            res.render(
                "settings",
                {
                    ...dashboardData(
                        req,
                        "configuration"
                    ),

                    settings:
                        getDashboardSettings(),

                    channels
                }
            );

        } catch (error) {
            console.error(
                "[SETTINGS PAGE] Error:",
                error
            );

            res
                .status(500)
                .send(
                    "Could not load settings."
                );
        }
    }
);

app.post(
    "/api/settings",
    requireLogin,
    requireSection("configuration"),
    async (req, res) => {
        try {
            const dashboardTitle =
                String(
                    req.body.dashboardTitle ||
                    "Hendry County Project"
                )
                .trim()
                .slice(
                    0,
                    80
                );

            const embedColor =
                /^#[0-9A-Fa-f]{6}$/.test(
                    req.body.embedColor
                )
                    ? req.body.embedColor
                    : "#ff7d28";

            const defaultFooter =
                String(
                    req.body.defaultFooter ||
                    ""
                )
                .trim()
                .slice(
                    0,
                    150
                );

            const logChannelId =
                String(
                    req.body.logChannelId ||
                    ""
                );

            const timezone =
                String(
                    req.body.timezone ||
                    "Europe/London"
                );

            const maintenanceMode =
                req.body.maintenanceMode === true;


            const settings = {
                dashboardTitle,
                embedColor,
                defaultFooter,
                logChannelId,
                timezone,
                maintenanceMode
            };


            saveDashboardSettings(
                settings
            );


            res.json({
                success: true,
                settings
            });

        } catch (error) {
            console.error(
                "[SETTINGS SAVE] Error:",
                error
            );

            res
                .status(500)
                .json({
                    error:
                        "Could not save settings."
                });
        }
    }
);

// ======================================================
// START DASHBOARD
// ======================================================

app.listen(
    PORT,
    "0.0.0.0",
    () => {
        console.log(
            `🌐 HCP Dashboard running on port ${PORT}`
        );
    }
);