import {
    AuditLogEvent,
    EmbedBuilder,
    PermissionFlagsBits
} from "discord.js";
import { isBlacklisted } from "../services/moderationStore.js";

// ======================================================
// SETTINGS
// ======================================================

const LEAVE_CHANNEL_ID = "1533856005333582006";

const LEAVE_RED = "#d90404";

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendGoodbye(channel, payload) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            return await channel.send(payload);
        } catch (error) {
            const permanentCodes = new Set([50001, 50013, 10003, 50035]);
            const transient = !permanentCodes.has(error.code) &&
                (!error.status || error.status >= 500 || error.code === "ECONNRESET");
            if (!transient || attempt === 3) throw error;
            await wait(attempt * 750);
        }
    }
}

async function fetchLeaveChannel(guild) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            return await guild.channels.fetch(LEAVE_CHANNEL_ID);
        } catch (error) {
            const permanentCodes = new Set([50001, 50013, 10003]);
            const transient = !permanentCodes.has(error.code) &&
                (!error.status || error.status >= 500 || error.code === "ECONNRESET");
            if (!transient || attempt === 3) throw error;
            await wait(attempt * 750);
        }
    }
}

async function getRemovalReason(guild, userId) {
    if (isBlacklisted(guild.id, userId)) return "blacklisted";

    for (const [action, reason] of [
        [AuditLogEvent.MemberBanAdd, "banned"],
        [AuditLogEvent.MemberKick, "kicked"]
    ]) {
        try {
            const logs = await guild.fetchAuditLogs({ type: action, limit: 6 });
            const recentMatch = logs.entries.find(entry =>
                entry.target?.id === userId &&
                Date.now() - entry.createdTimestamp < 15_000
            );
            if (recentMatch) return reason;
        } catch (error) {
            if (error.code !== 50001 && error.code !== 50013) {
                console.warn(`[LEAVE] Could not check ${reason} audit logs (${error.code || error.message}).`);
            }
        }
    }

    return "left";
}

// ======================================================
// GUILD MEMBER REMOVE EVENT
// ======================================================

export default {
    name: "guildMemberRemove",

    async execute(member) {
        try {
            const removalReason = await getRemovalReason(
                member.guild,
                member.id
            );
            const descriptions = {
                left: `**<@${member.id}>** has left the server. We hope to see you again.`,
                kicked: `**<@${member.id}>** has been kicked from the server.`,
                banned: `**<@${member.id}>** has been banned from the server.`,
                blacklisted: `**<@${member.id}>** has been blacklisted from the server.`
            };
            const actionText = {
                left: "left the server",
                kicked: "was kicked from the server",
                banned: "was banned from the server",
                blacklisted: "was blacklisted from the server"
            };

            console.log(
                `[LEAVE] ${member.user.tag} ${actionText[removalReason]}.`
            );

            const channel = await fetchLeaveChannel(member.guild);

            if (!channel) {
                console.error(
                    `[LEAVE] Channel ${LEAVE_CHANNEL_ID} was not found.`
                );

                return;
            }

            if (!channel.isTextBased()) {
                console.error(
                    "[LEAVE] Leave channel is not a text channel."
                );

                return;
            }

            const botMember = member.guild.members.me;
            const permissions = botMember && channel.permissionsFor(botMember);
            if (!permissions?.has([
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.EmbedLinks
            ])) {
                console.error(`[LEAVE] Bot is missing permission to post in channel ${LEAVE_CHANNEL_ID}.`);
                return;
            }

            const displayName =
                member.displayName ||
                member.user.globalName ||
                member.user.username;

            const embed =
                new EmbedBuilder()
                    .setColor(LEAVE_RED)

                    .setTitle(
                        `Goodbye ${displayName}`
                    )

                    .setDescription(
                        descriptions[removalReason]
                    )

                    .setFooter({
                        text: "Hendry County Project"
                    })

                    .setTimestamp();

            await sendGoodbye(channel, {
                embeds: [
                    embed
                ],

                allowedMentions: {
                    parse: []
                }
            });

            console.log(
                `[LEAVE] Goodbye message sent for ${member.user.tag}.`
            );

        } catch (error) {
            console.error(`[LEAVE] Could not post goodbye message (${error.code || error.message}).`);
        }
    }
};
