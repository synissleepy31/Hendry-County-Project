const get =
    id =>
        document.getElementById(id);


function createChip(
    name,
    id,
    type
) {
    const chip =
        document.createElement("div");

    chip.className =
        "owner-chip";

    chip.dataset[
        type === "user"
            ? "userId"
            : "roleId"
    ] = id;


    chip.innerHTML = `
        <span>${escapeHtml(name)}</span>
        <button type="button">×</button>
    `;


    chip
        .querySelector("button")
        .addEventListener(
            "click",
            () => chip.remove()
        );


    return chip;
}


function escapeHtml(value) {
    const div =
        document.createElement("div");

    div.textContent =
        String(value);

    return div.innerHTML;
}


// ============================================
// ADD USER
// ============================================

get("addUserButton")
    .addEventListener(
        "click",
        () => {

            const select =
                get("addUserSelect");

            if (!select.value) {
                return;
            }


            const exists =
                document.querySelector(
                    `[data-user-id="${select.value}"]`
                );

            if (exists) {
                return;
            }


            const name =
                select.options[
                    select.selectedIndex
                ].textContent.trim();


            get("allowedUsers")
                .appendChild(
                    createChip(
                        name,
                        select.value,
                        "user"
                    )
                );


            select.value = "";
        }
    );


// ============================================
// ADD ROLE
// ============================================

get("addRoleButton")
    .addEventListener(
        "click",
        () => {

            const select =
                get("addRoleSelect");

            if (!select.value) {
                return;
            }


            const exists =
                get("allowedRoles")
                    .querySelector(
                        `[data-role-id="${select.value}"]`
                    );

            if (exists) {
                return;
            }


            const name =
                select.options[
                    select.selectedIndex
                ].textContent.trim();


            get("allowedRoles")
                .appendChild(
                    createChip(
                        name,
                        select.value,
                        "role"
                    )
                );


            select.value = "";
        }
    );


// ============================================
// EXISTING CHIP REMOVE BUTTONS
// ============================================

document
    .querySelectorAll(
        ".remove-user, .remove-role, .remove-section-role"
    )
    .forEach(button => {

        button.addEventListener(
            "click",
            () => {

                button
                    .closest(
                        ".owner-chip"
                    )
                    .remove();
            }
        );
    });


// ============================================
// SECTION ROLES
// ============================================

document
    .querySelectorAll(
        ".section-add-role"
    )
    .forEach(button => {

        button.addEventListener(
            "click",
            () => {

                const section =
                    button.dataset.section;


                const select =
                    document.querySelector(
                        `.section-role-select[data-section="${section}"]`
                    );


                const list =
                    document.querySelector(
                        `.section-role-list[data-section="${section}"]`
                    );


                if (!select.value) {
                    return;
                }


                const exists =
                    list.querySelector(
                        `[data-role-id="${select.value}"]`
                    );


                if (exists) {
                    return;
                }


                const name =
                    select.options[
                        select.selectedIndex
                    ].textContent.trim();


                list.appendChild(
                    createChip(
                        name,
                        select.value,
                        "role"
                    )
                );


                select.value = "";
            }
        );
    });


// ============================================
// SAVE
// ============================================

get("saveOwnerPermissions")
    .addEventListener(
        "click",
        async () => {

            const button =
                get("saveOwnerPermissions");

            const message =
                get("ownerMessage");


            const allowedUserIds =
                Array.from(
                    document.querySelectorAll(
                        "#allowedUsers [data-user-id]"
                    )
                )
                .map(
                    element =>
                        element.dataset.userId
                );


            const allowedRoleIds =
                Array.from(
                    document.querySelectorAll(
                        "#allowedRoles [data-role-id]"
                    )
                )
                .map(
                    element =>
                        element.dataset.roleId
                );


            const sections = {
                bot: [],
                moderation: [],
                management: [],
                configuration: [],
                owner: []
            };


            document
                .querySelectorAll(
                    ".section-role-list"
                )
                .forEach(list => {

                    const section =
                        list.dataset.section;


                    sections[section] =
                        Array.from(
                            list.querySelectorAll(
                                "[data-role-id]"
                            )
                        )
                        .map(
                            element =>
                                element.dataset.roleId
                        );
                });


            try {

                button.disabled =
                    true;

                button.textContent =
                    "Saving...";


                const response =
                    await fetch(
                        "/api/owner/permissions",
                        {
                            method:
                                "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body:
                                JSON.stringify({
                                    allowedUserIds,
                                    allowedRoleIds,
                                    sections
                                })
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
                        "Your dashboard session may have expired."
                    );
                }


                if (!response.ok) {
                    throw new Error(
                        result.error ||
                        "Could not save permissions."
                    );
                }


                message.textContent =
                    "✅ Dashboard permissions saved.";

                message.className =
                    "owner-message success";


            } catch (error) {

                console.error(error);

                message.textContent =
                    `❌ ${error.message}`;

                message.className =
                    "owner-message error";


            } finally {

                button.disabled =
                    false;

                button.textContent =
                    "Save Permissions";
            }
        }
    );