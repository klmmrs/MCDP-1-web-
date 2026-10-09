export function multiplyMatrices(A, B) {
    const rowsA = A.length;
    const colsA = A[0].length;
    const rowsB = B.length;
    const colsB = B[0].length;

    if (colsA !== rowsB) {
        throw new Error("Matrix dimensions do not match");
    }

    const result = Array.from(
        { length: rowsA },
        () => Array(colsB).fill(0)
    );

    for (let i = 0; i < rowsA; i++) {
        for (let j = 0; j < colsB; j++) {
            for (let k = 0; k < colsA; k++) {
                result[i][j] += A[i][k] * B[k][j];
            }
        }
    }

    return result;
}
export function identityMatrix(size) {
    const result = Array.from(
        { length: size },
        () => Array(size).fill(0)
    );

    for (let i = 0; i < size; i++) {
        result[i][i] = 1;
    }

    return result;
}


export function matrixPower(A, n) {
    if (n < 0 || !Number.isInteger(n)) {
        throw new Error("Matrix power must be a non-negative integer");
    }

    if (A.length !== A[0].length) {
        throw new Error("Only square matrices can be raised to a power");
    }

    let result = identityMatrix(A.length);
    let base = A.map(row => [...row]);
    let exponent = n;

    while (exponent > 0) {
        if (exponent % 2 === 1) {
            result = multiplyMatrices(result, base);
        }

        base = multiplyMatrices(base, base);
        exponent = Math.floor(exponent / 2);
    }

    return result;
}
export function multiplyMatrixVector(A, v) {
    const rows = A.length;
    const cols = A[0].length;

    if (cols !== v.length) {
        throw new Error("Matrix and vector dimensions do not match");
    }

    const result = Array(rows).fill(0);

    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
            result[i] += A[i][j] * v[j];
        }
    }

    return result;
}
export function directExp(A, n) {
    if (n < 0) {
        throw new Error(
            `Power should be non-negative, got ${n}!`
        );
    }

    if (n === 0) {
        return identityMatrix(A.length);
    }

    if (n === 1) {
        return A.map(row => [...row]);
    }

    const squared = multiplyMatrices(A, A);

    if (n % 2 === 0) {
        return directExp(squared, Math.floor(n / 2));
    } else {
        return multiplyMatrices(
            A,
            directExp(squared, Math.floor(n / 2))
        );
    }
}
export function multiplyVectorMatrix(v, A) {
    const rows = A.length;
    const cols = A[0].length;

    if (v.length !== rows) {
        throw new Error("Vector and matrix dimensions do not match");
    }

    const result = Array(cols).fill(0);

    for (let j = 0; j < cols; j++) {
        for (let i = 0; i < rows; i++) {
            result[j] += v[i] * A[i][j];
        }
    }

    return result;
}


export function subtractMatrices(A, B) {
    if (
        A.length !== B.length ||
        A[0].length !== B[0].length
    ) {
        throw new Error("Matrix dimensions do not match");
    }

    return A.map((row, i) =>
        row.map((value, j) => value - B[i][j])
    );
}