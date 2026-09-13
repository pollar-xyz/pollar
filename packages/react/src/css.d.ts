// Ambient declaration for side-effect CSS imports (e.g. `import './Foo.css'`).
// tsup strips these at bundle time, but TypeScript 6.0 errors (TS2882) on
// side-effect imports of modules with no declaration, so we declare them here.
declare module '*.css';
