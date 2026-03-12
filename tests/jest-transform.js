// Custom transformer for ts-jest to handle import.meta.url
const { createRequire } = require('module');
const path = require('path');

module.exports = {
  process(sourceText, sourcePath) {
    // Replace import.meta.url with __filename equivalent
    const transformed = sourceText.replace(
      /import\.meta\.url/g,
      `require('url').pathToFileURL(__filename).href`
    );
    
    // Use ts-jest for actual transformation
    const tsJest = require('ts-jest');
    return tsJest.default.process(transformed, sourcePath, {
      tsconfig: {
        target: 'ES2020',
        module: 'commonjs',
        esModuleInterop: true,
      },
    });
  },
};

