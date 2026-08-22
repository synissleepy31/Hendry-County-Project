import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const DATA_DIRECTORY = path.join(
    __dirname,
    "..",
    "data"
);


const NEWS_FILE = path.join(
    DATA_DIRECTORY,
    "news.json"
);


function ensureNewsFile() {

    if (!fs.existsSync(DATA_DIRECTORY)) {
        fs.mkdirSync(
            DATA_DIRECTORY,
            {
                recursive: true
            }
        );
    }


    if (!fs.existsSync(NEWS_FILE)) {
        fs.writeFileSync(
            NEWS_FILE,
            "[]",
            "utf8"
        );
    }
}


export function getNewsPosts() {

    ensureNewsFile();

    try {

        const data = fs.readFileSync(
            NEWS_FILE,
            "utf8"
        );

        const posts = JSON.parse(data);

        if (!Array.isArray(posts)) {
            return [];
        }

        return posts;

    } catch (error) {

        console.error(
            "[NEWS] Failed to load news:",
            error
        );

        return [];
    }
}


export function saveNewsPosts(posts) {

    ensureNewsFile();

    fs.writeFileSync(
        NEWS_FILE,
        JSON.stringify(
            posts,
            null,
            4
        ),
        "utf8"
    );
}


export function getPublishedNews() {

    return getNewsPosts()
        .filter(post => post.published === true)
        .sort(
            (a, b) =>
                new Date(b.createdAt) -
                new Date(a.createdAt)
        );
}


export function getNewsPostBySlug(slug) {

    return getNewsPosts().find(
        post =>
            post.slug === slug &&
            post.published === true
    ) || null;
}


export function createNewsSlug(title) {

    return String(title)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-");
}