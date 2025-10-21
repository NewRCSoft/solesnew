// =============================================
// scripts/verificar-controladores.js
// =============================================
const fs = require('fs');
const path = require('path');

console.log('🔍 Verificando controladores existentes...\n');

// Lista de controladores esperados por el sistema de rutas
const controladoresEsperados = [
    'MercaderiasController.js',
    'DepositosController.js', 
    'StockController.js',
    'TransferenciasController.js',
    'MovimientosController.js',
    'ClientesController.js',
    'VendedoresController.js',
    'CategoriasController.js',
    'ReportesController.js',
    'EtiquetasController.js'
];

const controllersDir = './controllers';
const existentes = [];
const faltantes = [];
const conProblemas = [];

// Verificar si existe el directorio
if (!fs.existsSync(controllersDir)) {
    console.log('❌ El directorio controllers/ no existe');
    console.log('💡 Solución: mkdir controllers');
    process.exit(1);
}

// Verificar cada controlador
controladoresEsperados.forEach(nombreArchivo => {
    const rutaArchivo = path.join(controllersDir, nombreArchivo);
    
    if (fs.existsSync(rutaArchivo)) {
        console.log(`✅ ${nombreArchivo} - EXISTE`);
        existentes.push(nombreArchivo);
        
        // Verificar contenido del archivo
        try {
            const contenido = fs.readFileSync(rutaArchivo, 'utf8');
            
            // Buscar problemas comunes
            const problemas = [];
            
            // Verificar referencias a mysql sin require
            if (contenido.includes('mysql.') && !contenido.includes("require('mysql")) {
                problemas.push('Referencia a mysql sin require');
            }
            
            // Verificar si exporta correctamente
            if (!contenido.includes('module.exports')) {
                problemas.push('No exporta module.exports');
            }
            
            // Verificar sintaxis básica
            if (!contenido.includes('class ') && !contenido.includes('function ')) {
                problemas.push('No tiene estructura de clase o función');
            }
            
            // Verificar que tenga métodos básicos esperados
            const metodosEsperados = ['index', 'show', 'create', 'update'];
            const metodosFaltantes = metodosEsperados.filter(metodo => 
                !contenido.includes(`${metodo}(`) && !contenido.includes(`${metodo} (`)
            );
            
            if (metodosFaltantes.length > 0) {
                problemas.push(`Faltan métodos: ${metodosFaltantes.join(', ')}`);
            }
            
            if (problemas.length > 0) {
                console.log(`⚠️  ${nombreArchivo} - PROBLEMAS DETECTADOS:`);
                problemas.forEach(problema => console.log(`     • ${problema}`));
                conProblemas.push({ archivo: nombreArchivo, problemas });
            }
            
        } catch (error) {
            console.log(`❌ ${nombreArchivo} - ERROR AL LEER: ${error.message}`);
            conProblemas.push({ archivo: nombreArchivo, problemas: ['Error de lectura'] });
        }
        
    } else {
        console.log(`❌ ${nombreArchivo} - FALTANTE`);
        faltantes.push(nombreArchivo);
    }
});

// Resumen
console.log('\n' + '='.repeat(50));
console.log('📊 RESUMEN:');
console.log(`✅ Existentes y OK: ${existentes.length - conProblemas.length}`);
console.log(`⚠️  Con problemas: ${conProblemas.length}`);
console.log(`❌ Faltantes: ${faltantes.length}`);

// Mostrar archivos con problemas
if (conProblemas.length > 0) {
    console.log('\n🔧 ARCHIVOS QUE NECESITAN CORRECCIÓN:');
    conProblemas.forEach(item => {
        console.log(`\n📄 ${item.archivo}:`);
        item.problemas.forEach(problema => console.log(`   • ${problema}`));
    });
}

// Mostrar archivos faltantes
if (faltantes.length > 0) {
    console.log('\n📄 ARCHIVOS FALTANTES:');
    faltantes.forEach(archivo => console.log(`   • ${archivo}`));
}

// Sugerencias de solución
console.log('\n💡 PLAN DE ACCIÓN:');

if (conProblemas.length > 0) {
    console.log('1. Corregir archivos con problemas:');
    conProblemas.forEach(item => {
        if (item.problemas.includes('Referencia a mysql sin require')) {
            console.log(`   • ${item.archivo}: Agregar const db = require('../config/database');`);
        }
        if (item.problemas.some(p => p.includes('Faltan métodos'))) {
            console.log(`   • ${item.archivo}: Implementar métodos CRUD básicos`);
        }
    });
}

if (faltantes.length > 0) {
    console.log('2. Crear archivos faltantes:');
    faltantes.forEach(archivo => {
        console.log(`   • Crear controllers/${archivo} con estructura básica`);
    });
}

console.log('3. Probar el sistema: node server.js');
console.log('4. Verificar rutas: curl http://localhost:3001/api/v1/mercaderias');

// Generar comando para crear solo los faltantes
if (faltantes.length > 0) {
    console.log('\n🚀 COMANDO PARA CREAR SOLO LOS FALTANTES:');
    console.log(`node scripts/crear-solo-faltantes.js`);
    
    // Crear script para generar solo los faltantes
    const scriptFaltantes = `
// Crear solo controladores faltantes
const fs = require('fs');
const faltantes = ${JSON.stringify(faltantes)};

console.log('🔧 Creando solo controladores faltantes...');

faltantes.forEach(archivo => {
    const nombre = archivo.replace('.js', '');
    const contenido = \`class \${nombre} {
    async index(req, res) {
        res.json({ success: true, data: [], message: 'Controlador \${nombre} en desarrollo' });
    }
    async show(req, res) {
        res.json({ success: true, data: {}, message: 'Método show en desarrollo' });
    }
    async create(req, res) {
        res.json({ success: true, message: 'Método create en desarrollo' });
    }
    async update(req, res) {
        res.json({ success: true, message: 'Método update en desarrollo' });
    }
    async destroy(req, res) {
        res.json({ success: true, message: 'Método destroy en desarrollo' });
    }
}

module.exports = new \${nombre}();\`;

    fs.writeFileSync(\`controllers/\${archivo}\`, contenido);
    console.log(\`✅ \${archivo} creado\`);
});

console.log('🎉 Controladores faltantes creados');
`;

    fs.writeFileSync('scripts/crear-solo-faltantes.js', scriptFaltantes);
}

console.log('\n✨ Verificación completada');