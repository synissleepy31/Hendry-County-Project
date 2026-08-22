const dashboardTitle =
    document.getElementById(
        "dashboardTitle"
    );

const timezone =
    document.getElementById(
        "timezone"
    );

const embedColor =
    document.getElementById(
        "embedColor"
    );

const embedColorPicker =
    document.getElementById(
        "embedColorPicker"
    );

const defaultFooter =
    document.getElementById(
        "defaultFooter"
    );

const logChannelId =
    document.getElementById(
        "logChannelId"
    );

const maintenanceMode =
    document.getElementById(
        "maintenanceMode"
    );

const saveButton =
    document.getElementById(
        "saveSettings"
    );

const message =
    document.getElementById(
        "settingsMessage"
    );


embedColorPicker.addEventListener(
    "input",
    () => {
        embedColor.value =
            embedColorPicker.value;
    }
);


embedColor.addEventListener(
    "input",
    () => {
        if (
            /^#[0-9A-Fa-f]{6}$/.test(
                embedColor.value
            )
        ) {
            embedColorPicker.value =
                embedColor.value;
        }
    }
);


saveButton.addEventListener(
    "click",
    async () => {
        saveButton.disabled =
            true;

        saveButton.textContent =
            "Saving...";


        try {
            const response =
                await fetch(
                    "/api/settings",
                    {
                        method:
                            "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify({
                                dashboardTitle:
                                    dashboardTitle.value,

                                timezone:
                                    timezone.value,

                                embedColor:
                                    embedColor.value,

                                defaultFooter:
                                    defaultFooter.value,

                                logChannelId:
                                    logChannelId.value,

                                maintenanceMode:
                                    maintenanceMode.checked
                            })
                    }
                );


            const result =
                await response.json();


            if (!response.ok) {
                throw new Error(
                    result.error ||
                    "Could not save settings."
                );
            }


            message.textContent =
                "✅ Settings saved.";

            message.className =
                "settings-message success";


        } catch (error) {

            message.textContent =
                `❌ ${error.message}`;

            message.className =
                "settings-message error";


        } finally {

            saveButton.disabled =
                false;

            saveButton.textContent =
                "Save Settings";
        }
    }
);