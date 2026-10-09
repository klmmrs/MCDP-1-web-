import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
    loadIntervals,
    loadChrSizes,
    mergeNondisjointIntervals,
    filterEmptyIntervals,
    countOverlaps
} from "./helpers.js";

import { Model } from "./model.js";


const PORT = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicDir = path.join(__dirname, "..", "public");


function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8"
    });

    res.end(JSON.stringify(data));
}


function serveStaticFile(req, res) {
    let filePath;

    if (req.url === "/") {
        filePath = path.join(publicDir, "index.html");
    } else {
        filePath = path.join(publicDir, req.url);
    }

    const ext = path.extname(filePath);

    const contentTypes = {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "text/javascript; charset=utf-8"
    };

    const contentType =
        contentTypes[ext] || "text/plain; charset=utf-8";

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, {
                "Content-Type": "text/plain; charset=utf-8"
            });

            res.end("File not found");
            return;
        }

        res.writeHead(200, {
            "Content-Type": contentType
        });

        res.end(data);
    });
}


function handleCalculate(req, res) {
    let body = "";

    req.on("data", chunk => {
        body += chunk;

        // Защита от случайно огромного запроса
        if (body.length > 10_000_000) {
            req.destroy();
        }
    });

    req.on("end", () => {
        try {
            const data = JSON.parse(body);

            const refContent = data.refContent;
            const queryContent = data.queryContent;
            const chrSizesContent = data.chrSizesContent;

            if (
                typeof refContent !== "string" ||
                typeof queryContent !== "string" ||
                typeof chrSizesContent !== "string"
            ) {
                sendJson(res, 400, {
                    error: "Invalid input data."
                });
                return;
            }


            // 1. Загружаем интервалы
            let refIntervals = loadIntervals(refContent);
            let queryIntervals = loadIntervals(queryContent);

            // 2. Загружаем размеры хромосом
            const chrSizes = loadChrSizes(chrSizesContent);


            // 3. Оставляем только известные хромосомы
            const chrNames = new Set(
                chrSizes.map(chr => chr.chrName)
            );

            refIntervals = refIntervals.filter(
                interval => chrNames.has(interval.chrName)
            );

            queryIntervals = queryIntervals.filter(
                interval => chrNames.has(interval.chrName)
            );


            // 4. Объединяем пересекающиеся интервалы
            refIntervals = mergeNondisjointIntervals(refIntervals);
            queryIntervals = mergeNondisjointIntervals(queryIntervals);


            // 5. Удаляем пустые интервалы
            refIntervals = filterEmptyIntervals(refIntervals);
            queryIntervals = filterEmptyIntervals(queryIntervals);


            // 6. Считаем реальное количество перекрытий
            const overlapCount = countOverlaps(
                refIntervals,
                queryIntervals
            );


            // 7. Создаём модель
            const model = new Model(
                refIntervals,
                queryIntervals,
                chrSizes
            );


            // 8. Считаем p-value
            const pvalue = model.evalPvalue(overlapCount);


            // 9. Считаем survival function
            const sf = model.evalSf();


            // 10. Отправляем результат браузеру
            sendJson(res, 200, {
                overlapCount,
                pvalue,
                sf
            });

        } catch (error) {
            console.error(error);

            sendJson(res, 500, {
                error: error.message
            });
        }
    });
}


const server = http.createServer((req, res) => {

    if (req.method === "POST" && req.url === "/calculate") {
        handleCalculate(req, res);
        return;
    }

    if (req.method === "GET") {
        serveStaticFile(req, res);
        return;
    }

    res.writeHead(404);
    res.end("Not found");
});


server.listen(PORT, () => {
    console.log(`MCDP server running at http://localhost:${PORT}`);
});