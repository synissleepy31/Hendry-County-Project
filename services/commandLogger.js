import { EmbedBuilder } from "discord.js";
import { getDashboardSettings } from "./dashboardSettingsStore.js";

export const DEFAULT_COMMAND_LOG_CHANNEL_ID = "1570101352233697420";

function clip(value, limit = 1024) {
    const text = String(value ?? "").trim();
    return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

export async function sendCommandLog(client, { title, fields = [], description = "" }) {
    try {
        const channelId =
            getDashboardSettings().logChannelId || DEFAULT_COMMAND_LOG_CHANNEL_ID;
        const channel = await client.channels.fetch(channelId);
        if (!channel?.isTextBased() || typeof channel.send !== "function") {
            console.error(`[COMMAND LOG] Channel ${channelId} is unavailable or cannot accept messages.`);
            return;
        }

        const embed = new EmbedBuilder()
            .setColor("#ff8534")
            .setTitle(clip(title, 256))
            .setTimestamp()
            .setFooter({ text: "Hendry County Project • Command Log" });

        if (description) embed.setDescription(clip(description, 4096));
        if (fields.length) {
            embed.addFields(fields.slice(0, 25).map(field => ({
                name: clip(field.name, 256) || "Details",
                value: clip(field.value, 1024) || "—",
                inline: Boolean(field.inline)
            })));
        }

        await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    } catch (error) {
        console.error("[COMMAND LOG] Could not send command log:", error);
    }
}
