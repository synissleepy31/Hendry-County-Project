import { EmbedBuilder } from "discord.js";
import { getDashboardSettings } from "./dashboardSettingsStore.js";

export const DEFAULT_COMMAND_LOG_CHANNEL_ID = "1570101352233697420";
let lastLogFailureNoticeAt = 0;

function clip(value, limit = 1024) {
    const text = String(value ?? "").trim();
    return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

export async function sendCommandLog(client, { title, fields = [], description = "" }) {
    const configuredChannelId =
        getDashboardSettings().logChannelId || DEFAULT_COMMAND_LOG_CHANNEL_ID;
    const channelIds = [...new Set([
        configuredChannelId,
        DEFAULT_COMMAND_LOG_CHANNEL_ID
    ])];

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

    for (const channelId of channelIds) {
        try {
            const channel = await client.channels.fetch(channelId);
            if (!channel?.isTextBased() || typeof channel.send !== "function") continue;
            await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
            return;
        } catch {
            // Try the configured channel first, then the known default channel.
        }
    }

    if (Date.now() - lastLogFailureNoticeAt > 60_000) {
        console.warn("[COMMAND LOG] Could not access either configured or default log channel; check the bot's channel permissions.");
        lastLogFailureNoticeAt = Date.now();
    }
}
