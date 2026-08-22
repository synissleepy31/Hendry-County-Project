import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_PATH = path.join(
    __dirname,
    "..",
    "data",
    "moderation-data.json"
);

function defaultData() {
    return {
        warnings: [],
        tempBans: [],
        blacklist: []
    };
}

function ensureFile() {
    const directory = path.dirname(DATA_PATH);

    if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, {
            recursive: true
        });
    }

    if (!fs.existsSync(DATA_PATH)) {
        fs.writeFileSync(
            DATA_PATH,
            JSON.stringify(
                defaultData(),
                null,
                4
            )
        );
    }
}

export function getModerationData() {
    ensureFile();

    try {
        const raw = fs.readFileSync(
            DATA_PATH,
            "utf8"
        );

        return JSON.parse(raw);

    } catch (error) {
        console.error(
            "[MODERATION STORE] Read error:",
            error
        );

        return defaultData();
    }
}

export function saveModerationData(data) {
    ensureFile();

    fs.writeFileSync(
        DATA_PATH,
        JSON.stringify(
            data,
            null,
            4
        )
    );
}

export function addWarning({
    guildId,
    userId,
    username,
    moderatorId,
    moderatorName,
    reason
}) {
    const data = getModerationData();

    const warning = {
        id: Date.now().toString(),
        guildId,
        userId,
        username,
        moderatorId,
        moderatorName,
        reason,
        createdAt: Date.now()
    };

    data.warnings.push(warning);

    saveModerationData(data);

    return warning;
}

export function getWarnings(
    guildId,
    userId
) {
    const data = getModerationData();

    return data.warnings.filter(
        warning =>
            warning.guildId === guildId &&
            warning.userId === userId
    );
}

export function addTempBan({
    guildId,
    userId,
    username,
    moderatorId,
    moderatorName,
    reason,
    expiresAt
}) {
    const data = getModerationData();

    data.tempBans = data.tempBans.filter(
        ban =>
            !(
                ban.guildId === guildId &&
                ban.userId === userId
            )
    );

    const tempBan = {
        id: Date.now().toString(),
        guildId,
        userId,
        username,
        moderatorId,
        moderatorName,
        reason,
        expiresAt,
        createdAt: Date.now()
    };

    data.tempBans.push(tempBan);

    saveModerationData(data);

    return tempBan;
}

export function removeTempBan(
    guildId,
    userId
) {
    const data = getModerationData();

    data.tempBans = data.tempBans.filter(
        ban =>
            !(
                ban.guildId === guildId &&
                ban.userId === userId
            )
    );

    saveModerationData(data);
}

export function addBlacklist({
    guildId,
    userId,
    username,
    moderatorId,
    moderatorName,
    reason
}) {
    const data = getModerationData();

    const existing =
        data.blacklist.find(
            entry =>
                entry.guildId === guildId &&
                entry.userId === userId
        );

    if (existing) {
        return existing;
    }

    const entry = {
        id: Date.now().toString(),
        guildId,
        userId,
        username,
        moderatorId,
        moderatorName,
        reason,
        createdAt: Date.now()
    };

    data.blacklist.push(entry);

    saveModerationData(data);

    return entry;
}

export function isBlacklisted(
    guildId,
    userId
) {
    const data = getModerationData();

    return data.blacklist.some(
        entry =>
            entry.guildId === guildId &&
            entry.userId === userId
    );
}