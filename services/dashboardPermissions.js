import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename =
    fileURLToPath(import.meta.url);

const __dirname =
    path.dirname(__filename);

const SETTINGS_PATH =
    path.join(
        __dirname,
        "..",
        "data",
        "dashboard-permissions.json"
    );


function defaults() {
    return {
        ownerUserIds: [],
        allowedUserIds: [],
        allowedRoleIds: [],

        sections: {
            bot: [],
            moderation: [],
            management: [],
            configuration: [],
            owner: []
        }
    };
}


function ensureFile() {
    const folder =
        path.dirname(
            SETTINGS_PATH
        );

    if (!fs.existsSync(folder)) {
        fs.mkdirSync(
            folder,
            {
                recursive: true
            }
        );
    }

    if (!fs.existsSync(SETTINGS_PATH)) {
        fs.writeFileSync(
            SETTINGS_PATH,
            JSON.stringify(
                defaults(),
                null,
                4
            )
        );
    }
}


export function getDashboardPermissions() {
    ensureFile();

    try {
        const saved =
            JSON.parse(
                fs.readFileSync(
                    SETTINGS_PATH,
                    "utf8"
                )
            );

        return {
            ...defaults(),
            ...saved,

            sections: {
                ...defaults().sections,
                ...(saved.sections || {})
            }
        };

    } catch (error) {
        console.error(
            "[DASHBOARD PERMISSIONS] Read error:",
            error
        );

        return defaults();
    }
}


export function saveDashboardPermissions(data) {
    ensureFile();

    fs.writeFileSync(
        SETTINGS_PATH,
        JSON.stringify(
            data,
            null,
            4
        )
    );
}