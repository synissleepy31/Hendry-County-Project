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


try {

    console.log(
        "🧹 Clearing all global slash commands..."
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
        "✅ All global slash commands have been removed."
    );


} catch (error) {

    console.error(
        "❌ Failed to clear slash commands:",
        error
    );

}