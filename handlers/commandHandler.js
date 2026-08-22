import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { REST, Routes } from "discord.js";

export async function loadCommands(client) {
    console.log("[COMMANDS] Loading slash commands...");

    const commandsPath = path.join(
        process.cwd(),
        "commands"
    );

    if (!fs.existsSync(commandsPath)) {
        console.error(
            `[COMMANDS] Commands folder not found: ${commandsPath}`
        );

        return;
    }

    const commandFiles = fs
        .readdirSync(commandsPath)
        .filter(file => file.endsWith(".js"));

    const commandsJSON = [];

    for (const file of commandFiles) {
        try {
            const filePath = path.join(
                commandsPath,
                file
            );

            const commandModule = await import(
                pathToFileURL(filePath).href
            );

            const command = commandModule.default;

            if (
                !command?.data ||
                typeof command.execute !== "function"
            ) {
                console.warn(
                    `[COMMANDS] Skipping invalid command: ${file}`
                );

                continue;
            }

            client.commands.set(
                command.data.name,
                command
            );

            commandsJSON.push(
                command.data.toJSON()
            );

            console.log(
                `✅ Loaded command: /${command.data.name}`
            );

        } catch (error) {
            console.error(
                `❌ Failed to load command ${file}:`,
                error
            );
        }
    }

    const rest = new REST({
        version: "10"
    }).setToken(
        process.env.DISCORD_TOKEN
    );

    try {
        console.log(
            `[COMMANDS] Registering ${commandsJSON.length} command(s)...`
        );

        await rest.put(
            Routes.applicationCommands(
                process.env.CLIENT_ID
            ),
            {
                body: commandsJSON
            }
        );

        console.log(
            `✅ Registered ${commandsJSON.length} slash command(s).`
        );

    } catch (error) {
        console.error(
            "❌ Failed to register slash commands:",
            error
        );
    }
}