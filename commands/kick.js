import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    MessageFlags
} from "discord.js";

export default {
    data: new SlashCommandBuilder()
        .setName("kick")
        .setDescription("Kick a member.")

        .addUserOption(option =>
            option
                .setName("member")
                .setDescription("Member to kick")
                .setRequired(true)
        )

        .addStringOption(option =>
            option
                .setName("reason")
                .setDescription("Reason for the kick")
                .setRequired(true)
        )

        .setDefaultMemberPermissions(
            PermissionFlagsBits.KickMembers
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

        const member =
            await interaction.guild.members.fetch(
                user.id
            );

        if (!member.kickable) {
            return interaction.reply({
                content:
                    "❌ I cannot kick that member. Check the bot role hierarchy.",
                flags:
                    MessageFlags.Ephemeral
            });
        }

        try {
            await user.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor("#ff8534")
                        .setTitle(
                            "👢 You have been kicked"
                        )
                        .setDescription(
                            `You were kicked from **${interaction.guild.name}**.`
                        )
                        .addFields({
                            name: "Reason",
                            value: reason
                        })
                        .setTimestamp()
                ]
            });
        } catch {}

        await member.kick(reason);

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor("#ff8534")
                    .setTitle(
                        "👢 Member Kicked"
                    )
                    .setDescription(
                        `${user} has been kicked.`
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