let pyodideInstance = null;

// Safe environment initialization in the main thread
async function initPyodide() {
    const status = document.getElementById('status');
    const btn = document.getElementById('submit-btn');

    if (btn) btn.disabled = true;

    try {
        if (status) {
            status.innerText = "Initializing Python (loading Pyodide)...";
            status.style.color = "orange";
        }
        
        pyodideInstance = await loadPyodide();

        if (status) status.innerText = "Loading NumPy, SciPy, and Micropip...";
        await pyodideInstance.loadPackage(["numpy", "scipy", "micropip"]);
        
        if (status) status.innerText = "Installing required dependencies (argh)...";
        const micropip = pyodideInstance.pyimport("micropip");
        await micropip.install("argh");

        if (status) status.innerText = "Loading mathematical algorithm files...";
        
        const pyFiles = ['helpers.py', 'simple_model.py', 'mcdp.py']; 
        
        for (const file of pyFiles) {
            const response = await fetch(`./${file}?v=${new Date().getTime()}`);
            if (!response.ok) {
                throw new Error(`File ${file} not found on your server!`);
            }
            const text = await response.text();
            pyodideInstance.FS.writeFile(file, text);
        }

        if (status) {
            status.innerText = "The system is completely ready for calculations!";
            status.style.color = "green";
        }
        if (btn) btn.disabled = false;

    } catch (err) {
        console.error("Critical JS error during initialization:", err);
        if (status) {
            status.innerText = "Initialization error: " + err.message;
            status.style.color = "red";
        }
    }
}

window.addEventListener('DOMContentLoaded', initPyodide);

// Fast browser-side stream pre-filtering
function optimizeFileContent(text, isLengthFile = false) {
    const lines = text.split('\n');
    const optimizedLines = [];
    const validChrRegex = /^(chr)?[0-9XYMxy\-_]+$/;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === '' || line.startsWith('#')) continue;
        
        const parts = line.split('\t');
        
        if (!isLengthFile && parts.length >= 3) {
            const chr = parts[0].trim();
            if (validChrRegex.test(chr)) {
                optimizedLines.push(`${chr}\t${parts[1].trim()}\t${parts[2].trim()}`);
            }
        } else if (isLengthFile && parts.length >= 2) {
            const chr = parts[0].trim();
            if (validChrRegex.test(chr)) {
                optimizedLines.push(`${chr}\t${parts[1].trim()}`);
            }
        }
    }
    return optimizedLines.join('\n');
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

document.getElementById('submit-btn')?.addEventListener('click', async () => {
    const outputDiv = document.getElementById('output');
    const status = document.getElementById('status');
    const btn = document.getElementById('submit-btn');
    
    const fileInput1 = document.getElementById('fileInput1');
    const fileInput2 = document.getElementById('fileInput2');
    const fileInputLength = document.getElementById('fileInputLength');

    if (!fileInput1?.files[0] || !fileInput2?.files[0] || !fileInputLength?.files[0]) {
        alert("Please select all three required files!");
        return;
    }

    if (!pyodideInstance) {
        alert("Pyodide is still loading. Please wait a moment.");
        return;
    }

    if (btn) btn.disabled = true;

    try {
        if (outputDiv) outputDiv.innerText = "Optimizing data and reading files on JS side...";
        if (status) {
            status.innerText = "Processing files...";
            status.style.color = "orange";
        }
        await delay(100); 

        const text1 = await fileInput1.files[0].text();
        const text2 = await fileInput2.files[0].text();
        const textLen = await fileInputLength.files[0].text();

        const cleanText1 = optimizeFileContent(text1, false);
        const cleanText2 = optimizeFileContent(text2, false);
        const cleanTextLen = optimizeFileContent(textLen, true);

        if (outputDiv) outputDiv.innerText = "Writing pre-filtered data to virtual memory FS...";
        await delay(50);

        pyodideInstance.FS.writeFile('input_file1.txt', cleanText1);
        pyodideInstance.FS.writeFile('input_file2.txt', cleanText2);
        pyodideInstance.FS.writeFile('input_length.txt', cleanTextLen);

        if (outputDiv) outputDiv.innerText = "Running calculation backend script. Please wait...\n(This might take up to a few minutes for very large data streams)";
        await delay(100);

        await pyodideInstance.runPythonAsync(`
            import io
            import sys
            import logging
            
            sys.modules['pytest'] = type(sys)('pytest')
            import mcdp

            root_logger = logging.getLogger("root")
            root_logger.handlers = []

            old_stdout = sys.stdout
            old_stderr = sys.stderr
            
            new_stdout = io.StringIO()
            sys.stdout = new_stdout
            sys.stderr = new_stdout

            try:
                mcdp.set_root_logger(None)
                
                # Using the mathematically safe and existing "direct_eigen" method
                mcdp.main(
                    'input_file1.txt', 
                    'input_file2.txt', 
                    'input_length.txt',
                    method="direct_eigen"
                )
                
                sys.stdout = old_stdout
                sys.stderr = old_stderr
                result = new_stdout.getvalue()
            except Exception as e:
                sys.stdout = old_stdout
                sys.stderr = old_stderr
                result = f"Critical error inside Python script:\\n{str(e)}"
                
            import __main__
            __main__.result = result
        `);

        const resultFromPython = pyodideInstance.globals.get("result");

        if (status) {
            status.innerText = "Calculations successfully completed!";
            status.style.color = "green";
        }
        if (outputDiv) {
            outputDiv.innerText = resultFromPython || "The calculations have completed, but the log is empty.";
        }
        if (btn) btn.disabled = false;

    } catch (err) {
        console.error("Critical JS error while calculating:", err);
        if (status) {
            status.innerText = "Calculation failed!";
            status.style.color = "red";
        }
        if (outputDiv) {
            outputDiv.innerText = "Critical JS error: " + err.message;
            outputDiv.style.color = "red";
        }
        if (btn) btn.disabled = false;
    }
});