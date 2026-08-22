import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename =
    fileURLToPath(import.meta.url);

const __dirname =
    path.dirname(__filename);

const DATA_DIR =
    path.join(__dirname, "..", "data");

const SETTINGS_FILE =
    path.join(DATA_DIR, "role-management.json");

const AUDIT_FILE =
    path.join(DATA_DIR, "role-audit-log.json");

function ensureDataDir() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(file, fallback) {
    try {
        if (!fs.existsSync(file)) {
            return fallback;
        }

        return JSON.parse(
            fs.readFileSync(file, "utf8")
        );

    } catch (error) {
        console.error(
            `[ROLE STORE] Could not read ${file}:`,
            error
        );

        return fallback;
    }
}

function writeJson(file, value) {
    ensureDataDir();

    fs.writeFileSync(
        file,
        JSON.stringify(value, null, 4)
    );
}

export function getRoleManagementSettings() {
    const data =
        readJson(
            SETTINGS_FILE,
            { manageableRoleIds: [] }
        );

    return {
        manageableRoleIds:
            Array.isArray(data.manageableRoleIds)
                ? data.manageableRoleIds.map(String)
                : []
    };
}

export function saveRoleManagementSettings(settings) {
    const clean = {
        manageableRoleIds:
            Array.isArray(settings.manageableRoleIds)
                ? [
                    ...new Set(
                        settings.manageableRoleIds.map(String)
                    )
                ]
                : []
    };

    writeJson(SETTINGS_FILE, clean);

    return clean;
}

export function getRoleAuditLog() {
    const data = readJson(AUDIT_FILE, []);

    return Array.isArray(data)
        ? data
        : [];
}

export function addRoleAuditEntry(entry) {
    const log = getRoleAuditLog();

    const record = {
        id:
            `${Date.now()}-${Math.random()
                .toString(36)
                .slice(2, 8)}`,
        timestamp:
            new Date().toISOString(),
        ...entry
    };

    log.unshift(record);

    writeJson(
        AUDIT_FILE,
        log.slice(0, 500)
    );

    return record;
}
