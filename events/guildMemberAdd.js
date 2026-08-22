import {
    AttachmentBuilder,
    EmbedBuilder
} from "discord.js";

import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";


const __filename =
    fileURLToPath(import.meta.url);

const __dirname =
    path.dirname(__filename);


// ======================================================
// FILES
// ======================================================

const TEMPLATE_PATH =
    path.join(
        __dirname,
        "..",
        "assets",
        "welcome",
        "template.png"
    );


const USERNAME_FONT_PATH =
    path.join(
        __dirname,
        "..",
        "assets",
        "welcome",
        "username.otf"
    );


const SETTINGS_PATH =
    path.join(
        __dirname,
        "..",
        "data",
        "welcome-settings.json"
    );


// ======================================================
// SETTINGS
// ======================================================

function getWelcomeSettings() {

    const defaults = {

        enabled:
            true,

        channelId:
            "",

        embedColor:
            "#ff8534",

        embedTitle:
            "Welcome {username}",

        embedDescription:
            "Welcome **{mention}**! You are our **{memberNumber} Member**. Please look around and talk to some of our members.",

        embedFooter:
            "Hendry County Project",

        showTimestamp:
            true,

        showImage:
            true,

        avatarX:
            107,

        avatarY:
            99,

        avatarSize:
            245,

        usernameX:
            450,

        usernameY:
            225,

        usernameFontSize:
            42,

        pingUser:
            true
    };


    try {

        if (
            !fs.existsSync(
                SETTINGS_PATH
            )
        ) {
            return defaults;
        }


        const saved =
            JSON.parse(
                fs.readFileSync(
                    SETTINGS_PATH,
                    "utf8"
                )
            );


        return {
            ...defaults,
            ...saved
        };


    } catch (error) {

        console.error(
            "[WELCOME] Could not load settings:",
            error
        );

        return defaults;
    }
}


// ======================================================
// XML ESCAPE
// ======================================================

function escapeXML(text) {

    return String(text)

        .replaceAll(
            "&",
            "&amp;"
        )

        .replaceAll(
            "<",
            "&lt;"
        )

        .replaceAll(
            ">",
            "&gt;"
        )

        .replaceAll(
            '"',
            "&quot;"
        )

        .replaceAll(
            "'",
            "&apos;"
        );
}


// ======================================================
// FONT
// ======================================================

function getUsernameFontBase64() {

    if (
        !fs.existsSync(
            USERNAME_FONT_PATH
        )
    ) {
        throw new Error(
            `Username font not found: ${USERNAME_FONT_PATH}`
        );
    }


    return fs
        .readFileSync(
            USERNAME_FONT_PATH
        )
        .toString(
            "base64"
        );
}


// ======================================================
// AVATAR
// ======================================================

async function createAvatar(
    member,
    avatarSize
) {

    const avatarURL =
        member.user.displayAvatarURL({
            extension:
                "png",

            size:
                512,

            forceStatic:
                true
        });


    const response =
        await fetch(
            avatarURL
        );


    if (!response.ok) {
        throw new Error(
            `Failed to download avatar: ${response.status}`
        );
    }


    const avatarBuffer =
        Buffer.from(
            await response.arrayBuffer()
        );


    const circleMask =
        Buffer.from(`
            <svg
                width="${avatarSize}"
                height="${avatarSize}"
                xmlns="http://www.w3.org/2000/svg"
            >
                <circle
                    cx="${avatarSize / 2}"
                    cy="${avatarSize / 2}"
                    r="${avatarSize / 2}"
                    fill="white"
                />
            </svg>
        `);


    return sharp(
        avatarBuffer
    )

        .resize(
            avatarSize,
            avatarSize,
            {
                fit:
                    "cover",

                position:
                    "centre"
            }
        )

        .composite([
            {
                input:
                    circleMask,

                blend:
                    "dest-in"
            }
        ])

        .png()

        .toBuffer();
}


// ======================================================
// USERNAME IMAGE
// ======================================================

function createUsernameSVG(
    username,
    requestedFontSize
) {

    let displayName =
        username;


    if (
        displayName.length > 24
    ) {
        displayName =
            displayName.substring(
                0,
                21
            ) + "...";
    }


    const safeName =
        escapeXML(
            displayName
        );


    let fontSize =
        requestedFontSize;


    if (
        displayName.length > 14
    ) {
        fontSize *= 0.9;
    }


    if (
        displayName.length > 18
    ) {
        fontSize *= 0.8;
    }


    if (
        displayName.length > 22
    ) {
        fontSize *= 0.7;
    }


    fontSize =
        Math.round(
            fontSize
        );


    const fontBase64 =
        getUsernameFontBase64();


    return Buffer.from(`
        <svg
            width="700"
            height="100"
            xmlns="http://www.w3.org/2000/svg"
        >

            <style>

                @font-face {
                    font-family:
                        "HCPUsername";

                    src:
                        url("data:font/otf;base64,${fontBase64}");
                }


                .username {
                    font-family:
                        "HCPUsername";

                    font-size:
                        ${fontSize}px;

                    font-weight:
                        900;

                    fill:
                        white;

                    stroke:
                        white;

                    stroke-width:
                        0.8px;

                    paint-order:
                        stroke fill;
                }

            </style>


            <text
                class="username"
                x="0"
                y="${fontSize + 7}"
                text-anchor="start"
            >
                ${safeName}
            </text>

        </svg>
    `);
}


// ======================================================
// IMAGE
// ======================================================

async function createWelcomeImage(
    member,
    settings
) {

    if (
        !fs.existsSync(
            TEMPLATE_PATH
        )
    ) {
        throw new Error(
            `Welcome template not found: ${TEMPLATE_PATH}`
        );
    }


    const avatar =
        await createAvatar(
            member,
            settings.avatarSize
        );


    const displayName =
        member.displayName ||
        member.user.globalName ||
        member.user.username;


    const usernameGraphic =
        createUsernameSVG(
            displayName,
            settings.usernameFontSize
        );


    return sharp(
        TEMPLATE_PATH
    )

        .composite([
            {
                input:
                    avatar,

                left:
                    settings.avatarX,

                top:
                    settings.avatarY
            },

            {
                input:
                    usernameGraphic,

                left:
                    settings.usernameX,

                top:
                    settings.usernameY
            }
        ])

        .png()

        .toBuffer();
}


// ======================================================
// MEMBER NUMBER
// ======================================================

function ordinal(number) {

    const remainder100 =
        number % 100;


    if (
        remainder100 >= 11 &&
        remainder100 <= 13
    ) {
        return `${number}th`;
    }


    switch (
        number % 10
    ) {

        case 1:
            return `${number}st`;

        case 2:
            return `${number}nd`;

        case 3:
            return `${number}rd`;

        default:
            return `${number}th`;
    }
}


// ======================================================
// VARIABLES
// ======================================================

function replaceVariables(
    text,
    member,
    displayName,
    memberPosition
) {

    return String(
        text || ""
    )

        .replaceAll(
            "{username}",
            displayName
        )

        .replaceAll(
            "{mention}",
            `<@${member.id}>`
        )

        .replaceAll(
            "{memberNumber}",
            memberPosition
        );
}


// ======================================================
// EVENT
// ======================================================

export default {

    name:
        "guildMemberAdd",


    async execute(member) {

        try {

            console.log(
                `[WELCOME] ${member.user.tag} joined the server.`
            );


            const settings =
                getWelcomeSettings();


            // Disabled

            if (
                !settings.enabled
            ) {

                console.log(
                    "[WELCOME] Welcome system is disabled."
                );

                return;
            }


            // Channel

            if (
                !settings.channelId
            ) {

                console.error(
                    "[WELCOME] No welcome channel configured."
                );

                return;
            }


            const channel =
                await member.guild.channels.fetch(
                    settings.channelId
                )
                .catch(
                    () => null
                );


            if (
                !channel ||
                !channel.isTextBased()
            ) {

                console.error(
                    `[WELCOME] Channel ${settings.channelId} was not found or isn't text based.`
                );

                return;
            }


            // Member count

            const memberNumber =
                member.guild.memberCount;


            const memberPosition =
                ordinal(
                    memberNumber
                );


            // Username

            const displayName =
                member.displayName ||
                member.user.globalName ||
                member.user.username;


            // Embed

            const embed =
                new EmbedBuilder()

                    .setColor(
                        settings.embedColor ||
                        "#ff8534"
                    )

                    .setTitle(
                        replaceVariables(
                            settings.embedTitle,
                            member,
                            displayName,
                            memberPosition
                        )
                    )

                    .setDescription(
                        replaceVariables(
                            settings.embedDescription,
                            member,
                            displayName,
                            memberPosition
                        )
                    );


            // Footer

            if (
                settings.embedFooter
            ) {

                embed.setFooter({
                    text:
                        settings.embedFooter
                });
            }


            // Timestamp

            if (
                settings.showTimestamp
            ) {

                embed.setTimestamp();
            }


            // Image

            const files = [];


            if (
                settings.showImage
            ) {

                const welcomeImage =
                    await createWelcomeImage(
                        member,
                        settings
                    );


                const attachment =
                    new AttachmentBuilder(
                        welcomeImage,
                        {
                            name:
                                "hcp-welcome.png"
                        }
                    );


                files.push(
                    attachment
                );


                embed.setImage(
                    "attachment://hcp-welcome.png"
                );
            }


            // Send

            await channel.send({

                embeds: [
                    embed
                ],

                files,

                allowedMentions: {

                    users:
                        settings.pingUser
                            ? [member.id]
                            : []
                }
            });


            console.log(
                `[WELCOME] Successfully welcomed ${member.user.tag}.`
            );


            console.log(
                `[WELCOME] Member position: ${memberPosition}`
            );


        } catch (error) {

            console.error(
                "[WELCOME] Error creating welcome message:",
                error
            );
        }
    }
};