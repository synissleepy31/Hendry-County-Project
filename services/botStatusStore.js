import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename =
    fileURLToPath(import.meta.url);

const __dirname =
    path.dirname(__filename);

const DATA_DIR =
    path.join(
        __dirname,
        "..",
        "data"
    );

const STATUS_FILE =
    path.join(
        DATA_DIR,
        "bot-status.json"
    );


function ensureDataDir() {
    fs.mkdirSync(
        DATA_DIR,
        {
            recursive: true
        }
    );
}


function defaults() {
    return {
        status: "online",
        activityType: "Watching",
        activityText: "Hendry County Project"
    };
}


export function getBotStatusSettings() {
    try {
        ensureDataDir();

        if (!fs.existsSync(STATUS_FILE)) {
            fs.writeFileSync(
                STATUS_FILE,
                JSON.stringify(
                    defaults(),
                    null,
                    4
                )
            );

            return defaults();
        }

        return {
            ...defaults(),

            ...JSON.parse(
                fs.readFileSync(
                    STATUS_FILE,
                    "utf8"
                )
            )
        };

    } catch (error) {
        console.error(
            "[BOT STATUS STORE] Read error:",
            error
        );

        return defaults();
    }
}


export function saveBotStatusSettings(
    settings
) {
    ensureDataDir();

    fs.writeFileSync(
        STATUS_FILE,
        JSON.stringify(
            settings,
            null,
            4
        )
    );

    return settings;
}