import {
    MessageFlags,
    EmbedBuilder,
    ModalBuilder,
    ActionRowBuilder,
    TextInputBuilder,
    TextInputStyle
} from "discord.js";


const ROLE_REQUEST_DEPARTMENTS = {

    CPD: {
        name:
            "Clewiston Police Department",

        highCommandRoleId:
            "1533639156230525070"
    },


    HCSO: {
        name:
            "Hendry County Sheriff's Office",

        highCommandRoleId:
            "1533639412481785987"
    },


    FHP: {
        name:
            "Florida Highway Patrol",

        highCommandRoleId:
            "1533631143784612073"
    }
};


export default {

    name: "interactionCreate",

    async execute(interaction) {

        // ======================================================
        // SLASH COMMAND
        // ======================================================

        if (
            interaction.isChatInputCommand()
        ) {

            const command =
                interaction.client.commands.get(
                    interaction.commandName
                );

            if (!command) {

                console.error(
                    `[COMMANDS] Command /${interaction.commandName} was not found.`
                );

                return;
            }

            try {

                await command.execute(
                    interaction
                );

            } catch (error) {

                console.error(
                    `[COMMANDS] Error running /${interaction.commandName}:`,
                    error
                );

                const response = {
                    content:
                        "❌ There was an error while running this command.",

                    flags:
                        MessageFlags.Ephemeral
                };

                if (
                    interaction.replied ||
                    interaction.deferred
                ) {

                    await interaction
                        .followUp(response)
                        .catch(() => {});

                } else {

                    await interaction
                        .reply(response)
                        .catch(() => {});
                }
            }

            return;
        }


        // ======================================================
        // BUTTON
        // ======================================================

        if (interaction.isButton()) {

            // ==================================================
            // VERIFICATION BUTTON
            // ==================================================

            if (
                interaction.customId ===
                "start_verification"
            ) {

                const command =
                    interaction.client.commands.get(
                        "verification-panel"
                    );

                if (!command) {

                    console.error(
                        "[VERIFY] verification-panel command was not loaded."
                    );

                    return;
                }

                if (
                    typeof command.handleButton !==
                    "function"
                ) {

                    console.error(
                        "[VERIFY] verification-panel.js does not contain handleButton()."
                    );

                    return;
                }

                try {

                    await command.handleButton(
                        interaction
                    );

                } catch (error) {

                    console.error(
                        "[VERIFY] Button error:",
                        error
                    );
                }

                return;
            }


            // ==================================================
            // ROLE REQUEST ACCEPT
            // ==================================================

            if (
                interaction.customId.startsWith(
                    "rolerequest_accept:"
                )
            ) {

                try {

                    const [
                        ,
                        requestId,
                        targetUserId,
                        requestedRoleId,
                        departmentKey
                    ] =
                        interaction.customId.split(
                            ":"
                        );


                    const department =
                        ROLE_REQUEST_DEPARTMENTS[
                            departmentKey
                        ];


                    if (!department) {

                        return interaction.reply({
                            content:
                                "❌ Invalid department.",

                            flags:
                                MessageFlags.Ephemeral
                        });
                    }


                    const reviewer =
                        await interaction.guild.members.fetch(
                            interaction.user.id
                        );


                    if (
                        !reviewer.roles.cache.has(
                            department.highCommandRoleId
                        )
                    ) {

                        return interaction.reply({
                            content:
                                "❌ You are not authorised to approve role requests for this department.",

                            flags:
                                MessageFlags.Ephemeral
                        });
                    }


                    const targetMember =
                        await interaction.guild.members.fetch(
                            targetUserId
                        ).catch(
                            () => null
                        );


                    const requestedRole =
                        await interaction.guild.roles.fetch(
                            requestedRoleId
                        ).catch(
                            () => null
                        );


                    if (
                        !targetMember ||
                        !requestedRole
                    ) {

                        return interaction.reply({
                            content:
                                "❌ The member or requested role could not be found.",

                            flags:
                                MessageFlags.Ephemeral
                        });
                    }


                    if (
                        requestedRole.managed ||
                        !requestedRole.editable
                    ) {

                        return interaction.reply({
                            content:
                                "❌ I cannot assign that role. Check the bot role hierarchy.",

                            flags:
                                MessageFlags.Ephemeral
                        });
                    }


                    if (
                        targetMember.roles.cache.has(
                            requestedRole.id
                        )
                    ) {

                        return interaction.reply({
                            content:
                                "❌ That user already has the requested role.",

                            flags:
                                MessageFlags.Ephemeral
                        });
                    }


                    await targetMember.roles.add(
                        requestedRole,
                        `Role request approved by ${interaction.user.tag}`
                    );


                    try {

                        const dmEmbed =
                            new EmbedBuilder()

                                .setColor(
                                    "#22c55e"
                                )

                                .setTitle(
                                    "✅ Role Request Approved"
                                )

                                .setDescription(
                                    `Your role request in **${interaction.guild.name}** has been approved.`
                                )

                                .addFields(

                                    {
                                        name:
                                            "Department",

                                        value:
                                            department.name
                                    },

                                    {
                                        name:
                                            "Role",

                                        value:
                                            requestedRole.name
                                    },

                                    {
                                        name:
                                            "Approved By",

                                        value:
                                            interaction.user.tag
                                    }
                                )

                                .setTimestamp();


                        await targetMember.send({
                            embeds: [
                                dmEmbed
                            ]
                        });

                    } catch {}


                    const originalEmbed =
                        interaction.message.embeds[0];


                    const approvedEmbed =
                        EmbedBuilder.from(
                            originalEmbed
                        )

                            .setColor(
                                "#22c55e"
                            )

                            .setTitle(
                                "✅ Role Request Approved"
                            )

                            .addFields({
                                name:
                                    "Decision",

                                value:
                                    `Approved by <@${interaction.user.id}>`
                            });


                    await interaction.message.edit({
                        embeds: [
                            approvedEmbed
                        ],

                        components: []
                    });


                    return interaction.reply({
                        content:
                            `✅ Approved. ${targetMember} has been given ${requestedRole}.`,

                        flags:
                            MessageFlags.Ephemeral
                    });


                } catch (error) {

                    console.error(
                        "[ROLE REQUEST] Accept error:",
                        error
                    );


                    if (
                        interaction.replied ||
                        interaction.deferred
                    ) {

                        return interaction.followUp({
                            content:
                                "❌ Something went wrong while approving this role request.",

                            flags:
                                MessageFlags.Ephemeral
                        });
                    }


                    return interaction.reply({
                        content:
                            "❌ Something went wrong while approving this role request.",

                        flags:
                            MessageFlags.Ephemeral
                    });
                }
            }


            // ==================================================
            // ROLE REQUEST DENY
            // ==================================================

            if (
                interaction.customId.startsWith(
                    "rolerequest_deny:"
                )
            ) {

                try {

                    const [
                        ,
                        requestId,
                        targetUserId,
                        requestedRoleId,
                        departmentKey
                    ] =
                        interaction.customId.split(
                            ":"
                        );


                    const department =
                        ROLE_REQUEST_DEPARTMENTS[
                            departmentKey
                        ];


                    if (!department) {

                        return interaction.reply({
                            content:
                                "❌ Invalid department.",

                            flags:
                                MessageFlags.Ephemeral
                        });
                    }


                    const reviewer =
                        await interaction.guild.members.fetch(
                            interaction.user.id
                        );


                    if (
                        !reviewer.roles.cache.has(
                            department.highCommandRoleId
                        )
                    ) {

                        return interaction.reply({
                            content:
                                "❌ You are not authorised to deny role requests for this department.",

                            flags:
                                MessageFlags.Ephemeral
                        });
                    }


                    const modal =
                        new ModalBuilder()

.setCustomId(
    `rrdeny:${targetUserId}:${requestedRoleId}:${departmentKey}`
)

                            .setTitle(
                                "Deny Role Request"
                            );


                    const denialReason =
                        new TextInputBuilder()

                            .setCustomId(
                                "denial_reason"
                            )

                            .setLabel(
                                "Reason for denial"
                            )

                            .setStyle(
                                TextInputStyle.Paragraph
                            )

                            .setPlaceholder(
                                "Explain why this role request is being denied..."
                            )

                            .setRequired(
                                true
                            )

                            .setMaxLength(
                                1000
                            );


                    modal.addComponents(

                        new ActionRowBuilder()
                            .addComponents(
                                denialReason
                            )
                    );


                    return interaction.showModal(
                        modal
                    );


                } catch (error) {

                    console.error(
                        "[ROLE REQUEST] Deny button error:",
                        error
                    );


                    if (
                        interaction.replied ||
                        interaction.deferred
                    ) {

                        return interaction.followUp({
                            content:
                                "❌ Something went wrong while opening the denial form.",

                            flags:
                                MessageFlags.Ephemeral
                        });
                    }


                    return interaction.reply({
                        content:
                            "❌ Something went wrong while opening the denial form.",

                        flags:
                            MessageFlags.Ephemeral
                    });
                }
            }


            return;
        }


        // ======================================================
        // MODAL SUBMIT
        // ======================================================

if (
    interaction.isModalSubmit() &&
    interaction.customId.startsWith(
        "rrdeny:"
    )
)
        {

            try {

const [
    ,
    targetUserId,
    requestedRoleId,
    departmentKey
] =
    interaction.customId.split(
        ":"
    );


                const department =
                    ROLE_REQUEST_DEPARTMENTS[
                        departmentKey
                    ];


                if (!department) {

                    return interaction.reply({
                        content:
                            "❌ Invalid department.",

                        flags:
                            MessageFlags.Ephemeral
                    });
                }


                const reviewer =
                    await interaction.guild.members.fetch(
                        interaction.user.id
                    );


                if (
                    !reviewer.roles.cache.has(
                        department.highCommandRoleId
                    )
                ) {

                    return interaction.reply({
                        content:
                            "❌ You are not authorised to deny role requests for this department.",

                        flags:
                            MessageFlags.Ephemeral
                    });
                }


                const denialReason =
                    interaction.fields.getTextInputValue(
                        "denial_reason"
                    );


                const targetMember =
                    await interaction.guild.members.fetch(
                        targetUserId
                    ).catch(
                        () => null
                    );


                const requestedRole =
                    await interaction.guild.roles.fetch(
                        requestedRoleId
                    ).catch(
                        () => null
                    );


                if (targetMember) {

                    try {

                        const dmEmbed =
                            new EmbedBuilder()

                                .setColor(
                                    "#ef4444"
                                )

                                .setTitle(
                                    "❌ Role Request Denied"
                                )

                                .setDescription(
                                    `Your role request in **${interaction.guild.name}** has been denied.`
                                )

                                .addFields(

                                    {
                                        name:
                                            "Department",

                                        value:
                                            department.name
                                    },

                                    {
                                        name:
                                            "Role",

                                        value:
                                            requestedRole
                                                ? requestedRole.name
                                                : "Unknown Role"
                                    },

                                    {
                                        name:
                                            "Reason",

                                        value:
                                            denialReason
                                    },

                                    {
                                        name:
                                            "Denied By",

                                        value:
                                            interaction.user.tag
                                    }
                                )

                                .setTimestamp();


                        await targetMember.send({
                            embeds: [
                                dmEmbed
                            ]
                        });

                    } catch {}
                }


                const requestChannel =
                    await interaction.guild.channels.fetch(
                        requestChannelId
                    ).catch(
                        () => null
                    );


                const requestMessage =
                    requestChannel &&
                    requestChannel.isTextBased()
                        ? await requestChannel.messages.fetch(
                            requestMessageId
                        ).catch(
                            () => null
                        )
                        : null;


                if (requestMessage) {

                    const originalEmbed =
                        requestMessage.embeds[0];


                    const deniedEmbed =
                        originalEmbed
                            ? EmbedBuilder.from(
                                originalEmbed
                            )
                            : new EmbedBuilder();


                    deniedEmbed
                        .setColor(
                            "#ef4444"
                        )

                        .setTitle(
                            "❌ Role Request Denied"
                        )

                        .addFields(

                            {
                                name:
                                    "Decision",

                                value:
                                    `Denied by <@${interaction.user.id}>`
                            },

                            {
                                name:
                                    "Denial Reason",

                                value:
                                    denialReason
                            }
                        );


                    await requestMessage.edit({
                        embeds: [
                            deniedEmbed
                        ],

                        components: []
                    });
                }


                return interaction.reply({
                    content:
                        "✅ Role request denied and the user has been notified.",

                    flags:
                        MessageFlags.Ephemeral
                });


            } catch (error) {

                console.error(
                    "[ROLE REQUEST] Denial modal error:",
                    error
                );


                if (
                    interaction.replied ||
                    interaction.deferred
                ) {

                    return interaction.followUp({
                        content:
                            "❌ Something went wrong while denying this role request.",

                        flags:
                            MessageFlags.Ephemeral
                    });
                }


                return interaction.reply({
                    content:
                        "❌ Something went wrong while denying this role request.",

                    flags:
                        MessageFlags.Ephemeral
                });
            }
        }
    }
};
