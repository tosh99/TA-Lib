import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';

const commonConfig = {
    input: 'src/index.ts',
    plugins: [
        resolve(),
        commonjs(),
        typescript({
            tsconfig: './tsconfig.json',
            declaration: false,
            outDir: null,
            module: 'esnext',
        }),
        terser()
    ],
    external: ['lodash.round'], // Add any external dependencies here
};

export default [
    {
        ...commonConfig,
        output: {
            dir: 'dist/esm',
            format: 'esm',
            sourcemap: true,
            preserveModules: true,
            preserveModulesRoot: 'src',
        },
    },
    {
        ...commonConfig,
        output: {
            dir: 'dist/cjs',
            format: 'cjs',
            sourcemap: true,
            preserveModules: true,
            preserveModulesRoot: 'src',
        },
    }
];
