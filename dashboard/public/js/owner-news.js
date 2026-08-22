const titleInput =
    document.getElementById("newsTitle");

const summaryInput =
    document.getElementById("newsSummary");

const contentInput =
    document.getElementById("newsContent");

const imageInput =
    document.getElementById("newsImage");

const publishedInput =
    document.getElementById("newsPublished");

const editingId =
    document.getElementById("editingArticleId");

const saveButton =
    document.getElementById("saveNewsButton");

const cancelButton =
    document.getElementById("cancelEditButton");

const editorHeading =
    document.getElementById("editorHeading");

const message =
    document.getElementById("newsMessage");


function showMessage(text, type) {

    message.textContent =
        text;

    message.className =
        `news-manager-message ${type}`;

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


function resetEditor() {

    editingId.value = "";

    titleInput.value = "";
    summaryInput.value = "";
    contentInput.value = "";
    imageInput.value = "";

    publishedInput.checked =
        true;

    editorHeading.textContent =
        "Create News Article";

    saveButton.textContent =
        "Publish Article";

    cancelButton.hidden =
        true;
}


cancelButton.addEventListener(
    "click",
    () => {

        resetEditor();

    }
);


saveButton.addEventListener(
    "click",
    async () => {

        const title =
            titleInput.value.trim();

        const summary =
            summaryInput.value.trim();

        const content =
            contentInput.value.trim();

        const image =
            imageInput.value.trim();

        const published =
            publishedInput.checked;


        if (!title) {

            showMessage(
                "Article title is required.",
                "error"
            );

            return;
        }


        if (!content) {

            showMessage(
                "Article content is required.",
                "error"
            );

            return;
        }


        const articleId =
            editingId.value;


        const editing =
            Boolean(articleId);


        saveButton.disabled =
            true;

        saveButton.textContent =
            editing
                ? "Saving Changes..."
                : "Creating Article...";


        try {

            const response =
                await fetch(
                    editing
                        ? `/api/owner/news/${articleId}`
                        : "/api/owner/news",
                    {
                        method:
                            editing
                                ? "PUT"
                                : "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify({
                                title,
                                summary,
                                content,
                                image,
                                published
                            })
                    }
                );


            const result =
                await response.json();


            if (!response.ok) {

                throw new Error(
                    result.error ||
                    "Could not save article."
                );
            }


            showMessage(
                editing
                    ? "Article updated successfully."
                    : "Article created successfully.",
                "success"
            );


            setTimeout(
                () => {
                    window.location.reload();
                },
                600
            );


        } catch (error) {

            showMessage(
                error.message,
                "error"
            );


            saveButton.disabled =
                false;

            saveButton.textContent =
                editing
                    ? "Save Changes"
                    : "Publish Article";
        }

    }
);


// ======================================================
// EDIT
// ======================================================

document
    .querySelectorAll(
        ".edit-news-button"
    )
    .forEach(button => {

        button.addEventListener(
            "click",
            () => {

                editingId.value =
                    button.dataset.id;

                titleInput.value =
                    button.dataset.title || "";

                summaryInput.value =
                    button.dataset.summary || "";

                contentInput.value =
                    button.dataset.content || "";

                imageInput.value =
                    button.dataset.image || "";

                publishedInput.checked =
                    button.dataset.published ===
                    "true";


                editorHeading.textContent =
                    "Edit News Article";

                saveButton.textContent =
                    "Save Changes";

                cancelButton.hidden =
                    false;


                window.scrollTo({
                    top: 0,
                    behavior: "smooth"
                });

            }
        );

    });


// ======================================================
// PUBLISH / UNPUBLISH
// ======================================================

document
    .querySelectorAll(
        ".publish-news-button"
    )
    .forEach(button => {

        button.addEventListener(
            "click",
            async () => {

                const article =
                    button.closest(
                        ".news-manager-item"
                    );

                const editButton =
                    article.querySelector(
                        ".edit-news-button"
                    );


                const currentlyPublished =
                    button.dataset.published ===
                    "true";


                button.disabled =
                    true;


                try {

                    const response =
                        await fetch(
                            `/api/owner/news/${button.dataset.id}`,
                            {
                                method:
                                    "PUT",

                                headers: {
                                    "Content-Type":
                                        "application/json"
                                },

                                body:
                                    JSON.stringify({
                                        title:
                                            editButton.dataset.title,

                                        summary:
                                            editButton.dataset.summary,

                                        content:
                                            editButton.dataset.content,

                                        image:
                                            editButton.dataset.image,

                                        published:
                                            !currentlyPublished
                                    })
                            }
                        );


                    const result =
                        await response.json();


                    if (!response.ok) {

                        throw new Error(
                            result.error ||
                            "Could not change publication status."
                        );
                    }


                    window.location.reload();


                } catch (error) {

                    showMessage(
                        error.message,
                        "error"
                    );

                    button.disabled =
                        false;
                }

            }
        );

    });


// ======================================================
// DELETE
// ======================================================

document
    .querySelectorAll(
        ".delete-news-button"
    )
    .forEach(button => {

        button.addEventListener(
            "click",
            async () => {

                const articleTitle =
                    button.dataset.title;


                const confirmed =
                    window.confirm(
                        `Delete "${articleTitle}"?\n\nThis cannot be undone.`
                    );


                if (!confirmed) {
                    return;
                }


                button.disabled =
                    true;


                try {

                    const response =
                        await fetch(
                            `/api/owner/news/${button.dataset.id}`,
                            {
                                method:
                                    "DELETE"
                            }
                        );


                    const result =
                        await response.json();


                    if (!response.ok) {

                        throw new Error(
                            result.error ||
                            "Could not delete article."
                        );
                    }


                    window.location.reload();


                } catch (error) {

                    showMessage(
                        error.message,
                        "error"
                    );

                    button.disabled =
                        false;
                }

            }
        );

    });