import {
    MessageFlags
} from "discord.js";

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
            }
        }
    }
};