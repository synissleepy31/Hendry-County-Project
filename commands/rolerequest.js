import {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} from "discord.js";


const ROLE_REQUEST_DEPARTMENTS = {

    CPD: {
        name:
            "Clewiston Police Department",

        channelId:
            "1533671125060419745",

        highCommandRoleId:
            "1533639156230525070"
    },


    HCSO: {
        name:
            "Hendry County Sheriff's Office",

        channelId:
            "1533936099771027506",

        highCommandRoleId:
            "1533639412481785987"
    },


    FHP: {
        name:
            "Florida Highway Patrol",

        channelId:
            "1534674035663835206",

        highCommandRoleId:
            "1533631143784612073"
    }
};


const data =
    new SlashCommandBuilder()

        .setName(
            "rolerequest"
        )

        .setDescription(
            "Request a Discord role from your department."
        )


        // ==================================================
        // ROLE PICKER
        // ==================================================

        .addRoleOption(option =>

            option
                .setName(
                    "role"
                )

                .setDescription(
                    "Select the role you are requesting."
                )

                .setRequired(
                    true
                )
        )


        // ==================================================
        // DEPARTMENT
        // ==================================================

        .addStringOption(option =>

            option
                .setName(
                    "department"
                )

                .setDescription(
                    "Select the department this role request is for."
                )

                .setRequired(
                    true
                )

                .addChoices(

                    {
                        name:
                            "Clewiston Police Department (CPD)",

                        value:
                            "CPD"
                    },

                    {
                        name:
                            "Hendry County Sheriff's Office (HCSO)",

                        value:
                            "HCSO"
                    },

                    {
                        name:
                            "Florida Highway Patrol (FHP)",

                        value:
                            "FHP"
                    }
                )
        )


        // ==================================================
        // REASON
        // ==================================================

        .addStringOption(option =>

            option
                .setName(
                    "reason"
                )

                .setDescription(
                    "Why are you requesting this role?"
                )

                .setRequired(
                    true
                )

                .setMaxLength(
                    1000
                )
        );



async function execute(interaction) {

    try {

        const requestedRole =
            interaction.options.getRole(
                "role"
            );


        const departmentKey =
            interaction.options.getString(
                "department"
            );


        const reason =
            interaction.options.getString(
                "reason"
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


        // ==================================================
        // BASIC ROLE SAFETY
        // ==================================================

        if (
            requestedRole.id ===
            interaction.guild.id
        ) {

            return interaction.reply({
                content:
                    "❌ You cannot request the @everyone role.",

                flags:
                    MessageFlags.Ephemeral
            });
        }


        if (
            requestedRole.managed
        ) {

            return interaction.reply({
                content:
                    "❌ That role is managed by a bot or integration and cannot be requested.",

                flags:
                    MessageFlags.Ephemeral
            });
        }


        if (
            interaction.member.roles.cache.has(
                requestedRole.id
            )
        ) {

            return interaction.reply({
                content:
                    "❌ You already have that role.",

                flags:
                    MessageFlags.Ephemeral
            });
        }


        // ==================================================
        // REQUEST CHANNEL
        // ==================================================

        const channel =
            await interaction.guild.channels.fetch(
                department.channelId
            );


        if (
            !channel ||
            !channel.isTextBased()
        ) {

            return interaction.reply({
                content:
                    "❌ The role request channel for that department could not be found.",

                flags:
                    MessageFlags.Ephemeral
            });
        }


        // ==================================================
        // REQUEST ID
        // ==================================================

        const requestId =
            `${interaction.user.id}-${Date.now()}`;


        // ==================================================
        // REQUEST EMBED
        // ==================================================

        const requestEmbed =
            new EmbedBuilder()

                .setColor(
                    "#ff8534"
                )

                .setTitle(
                    "📋 New Role Request"
                )

                .setDescription(
                    "A new department role request has been submitted."
                )

                .addFields(

                    {
                        name:
                            "User",

                        value:
                            `<@${interaction.user.id}>`,

                        inline:
                            true
                    },

                    {
                        name:
                            "Department",

                        value:
                            department.name,

                        inline:
                            true
                    },

                    {
                        name:
                            "Requested Role",

                        value:
                            `<@&${requestedRole.id}>`,

                        inline:
                            true
                    },

                    {
                        name:
                            "Reason",

                        value:
                            reason
                    }
                )

                .setThumbnail(
                    interaction.user.displayAvatarURL({
                        size: 256
                    })
                )

                .setFooter({
                    text:
                        `Hendry County Project • Request ID: ${requestId}`
                })

                .setTimestamp();


        // ==================================================
        // BUTTONS
        // ==================================================

        const buttons =
            new ActionRowBuilder()

                .addComponents(

                    new ButtonBuilder()

                        .setCustomId(
                            `rolerequest_accept:${requestId}:${interaction.user.id}:${requestedRole.id}:${departmentKey}`
                        )

                        .setLabel(
                            "Accept"
                        )

                        .setEmoji(
                            "✅"
                        )

                        .setStyle(
                            ButtonStyle.Success
                        ),


                    new ButtonBuilder()

                        .setCustomId(
                            `rolerequest_deny:${requestId}:${interaction.user.id}:${requestedRole.id}:${departmentKey}`
                        )

                        .setLabel(
                            "Deny"
                        )

                        .setEmoji(
                            "❌"
                        )

                        .setStyle(
                            ButtonStyle.Danger
                        )
                );


        // ==================================================
        // SEND REQUEST
        // ==================================================

        await channel.send({

            content:
                `<@&${department.highCommandRoleId}>`,

            embeds: [
                requestEmbed
            ],

            components: [
                buttons
            ],

            allowedMentions: {
                roles: [
                    department.highCommandRoleId
                ]
            }
        });


        // ==================================================
        // USER CONFIRMATION
        // ==================================================

        return interaction.reply({

            content:
                `✅ Your request for ${requestedRole} has been sent to **${department.name} High Command**.`,

            flags:
                MessageFlags.Ephemeral
        });


    } catch (error) {

        console.error(
            "[ROLE REQUEST] Command error:",
            error
        );


        if (
            interaction.replied ||
            interaction.deferred
        ) {

            return interaction.followUp({
                content:
                    "❌ Something went wrong while submitting your role request.",

                flags:
                    MessageFlags.Ephemeral
            });
        }


        return interaction.reply({
            content:
                "❌ Something went wrong while submitting your role request.",

            flags:
                MessageFlags.Ephemeral
        });
    }
}


export default {
    data,
    execute
};