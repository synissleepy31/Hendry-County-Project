import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function loadEvents(client) {
    const eventsPath = path.join(__dirname, "..", "events");

    const eventFiles = fs
        .readdirSync(eventsPath)
        .filter(file => file.endsWith(".js"));

    for (const file of eventFiles) {
        const event = await import(`file://${path.join(eventsPath, file)}`);

        if (event.default.once) {
            client.once(event.default.name, (...args) =>
                event.default.execute(...args)
            );
        } else {
            client.on(event.default.name, (...args) =>
                event.default.execute(...args)
            );
        }
    }

    console.log(`✅ Loaded ${eventFiles.length} event(s).`);
}