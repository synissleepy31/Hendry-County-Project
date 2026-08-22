import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    MessageFlags
} from "discord.js";

import {
    addWarning
} from "../services/moderationStore.js";

export default {
    data: new SlashCommandBuilder()
        .setName("warning")
        .setDescription("Warn a member.")

        .addUserOption(option =>
            option
                .setName("member")
                .setDescription("Member to warn")
                .setRequired(true)
        )

        .addStringOption(option =>
            option
                .setName("reason")
                .setDescription("Reason for the warning")
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

        const reason =
            interaction.options.getString(
                "reason",
                true
            );

        const warning = addWarning({
            guildId:
                interaction.guild.id,

            userId:
                user.id,

            username:
                user.username,

            moderatorId:
                interaction.user.id,

            moderatorName:
                interaction.user.username,

            reason
        });

        const embed =
            new EmbedBuilder()
                .setColor("#ff8534")

                .setTitle(
                    "⚠️ Member Warning"
                )

                .setDescription(
                    `${user} has been warned.`
                )

                .addFields(
                    {
                        name: "Reason",
                        value: reason
                    },
                    {
                        name: "Moderator",
                        value:
                            `${interaction.user}`
                    },
                    {
                        name: "Warning ID",
                        value:
                            warning.id
                    }
                )

                .setFooter({
                    text:
                        "Hendry County Project • Moderation"
                })

                .setTimestamp();

        await interaction.reply({
            embeds: [embed]
        });

        try {
            await user.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor("#ff8534")
                        .setTitle(
                            "⚠️ You have received a warning"
                        )
                        .setDescription(
                            `You have received a warning in **${interaction.guild.name}**.`
                        )
                        .addFields({
                            name: "Reason",
                            value: reason
                        })
                        .setFooter({
                            text:
                                "Hendry County Project"
                        })
                        .setTimestamp()
                ]
            });
        } catch {
            // User DMs disabled.
        }
    }
};