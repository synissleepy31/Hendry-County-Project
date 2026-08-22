import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder
} from "discord.js";

import {
    getWarnings
} from "../services/moderationStore.js";

export default {
    data: new SlashCommandBuilder()
        .setName("check-warnings")
        .setDescription("Check a member's warnings.")

        .addUserOption(option =>
            option
                .setName("member")
                .setDescription(
                    "Member whose warnings you want to check"
                )
                .setRequired(true)
        )

        .setDefaultMemberPermissions(
            PermissionFlagsBits.ModerateMembers
        ),

    async execute(interaction) {
        const user =
            interaction.options.getUser(
                "member",
                true
            );

        const warnings =
            getWarnings(
                interaction.guild.id,
                user.id
            );

        const embed =
            new EmbedBuilder()

                .setColor("#ff8534")

                .setTitle(
                    `⚠️ Warnings — ${user.username}`
                )

                .setFooter({
                    text:
                        `Hendry County Project • ${warnings.length} warning(s)`
                })

                .setTimestamp();

        if (warnings.length === 0) {
            embed.setDescription(
                `${user} currently has **no warnings**.`
            );

        } else {
            embed.setDescription(
                warnings
                    .slice(-10)
                    .map(
                        (warning, index) =>
                            `**${index + 1}. ${warning.reason}**\n` +
                            `Moderator: <@${warning.moderatorId}>\n` +
                            `<t:${Math.floor(
                                warning.createdAt / 1000
                            )}:f>\n` +
                            `ID: \`${warning.id}\``
                    )
                    .join("\n\n")
            );
        }

        await interaction.reply({
            embeds: [embed]
        });
    }
};