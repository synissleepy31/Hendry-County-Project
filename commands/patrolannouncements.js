import {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    MessageFlags
} from "discord.js";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";


const __filename =
    fileURLToPath(import.meta.url);

const __dirname =
    path.dirname(__filename);


const SETTINGS_PATH =
    path.join(
        __dirname,
        "..",
        "data",
        "patrol-settings.json"
    );


const NUMBER_EMOJIS = [
    "1️⃣",
    "2️⃣",
    "3️⃣",
    "4️⃣",
    "5️⃣",
    "6️⃣",
    "7️⃣",
    "8️⃣",
    "9️⃣"
];


// ======================================================
// LOAD SETTINGS
// ======================================================

function getSettings() {

    try {

        return JSON.parse(
            fs.readFileSync(
                SETTINGS_PATH,
                "utf8"
            )
        );

    } catch (error) {

        console.error(
            "[PATROL] Failed to load settings:",
            error
        );

        return null;
    }
}


// ======================================================
// COMMAND
// ======================================================

export default {

    data:
        new SlashCommandBuilder()

            .setName(
                "patrolannouncements"
            )

            .setDescription(
                "Send a patrol announcement."
            )


            .addStringOption(option =>

                option
                    .setName("time")

                    .setDescription(
                        "Patrol time (example: 7:00)"
                    )

                    .setRequired(true)
            )


            .addStringOption(option =>

                option
                    .setName("ampm")

                    .setDescription(
                        "AM or PM"
                    )

                    .setRequired(true)

                    .addChoices(

                        {
                            name: "AM",
                            value: "AM"
                        },

                        {
                            name: "PM",
                            value: "PM"
                        }
                    )
            )


            .setDefaultMemberPermissions(
                PermissionFlagsBits.ManageGuild
            ),


    async execute(interaction) {

        try {

            // ==================================================
            // GET SETTINGS
            // ==================================================

            const settings =
                getSettings();


            if (!settings) {

                return interaction.reply({
                    content:
                        "❌ Patrol announcement settings could not be loaded.",

                    flags:
                        MessageFlags.Ephemeral
                });
            }


            // ==================================================
            // OPTIONS
            // ==================================================

            const time =
                interaction.options.getString(
                    "time",
                    true
                );


            const ampm =
                interaction.options.getString(
                    "ampm",
                    true
                );


            // ==================================================
            // VALIDATE TIME
            // ==================================================

            const timeRegex =
                /^(0?[1-9]|1[0-2]):[0-5][0-9]$/;


            if (
                !timeRegex.test(time)
            ) {

                return interaction.reply({

                    content:
                        "❌ Invalid time. Use a time like `7:00`, `8:30` or `11:45`.",

                    flags:
                        MessageFlags.Ephemeral
                });
            }


            // ==================================================
            // CHANNEL
            // ==================================================

            if (!settings.channelId) {

                return interaction.reply({

                    content:
                        "❌ No patrol announcement channel has been selected in the dashboard.",

                    flags:
                        MessageFlags.Ephemeral
                });
            }


            const channel =
                await interaction.guild.channels.fetch(
                    settings.channelId
                );


            if (
                !channel ||
                !channel.isTextBased()
            ) {

                return interaction.reply({

                    content:
                        "❌ The configured patrol announcement channel could not be found.",

                    flags:
                        MessageFlags.Ephemeral
                });
            }


            // ==================================================
            // ACKNOWLEDGE COMMAND
            // ==================================================

            await interaction.deferReply({
                flags:
                    MessageFlags.Ephemeral
            });


            // ==================================================
            // DESCRIPTION
            // ==================================================

            const description =
                String(
                    settings.description || ""
                )

                .replaceAll(
                    "{time}",
                    time
                )

                .replaceAll(
                    "{ampm}",
                    ampm
                );


            // ==================================================
            // PATROL AREAS
            // ==================================================

            const patrolAreas =
                Array.isArray(
                    settings.patrolAreas
                )

                    ? settings.patrolAreas

                    : [];


            const patrolAreaText =
                patrolAreas

                    .slice(0, 9)

                    .map(
                        (area, index) =>
                            `${NUMBER_EMOJIS[index]} **${area}**`
                    )

                    .join("\n");


            // ==================================================
            // BUILD EMBED
            // ==================================================

            const embed =
                new EmbedBuilder()

                    .setColor(
                        settings.color ||
                        "#ff8534"
                    )

                    .setTitle(
                        settings.title ||
                        "🚓 Patrol Announcement 🚓"
                    );


            let embedText =
                description;


            if (patrolAreaText) {

                embedText +=
                    `\n\n### 📍 Patrol Areas\n${patrolAreaText}`;
            }


            embedText +=
                `\n\n### 🚔 Patrol Information\n` +
                `🕐 **Time:** ${time} ${ampm} ${settings.timezone || "CST"}`;


            if (settings.cadMessage) {

                embedText +=
                    `\n\n${settings.cadMessage}`;
            }


            embedText +=
                `\n\n### 📋 Attendance\n` +

                `✅ **${settings.attendanceYes || "Yes"}**\n` +

                `❓ **${settings.attendanceMaybe || "Maybe / Late"}**\n` +

                `❌ **${settings.attendanceNo || "No"}**`;


            if (settings.addReactions) {

                embedText +=
                    "\n\nReact below with your **attendance** and **patrol area**.";
            }


            embed.setDescription(
                embedText
            );


            if (settings.footer) {

                embed.setFooter({
                    text:
                        settings.footer
                });
            }


            if (
                settings.showTimestamp
            ) {

                embed.setTimestamp();
            }


            // ==================================================
            // ROLE PING
            // ==================================================

            let messageContent = "";

            const allowedRoles = [];


            if (
                settings.pingRole &&
                settings.roleId
            ) {

                const role =
                    interaction.guild.roles.cache.get(
                        settings.roleId
                    );


                if (role) {

                    messageContent =
                        `<@&${role.id}>`;

                    allowedRoles.push(
                        role.id
                    );
                }
            }


            // ==================================================
            // SEND
            // ==================================================

            const patrolMessage =
                await channel.send({

                    content:
                        messageContent || undefined,

                    embeds: [
                        embed
                    ],

                    allowedMentions: {
                        roles:
                            allowedRoles
                    }
                });


            // ==================================================
            // REACTIONS
            // ==================================================

            if (
                settings.addReactions
            ) {

                const reactions = [
                    "✅",
                    "❓",
                    "❌",

                    ...NUMBER_EMOJIS.slice(
                        0,
                        patrolAreas.length
                    )
                ];


                for (
                    const reaction
                    of reactions
                ) {

                    try {

                        await patrolMessage.react(
                            reaction
                        );

                    } catch (error) {

                        console.error(
                            `[PATROL] Reaction ${reaction} failed:`,
                            error
                        );
                    }
                }
            }


            // ==================================================
            // COMPLETE
            // ==================================================

            await interaction.editReply({

                content:
                    `✅ Patrol announcement sent in <#${channel.id}> for **${time} ${ampm} ${settings.timezone || "CST"}**.`
            });


            console.log(
                "======================================"
            );

            console.log(
                "🚓 PATROL ANNOUNCEMENT SENT"
            );

            console.log(
                `Time: ${time} ${ampm} ${settings.timezone || "CST"}`
            );

            console.log(
                `Channel: #${channel.name}`
            );

            console.log(
                `Sent by: ${interaction.user.tag}`
            );

            console.log(
                "======================================"
            );

        } catch (error) {

            console.error(
                "[PATROL] Command error:",
                error
            );


            if (
                interaction.deferred ||
                interaction.replied
            ) {

                await interaction
                    .editReply({
                        content:
                            "❌ Failed to send the patrol announcement."
                    })
                    .catch(() => {});

            } else {

                await interaction
                    .reply({

                        content:
                            "❌ Failed to send the patrol announcement.",

                        flags:
                            MessageFlags.Ephemeral
                    })

                    .catch(() => {});
            }
        }
    }
};