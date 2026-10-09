const fileInput1 = document.getElementById("fileInput1");
const fileInput2 = document.getElementById("fileInput2");
const fileInputLength = document.getElementById("fileInputLength");

const submitButton = document.getElementById("submit-btn");
const statusElement = document.getElementById("status");
const output = document.getElementById("output");


function updateButtonState() {
    const allFilesSelected =
        fileInput1.files.length > 0 &&
        fileInput2.files.length > 0 &&
        fileInputLength.files.length > 0;

    submitButton.disabled = !allFilesSelected;

    if (allFilesSelected) {
        statusElement.textContent = "All files selected. Ready to calculate.";
    } else {
        statusElement.textContent = "Waiting for files...";
    }
}


fileInput1.addEventListener("change", updateButtonState);
fileInput2.addEventListener("change", updateButtonState);
fileInputLength.addEventListener("change", updateButtonState);


submitButton.addEventListener("click", async () => {

    const refFile = fileInput1.files[0];
    const queryFile = fileInput2.files[0];
    const chrSizesFile = fileInputLength.files[0];

    if (!refFile || !queryFile || !chrSizesFile) {
        return;
    }

    submitButton.disabled = true;
    statusElement.textContent = "Calculating...";
    output.textContent = "";


    try {
        const refContent = await refFile.text();
        const queryContent = await queryFile.text();
        const chrSizesContent = await chrSizesFile.text();

        const response = await fetch("/calculate", {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                refContent,
                queryContent,
                chrSizesContent
            })
        });


        const result = await response.json();


        if (!response.ok) {
            throw new Error(result.error || "Calculation failed.");
        }


        statusElement.textContent = "Calculation completed.";

        output.textContent =
            `Reference file: ${refFile.name}\n` +
            `Query file: ${queryFile.name}\n` +
            `Chromosome sizes: ${chrSizesFile.name}\n\n` +
            `Overlap count: ${result.overlapCount}\n` +
            `P-value: ${result.pvalue}`;


    } catch (error) {

        statusElement.textContent = "Calculation error.";

        output.textContent = error.message;

    } finally {
        submitButton.disabled = false;
        updateButtonState();
    }
});