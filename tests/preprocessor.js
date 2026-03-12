// Preprocessor to replace import.meta.url before ts-jest compiles
const tsJest = require('ts-jest');

module.exports = {
  process(src, path) {
    // Replace import.meta.url with a workaround for CommonJS
    if (src.includes('import.meta.url')) {
      // Replace import.meta.url with __filename wrapped in pathToFileURL
      src = src.replace(
        /import\.meta\.url/g,
        "require('url').pathToFileURL(__filename).href"
      );
    }
    
    // Use ts-jest to process
    return tsJest.default.process(src, path, {
      tsconfig: {
        target: 'ES2020',
        module: 'commonjs',
        moduleResolution: 'node',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        skipLibCheck: true,
      },
    });
  },
};

