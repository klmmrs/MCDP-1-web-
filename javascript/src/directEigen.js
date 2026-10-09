import {
    multiplyMatrices,
    multiplyVectorMatrix,
    subtractMatrices,
    matrixPower,
    directExp
} from "./matrix.js";

export function buildMatrices(x, y) {
    const T = [
        [x, 1 - x],
        [1 - y, y]
    ];

    const D = [
        [x, 0],
        [1 - y, 0]
    ];

    return { T, D };
}


export class TDExp {
    constructor(x, y) {
        this.x = x;
        this.y = y;

        this.T = [
            [x, 1 - x],
            [1 - y, y]
        ];

        this.D = [
            [x, 0],
            [1 - y, 0]
        ];

        try {
            const quotient = -2 + x + y;

            this.Q = [
                [1, (x - 1) / (1 - y)],
                [1, 1]
            ];

            this.Q_inv = [
                [(-1 + y) / quotient, (-1 + x) / quotient],
                [(1 - y) / quotient, (-1 + y) / quotient]
            ];
        } catch (error) {
            this.exp_t = (a) => directExp(this.T, a);
        }

        this.logx = Math.log(x);
    }


    expT(a) {
        if (a < 0) {
            throw new Error(
                `Exponent must be nonnegative, got '${a}' instead!`
            );
        }

        if (a === 0) {
            return [
                [1, 0],
                [0, 1]
            ];
        }

        if (a === 1) {
            return this.T.map(row => [...row]);
        }

        if (a < 100) {
            return directExp(this.T, a);
        }

        const lambda = Math.pow(this.x + this.y - 1, a);

        const L = [
            [1, 0],
            [0, lambda]
        ];

        return multiplyMatrices(
            multiplyMatrices(this.Q, L),
            this.Q_inv
        );
    }


    expD(a) {
        if (a < 0) {
            throw new Error(
                `Exponent must be nonnegative, got '${a}' instead!`
            );
        }

        if (a === 0) {
            return [
                [1, 0],
                [0, 1]
            ];
        }

        if (a === 1) {
            return this.D.map(row => [...row]);
        }

        if (a < 50) {
            return directExp(this.D, a);
        }

        const result = [
            [
                Math.exp(a * this.logx),
                0
            ],
            [
                (1 - this.y) * Math.exp((a - 1) * this.logx),
                0
            ]
        ];

        return result;
    }
}
export function estimateMcWeightsSimple(chrSize, q) {
    if (q.length === 0) {
        throw new Error("Query interval set should be non-empty!");
    }

    let totalIntervalsLength = 0;

    for (const interval of q) {
        totalIntervalsLength += interval.end - interval.begin;
    }

    const totalGapsLength = chrSize - totalIntervalsLength;
    const n = q.length;

    const alpha = -n - 1 + totalGapsLength;
    const beta = -n + totalIntervalsLength;

    const x = alpha / (alpha + n);
    const y = beta / (beta + n);

    return { x, y };
}
export function evalProbsSingleDirectLmEigen(r, q, chrSize) {
    if (q.length === 0 || r.length === 0) {
        return [0];
    }

    const { x, y } = estimateMcWeightsSimple(chrSize, q);

    const E = new TDExp(x, y);

    let reference = r.map(interval => ({
        begin: interval.begin,
        end: interval.end
    }));

    let m = reference.length;

    // В Python первый интервал, начинающийся с 0,
    // заменяется на начинающийся с 1.
    if (reference[0].begin === 0) {
        reference[0] = {
            begin: 1,
            end: reference[0].end
        };

        if (reference[0].end - reference[0].begin === 0) {
            reference = reference.slice(1);
        }
    }

    m = reference.length;

    const rAugmented = [
        {
            begin: Number.NEGATIVE_INFINITY,
            end: 0
        },
        ...reference,
        {
            begin: chrSize,
            end: Number.POSITIVE_INFINITY
        }
    ];

    // prevLine[j] — вектор из двух состояний.
    const prevLine = Array.from(
        { length: m + 1 },
        () => [0, 0]
    );

    prevLine[0][0] = 1;

    const lastCol = Array.from(
        { length: m + 1 },
        () => [0, 0]
    );

    for (let j = 1; j <= m; j++) {
        let gap =
            rAugmented[j].begin -
            rAugmented[j - 1].end;

        if (j === 1) {
            gap -= 1;
        }

        if (gap < 0) {
            throw new Error(`Expected non-negative gap, got ${gap}`);
        }

        const length =
            rAugmented[j].end -
            rAugmented[j].begin;

        if (length < 0) {
            throw new Error(`Expected non-negative length, got ${length}`);
        }

        const gapMatrix = E.expT(gap);
        const intervalMatrix = E.expD(length);

        const transition =
            multiplyMatrices(
                gapMatrix,
                intervalMatrix
            );

        prevLine[j] =
            multiplyVectorMatrix(
                prevLine[j - 1],
                transition
            );
    }

    lastCol[0] = [...prevLine[m]];

    const nextLine = Array.from(
        { length: m + 1 },
        () => [0, 0]
    );

    for (let k = 1; k <= m; k++) {
        nextLine[k - 1] = [0, 0];

        for (let j = k; j <= m; j++) {
            let gap =
                rAugmented[j].begin -
                rAugmented[j - 1].end;

            if (j === 1) {
                gap -= 1;
            }

            if (gap < 0) {
                throw new Error(`Expected non-negative gap, got ${gap}`);
            }

            const length =
                rAugmented[j].end -
                rAugmented[j].begin;

            if (length < 0) {
                throw new Error(`Expected non-negative length, got ${length}`);
            }

            const TGap = E.expT(gap);
            const DLength = E.expD(length);

            // dont_hit =
            // P[j-1, k] * T^g * D^l
            const dontHitMatrix =
                multiplyMatrices(
                    TGap,
                    DLength
                );

            const dontHit =
                multiplyVectorMatrix(
                    nextLine[j - 1],
                    dontHitMatrix
                );

            // hit =
            // P[j-1, k-1] * T^g * (T^l - D^l)
            const TLength = E.expT(length);

            const difference =
                subtractMatrices(
                    TLength,
                    DLength
                );

            const hitMatrix =
                multiplyMatrices(
                    TGap,
                    difference
                );

            const hit =
                multiplyVectorMatrix(
                    prevLine[j - 1],
                    hitMatrix
                );

            // P[j,k] = dont_hit + hit
            nextLine[j] = [
                dontHit[0] + hit[0],
                dontHit[1] + hit[1]
            ];
        }

        lastCol[k] = [...nextLine[m]];

        // Python:
        //
        // for j in range(m+1):
        //     prev_line[j, 0] = next_line[j, 0]
        //     prev_line[j, 1] = next_line[j, 1]

        for (let j = 0; j <= m; j++) {
            prevLine[j][0] = nextLine[j][0];
            prevLine[j][1] = nextLine[j][1];
        }
    }

    // Python:
    //
    // probs = [
    //     np.log(np.sum(last_col[k, :]))
    //     for k in range(m + 1)
    // ]

    return lastCol.map(row => {
        const probability = row[0] + row[1];

        return Math.log(probability);
    });
}
