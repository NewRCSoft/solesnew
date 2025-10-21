// =============================================
// scripts/verify-dependencies.js - Verificación de Dependencias
// =============================================
const fs = require('fs');
const path = require('path');

function verifyFile(filePath, requiredImports) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const missing = [];
        
        requiredImports.forEach(imp => {
            if (!content.includes(imp)) {
                missing.push(imp);
            }
        });
        
        return { file: filePath, missing };
    } catch (error) {
        return { file: filePath, error: error.message };
    }
}

function checkForDuplicateDeclarations(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        const declarations = {};
        const duplicates = [];
        
        lines.forEach((line, index) => {
            const match = line.match(/^\s*(const|let|var)\s+(\w+)/);
            if (match) {
                const varName = match[2];
                if (declarations[varName]) {
                    duplicates.push({
                        variable: varName,
                        lines: [declarations[varName], index + 1]
                    });
                } else {
                    declarations[varName] = index + 1;
                }
            }
        });
        
        return duplicates;
    } catch (error) {
        return [];
    }
}

console.log('🔍 Verificando dependencias del sistema...\n');

// Verificar modelos
const modelsToCheck = [
    {
        path: './models/Mercaderia.js',
        imports: ['const db = require', 'const logger = require']
    },
    {
        path: './models/StockDeposito.js',
        imports: ['const db = require', 'const logger = require']
    },
    {
        path: './models/MovimientoStock.js',
        imports: ['const db = require', 'const logger = require']
    }
];

console.log('📦 Verificando modelos:');
modelsToCheck.forEach(model => {
    const result = verifyFile(model.path, model.imports);
    if (result.error) {
        console.log(`❌ ${model.path}: ${result.error}`);
    } else if (result.missing.length > 0) {
        console.log(`⚠️  ${model.path}: Faltan imports - ${result.missing.join(', ')}`);
    } else {
        console.log(`✅ ${model.path}: OK`);
    }
});

// Verificar duplicaciones
console.log('\n🔍 Verificando declaraciones duplicadas:');
const filesToCheck = [
    './server.js',
    './config/logger.js',
    './config/database.js'
];

filesToCheck.forEach(file => {
    if (fs.existsSync(file)) {
        const duplicates = checkForDuplicateDeclarations(file);
        if (duplicates.length > 0) {
            console.log(`❌ ${file}: Declaraciones duplicadas encontradas:`);
            duplicates.forEach(dup => {
                console.log(`   - Variable '${dup.variable}' en líneas ${dup.lines.join(' y ')}`);
            });
        } else {
            console.log(`✅ ${file}: Sin duplicaciones`);
        }
    } else {
        console.log(`⚠️  ${file}: Archivo no encontrado`);
    }
});

console.log('\n📋 Checklist para resolver errores:');
console.log('1. Verificar que todos los requires estén al inicio del archivo');
console.log('2. No declarar la misma variable múltiples veces');
console.log('3. Usar nombres únicos para variables');
console.log('4. Verificar paths de imports (../config/logger vs ./config/logger)');
console.log('5. Asegurar que config/logger.js y config/database.js existan');

console.log('\n🚀 Comandos útiles:');
console.log('node scripts/verify-dependencies.js  # Ejecutar esta verificación');
console.log('node -c archivo.js                  # Verificar sintaxis de un archivo');
console.log('npm start --verbose                 # Iniciar con logs detallados');