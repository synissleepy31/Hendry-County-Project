const memberSelect =
    document.getElementById(
        "memberSelect"
    );

const roleSelect =
    document.getElementById(
        "roleSelect"
    );

const currentRoles =
    document.getElementById(
        "currentRoles"
    );

const selectedMember =
    document.getElementById(
        "selectedMember"
    );

const roleMessage =
    document.getElementById(
        "roleMessage"
    );

const addRoleButton =
    document.getElementById(
        "addRoleButton"
    );

const roleSearch =
    document.getElementById(
        "roleSearch"
    );

const saveManageableRoles =
    document.getElementById(
        "saveManageableRoles"
    );


function escapeHtml(value) {
    const div =
        document.createElement(
            "div"
        );

    div.textContent =
        String(value ?? "");

    return div.innerHTML;
}


function showMessage(
    text,
    type = "success"
) {
    roleMessage.textContent =
        text;

    roleMessage.className =
        `role-message ${type}`;
}


async function apiRequest(
    url,
    options = {}
) {
    const response =
        await fetch(
            url,
            options
        );

    const text =
        await response.text();

    let data;

    try {
        data =
            JSON.parse(text);

    } catch (error) {
        console.error(
            "[ROLES] Non-JSON response:",
            {
                url,
                status:
                    response.status,
                response:
                    text
            }
        );

        if (
            response.status === 404
        ) {
            throw new Error(
                `Backend route not found: ${url}`
            );
        }

        if (
            response.status === 403
        ) {
            throw new Error(
                "You do not have permission to use this feature."
            );
        }

        if (
            response.status === 401
        ) {
            throw new Error(
                "Your dashboard session has expired. Log in again."
            );
        }

        throw new Error(
            `The server returned an invalid response (${response.status}). Check the terminal.`
        );
    }


    if (!response.ok) {
        throw new Error(
            data.error ||
            `Request failed (${response.status}).`
        );
    }


    return data;
}


function renderMember(
    member
) {
    selectedMember.innerHTML = `
        <strong>${escapeHtml(member.displayName)}</strong>
        <span>@${escapeHtml(member.username)}</span>
    `;

    currentRoles.innerHTML =
        "";


    if (
        !member.roles ||
        member.roles.length === 0
    ) {
        currentRoles.innerHTML = `
            <span class="muted">
                No roles.
            </span>
        `;

        return;
    }


    for (
        const role
        of member.roles
    ) {
        const chip =
            document.createElement(
                "div"
            );

        chip.className =
            "member-role-chip";


        const dot =
            document.createElement(
                "span"
            );

        dot.className =
            "role-dot";

        dot.style.backgroundColor =
            role.color;


        const name =
            document.createElement(
                "span"
            );

        name.textContent =
            `@${role.name}`;


        chip.appendChild(
            dot
        );

        chip.appendChild(
            name
        );


        const canRemove =
            Array.from(
                roleSelect.options
            )
            .some(
                option =>
                    option.value ===
                    role.id
            );


        if (canRemove) {
            const button =
                document.createElement(
                    "button"
                );

            button.type =
                "button";

            button.textContent =
                "×";

            button.title =
                `Remove @${role.name}`;


            button.addEventListener(
                "click",
                () =>
                    removeRole(
                        role.id
                    )
            );


            chip.appendChild(
                button
            );
        }


        currentRoles.appendChild(
            chip
        );
    }
}


async function loadMember() {
    const userId =
        memberSelect.value;


    if (!userId) {
        selectedMember.innerHTML = `
            <strong>Select a member</strong>
            <span>Their current roles will appear here.</span>
        `;

        currentRoles.innerHTML = `
            <span class="muted">
                No member selected.
            </span>
        `;

        return;
    }


    selectedMember.innerHTML = `
        <strong>Loading member...</strong>
        <span>Retrieving Discord roles.</span>
    `;

    currentRoles.innerHTML = `
        <span class="muted">
            Loading roles...
        </span>
    `;


    try {
        const result =
            await apiRequest(
                `/api/roles/member/${encodeURIComponent(userId)}`
            );

        renderMember(
            result.member
        );

    } catch (error) {
        selectedMember.innerHTML = `
            <strong>Could not load member</strong>
            <span>Please try again.</span>
        `;

        currentRoles.innerHTML = `
            <span class="muted">
                Could not retrieve roles.
            </span>
        `;

        showMessage(
            error.message,
            "error"
        );
    }
}


async function addRole() {
    const userId =
        memberSelect.value;

    const roleId =
        roleSelect.value;


    if (!userId) {
        return showMessage(
            "Select a member first.",
            "error"
        );
    }


    if (!roleId) {
        return showMessage(
            "Select a role first.",
            "error"
        );
    }


    addRoleButton.disabled =
        true;

    addRoleButton.textContent =
        "Adding...";


    try {
        const result =
            await apiRequest(
                "/api/roles/add",
                {
                    method:
                        "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({
                            userId,
                            roleId
                        })
                }
            );


        showMessage(
            result.message
        );

        roleSelect.value =
            "";

        await loadMember();


    } catch (error) {
        showMessage(
            error.message,
            "error"
        );

    } finally {
        addRoleButton.disabled =
            false;

        addRoleButton.textContent =
            "+ Add Role";
    }
}


async function removeRole(
    roleId
) {
    const userId =
        memberSelect.value;


    if (!userId) {
        return;
    }


    try {
        const result =
            await apiRequest(
                "/api/roles/remove",
                {
                    method:
                        "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({
                            userId,
                            roleId
                        })
                }
            );


        showMessage(
            result.message
        );

        await loadMember();


    } catch (error) {
        showMessage(
            error.message,
            "error"
        );
    }
}


memberSelect
    ?.addEventListener(
        "change",
        loadMember
    );


addRoleButton
    ?.addEventListener(
        "click",
        addRole
    );


roleSearch
    ?.addEventListener(
        "input",
        () => {
            const query =
                roleSearch.value
                    .trim()
                    .toLowerCase();


            document
                .querySelectorAll(
                    ".role-directory-item"
                )
                .forEach(
                    item => {
                        item.style.display =
                            item.dataset.roleName.includes(
                                query
                            )
                                ? ""
                                : "none";
                    }
                );
        }
    );


saveManageableRoles
    ?.addEventListener(
        "click",
        async () => {
            const manageableRoleIds =
                Array.from(
                    document.querySelectorAll(
                        ".manageable-checkbox:checked"
                    )
                )
                .map(
                    checkbox =>
                        checkbox.value
                );


            saveManageableRoles.disabled =
                true;

            saveManageableRoles.textContent =
                "Saving...";


            try {
                await apiRequest(
                    "/api/roles/settings",
                    {
                        method:
                            "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify({
                                manageableRoleIds
                            })
                    }
                );


                showMessage(
                    "✅ Manageable role settings saved."
                );


                setTimeout(
                    () =>
                        location.reload(),
                    600
                );


            } catch (error) {
                showMessage(
                    error.message,
                    "error"
                );

                saveManageableRoles.disabled =
                    false;

                saveManageableRoles.textContent =
                    "Save Role Settings";
            }
        }
    );


// Chrome may restore the selected <option> after a refresh without
// firing the "change" event. If that happens, load it automatically.
document.addEventListener(
    "DOMContentLoaded",
    async () => {
        if (
            memberSelect &&
            memberSelect.value
        ) {
            await loadMember();
        }
    }
);
