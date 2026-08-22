import {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits,
    MessageFlags,
    AttachmentBuilder
} from "discord.js";

import svgCaptcha from "svg-captcha";
import sharp from "sharp";

// ======================================================
// VERIFICATION SETTINGS
// ======================================================

const VERIFIED_ROLE_ID = "1533590255624523830";

const CAPTCHA_TIMEOUT = 2 * 60 * 1000;

// ======================================================
// ACTIVE VERIFICATIONS
// ======================================================

const verificationSessions = new Map();

// ======================================================
// CREATE CAPTCHA
// ======================================================

async function createCaptcha() {
    const captcha = svgCaptcha.create({
        size: 6,
        noise: 3,
        color: true,
        background: "#101318",
        width: 550,
        height: 200,
        fontSize: 90,

        charPreset:
            "ABCDEFGHJKLMNPQRSTUVWXYZ" +
            "abcdefghjkmnpqrstuvwxyz" +
            "23456789"
    });

    const image = await sharp(
        Buffer.from(captcha.data)
    )
        .png()
        .toBuffer();

    return {
        code: captcha.text,
        image
    };
}

// ======================================================
// COMMAND
// ======================================================

const verificationCommand = {

    data: new SlashCommandBuilder()

        .setName("verification-panel")

        .setDescription(
            "Send the server verification panel."
        )

        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild
        ),

    // ==================================================
    // /verification-panel
    // ==================================================

    async execute(interaction) {

        try {

            const embed =
                new EmbedBuilder()

                    .setColor("#ff8534")

                    .setTitle(
                        "✅ Verification Panel"
                    )

                    .setDescription(
                        "Click the button below to begin verification.\n\n" +
                        "You will receive verification instructions in your DMs."
                    )

                    .setFooter({
                        text:
                            "Hendry County Project"
                    })

                    .setTimestamp();

            const button =
                new ButtonBuilder()

                    .setCustomId(
                        "start_verification"
                    )

                    .setLabel(
                        "Start Verification"
                    )

                    .setStyle(
                        ButtonStyle.Primary
                    );

            const row =
                new ActionRowBuilder()
                    .addComponents(
                        button
                    );

            await interaction.channel.send({
                embeds: [embed],
                components: [row]
            });

            await interaction.reply({
                content:
                    "✅ Verification panel sent.",
                flags:
                    MessageFlags.Ephemeral
            });

        } catch (error) {

            console.error(
                "[VERIFICATION PANEL] Error:",
                error
            );

            if (!interaction.replied) {

                await interaction.reply({
                    content:
                        "❌ Failed to send the verification panel.",

                    flags:
                        MessageFlags.Ephemeral
                }).catch(() => {});
            }
        }
    },

    // ==================================================
    // START VERIFICATION BUTTON
    // ==================================================

    async handleButton(interaction) {

        if (
            interaction.customId !==
            "start_verification"
        ) {
            return;
        }

        // ==================================================
        // ACKNOWLEDGE BUTTON IMMEDIATELY
        // ==================================================

        try {

            await interaction.deferReply({
                flags:
                    MessageFlags.Ephemeral
            });

        } catch (error) {

            console.error(
                "[VERIFY] Could not defer interaction:",
                error
            );

            return;
        }

        // ==================================================
        // SERVER CHECK
        // ==================================================

        if (!interaction.guild) {

            return interaction.editReply({
                content:
                    "❌ Verification must be started inside the server."
            });
        }

        // ==================================================
        // ALREADY VERIFYING
        // ==================================================

        if (
            verificationSessions.has(
                interaction.user.id
            )
        ) {

            return interaction.editReply({
                content:
                    "⚠️ You already have a verification in progress. Check your DMs."
            });
        }

        try {

            // ==================================================
            // FETCH MEMBER
            // ==================================================

            const member =
                await interaction.guild.members.fetch(
                    interaction.user.id
                );

            // ==================================================
            // FETCH ROLE
            // ==================================================

            const role =
                await interaction.guild.roles.fetch(
                    VERIFIED_ROLE_ID
                );

            if (!role) {

                console.error(
                    `[VERIFY] Role ${VERIFIED_ROLE_ID} not found.`
                );

                return interaction.editReply({
                    content:
                        "❌ The verified role could not be found."
                });
            }

            // ==================================================
            // ALREADY VERIFIED
            // ==================================================

            if (
                member.roles.cache.has(
                    VERIFIED_ROLE_ID
                )
            ) {

                return interaction.editReply({
                    content:
                        "✅ You are already verified."
                });
            }

            // ==================================================
            // FETCH BOT MEMBER
            // ==================================================

            const botMember =
                await interaction.guild.members.fetchMe();

            // ==================================================
            // PERMISSION CHECK
            // ==================================================

            if (
                !botMember.permissions.has(
                    PermissionFlagsBits.ManageRoles
                )
            ) {

                return interaction.editReply({
                    content:
                        "❌ I don't have permission to manage roles."
                });
            }

            // ==================================================
            // ROLE POSITION CHECK
            // ==================================================

            if (
                botMember.roles.highest.comparePositionTo(
                    role
                ) <= 0
            ) {

                return interaction.editReply({
                    content:
                        "❌ My bot role must be above the verified role."
                });
            }

            // ==================================================
            // CREATE CAPTCHA
            // ==================================================

            const captcha =
                await createCaptcha();

            console.log(
                `[VERIFY] Generated CAPTCHA for ${interaction.user.tag}: ${captcha.code}`
            );

            const attachment =
                new AttachmentBuilder(
                    captcha.image,
                    {
                        name:
                            "verification-captcha.png"
                    }
                );

            // ==================================================
            // CAPTCHA EMBED
            // ==================================================

            const captchaEmbed =
                new EmbedBuilder()

                    .setColor("#38bdf8")

                    .setTitle(
                        "Verification Started"
                    )

                    .setDescription(
                        "To complete verification, reply to this DM with the **exact code** shown in the image.\n\n" +
                        "The code is **case-sensitive**."
                    )

                    .setImage(
                        "attachment://verification-captcha.png"
                    )

                    .setFooter({
                        text:
                            "Hendry County Project"
                    })

                    .setTimestamp();

            // ==================================================
            // SEND CAPTCHA
            // ==================================================

            try {

                await interaction.user.send({
                    embeds: [
                        captchaEmbed
                    ],

                    files: [
                        attachment
                    ]
                });

            } catch (error) {

                console.error(
                    "[VERIFY] Could not send DM:",
                    error
                );

                return interaction.editReply({
                    content:
                        "❌ I couldn't DM you. Please enable DMs from server members."
                });
            }

            // ==================================================
            // SAVE SESSION
            // ==================================================

            verificationSessions.set(
                interaction.user.id,
                {
                    code:
                        captcha.code,

                    guildId:
                        interaction.guild.id,

                    roleId:
                        VERIFIED_ROLE_ID,

                    expiresAt:
                        Date.now() +
                        CAPTCHA_TIMEOUT
                }
            );

            console.log(
                `[VERIFY] Session stored for ${interaction.user.id}`
            );

            // ==================================================
            // TELL USER
            // ==================================================

            await interaction.editReply({
                content:
                    "📩 Check your DMs! I've sent your verification CAPTCHA."
            });

            // ==================================================
            // EXPIRE CAPTCHA
            // ==================================================

            setTimeout(
                async () => {

                    const session =
                        verificationSessions.get(
                            interaction.user.id
                        );

                    if (!session) {
                        return;
                    }

                    if (
                        Date.now() <
                        session.expiresAt
                    ) {
                        return;
                    }

                    verificationSessions.delete(
                        interaction.user.id
                    );

                    const expiredEmbed =
                        new EmbedBuilder()

                            .setColor(
                                "#ef4444"
                            )

                            .setTitle(
                                "⌛ Verification Expired"
                            )

                            .setDescription(
                                "Your verification session expired.\n\n" +
                                "Return to the server and press **Start Verification** to try again."
                            )

                            .setFooter({
                                text:
                                    "Hendry County Project"
                            })

                            .setTimestamp();

                    await interaction.user.send({
                        embeds: [
                            expiredEmbed
                        ]
                    }).catch(() => {});

                },

                CAPTCHA_TIMEOUT + 500
            );

        } catch (error) {

            console.error(
                "[VERIFY] Start verification error:",
                error
            );

            await interaction.editReply({
                content:
                    "❌ Something went wrong while starting verification."
            }).catch(() => {});
        }
    },

    // ==================================================
    // HANDLE USER DM
    // ==================================================

    async handleMessage(message) {

        // Ignore bot messages
        if (message.author.bot) {
            return;
        }

        // Ignore server messages
        // We ONLY want DMs
        if (message.guild !== null) {
            return;
        }

        console.log(
            `[VERIFY] DM EVENT RECEIVED FROM ${message.author.tag}: ${message.content}`
        );

        // ==================================================
        // FIND ACTIVE SESSION
        // ==================================================

        const session =
            verificationSessions.get(
                message.author.id
            );

        if (!session) {

            console.log(
                `[VERIFY] ${message.author.tag} has no active verification session.`
            );

            return;
        }

        // ==================================================
        // EXPIRED
        // ==================================================

        if (
            Date.now() >
            session.expiresAt
        ) {

            verificationSessions.delete(
                message.author.id
            );

            const expiredEmbed =
                new EmbedBuilder()

                    .setColor("#ef4444")

                    .setTitle(
                        "⌛ Verification Expired"
                    )

                    .setDescription(
                        "Your verification session has expired.\n\n" +
                        "Return to the server and press **Start Verification** to try again."
                    )

                    .setFooter({
                        text:
                            "Hendry County Project"
                    })

                    .setTimestamp();

            await message.reply({
                embeds: [
                    expiredEmbed
                ]
            });

            return;
        }

        // ==================================================
        // CHECK ANSWER
        // ==================================================

        const answer =
            message.content.trim();

        const correctCode =
            session.code;

        console.log(
            "======================================"
        );

        console.log(
            "[VERIFY] CAPTCHA ANSWER RECEIVED"
        );

        console.log(
            `User: ${message.author.tag}`
        );

        console.log(
            `Expected: ${correctCode}`
        );

        console.log(
            `Received: ${answer}`
        );

        console.log(
            "======================================"
        );

        // ==================================================
        // WRONG
        // ==================================================

        if (
            answer !== correctCode
        ) {

            verificationSessions.delete(
                message.author.id
            );

            console.log(
                `[VERIFY] ❌ ${message.author.tag} entered the wrong CAPTCHA.`
            );

            const wrongEmbed =
                new EmbedBuilder()

                    .setColor("#ef4444")

                    .setTitle(
                        "❌ Verification Failed"
                    )

                    .setDescription(
                        "The verification code you entered was **incorrect**.\n\n" +
                        "Return to the server and press **Start Verification** to try again."
                    )

                    .setFooter({
                        text:
                            "Hendry County Project"
                    })

                    .setTimestamp();

            await message.reply({
                embeds: [
                    wrongEmbed
                ]
            });

            return;
        }

        // ==================================================
        // CORRECT!
        // ==================================================

        console.log(
            `[VERIFY] ✅ ${message.author.tag} entered the CORRECT CAPTCHA.`
        );

        // Delete immediately so CAPTCHA cannot be reused

        verificationSessions.delete(
            message.author.id
        );

        // ==================================================
        // GET SERVER
        // ==================================================

        const guild =
            await message.client.guilds.fetch(
                session.guildId
            );

        // ==================================================
        // GET MEMBER
        // ==================================================

        const member =
            await guild.members.fetch(
                message.author.id
            );

        // ==================================================
        // GET ROLE
        // ==================================================

        const role =
            await guild.roles.fetch(
                session.roleId
            );

        if (!role) {

            console.error(
                "[VERIFY] Verified role disappeared."
            );

            await message.reply({
                content:
                    "❌ The verified role could not be found. Please contact staff."
            });

            return;
        }

        // ==================================================
        // ASSIGN ROLE
        // ==================================================

        try {

            await member.roles.add(
                role,
                "Successfully completed HCP verification"
            );

        } catch (error) {

            console.error(
                "======================================"
            );

            console.error(
                "❌ ROLE ASSIGNMENT FAILED"
            );

            console.error(error);

            console.error(
                `User: ${message.author.tag}`
            );

            console.error(
                `Role: ${role.name}`
            );

            console.error(
                `Role ID: ${role.id}`
            );

            console.error(
                "======================================"
            );

            const errorEmbed =
                new EmbedBuilder()

                    .setColor("#ef4444")

                    .setTitle(
                        "⚠️ Verification Error"
                    )

                    .setDescription(
                        "Your verification code was **correct**, but I couldn't assign your verified role.\n\n" +
                        "Please contact a member of staff."
                    )

                    .setFooter({
                        text:
                            "Hendry County Project"
                    })

                    .setTimestamp();

            await message.reply({
                embeds: [
                    errorEmbed
                ]
            });

            return;
        }

        // ==================================================
        // SUCCESS
        // ==================================================

        const successEmbed =
            new EmbedBuilder()

                .setColor("#22c55e")

                .setTitle(
                    "✅ Verification Complete"
                )

                .setDescription(
                    "Your verification code was **correct**!\n\n" +
                    `You have successfully been verified and the **${role.name}** role has been added to your account.`
                )

                .setFooter({
                    text:
                        "Hendry County Project"
                })

                .setTimestamp();

        await message.reply({
            embeds: [
                successEmbed
            ]
        });

        console.log(
            "======================================"
        );

        console.log(
            "✅ VERIFICATION COMPLETE"
        );

        console.log(
            `User: ${message.author.tag}`
        );

        console.log(
            `Role: ${role.name}`
        );

        console.log(
            `Role ID: ${role.id}`
        );

        console.log(
            "======================================"
        );
    }
};

export default verificationCommand;