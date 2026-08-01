import init, { run_mcdp_analysis } from './pkg/mcdp_wasm.js';

async function run() {
    const status = document.getElementById('status');
    const btn = document.getElementById('submit-btn');
    const output = document.getElementById('output');

    try {
        status.innerText = "WebAssembly (Rust) module initialization...";
        status.style.color = "orange";

        await init();

        status.innerText = "The Rust Wasm system is completely ready!";
        status.style.color = "green";
        if (btn) btn.disabled = false;

        btn.addEventListener('click', async () => {
            const file1 = document.getElementById('fileInput1').files[0];
            const file2 = document.getElementById('fileInput2').files[0];
            const fileLength = document.getElementById('fileInputLength').files[0];

            if (!file1 || !file2 || !fileLength) {
                alert("Please select all three files!");
                return;
            }

            btn.disabled = true;
            status.innerText = "Calculating p-value on the Rust side...";
            output.innerText = "Calculations started...";

            const refText = await file1.text();
            const queryText = await file2.text();
            const sizesText = await fileLength.text();

            const startTime = performance.now();

            const result = run_mcdp_analysis(refText, queryText, sizesText);

            const endTime = performance.now();

            output.innerText = `${result}\n\nExecution time in browser:${(endTime - startTime).toFixed(2)} мс`;
            status.innerText = "The results are ready!";
            btn.disabled = false;
        });

    } catch (err) {
        console.error("Error:", err);
        status.innerText = "Wasm launch error:" + err.message;
        status.style.color = "red";
    }
}

window.addEventListener('DOMContentLoaded', run);