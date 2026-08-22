const get = id =>
    document.getElementById(id);


const fields = {

    enabled:
        get("welcomeEnabled"),

    channelId:
        get("welcomeChannel"),

    pingUser:
        get("pingUser"),

    embedTitle:
        get("embedTitle"),

    embedDescription:
        get("embedDescription"),

    embedColor:
        get("embedColor"),

    embedColorPicker:
        get("embedColorPicker"),

    embedFooter:
        get("embedFooter"),

    showTimestamp:
        get("showTimestamp"),

    showImage:
        get("showImage"),

    avatarX:
        get("avatarX"),

    avatarY:
        get("avatarY"),

    avatarSize:
        get("avatarSize"),

    usernameX:
        get("usernameX"),

    usernameY:
        get("usernameY"),

    usernameFontSize:
        get("usernameFontSize")
};


// ======================================================
// PREVIEW
// ======================================================

function replacePreviewVariables(text) {

    return String(text || "")

        .replaceAll(
            "{username}",
            "ExampleUser"
        )

        .replaceAll(
            "{mention}",
            "@ExampleUser"
        )

        .replaceAll(
            "{memberNumber}",
            "14th"
        );
}


function updateWelcomePreview() {

    const title =
        replacePreviewVariables(
            fields.embedTitle.value
        );


    const description =
        replacePreviewVariables(
            fields.embedDescription.value
        );


    get("previewWelcomeTitle")
        .textContent =
        title;


    get("previewWelcomeDescription")
        .textContent =
        description;


    get("previewWelcomeFooter")
        .textContent =
        fields.embedFooter.value;


    const embed =
        get("welcomePreviewEmbed");


    if (
        /^#[0-9a-fA-F]{6}$/.test(
            fields.embedColor.value
        )
    ) {
        embed.style.borderLeftColor =
            fields.embedColor.value;
    }


    const imagePreview =
        get("welcomeImagePreview");


    imagePreview.style.display =
        fields.showImage.checked
            ? "block"
            : "none";


    const avatar =
        get("previewAvatar");


    const username =
        get("previewUsername");


    // Scale the real 1200x440 image
    // into the smaller dashboard preview.

    const scale = 0.42;


    avatar.style.left =
        `${Number(fields.avatarX.value) * scale}px`;

    avatar.style.top =
        `${Number(fields.avatarY.value) * scale}px`;

    avatar.style.width =
        `${Number(fields.avatarSize.value) * scale}px`;

    avatar.style.height =
        `${Number(fields.avatarSize.value) * scale}px`;


    username.style.left =
        `${Number(fields.usernameX.value) * scale}px`;

    username.style.top =
        `${Number(fields.usernameY.value) * scale}px`;

    username.style.fontSize =
        `${Number(fields.usernameFontSize.value) * scale}px`;
}


// ======================================================
// COLOUR
// ======================================================

fields.embedColorPicker.addEventListener(
    "input",
    () => {

        fields.embedColor.value =
            fields.embedColorPicker.value;

        updateWelcomePreview();
    }
);


fields.embedColor.addEventListener(
    "input",
    () => {

        if (
            /^#[0-9a-fA-F]{6}$/.test(
                fields.embedColor.value
            )
        ) {
            fields.embedColorPicker.value =
                fields.embedColor.value;
        }

        updateWelcomePreview();
    }
);


// ======================================================
// WATCH FIELDS
// ======================================================

Object.values(fields).forEach(
    field => {

        if (!field) {
            return;
        }

        field.addEventListener(
            "input",
            updateWelcomePreview
        );

        field.addEventListener(
            "change",
            updateWelcomePreview
        );
    }
);


// ======================================================
// SAVE
// ======================================================

get("saveWelcomeSettings")
    .addEventListener(
        "click",
        async () => {

            const button =
                get("saveWelcomeSettings");

            const message =
                get("welcomeMessage");


            const settings = {

                enabled:
                    fields.enabled.checked,

                channelId:
                    fields.channelId.value,

                pingUser:
                    fields.pingUser.checked,

                embedTitle:
                    fields.embedTitle.value,

                embedDescription:
                    fields.embedDescription.value,

                embedColor:
                    fields.embedColor.value,

                embedFooter:
                    fields.embedFooter.value,

                showTimestamp:
                    fields.showTimestamp.checked,

                showImage:
                    fields.showImage.checked,

                avatarX:
                    Number(
                        fields.avatarX.value
                    ),

                avatarY:
                    Number(
                        fields.avatarY.value
                    ),

                avatarSize:
                    Number(
                        fields.avatarSize.value
                    ),

                usernameX:
                    Number(
                        fields.usernameX.value
                    ),

                usernameY:
                    Number(
                        fields.usernameY.value
                    ),

                usernameFontSize:
                    Number(
                        fields.usernameFontSize.value
                    )
            };


            try {

                button.disabled = true;

                button.textContent =
                    "Saving...";


                const response =
                    await fetch(
                        "/api/welcome-settings",
                        {
                            method:
                                "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body:
                                JSON.stringify(
                                    settings
                                )
                        }
                    );


                const text =
                    await response.text();


                let result;

                try {
                    result =
                        JSON.parse(text);
                } catch {
                    throw new Error(
                        "Your dashboard session may have expired. Refresh and log in again."
                    );
                }


                if (!response.ok) {
                    throw new Error(
                        result.error ||
                        "Could not save settings."
                    );
                }


                message.textContent =
                    "✅ Welcome settings saved.";

                message.className =
                    "welcome-save-message success";


            } catch (error) {

                console.error(error);


                message.textContent =
                    `❌ ${error.message}`;

                message.className =
                    "welcome-save-message error";


            } finally {

                button.disabled = false;

                button.textContent =
                    "Save Welcome Settings";


                setTimeout(
                    () => {

                        message.textContent =
                            "";

                        message.className =
                            "welcome-save-message";

                    },
                    5000
                );
            }
        }
    );


updateWelcomePreview();