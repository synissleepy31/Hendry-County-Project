import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder
} from "discord.js";

import {
    addBlacklist
} from "../services/moderationStore.js";

export default {
    data: new SlashCommandBuilder()
        .setName("blacklist")
        .setDescription(
            "Blacklist a user from Hendry County Project."
        )

        .addUserOption(option =>
            option
                .setName("member")
                .setDescription(
                    "User to blacklist"
                )
                .setRequired(true)
        )

        .addStringOption(option =>
            option
                .setName("reason")
                .setDescription(
                    "Reason for the blacklist"
                )
                .setRequired(true)
        )

        .setDefaultMemberPermissions(
            PermissionFlagsBits.Administrator
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

        addBlacklist({
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

        try {
            await user.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor("#ef4444")
                        .setTitle(
                            "🚫 Community Blacklist"
                        )
                        .setDescription(
                            `You have been blacklisted from **${interaction.guild.name}**.`
                        )
                        .addFields({
                            name: "Reason",
                            value: reason
                        })
                        .setTimestamp()
                ]
            });
        } catch {}

        await interaction.guild.members.ban(
            user.id,
            {
                reason:
                    `BLACKLISTED - ${reason}`
            }
        );

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor("#ef4444")
                    .setTitle(
                        "🚫 User Blacklisted"
                    )
                    .setDescription(
                        `${user} has been added to the community blacklist.`
                    )
                    .addFields(
                        {
                            name: "Reason",
                            value:
                                reason
                        },
                        {
                            name: "Moderator",
                            value:
                                `${interaction.user}`
                        }
                    )
                    .setFooter({
                        text:
                            "Hendry County Project • Moderation"
                    })
                    .setTimestamp()
            ]
        });
    }
};