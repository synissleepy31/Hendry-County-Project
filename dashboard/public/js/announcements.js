const get = id =>
    document.getElementById(id);


const fields = {

    channel:
        get("announcementChannel"),

    role:
        get("announcementRole"),

    title:
        get("announcementTitle"),

    description:
        get("announcementDescription"),

    color:
        get("announcementColor"),

    colorPicker:
        get("announcementColorPicker"),

    footer:
        get("announcementFooter"),

    image:
        get("announcementImage"),

    thumbnail:
        get("announcementThumbnail"),

    timestamp:
        get("announcementTimestamp")
};


// ======================================================
// PREVIEW
// ======================================================

function updateAnnouncementPreview() {

    const embed =
        get("previewAnnouncementEmbed");


    const title =
        fields.title.value.trim() ||
        "Server Announcement";


    const description =
        fields.description.value.trim() ||
        "Your announcement preview will appear here.";


    get("previewAnnouncementTitle")
        .textContent =
        title;


    get("previewAnnouncementDescription")
        .textContent =
        description;


    get("previewAnnouncementFooter")
        .textContent =
        fields.footer.value.trim();


    if (
        /^#[0-9A-Fa-f]{6}$/.test(
            fields.color.value
        )
    ) {

        embed.style.borderLeftColor =
            fields.color.value;
    }


    // Role ping preview

    const selectedRole =
        fields.role.options[
            fields.role.selectedIndex
        ];


    const ping =
        get("previewAnnouncementPing");


    if (
        selectedRole &&
        selectedRole.value
    ) {

        ping.style.display =
            "inline-block";

        ping.textContent =
            selectedRole.textContent.trim();

    } else {

        ping.style.display =
            "none";
    }


    // Thumbnail

    const thumbnail =
        get("previewAnnouncementThumbnail");


    if (
        fields.thumbnail.value.trim()
    ) {

        thumbnail.src =
            fields.thumbnail.value.trim();

        thumbnail.style.display =
            "block";

    } else {

        thumbnail.style.display =
            "none";
    }


    // Large image

    const image =
        get("previewAnnouncementImage");


    if (
        fields.image.value.trim()
    ) {

        image.src =
            fields.image.value.trim();

        image.style.display =
            "block";

    } else {

        image.style.display =
            "none";
    }
}


// ======================================================
// COLOUR
// ======================================================

fields.colorPicker.addEventListener(
    "input",
    () => {

        fields.color.value =
            fields.colorPicker.value;

        updateAnnouncementPreview();
    }
);


fields.color.addEventListener(
    "input",
    () => {

        if (
            /^#[0-9A-Fa-f]{6}$/.test(
                fields.color.value
            )
        ) {

            fields.colorPicker.value =
                fields.color.value;
        }


        updateAnnouncementPreview();
    }
);


// ======================================================
// WATCH EVERYTHING
// ======================================================

Object.values(fields).forEach(
    field => {

        if (!field) {
            return;
        }


        field.addEventListener(
            "input",
            updateAnnouncementPreview
        );


        field.addEventListener(
            "change",
            updateAnnouncementPreview
        );
    }
);


// ======================================================
// SEND
// ======================================================

get("sendAnnouncement")
    .addEventListener(
        "click",
        async () => {

            const button =
                get("sendAnnouncement");

            const message =
                get("announcementMessage");


            const data = {

                channelId:
                    fields.channel.value,

                roleId:
                    fields.role.value,

                title:
                    fields.title.value.trim(),

                description:
                    fields.description.value.trim(),

                color:
                    fields.color.value.trim(),

                footer:
                    fields.footer.value.trim(),

                image:
                    fields.image.value.trim(),

                thumbnail:
                    fields.thumbnail.value.trim(),

                timestamp:
                    fields.timestamp.checked
            };


            if (!data.channelId) {

                message.textContent =
                    "❌ Select a destination channel.";

                message.className =
                    "announcement-message error";

                return;
            }


            if (
                !data.title &&
                !data.description
            ) {

                message.textContent =
                    "❌ Add a title or description.";

                message.className =
                    "announcement-message error";

                return;
            }


            try {

                button.disabled =
                    true;

                button.textContent =
                    "Sending...";


                const response =
                    await fetch(
                        "/api/announcement",
                        {
                            method:
                                "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body:
                                JSON.stringify(
                                    data
                                )
                        }
                    );


                const text =
                    await response.text();


                let result;


                try {

                    result =
                        JSON.parse(
                            text
                        );

                } catch {

                    throw new Error(
                        "Your dashboard session may have expired. Refresh and log in again."
                    );
                }


                if (!response.ok) {

                    throw new Error(
                        result.error ||
                        "Could not send announcement."
                    );
                }


                message.textContent =
                    `✅ Announcement sent to #${result.channelName}.`;

                message.className =
                    "announcement-message success";


            } catch (error) {

                console.error(error);


                message.textContent =
                    `❌ ${error.message}`;

                message.className =
                    "announcement-message error";


            } finally {

                button.disabled =
                    false;

                button.textContent =
                    "Send Announcement";


                setTimeout(
                    () => {

                        message.textContent =
                            "";

                        message.className =
                            "announcement-message";

                    },
                    5000
                );
            }
        }
    );


updateAnnouncementPreview();