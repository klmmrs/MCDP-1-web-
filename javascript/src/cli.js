import fs from "node:fs";
import {
    loadIntervals,
    loadChrSizes,
    countOverlaps,
    mergeNondisjointIntervals,
    filterEmptyIntervals,
} from "./helpers.js";
import { Model } from "./model.js";

function parseArgs(args) {
    const options = {
        log: null,
        closed: false,
        sf: null,
        method: "direct_eigen",
        tries: 100,
    };

    const positional = [];

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === "-c" || arg === "--closed") {
            options.closed = true;
        } else if (arg === "-l" || arg === "--log") {
            options.log = args[++i];
        } else if (arg === "-s" || arg === "--sf") {
            options.sf = args[++i];
        } else if (arg === "-m" || arg === "--method") {
            options.method = args[++i];
        } else if (arg === "-t" || arg === "--tries") {
            options.tries = Number(args[++i]);
        } else if (arg.startsWith("-")) {
            throw new Error(`Unknown option: ${arg}`);
        } else {
            positional.push(arg);
        }
    }

    if (positional.length !== 3) {
        throw new Error(
            "Usage: node src/cli.js [options] <ref_intervals> <query_intervals> <chr_sizes>"
        );
    }

    if (!["direct_eigen", "sim_perm_nc"].includes(options.method)) {
        throw new Error(`Unsupported method: ${options.method}`);
    }

    return {
        ...options,
        refPath: positional[0],
        queryPath: positional[1],
        chrSizesPath: positional[2],
    };
}

function logMessage(message, logPath) {
    console.log(message);

    if (logPath) {
        fs.appendFileSync(logPath, message + "\n");
    }
}

function dumpSf(sfValues, outputPath) {
    const lines = ["k\tpvalue"];

    sfValues.forEach((value, k) => {
        lines.push(`${k}\t${value}`);
    });

    fs.writeFileSync(outputPath, lines.join("\n") + "\n");
}

export function main(args = process.argv.slice(2)) {
    const options = parseArgs(args);

    if (options.log) {
        fs.writeFileSync(options.log, "");
    }

    const readText = (path) => fs.readFileSync(path, "utf8");

    logMessage(
        `Loading reference interval set from '${options.refPath}'...`,
        options.log
    );
    let refIntervals = loadIntervals(readText(options.refPath), options.closed);

    logMessage(
        `Loading query interval set from '${options.queryPath}'...`,
        options.log
    );
    let queryIntervals = loadIntervals(readText(options.queryPath), options.closed);

    logMessage(
        `Loading chromosome sizes from '${options.chrSizesPath}'...`,
        options.log
    );
    const chrSizes = loadChrSizes(readText(options.chrSizesPath));

    const rawRefCount = refIntervals.length;
    const rawQueryCount = queryIntervals.length;
    const chrNames = new Set(chrSizes.map(({ chrName }) => chrName));

    refIntervals = refIntervals.filter(({ chrName }) => chrNames.has(chrName));
    queryIntervals = queryIntervals.filter(({ chrName }) => chrNames.has(chrName));

    refIntervals = filterEmptyIntervals(
        mergeNondisjointIntervals(refIntervals)
    );
    queryIntervals = filterEmptyIntervals(
        mergeNondisjointIntervals(queryIntervals)
    );

    logMessage(
        `Number of reference intervals: ${refIntervals.length} (${rawRefCount} before merging)`,
        options.log
    );
    logMessage(
        `Number of query intervals: ${queryIntervals.length} (${rawQueryCount} before merging)`,
        options.log
    );
    logMessage(`Number of chromosomes: ${chrSizes.length}`, options.log);

    const overlapCount = countOverlaps(refIntervals, queryIntervals);
    logMessage(`Overlap count: ${overlapCount}`, options.log);

    if (options.method === "sim_perm_nc") {
        throw new Error(
            "Method sim_perm_nc is not implemented in the JavaScript port yet."
        );
    }

    const model = new Model(refIntervals, queryIntervals, chrSizes);

    if (options.sf === null) {
        const pvalue = model.evalPvalue(overlapCount);
        logMessage(`p-value: ${pvalue}`, options.log);
    } else {
        const sfValues = model.evalSf();
        const pvalue = sfValues[overlapCount] ?? 0;

        logMessage(`p-value: ${pvalue}`, options.log);
        dumpSf(sfValues, options.sf);
    }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
    try {
        main();
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exitCode = 1;
    }
}