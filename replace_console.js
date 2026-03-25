import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const targetDirs = [
    'controllers',
    'helpers',
    'middlewares',
    'models',
    'routes',
    'services',
    'utils',
    'workers',
    'config'
];

const loggerPathAbs = path.join(__dirname, 'utils', 'logger.js');

function processDirectory(dirPath) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
            processDirectory(fullPath);
        } else if (entry.isFile() && fullPath.endsWith('.js')) {
            processFile(fullPath);
        }
    }
}

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Skip if no console methods are used to save write cycles
    if (!/console\.(log|error|warn|info)/.test(content)) return;

    let modified = false;

    // Calculate relative path to logger.js
    let relPath = path.relative(path.dirname(filePath), loggerPathAbs).replace(/\\/g, '/');
    if (!relPath.startsWith('.')) {
        relPath = './' + relPath;
    }

    // Inject import if not exists
    if (!content.includes('import logger from') && !content.includes('import logger ')) {
        const importStatement = `import logger from "${relPath}";\n`;
        
        // Find best place to inject (after last import or top of file)
        const importRegex = /^import .+?;?$/gm;
        let lastImportIndex = 0;
        let match;
        while ((match = importRegex.exec(content)) !== null) {
            lastImportIndex = match.index + match[0].length;
        }

        if (lastImportIndex > 0) {
            content = content.slice(0, lastImportIndex) + '\n' + importStatement + content.slice(lastImportIndex);
        } else {
            content = importStatement + content;
        }
        modified = true;
    }

    // Replace console calls
    const newContent = content
        .replace(/console\.log/g, 'logger.info')
        .replace(/console\.info/g, 'logger.info')
        .replace(/console\.warn/g, 'logger.warn')
        .replace(/console\.error/g, 'logger.error');

    if (content !== newContent) {
        content = newContent;
        modified = true;
    }

    if (modified) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated: ${filePath}`);
    }
}

for (const dir of targetDirs) {
    const fullDirPath = path.join(__dirname, dir);
    if (fs.existsSync(fullDirPath)) {
        processDirectory(fullDirPath);
    }
}
