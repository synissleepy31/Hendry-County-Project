import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    MessageFlags
} from "discord.js";

import {
    addTempBan
} from "../services/moderationStore.js";

function parseDuration(value) {
    const match =
        /^(\d+)(m|h|d|w)$/i.exec(
            value.trim()
        );

    if (!match) {
        return null;
    }

    const amount =
        Number(match[1]);

    const unit =
        match[2].toLowerCase();

    const multipliers = {
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
        w: 7 * 24 * 60 * 60 * 1000
    };

    return amount *
        multipliers[unit];
}

export default {
    data: new SlashCommandBuilder()
        .setName("temp-ban")
        .setDescription(
            "Temporarily ban a member."
        )

        .addUserOption(option =>
            option
                .setName("member")
                .setDescription(
                    "Member to temporarily ban"
                )
                .setRequired(true)
        )

        .addStringOption(option =>
            option
                .setName("duration")
                .setDescription(
                    "Examples: 30m, 6h, 2d, 1w"
                )
                .setRequired(true)
        )

        .addStringOption(option =>
            option
                .setName("reason")
                .setDescription(
                    "Reason for the temporary ban"
                )
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

        const durationText =
            interaction.options.getString(
                "duration",
                true
            );

        const reason =
            interaction.options.getString(
                "reason",
                true
            );

        const duration =
            parseDuration(
                durationText
            );

        if (!duration) {
            return interaction.reply({
                content:
                    "❌ Invalid duration. Use something like `30m`, `6h`, `2d` or `1w`.",
                flags:
                    MessageFlags.Ephemeral
            });
        }

        const expiresAt =
            Date.now() + duration;

        try {
            await user.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor("#ff8534")
                        .setTitle(
                            "⏳ You have been temporarily banned"
                        )
                        .setDescription(
                            `You were temporarily banned from **${interaction.guild.name}**.`
                        )
                        .addFields(
                            {
                                name: "Duration",
                                value:
                                    durationText
                            },
                            {
                                name: "Reason",
                                value:
                                    reason
                            },
                            {
                                name: "Expires",
                                value:
                                    `<t:${Math.floor(
                                        expiresAt / 1000
                                    )}:F>`
                            }
                        )
                        .setTimestamp()
                ]
            });
        } catch {}

        await interaction.guild.members.ban(
            user.id,
            {
                reason:
                    `TEMP BAN (${durationText}) - ${reason}`
            }
        );

        addTempBan({
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

            reason,
            expiresAt
        });

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor("#ff8534")
                    .setTitle(
                        "⏳ Member Temporarily Banned"
                    )
                    .setDescription(
                        `${user} has been temporarily banned.`
                    )
                    .addFields(
                        {
                            name: "Duration",
                            value:
                                durationText
                        },
                        {
                            name: "Reason",
                            value:
                                reason
                        },
                        {
                            name: "Expires",
                            value:
                                `<t:${Math.floor(
                                    expiresAt / 1000
                                )}:F>`
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