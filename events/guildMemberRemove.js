import {
    EmbedBuilder
} from "discord.js";

// ======================================================
// SETTINGS
// ======================================================

const LEAVE_CHANNEL_ID = "1533856005333582006";

const LEAVE_RED = "#d90404";

// ======================================================
// GUILD MEMBER REMOVE EVENT
// ======================================================

export default {
    name: "guildMemberRemove",

    async execute(member) {
        try {
            console.log(
                `[LEAVE] ${member.user.tag} left the server.`
            );

            const channel =
                member.guild.channels.cache.get(
                    LEAVE_CHANNEL_ID
                );

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
                        `**<@${member.id}>** has left the server. We hope to see you again.`
                    )

                    .setFooter({
                        text: "Hendry County Project"
                    })

                    .setTimestamp();

            await channel.send({
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
            console.error(
                "[LEAVE] Error sending goodbye message:",
                error
            );
        }
    }
};