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

const SETTINGS_FILE =
    path.join(
        DATA_DIR,
        "dashboard-settings.json"
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
        dashboardTitle:
            "Hendry County Project",

        embedColor:
            "#ff7d28",

        defaultFooter:
            "Hendry County Project",

        logChannelId:
            "1570101352233697420",

        timezone:
            "Europe/London",

        maintenanceMode:
            false
    };
}


export function getDashboardSettings() {
    try {
        ensureDataDir();

        if (!fs.existsSync(SETTINGS_FILE)) {
            fs.writeFileSync(
                SETTINGS_FILE,
                JSON.stringify(
                    defaults(),
                    null,
                    4
                )
            );

            return defaults();
        }

        const saved = JSON.parse(
            fs.readFileSync(
                SETTINGS_FILE,
                "utf8"
            )
        );

        return {
            ...defaults(),
            ...saved,
            logChannelId:
                saved.logChannelId || defaults().logChannelId
        };

    } catch (error) {
        console.error(
            "[DASHBOARD SETTINGS] Read error:",
            error
        );

        return defaults();
    }
}


export function saveDashboardSettings(
    settings
) {
    ensureDataDir();

    fs.writeFileSync(
        SETTINGS_FILE,
        JSON.stringify(
            settings,
            null,
            4
        )
    );

    return settings;
}
