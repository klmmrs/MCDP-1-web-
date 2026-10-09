export function loadIntervals(content, isClosed = false) {
    const result = [];

    const lines = content.split(/\r?\n/);

    for (let lnum = 0; lnum < lines.length; lnum++) {
        const line = lines[lnum];

        // Пропускаем пустые строки
        if (line.trim().length === 0) {
            continue;
        }

        const elements = line.trim().split("\t");

        if (elements.length !== 3) {
            throw new Error(
                `Incorrect number of columns! Line #${lnum}: ${line}`
            );
        }

        const [chrName, bString, eString] = elements;

        let b = Number.parseInt(bString, 10);
        const e = Number.parseInt(eString, 10);

        if (Number.isNaN(b) || Number.isNaN(e)) {
            throw new Error(
                `Coordinates should be integers! Line #${lnum}: ${line}`
            );
        }

        if (isClosed) {
            b -= 1;
        }

        if (b < 0 || e < 0) {
            throw new Error(
                `Coordinates should be non-negative! Line #${lnum}: ${line}`
            );
        }

        if (!(b < e)) {
            throw new Error(
                `Begin should be less than end! Line #${lnum}: ${line}`
            );
        }

        result.push({
            chrName,
            begin: b,
            end: e
        });
    }

    result.sort((a, b) => {
        if (a.chrName !== b.chrName) {
            return a.chrName.localeCompare(b.chrName);
        }

        if (a.begin !== b.begin) {
            return a.begin - b.begin;
        }

        return a.end - b.end;
    });

    return result;
}

export function loadChrSizes(content) {
    const result = [];

    const lines = content.split(/\r?\n/);

    for (let lnum = 0; lnum < lines.length; lnum++) {
        const line = lines[lnum];

        // Пропускаем пустые строки
        if (line.trim().length === 0) {
            continue;
        }

        const elements = line.trim().split("\t");

        if (elements.length !== 2) {
            throw new Error(
                `Incorrect number of columns! Line #${lnum}: ${line}`
            );
        }

        const [chrName, lengthString] = elements;
        const length = Number.parseInt(lengthString, 10);

        if (Number.isNaN(length)) {
            throw new Error(
                `Length should be an integer! Line #${lnum}: ${line}`
            );
        }

        if (length <= 0) {
            throw new Error(
                `Length should be positive! Line #${lnum}: ${line}`
            );
        }

        result.push({
            chrName,
            length
        });
    }

    return result;
}

export function countOverlapsSingleChromosome(r, q) {
    const events = [];

    // Reference intervals
    for (const [begin, end] of r) {
        events.push({
            position: begin,
            type: "reference",
            isEnd: false
        });

        events.push({
            position: end,
            type: "reference",
            isEnd: true
        });
    }

    // Query intervals
    for (const [begin, end] of q) {
        events.push({
            position: begin,
            type: "query",
            isEnd: false
        });

        events.push({
            position: end,
            type: "query",
            isEnd: true
        });
    }

    // Специальное событие в конце,
    // аналог math.inf в Python
    events.push({
        position: Infinity,
        type: "query",
        isEnd: false
    });

    // Python: sorted(ends)
    events.sort((a, b) => {
        if (a.position !== b.position) {
            return a.position - b.position;
        }

        // В Python tuple сортируется следующим образом:
        // (position, type, isEnd)
        if (a.type !== b.type) {
            return a.type === "reference" ? -1 : 1;
        }

        return Number(a.isEnd) - Number(b.isEnd);
    });

    let count = 0;

    let isReferenceOpen = false;
    let isQueryOpen = false;

    let isCurrentReferenceCounted = false;

    let lastPosition = -1;

    for (const event of events) {
        const {
            position,
            type,
            isEnd
        } = event;

        if (lastPosition < position) {
            lastPosition = position;

            if (
                isReferenceOpen &&
                isQueryOpen &&
                !isCurrentReferenceCounted
            ) {
                count += 1;
                isCurrentReferenceCounted = true;
            }
        }

        // Reference interval starts
        if (type === "reference" && !isEnd) {
            isCurrentReferenceCounted = false;
            isReferenceOpen = true;
        }

        // Reference interval ends
        if (type === "reference" && isEnd) {
            isReferenceOpen = false;
        }

        // Query interval starts
        if (type === "query" && !isEnd) {
            isQueryOpen = true;
        }

        // Query interval ends
        if (type === "query" && isEnd) {
            isQueryOpen = false;
        }
    }

    return count;
}

function compareIntervals(a, b) {
    if (a.chrName !== b.chrName) {
        return a.chrName.localeCompare(b.chrName);
    }

    if (a.begin !== b.begin) {
        return a.begin - b.begin;
    }

    return a.end - b.end;
}

export function countOverlaps(r, q) {
    const chrNames = new Set();

    for (const interval of r) {
        chrNames.add(interval.chrName);
    }

    for (const interval of q) {
        chrNames.add(interval.chrName);
    }

    const sortedChrNames = [...chrNames].sort();

    const rSorted = [...r].sort(compareIntervals);
    const qSorted = [...q].sort(compareIntervals);

    let rNext = 0;
    let qNext = 0;

    let totalOverlapCount = 0;

    for (const chrName of sortedChrNames) {
        while (
            rNext < rSorted.length &&
            rSorted[rNext].chrName < chrName
        ) {
            rNext++;
        }

        while (
            qNext < qSorted.length &&
            qSorted[qNext].chrName < chrName
        ) {
            qNext++;
        }

        const rSub = [];

        while (
            rNext < rSorted.length &&
            rSorted[rNext].chrName === chrName
        ) {
            rSub.push([
                rSorted[rNext].begin,
                rSorted[rNext].end
            ]);

            rNext++;
        }

        const qSub = [];

        while (
            qNext < qSorted.length &&
            qSorted[qNext].chrName === chrName
        ) {
            qSub.push([
                qSorted[qNext].begin,
                qSorted[qNext].end
            ]);

            qNext++;
        }

        if (rSub.length === 0 || qSub.length === 0) {
            continue;
        }

        totalOverlapCount += countOverlapsSingleChromosome(
            rSub,
            qSub
        );
    }

    return totalOverlapCount;
}

export function mergeNondisjointIntervals(intervals) {
    // Python:
    // intervals = filter(lambda interval: interval[1] < interval[2], intervals)
    // Здесь оставляем только интервалы begin < end.
    const filtered = intervals.filter(
        interval => interval.begin < interval.end
    );

    // Python sorted(intervals)
    const sorted = [...filtered].sort(compareIntervals);

    if (sorted.length < 2) {
        return sorted;
    }

    const result = [];

    let current = { ...sorted[0] };

    for (let i = 1; i < sorted.length; i++) {
        const next = sorted[i];

        // Другая хромосома
        if (next.chrName !== current.chrName) {
            result.push(current);
            current = { ...next };
            continue;
        }

        // Есть положительный промежуток между интервалами.
        // Тогда они не объединяются.
        if (current.end < next.begin) {
            result.push(current);
            current = { ...next };
            continue;
        }

        // Интервалы пересекаются или соприкасаются.
        current.end = Math.max(current.end, next.end);
    }

    result.push(current);

    return result;
}
export function filterEmptyIntervals(intervals) {
    return intervals.filter(
        interval => interval.begin < interval.end
    );
}
function logSumExp(values) {
    if (values.length === 0) {
        return -Infinity;
    }

    const maxValue = Math.max(...values);

    if (maxValue === -Infinity) {
        return -Infinity;
    }

    if (maxValue === Infinity) {
        return Infinity;
    }

    const sum = values.reduce(
        (total, value) => total + Math.exp(value - maxValue),
        0
    );

    return maxValue + Math.log(sum);
}

export function jointLogProbs(probsByLevel) {
    if (probsByLevel.length === 0) {
        throw new Error("Probabilities should have at least one level!");
    }

    if (probsByLevel.some(level => level.length === 0)) {
        throw new Error("Probability levels should be non-empty!");
    }

    if (probsByLevel.length === 1) {
        return [...probsByLevel[0]];
    }

    const maxK = probsByLevel.reduce(
        (sum, level) => sum + level.length - 1,
        0
    );

    let prevRow = Array(maxK + 1).fill(-Infinity);

    probsByLevel[0].forEach((value, index) => {
        prevRow[index] = value;
    });

    let currentRow = Array(maxK + 1).fill(-Infinity);

    for (const level of probsByLevel.slice(1)) {
        for (let k = 0; k <= maxK; k++) {
            const terms = [];

            const upper = Math.min(k, level.length - 1);

            for (let j = 0; j <= upper; j++) {
                terms.push(level[j] + prevRow[k - j]);
            }

            currentRow[k] = logSumExp(terms);
        }

        prevRow = [...currentRow];
        currentRow = Array(maxK + 1).fill(-Infinity);
    }

    return prevRow;
}

export function jointPValue(probsByLevel, overlapCount) {
    if (overlapCount < 0) {
        return 1;
    }

    const logProbs = jointLogProbs(probsByLevel);

    if (overlapCount >= logProbs.length) {
        return 0;
    }

    return Math.exp(
        logSumExp(logProbs.slice(overlapCount))
    );
}