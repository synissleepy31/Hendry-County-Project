const moderationMessage =
    document.getElementById("moderationMessage");

function showMessage(
    text,
    type = "success"
) {
    moderationMessage.textContent = text;

    moderationMessage.className =
        `moderation-message ${type}`;

    setTimeout(
        () => {
            moderationMessage.textContent = "";

            moderationMessage.className =
                "moderation-message";
        },
        5000
    );
}


async function sendModerationAction(
    action,
    userId,
    reason,
    extra = {}
) {
    const response =
        await fetch(
            `/api/moderation/${action}`,
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body:
                    JSON.stringify({
                        userId,
                        reason,
                        ...extra
                    })
            }
        );

    const result =
        await response.json();

    if (!response.ok) {
        throw new Error(
            result.error ||
            "Moderation action failed."
        );
    }

    return result;
}


// ======================================================
// WARN / KICK / BAN / BLACKLIST
// ======================================================

document
    .querySelectorAll(
        ".moderation-action"
    )
    .forEach(button => {

        button.addEventListener(
            "click",
            async () => {

                const action =
                    button.dataset.action;

                const memberSelect =
                    document.getElementById(
                        "memberSelect"
                    );

                const reasonInput =
                    document.getElementById(
                        "moderationReason"
                    );

                const userId =
                    memberSelect.value;

                const reason =
                    reasonInput.value.trim();

                if (!userId) {
                    showMessage(
                        "❌ Select a member first.",
                        "error"
                    );

                    return;
                }

                if (!reason) {
                    showMessage(
                        "❌ Enter a reason first.",
                        "error"
                    );

                    return;
                }

                const originalText =
                    button.textContent;

                try {
                    button.disabled = true;

                    button.textContent =
                        "Processing...";

                    const result =
                        await sendModerationAction(
                            action,
                            userId,
                            reason
                        );

                    showMessage(
                        result.message ||
                        "✅ Moderation action completed."
                    );

                    reasonInput.value = "";

                } catch (error) {

                    console.error(error);

                    showMessage(
                        `❌ ${error.message}`,
                        "error"
                    );

                } finally {

                    button.disabled = false;

                    button.textContent =
                        originalText;
                }
            }
        );
    });


// ======================================================
// TEMP BAN
// ======================================================

document
    .getElementById(
        "tempBanButton"
    )
    .addEventListener(
        "click",
        async () => {

            const button =
                document.getElementById(
                    "tempBanButton"
                );

            const userId =
                document.getElementById(
                    "tempMemberSelect"
                ).value;

            const duration =
                document.getElementById(
                    "tempDuration"
                )
                .value
                .trim();

            const reason =
                document.getElementById(
                    "tempReason"
                )
                .value
                .trim();

            if (!userId) {
                showMessage(
                    "❌ Select a member first.",
                    "error"
                );

                return;
            }

            if (!duration) {
                showMessage(
                    "❌ Enter a duration.",
                    "error"
                );

                return;
            }

            if (!reason) {
                showMessage(
                    "❌ Enter a reason.",
                    "error"
                );

                return;
            }

            try {
                button.disabled = true;

                button.textContent =
                    "Processing...";

                const result =
                    await sendModerationAction(
                        "temp-ban",
                        userId,
                        reason,
                        {
                            duration
                        }
                    );

                showMessage(
                    result.message ||
                    "✅ Temporary ban created."
                );

                document.getElementById(
                    "tempDuration"
                ).value = "";

                document.getElementById(
                    "tempReason"
                ).value = "";

            } catch (error) {

                console.error(error);

                showMessage(
                    `❌ ${error.message}`,
                    "error"
                );

            } finally {

                button.disabled = false;

                button.textContent =
                    "⏳ Temporarily Ban Member";
            }
        }
    );


// ======================================================
// CHECK WARNINGS
// ======================================================

document
    .getElementById(
        "checkWarningsButton"
    )
    .addEventListener(
        "click",
        async () => {

            const userId =
                document.getElementById(
                    "warningMemberSelect"
                ).value;

            const results =
                document.getElementById(
                    "warningResults"
                );

            if (!userId) {
                showMessage(
                    "❌ Select a member first.",
                    "error"
                );

                return;
            }

            results.innerHTML =
                `<p class="warning-empty">Loading...</p>`;

            try {
                const response =
                    await fetch(
                        `/api/moderation/warnings/${userId}`
                    );

                const result =
                    await response.json();

                if (!response.ok) {
                    throw new Error(
                        result.error ||
                        "Failed to retrieve warnings."
                    );
                }

                const warnings =
                    result.warnings || [];

                if (
                    warnings.length === 0
                ) {
                    results.innerHTML = `
                        <div class="warning-empty">
                            ✅ This member has no warnings.
                        </div>
                    `;

                    return;
                }

                results.innerHTML =
                    warnings
                        .slice()
                        .reverse()
                        .map(warning => {

                            const date =
                                new Date(
                                    warning.createdAt
                                )
                                .toLocaleString();

                            return `
                                <div class="warning-item">

                                    <div class="warning-item-top">

                                        <strong>
                                            ⚠️ ${escapeHtml(
                                                warning.reason
                                            )}
                                        </strong>

                                        <span>
                                            ${escapeHtml(
                                                date
                                            )}
                                        </span>

                                    </div>

                                    <p>
                                        Moderator:
                                        <strong>
                                            ${escapeHtml(
                                                warning.moderatorName
                                            )}
                                        </strong>
                                    </p>

                                    <small>
                                        Warning ID:
                                        ${escapeHtml(
                                            warning.id
                                        )}
                                    </small>

                                </div>
                            `;
                        })
                        .join("");

            } catch (error) {

                console.error(error);

                results.innerHTML = `
                    <div class="warning-empty error">
                        ❌ ${escapeHtml(
                            error.message
                        )}
                    </div>
                `;
            }
        }
    );


function escapeHtml(value) {
    const div =
        document.createElement("div");

    div.textContent =
        String(value);

    return div.innerHTML;
}