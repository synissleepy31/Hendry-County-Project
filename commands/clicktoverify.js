import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags
} from "discord.js";

const VERIFY_ROLE_ID = "1533590255624523830";
const VERIFY_EMOJI = "✅";
const VERIFY_MARKER = "click-to-verify";

export default {
    data: new SlashCommandBuilder()
        .setName("clicktoverify")
        .setDescription("Post a reaction based verification message.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        if (!interaction.guild || !interaction.channel) {
            return interaction.reply({
                content: "This command can only be used in a server channel.",
                flags: MessageFlags.Ephemeral
            });
        }

        try {
            const message = await interaction.channel.send({
                content: `React with ${VERIFY_EMOJI} to receive the verified role.`,
                embeds: [{
                    footer: { text: VERIFY_MARKER }
                }]
            });
            await message.react(VERIFY_EMOJI);

            await interaction.reply({
                content: "✅ Click to verify message posted.",
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            console.error("[CLICK TO VERIFY] Could not post verification message:", error);
            const response = {
                content: "I couldn't post or react to the verification message. Check my channel permissions.",
                flags: MessageFlags.Ephemeral
            };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(response).catch(() => {});
            } else {
                await interaction.reply(response).catch(() => {});
            }
        }
    }
};
