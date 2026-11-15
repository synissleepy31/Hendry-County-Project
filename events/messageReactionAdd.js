import { Events } from "discord.js";

const VERIFY_ROLE_ID = "1533590255624523830";
const VERIFY_EMOJI = "✅";
const VERIFY_DESCRIPTION =
    `React with ${VERIFY_EMOJI} below to begin verification.\n\n` +
    "You will receive the verified role once you react.";

export default {
    name: Events.MessageReactionAdd,

    async execute(reaction, user) {
        if (user.bot || reaction.emoji.name !== VERIFY_EMOJI) return;

        try {
            if (reaction.partial) await reaction.fetch();
            const message = reaction.message;
            if (message.partial) await message.fetch();
            if (!message.guild || message.author?.id !== message.client.user.id) return;
            if (!message.embeds.some(embed =>
                embed.title === "✅ Verification Panel" &&
                embed.description === VERIFY_DESCRIPTION
            )) return;

            const member = await message.guild.members.fetch(user.id);
            const role = await message.guild.roles.fetch(VERIFY_ROLE_ID);
            if (!role) {
                console.error(`[CLICK TO VERIFY] Role ${VERIFY_ROLE_ID} was not found.`);
                return;
            }
            if (!member.roles.cache.has(VERIFY_ROLE_ID)) {
                await member.roles.add(role, "Reacted to the click to verify message");
            }
        } catch (error) {
            console.error("[CLICK TO VERIFY] Failed to assign verification role:", error);
        }
    }
};
