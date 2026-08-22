const botStatus =
    document.getElementById(
        "botStatus"
    );

const activityType =
    document.getElementById(
        "activityType"
    );

const activityText =
    document.getElementById(
        "activityText"
    );

const preview =
    document.getElementById(
        "presencePreviewText"
    );

const applyButton =
    document.getElementById(
        "applyPresence"
    );

const message =
    document.getElementById(
        "statusMessage"
    );

const uptimeValue =
    document.getElementById(
        "uptimeValue"
    );


function updatePreview() {
    preview.textContent =
        `${activityType.value} ${activityText.value}`;
}


activityType.addEventListener(
    "change",
    updatePreview
);

activityText.addEventListener(
    "input",
    updatePreview
);


function formatUptime(ms) {
    const totalSeconds =
        Math.floor(
            ms / 1000
        );

    const days =
        Math.floor(
            totalSeconds / 86400
        );

    const hours =
        Math.floor(
            (
                totalSeconds % 86400
            ) / 3600
        );

    const minutes =
        Math.floor(
            (
                totalSeconds % 3600
            ) / 60
        );


    if (days > 0) {
        return `${days}d ${hours}h ${minutes}m`;
    }

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }

    return `${minutes}m`;
}


const botUptimeData =
    document.getElementById(
        "botUptimeData"
    );

const initialUptime =
    Number(
        botUptimeData?.dataset.uptime || 0
    );


function updateUptime() {
    uptimeValue.textContent =
        formatUptime(
            initialUptime +
            performance.now()
        );
}


updateUptime();

setInterval(
    updateUptime,
    30000
);


applyButton.addEventListener(
    "click",
    async () => {
        applyButton.disabled =
            true;

        applyButton.textContent =
            "Applying...";


        try {
            const response =
                await fetch(
                    "/api/bot-status",
                    {
                        method:
                            "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify({
                                status:
                                    botStatus.value,

                                activityType:
                                    activityType.value,

                                activityText:
                                    activityText.value
                            })
                    }
                );


            const result =
                await response.json();


            if (!response.ok) {
                throw new Error(
                    result.error ||
                    "Could not update presence."
                );
            }


            message.textContent =
                "✅ Bot presence updated.";

            message.className =
                "status-message success";


        } catch (error) {
            message.textContent =
                `❌ ${error.message}`;

            message.className =
                "status-message error";


        } finally {
            applyButton.disabled =
                false;

            applyButton.textContent =
                "Apply Presence";
        }
    }
);