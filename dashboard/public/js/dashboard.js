const dropdowns =
    document.querySelectorAll(".dropdown");

const buttons =
    document.querySelectorAll(".dropdown-toggle");

buttons.forEach((button) => {

    button.addEventListener("click", (event) => {

        event.stopPropagation();

        const currentDropdown =
            button.closest(".dropdown");

        dropdowns.forEach((dropdown) => {

            if (dropdown !== currentDropdown) {
                dropdown.classList.remove("open");
            }

        });

        currentDropdown.classList.toggle("open");
    });

});

document.addEventListener("click", () => {

    dropdowns.forEach((dropdown) => {
        dropdown.classList.remove("open");
    });

});