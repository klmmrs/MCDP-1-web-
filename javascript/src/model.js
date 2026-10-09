import { evalProbsSingleDirectLmEigen } from "./directEigen.js";
import { jointLogProbs, jointPValue } from "./helpers.js";

export class Model {
    constructor(refIntervals, queryIntervals, chrSizes) {
        this.refIntervals = refIntervals;
        this.queryIntervals = queryIntervals;
        this.chrSizes = chrSizes;
    }

    evalPvalue(overlapCount) {
        const probsByChromosome = [];

        for (const { chrName, length } of this.chrSizes) {
            const r = this.refIntervals
                .filter(interval => interval.chrName === chrName)
                .map(interval => ({
                    begin: interval.begin,
                    end: interval.end
                }));

            const q = this.queryIntervals
                .filter(interval => interval.chrName === chrName)
                .map(interval => ({
                    begin: interval.begin,
                    end: interval.end
                }));

            const probs = evalProbsSingleDirectLmEigen(
                r,
                q,
                length
            );

            probsByChromosome.push(probs);
        }

        return jointPValue(probsByChromosome, overlapCount);
    }

    evalSf() {
        const probsByChromosome = [];

        for (const { chrName, length } of this.chrSizes) {
            const r = this.refIntervals
                .filter(interval => interval.chrName === chrName)
                .map(interval => ({
                    begin: interval.begin,
                    end: interval.end
                }));

            const q = this.queryIntervals
                .filter(interval => interval.chrName === chrName)
                .map(interval => ({
                    begin: interval.begin,
                    end: interval.end
                }));

            const probs = evalProbsSingleDirectLmEigen(
                r,
                q,
                length
            );

            probsByChromosome.push(probs);
        }

        const jointLogProbsResult = jointLogProbs(probsByChromosome);
        const result = Array(jointLogProbsResult.length).fill(0);

        let cumulative = -Infinity;

        for (let i = jointLogProbsResult.length - 1; i >= 0; i--) {
            const a = cumulative;
            const b = jointLogProbsResult[i];

            if (a === -Infinity) {
                cumulative = b;
            } else {
                const max = Math.max(a, b);
                cumulative = max + Math.log(
                    Math.exp(a - max) + Math.exp(b - max)
                );
            }

            result[i] = Math.exp(cumulative);
        }

        return result;
    }
}