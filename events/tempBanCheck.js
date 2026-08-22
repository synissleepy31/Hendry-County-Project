import {
    getModerationData,
    removeTempBan
} from "../services/moderationStore.js";

async function checkTempBans(client) {
    const data =
        getModerationData();

    const now =
        Date.now();

    for (
        const tempBan
        of data.tempBans
    ) {
        if (
            tempBan.expiresAt >
            now
        ) {
            continue;
        }

        try {
            const guild =
                await client.guilds.fetch(
                    tempBan.guildId
                );

            await guild.members.unban(
                tempBan.userId,
                "Temporary ban expired"
            );

            console.log(
                `[TEMP BAN] Unbanned ${tempBan.username}.`
            );

        } catch (error) {
            // Unknown Ban means they're already unbanned.
            if (error?.code !== 10026) {
                console.error(
                    "[TEMP BAN] Unban error:",
                    error
                );

                continue;
            }
        }

        removeTempBan(
            tempBan.guildId,
            tempBan.userId
        );
    }
}

export default {
    name: "clientReady",
    once: true,

    async execute(client) {
        await checkTempBans(client);

        setInterval(
            () =>
                checkTempBans(client),

            60 * 1000
        );

        console.log(
            "✅ Temporary ban checker started."
        );
    }
};