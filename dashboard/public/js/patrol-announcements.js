const $ = id => document.getElementById(id);

const elements = {
    channelId: $("channelId"),
    roleId: $("roleId"),

    title: $("embedTitle"),
    description: $("embedDescription"),
    color: $("embedColor"),
    colorPicker: $("embedColorPicker"),
    footer: $("footer"),
    timezone: $("timezone"),
    cadMessage: $("cadMessage"),

    attendanceYes: $("attendanceYes"),
    attendanceMaybe: $("attendanceMaybe"),
    attendanceNo: $("attendanceNo"),

    pingRole: $("pingRole"),
    showTimestamp: $("showTimestamp"),
    addReactions: $("addReactions")
};


// ======================================================
// UPDATE PREVIEW
// ======================================================

function updatePreview() {

    $("previewTitle").textContent =
        elements.title.value ||
        "🚓 Patrol Announcement 🚓";


    $("previewDescription").innerHTML =
        formatPreview(
            elements.description.value
        );


    $("previewTimezone").textContent =
        elements.timezone.value || "CST";


    $("previewCad").innerHTML =
        formatPreview(
            elements.cadMessage.value
        );


    $("previewYes").textContent =
        elements.attendanceYes.value;


    $("previewMaybe").textContent =
        elements.attendanceMaybe.value;


    $("previewNo").textContent =
        elements.attendanceNo.value;


    $("previewFooter").textContent =
        elements.footer.value;


    // Embed colour

    $("previewEmbed").style.borderLeftColor =
        elements.color.value;


    // Role preview

    const selectedRole =
        elements.roleId.options[
            elements.roleId.selectedIndex
        ];

    $("previewPing").textContent =
        selectedRole &&
        selectedRole.value
            ? `@${selectedRole.textContent
                .replace("@", "")
                .trim()}`
            : "@Patrol";


    $("previewPing").style.display =
        elements.pingRole.checked
            ? "block"
            : "none";


    $("previewReactions").style.display =
        elements.addReactions.checked
            ? "flex"
            : "none";


    updateAreas();
}


// ======================================================
// FORMAT SIMPLE DISCORD MARKDOWN
// ======================================================

function formatPreview(text) {

    if (!text) {
        return "";
    }

    let output = escapeHtml(text);

    output = output
        .replaceAll(
            "{time}",
            "7:00"
        )

        .replaceAll(
            "{ampm}",
            "PM"
        )

        .replace(
            /\*\*(.*?)\*\*/g,
            "<strong>$1</strong>"
        )

        .replace(
            /\n/g,
            "<br>"
        );

    return output;
}


function escapeHtml(text) {

    const div =
        document.createElement("div");

    div.textContent = text;

    return div.innerHTML;
}


// ======================================================
// PATROL AREAS
// ======================================================

function updateAreas() {

    const inputs =
        document.querySelectorAll(
            ".patrol-area-input"
        );

    const preview =
        $("previewAreas");

    preview.innerHTML = "";

    const emojis = [
        "1️⃣",
        "2️⃣",
        "3️⃣",
        "4️⃣",
        "5️⃣",
        "6️⃣",
        "7️⃣",
        "8️⃣",
        "9️⃣"
    ];


    inputs.forEach(
        (input, index) => {

            const line =
                document.createElement("p");

            line.textContent =
                `${emojis[index] || "•"} ${input.value}`;

            preview.appendChild(line);
        }
    );


    document
        .querySelectorAll(".area-number")
        .forEach(
            (number, index) => {
                number.textContent =
                    index + 1;
            }
        );
}


// ======================================================
// ADD AREA
// ======================================================

$("addArea").addEventListener(
    "click",
    () => {

        const container =
            $("patrolAreas");

        const amount =
            container.querySelectorAll(
                ".patrol-area-row"
            ).length;


        if (amount >= 9) {
            alert(
                "You can have a maximum of 9 patrol areas."
            );

            return;
        }


        const row =
            document.createElement("div");

        row.className =
            "patrol-area-row";


        row.innerHTML = `
            <span class="area-number">
                ${amount + 1}
            </span>

            <input
                type="text"
                class="patrol-area-input"
                value="New Patrol Area"
            >

            <button
                type="button"
                class="remove-area"
            >
                Remove
            </button>
        `;


        container.appendChild(row);

        bindAreaEvents();

        updatePreview();
    }
);


// ======================================================
// AREA EVENTS
// ======================================================

function bindAreaEvents() {

    document
        .querySelectorAll(
            ".patrol-area-input"
        )
        .forEach(input => {

            input.oninput =
                updatePreview;
        });


    document
        .querySelectorAll(
            ".remove-area"
        )
        .forEach(button => {

            button.onclick = () => {

                button
                    .closest(
                        ".patrol-area-row"
                    )
                    .remove();

                updatePreview();
            };
        });
}


// ======================================================
// COLOUR
// ======================================================

elements.colorPicker.addEventListener(
    "input",
    () => {

        elements.color.value =
            elements.colorPicker.value;

        updatePreview();
    }
);


elements.color.addEventListener(
    "input",
    () => {

        if (
            /^#[0-9A-Fa-f]{6}$/.test(
                elements.color.value
            )
        ) {
            elements.colorPicker.value =
                elements.color.value;
        }

        updatePreview();
    }
);


// ======================================================
// NORMAL INPUT EVENTS
// ======================================================

Object.values(elements).forEach(
    element => {

        if (!element) {
            return;
        }

        element.addEventListener(
            "input",
            updatePreview
        );

        element.addEventListener(
            "change",
            updatePreview
        );
    }
);


// ======================================================
// SAVE
// ======================================================

$("savePatrolSettings").addEventListener(
    "click",
    async () => {

        const button =
            $("savePatrolSettings");

        const message =
            $("saveMessage");


        const patrolAreas =
            Array.from(
                document.querySelectorAll(
                    ".patrol-area-input"
                )
            )

            .map(input =>
                input.value.trim()
            )

            .filter(Boolean);


        const data = {

            channelId:
                elements.channelId.value,

            roleId:
                elements.roleId.value,

            title:
                elements.title.value,

            description:
                elements.description.value,

            color:
                elements.color.value,

            footer:
                elements.footer.value,

            timezone:
                elements.timezone.value,

            cadMessage:
                elements.cadMessage.value,

            patrolAreas,

            attendanceYes:
                elements.attendanceYes.value,

            attendanceMaybe:
                elements.attendanceMaybe.value,

            attendanceNo:
                elements.attendanceNo.value,

            pingRole:
                elements.pingRole.checked,

            showTimestamp:
                elements.showTimestamp.checked,

            addReactions:
                elements.addReactions.checked
        };


        try {

            button.disabled = true;

            button.textContent =
                "Saving...";


            const response =
                await fetch(
                    "/api/patrol-settings",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify(data)
                    }
                );


            const result =
                await response.json();


            if (!response.ok) {
                throw new Error(
                    result.error ||
                    "Save failed"
                );
            }


            message.textContent =
                "✅ Patrol announcement settings saved.";

            message.className =
                "patrol-save-message success";


        } catch (error) {

            console.error(error);

            message.textContent =
                "❌ Failed to save patrol announcement settings.";

            message.className =
                "patrol-save-message error";

        } finally {

            button.disabled = false;

            button.textContent =
                "Save Changes";


            setTimeout(
                () => {

                    message.textContent = "";

                    message.className =
                        "patrol-save-message";

                },
                4000
            );
        }
    }
);


const previewEmbed = document.getElementById("previewEmbed");

if (previewEmbed) {
    const savedColor =
        previewEmbed.dataset.embedColor || "#ff8534";

    previewEmbed.style.borderLeftColor =
        savedColor;
}

bindAreaEvents();

updatePreview();