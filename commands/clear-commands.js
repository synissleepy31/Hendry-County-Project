import "dotenv/config";

import {
    REST,
    Routes
} from "discord.js";


const rest =
    new REST({
        version: "10"
    }).setToken(
        process.env.DISCORD_TOKEN
    );


async function clearCommands() {

    try {

        console.log(
            "🧹 Clearing GLOBAL slash commands..."
        );


        await rest.put(
            Routes.applicationCommands(
                process.env.CLIENT_ID
            ),
            {
                body: []
            }
        );


        console.log(
            "✅ Global slash commands cleared."
        );


        console.log(
            "🧹 Clearing SERVER slash commands..."
        );


        await rest.put(
            Routes.applicationGuildCommands(
                process.env.CLIENT_ID,
                process.env.GUILD_ID
            ),
            {
                body: []
            }
        );


        console.log(
            "✅ Server slash commands cleared."
        );


        console.log(
            "======================================"
        );

        console.log(
            "✅ ALL COMMANDS HAVE BEEN CLEARED"
        );

        console.log(
            "======================================"
        );


    } catch (error) {

        console.error(
            "❌ Failed to clear commands:",
            error
        );
    }
}


clearCommands();