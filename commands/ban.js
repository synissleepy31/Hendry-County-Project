import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder
} from "discord.js";

export default {
    data: new SlashCommandBuilder()
        .setName("ban")
        .setDescription("Permanently ban a member.")

        .addUserOption(option =>
            option
                .setName("member")
                .setDescription("Member to ban")
                .setRequired(true)
        )

        .addStringOption(option =>
            option
                .setName("reason")
                .setDescription("Reason for the ban")
                .setRequired(true)
        )

        .setDefaultMemberPermissions(
            PermissionFlagsBits.BanMembers
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

        try {
            await user.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor("#ef4444")
                        .setTitle(
                            "🔨 You have been banned"
                        )
                        .setDescription(
                            `You were banned from **${interaction.guild.name}**.`
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
                reason
            }
        );

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor("#ef4444")
                    .setTitle(
                        "🔨 Member Banned"
                    )
                    .setDescription(
                        `${user} has been permanently banned.`
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