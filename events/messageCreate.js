export default {

    name: "messageCreate",

    async execute(message) {

        // Ignore bots
        if (message.author.bot) {
            return;
        }

        // We only care about DMs here
        if (message.guild !== null) {
            return;
        }

        console.log(
            `[MESSAGE CREATE] DM from ${message.author.tag}: ${message.content}`
        );

        const command =
            message.client.commands.get(
                "verification-panel"
            );

        if (!command) {

            console.error(
                "[MESSAGE CREATE] verification-panel command isn't loaded."
            );

            return;
        }

        if (
            typeof command.handleMessage !==
            "function"
        ) {

            console.error(
                "[MESSAGE CREATE] verification-panel.js doesn't have handleMessage()."
            );

            return;
        }

        try {

            await command.handleMessage(
                message
            );

        } catch (error) {

            console.error(
                "[MESSAGE CREATE] Verification DM error:",
                error
            );
        }
    }
};