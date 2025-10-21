// =============================================
// utils/seeders.js - Datos de Prueba
// =============================================
const db = require('../config/database');
const bcrypt = require('bcryptjs');

class Seeders {
    async seedAll() {
        console.log('🌱 Iniciando seeding de datos...');

        try {
            await this.seedUsers();
            await this.seedCategorias();
            await this.seedZonas();
            await this.seedProveedores();
            await this.seedVendedores();
            await this.seedClientes();
            await this.seedMercaderias();
            await this.seedStock();

            console.log('✅ Seeding completado');
        } catch (error) {
            console.error('❌ Error en seeding:', error);
            throw error;
        }
    }

    async seedUsers() {
        const users = [
            {
                nombre: 'Admin Sistema',
                email: 'admin@sistema.com',
                password: 'admin123',
                rol: 'ADMIN'
            },
            {
                nombre: 'Operador Ejemplo',
                email: 'operador@sistema.com',
                password: 'operador123',
                rol: 'OPERADOR'
            }
        ];

        for (const user of users) {
            const passwordHash = await bcrypt.hash(user.password, 12);
            await db.query(`
                INSERT IGNORE INTO usuarios (nombre, email, password_hash, rol)
                VALUES (?, ?, ?, ?)
            `, [user.nombre, user.email, passwordHash, user.rol]);
        }

        console.log('👥 Usuarios creados');
    }

    async seedCategorias() {
        const categorias = [
            'Electrónicos',
            'Ropa y Accesorios',
            'Hogar y Jardín',
            'Deportes',
            'Libros',
            'Alimentación',
            'Herramientas',
            'Automotor'
        ];

        for (const categoria of categorias) {
            await db.query(
                'INSERT IGNORE INTO categorias (descripcion) VALUES (?)',
                [categoria]
            );
        }

        console.log('📂 Categorías creadas');
    }

    async seedZonas() {
        const zonas = [
            'Zona Norte',
            'Zona Sur', 
            'Zona Este',
            'Zona Oeste',
            'Centro',
            'Interior'
        ];

        for (const zona of zonas) {
            await db.query(
                'INSERT IGNORE INTO zonas (zona) VALUES (?)',
                [zona]
            );
        }

        console.log('🗺️ Zonas creadas');
    }

    async seedProveedores() {
        const proveedores = [
            {
                razonSocial: 'TechnoSupply S.A.',
                cuit: '30123456789',
                telefono: '11-1234-5678',
                email: 'contacto@technosupply.com',
                domicilio: 'Av. Tecnología 1234, CABA'
            },
            {
                razonSocial: 'Distribuidora Central',
                cuit: '30987654321',
                telefono: '11-8765-4321',
                email: 'ventas@distcentral.com',
                domicilio: 'Calle Comercio 567, CABA'
            }
        ];

        for (const proveedor of proveedores) {
            await db.query(`
                INSERT IGNORE INTO proveedores 
                (razonSocial, cuit, telefono, email, domicilio)
                VALUES (?, ?, ?, ?, ?)
            `, [
                proveedor.razonSocial,
                proveedor.cuit,
                proveedor.telefono,
                proveedor.email,
                proveedor.domicilio
            ]);
        }

        console.log('🏢 Proveedores creados');
    }

    async seedVendedores() {
        const vendedores = [
            {
                razonSocial: 'Juan Pérez',
                cuit: '20123456781',
                telefono: '11-2345-6789',
                email: 'juan.perez@empresa.com',
                domicilio: 'San Martín 123, Buenos Aires'
            },
            {
                razonSocial: 'María González',
                cuit: '27987654322',
                telefono: '11-3456-7890',
                email: 'maria.gonzalez@empresa.com',
                domicilio: 'Belgrano 456, Buenos Aires'
            }
        ];

        for (const vendedor of vendedores) {
            await db.query(`
                INSERT IGNORE INTO vendedores 
                (razonSocial, cuit, telefono, email, domicilio)
                VALUES (?, ?, ?, ?, ?)
            `, [
                vendedor.razonSocial,
                vendedor.cuit,
                vendedor.telefono,
                vendedor.email,
                vendedor.domicilio
            ]);
        }

        console.log('👨‍💼 Vendedores creados');
    }

    async seedClientes() {
        const clientes = [
            {
                razonSocial: 'Cliente Premium S.A.',
                cuit: '30555666777',
                condicionIVA: 'Responsable Inscripto',
                domicilio: 'Av. Principal 789, Buenos Aires',
                telefono: '11-4567-8901',
                email: 'contacto@clientepremium.com',
                vendedorId: 1,
                zonaId: 1,
                tiene_deposito: 1
            },
            {
                razonSocial: 'Comercio Minorista',
                cuit: '30888999000',
                condicionIVA: 'Responsable Inscripto',
                domicilio: 'Calle Comercial 321, Buenos Aires',
                telefono: '11-5678-9012',
                email: 'info@comerciominorista.com',
                vendedorId: 2,
                zonaId: 2,
                tiene_deposito: 0
            }
        ];

        for (const cliente of clientes) {
            await db.query(`
                INSERT IGNORE INTO clientes 
                (razonSocial, cuit, condicionIVA, domicilio, telefono, email, vendedorId, zonaId, tiene_deposito)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                cliente.razonSocial,
                cliente.cuit,
                cliente.condicionIVA,
                cliente.domicilio,
                cliente.telefono,
                cliente.email,
                cliente.vendedorId,
                cliente.zonaId,
                cliente.tiene_deposito
            ]);
        }

        console.log('🏪 Clientes creados');
    }

    async seedMercaderias() {
        const mercaderias = [
            {
                descripcion: 'Smartphone Samsung Galaxy A54',
                codigo_sku: 'SMSG-A54-128',
                codigo_ean13: '7123456789012',
                precio_costo: 45000,
                precio_venta: 65000,
                stock_minimo: 5,
                unidad_medida: 'Unidad',
                id_categoria: 1
            },
            {
                descripcion: 'Notebook Lenovo ThinkPad E14',
                codigo_sku: 'NB-LEN-E14',
                codigo_ean13: '7123456789029',
                precio_costo: 120000,
                precio_venta: 165000,
                stock_minimo: 3,
                unidad_medida: 'Unidad',
                id_categoria: 1
            },
            {
                descripcion: 'Remera Deportiva Nike',
                codigo_sku: 'REM-NIKE-001',
                codigo_ean13: '7123456789036',
                precio_costo: 2500,
                precio_venta: 4500,
                stock_minimo: 20,
                unidad_medida: 'Unidad',
                id_categoria: 2
            }
        ];

        for (const mercaderia of mercaderias) {
            await db.query(`
                INSERT IGNORE INTO mercaderias 
                (descripcion, codigo_sku, codigo_ean13, precio_costo, cotizacion, precio_venta, stock_minimo, unidad_medida, id_categoria)
                VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)
            `, [
                mercaderia.descripcion,
                mercaderia.codigo_sku,
                mercaderia.codigo_ean13,
                mercaderia.precio_costo,
                mercaderia.precio_venta,
                mercaderia.stock_minimo,
                mercaderia.unidad_medida,
                mercaderia.id_categoria
            ]);
        }

        console.log('📦 Mercaderías creadas');
    }

    async seedStock() {
        // Obtener depósito central
        const depositoCentral = await db.query(
            "SELECT id FROM depositos WHERE tipo = 'CENTRAL' LIMIT 1"
        );

        if (depositoCentral.length === 0) return;

        const depositoId = depositoCentral[0].id;

        // Obtener mercaderías
        const mercaderias = await db.query(
            "SELECT id, stock_minimo FROM mercaderias WHERE activo = 1"
        );

        // Agregar stock inicial
        for (const mercaderia of mercaderias) {
            const stockInicial = Math.max(mercaderia.stock_minimo * 3, 10);
            
            await db.query(`
                INSERT IGNORE INTO stock_depositos (mercaderia_id, deposito_id, cantidad, stock_minimo)
                VALUES (?, ?, ?, ?)
            `, [mercaderia.id, depositoId, stockInicial, mercaderia.stock_minimo]);

            // Registrar movimiento inicial
            await db.query(`
                INSERT INTO movimientos_stock 
                (tipo_movimiento, mercaderia_id, deposito_destino_id, cantidad, motivo)
                VALUES ('COMPRA', ?, ?, ?, 'Stock inicial del sistema')
            `, [mercaderia.id, depositoId, stockInicial]);
        }

        console.log('📊 Stock inicial creado');
    }
}

module.exports = new Seeders();