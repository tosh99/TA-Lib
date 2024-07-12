interface OptimizeResult {
    x: number;  // The value of x that minimizes the function
    fx: number; // The minimum value of the function
}

interface OptimizeOptions {
    bounds: [number, number]; // The lower and upper bounds for x
    tolerance?: number;       // The desired accuracy of the result
    maxIterations?: number;   // The maximum number of iterations
}

export const optimize = (objectiveFunction: (x: number) => number, options: OptimizeOptions): OptimizeResult => {
    const goldenRatio = (Math.sqrt(5) - 1) / 2;
    const [a, b] = options.bounds;
    const tolerance = options.tolerance || 1e-5;
    const maxIterations = options.maxIterations || 1000;

    let x1 = b - goldenRatio * (b - a);
    let x2 = a + goldenRatio * (b - a);
    let f1 = objectiveFunction(x1);
    let f2 = objectiveFunction(x2);

    for (let i = 0; i < maxIterations; i++) {
        if (Math.abs(b - a) < tolerance) {
            break;
        }

        if (f1 < f2) {
            const b = x2;
            x2 = x1;
            f2 = f1;
            x1 = b - goldenRatio * (b - a);
            f1 = objectiveFunction(x1);
        } else {
            const a = x1;
            x1 = x2;
            f1 = f2;
            x2 = a + goldenRatio * (b - a);
            f2 = objectiveFunction(x2);
        }
    }

    const x = (a + b) / 2;
    const fx = objectiveFunction(x);

    return {x, fx};
}
