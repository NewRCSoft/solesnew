# 📦 Sistema de Control de Stock con Múltiples Depósitos

Un sistema completo de gestión de inventario diseñado para empresas que manejan múltiples depósitos con vendedores como intermediarios y clientes con depósitos propios.

## 🏗️ Arquitectura del Sistema

### Flujo de Mercadería
```
CENTRAL → VENDEDORES → CLIENTES
CLIENTES → VENDEDORES → CENTRAL (devoluciones)
```

### Tipos de Depósitos
- **🏢 Central**: Recibe compras, envía a vendedores
- **👤 Vendedores**: Depósito transitorio, actúa como intermediario
- **🏪 Clientes**: Solo clientes seleccionados tienen depósito

## 🚀 Características Principales

### ✅ Gestión Completa de Stock
- Control de stock por depósito independiente
- Alertas de stock mínimo
- Trazabilidad completa de movimientos
- Ajustes de inventario

### ✅ Sistema de Transferencias
- Órdenes de transferencia con entregas parciales
- Control automático de stock
- Estados: Pendiente, Parcial, Completada, Cancelada

### ✅ Códigos de Barras y Etiquetas
- Generación automática de códigos EAN-13
- Impresión de etiquetas individuales y en lote
- Exportación a PDF
- Vista previa de etiquetas

### ✅ Módulos Principales
- **Mercaderías**: CRUD completo con categorías
- **Depósitos**: Gestión automática por entidad
- **Clientes y Vendedores**: Integración con depósitos
- **Movimientos**: Compras, ventas, transferencias, devoluciones
- **Reportes**: Dashboard, análisis, alertas

## 🛠️ Tecnologías Utilizadas

### Backend
- **Node.js** con Express.js
- **MySQL** para base de datos
- **JWT** para autenticación
- **Winston** para logging
- **PDFKit** para generación de PDF
- **JsBarcode** para códigos de barras

### Frontend
- **HTML5/CSS3/JavaScript** vanilla
- **Bootstrap 5** para UI
- **Syncfusion** para componentes avanzados
- **Font Awesome** para iconografía

## 📋 Requisitos del Sistema

### Servidor
- Node.js >= 16.0.0
- MySQL >= 8.0
- 2GB RAM mínimo
- 5GB espacio en disco

### Cliente
- Navegador moderno (Chrome, Firefox, Safari, Edge)
- Resolución mínima: 1024x768

## 🔧 Instalación

### 1. Instalación Automática
```bash
# Clonar repositorio
git clone <repo-url>
cd sistema-stock

# Instalar dependencias
npm install

# Ejecutar instalador interactivo
node scripts/install.js
```

### 2. Instalación Manual

#### Paso 1: Configurar Base de Datos
```sql
CREATE DATABASE sistema_stock CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

#### Paso 2: Configurar Variables de Entorno
```bash
cp .env.example .env
```

Editar `.env`:
```env
NODE_ENV=production
PORT=3001

# Base de datos
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=sistema_stock
DB_PORT=3306

# JWT
JWT_SECRET=your_super_secret_key_here
JWT_EXPIRES_IN=24h

# Logging
LOG_LEVEL=info

# Upload
MAX_FILE_SIZE=10485760
UPLOAD_PATH=./uploads

# Etiquetas
LABEL_WIDTH=100
LABEL_HEIGHT=50
```

#### Paso 3: Crear Estructura
```bash
# Ejecutar migraciones
node scripts/migrate.js

# Insertar datos de ejemplo (opcional)
node -e "require('./utils/seeders').seedAll()"
```

#### Paso 4: Iniciar Sistema
```bash
# Desarrollo
npm run dev

# Producción
npm start
```

## 📚 Documentación de la API

### Base URL
```
http://localhost:3001/api/v1
```

### Autenticación
Todas las rutas protegidas requieren token JWT en el header:
```
Authorization: Bearer <token>
```

### Endpoints Principales

#### 🔐 Autenticación
```http
POST /auth/login
POST /auth/register
GET  /auth/profile
POST /auth/refresh
```

**Ejemplo Login:**
```json
POST /api/v1/auth/login
{
  "email": "admin@sistema.com",
  "password": "admin123"
}

Response:
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "nombre": "Admin Sistema",
    "email": "admin@sistema.com",
    "rol": "ADMIN"
  }
}
```

#### 📦 Mercaderías
```http
GET    /mercaderias           # Listar todas
GET    /mercaderias/:id       # Obtener por ID
POST   /mercaderias           # Crear nueva
PUT    /mercaderias/:id       # Actualizar
DELETE /mercaderias/:id       # Eliminar
GET    /mercaderias/sku/:sku  # Buscar por SKU
GET    /mercaderias/ean13/:ean13 # Buscar por EAN-13
```

**Ejemplo Crear Mercadería:**
```json
POST /api/v1/mercaderias
{
  "descripcion": "Smartphone Samsung Galaxy A54",
  "codigo_sku": "SMSG-A54-128",
  "codigo_ean13": "7123456789012",
  "precio_costo": 45000,
  "precio_venta": 65000,
  "stock_minimo": 5,
  "unidad_medida": "Unidad",
  "id_categoria": 1
}
```

#### 🏪 Depósitos
```http
GET    /depositos                    # Listar todos
GET    /depositos/:id                # Obtener por ID
POST   /depositos                    # Crear nuevo
PUT    /depositos/:id                # Actualizar
DELETE /depositos/:id                # Eliminar
GET    /depositos/tipo/:tipo         # Por tipo (CENTRAL/VENDEDOR/CLIENTE)
GET    /depositos/vendedor/:vendedorId # Depósito de vendedor
GET    /depositos/cliente/:clienteId   # Depósito de cliente
```

#### 📊 Control de Stock
```http
GET  /stock/deposito/:depositoId     # Stock por depósito
GET  /stock/mercaderia/:mercaderiaId # Stock de mercadería en todos los depósitos
GET  /stock/alertas                 # Alertas de stock bajo
POST /stock/transferir              # Transferir entre depósitos
POST /stock/compra                  # Registrar compra
```

**Ejemplo Transferencia:**
```json
POST /api/v1/stock/transferir
{
  "mercaderia_id": 1,
  "deposito_origen_id": 1,
  "deposito_destino_id": 2,
  "cantidad": 10,
  "motivo": "Envío a vendedor",
  "numero_documento": "TR-001"
}
```

#### 🔄 Transferencias (Órdenes)
```http
GET  /transferencias                 # Listar órdenes
GET  /transferencias/:id             # Obtener orden por ID
POST /transferencias                 # Crear nueva orden
POST /transferencias/enviar          # Enviar mercadería (parcial/total)
PUT  /transferencias/:id/cancelar    # Cancelar orden
GET  /transferencias/:id/detalles    # Detalles de orden
```

**Ejemplo Orden de Transferencia:**
```json
POST /api/v1/transferencias
{
  "deposito_origen_id": 1,
  "deposito_destino_id": 2,
  "items": [
    {
      "mercaderia_id": 1,
      "cantidad_solicitada": 10,
      "precio_unitario": 65000
    },
    {
      "mercaderia_id": 2,
      "cantidad_solicitada": 5,
      "precio_unitario": 165000
    }
  ],
  "observaciones": "Pedido urgente del vendedor"
}
```

#### 📈 Movimientos
```http
GET  /movimientos                    # Listar movimientos
GET  /movimientos/:id                # Obtener por ID
GET  /movimientos/deposito/:depositoId # Por depósito
GET  /movimientos/mercaderia/:mercaderiaId # Por mercadería
POST /movimientos/devolucion         # Registrar devolución
POST /movimientos/ajuste             # Ajustar stock
GET  /movimientos/reporte/resumen    # Resumen de movimientos
```

#### 🏷️ Etiquetas y Códigos de Barras
```http
GET  /etiquetas/codigo-barras/:codigo     # Generar código de barras
GET  /etiquetas/etiqueta/:mercaderiaId    # Generar etiqueta
GET  /etiquetas/pdf/:mercaderiaId         # Generar PDF de etiqueta
POST /etiquetas/etiquetas-lote            # Generar lote de etiquetas
```

**Ejemplo Generar Lote:**
```json
POST /api/v1/etiquetas/etiquetas-lote
{
  "mercaderias": [
    { "mercaderia_id": 1, "cantidad": 10 },
    { "mercaderia_id": 2, "cantidad": 5 }
  ]
}
```

#### 👥 Clientes y Vendedores
```http
# Clientes
GET    /clientes                    # Listar todos
GET    /clientes/:id                # Obtener por ID
POST   /clientes                    # Crear nuevo
PUT    /clientes/:id                # Actualizar
DELETE /clientes/:id                # Eliminar
GET    /clientes/vendedor/:vendedorId # Por vendedor
PUT    /clientes/:id/toggle-deposito # Activar/desactivar depósito
GET    /clientes/:id/stock          # Stock del cliente

# Vendedores
GET    /vendedores                  # Listar todos
GET    /vendedores/:id              # Obtener por ID
POST   /vendedores                  # Crear nuevo
PUT    /vendedores/:id              # Actualizar
DELETE /vendedores/:id              # Eliminar
GET    /vendedores/:id/clientes     # Clientes del vendedor
GET    /vendedores/:id/stock        # Stock del vendedor
```

#### 📋 Reportes
```http
GET /reportes/dashboard             # Dashboard principal
GET /reportes/stock/general         # Reporte general de stock
GET /reportes/stock/bajo            # Stock bajo
GET /reportes/stock/valorizado      # Stock valorizado (solo admin)
GET /reportes/movimientos/resumen   # Resumen de movimientos
GET /reportes/vendedores/performance # Performance de vendedores
GET /reportes/clientes/stock        # Stock en clientes
```

## 🔒 Roles y Permisos

### ADMIN
- Acceso completo a todas las funcionalidades
- Gestión de usuarios, vendedores y clientes
- Reportes valorizados
- Configuración del sistema

### OPERADOR
- Gestión de mercaderías y stock
- Órdenes de transferencia
- Movimientos de stock
- Reportes básicos

### VENDEDOR
- Ver su stock y el de sus clientes
- Crear órdenes para sus clientes
- Registrar devoluciones
- Reportes de su zona

## 💾 Base de Datos

### Tablas Principales

#### mercaderias
```sql
id, descripcion, codigo_sku, codigo_ean13, precio_costo, 
cotizacion, precio_venta, stock_minimo, unidad_medida, 
id_categoria, imagen, activo, fecha_creacion, ultima_modificacion
```

#### depositos
```sql
id, nombre, tipo (CENTRAL/VENDEDOR/CLIENTE), entity_id, 
direccion, telefono, email, activo, fecha_creacion
```

#### stock_depositos
```sql
id, mercaderia_id, deposito_id, cantidad, stock_minimo, 
fecha_actualizacion
```

#### movimientos_stock
```sql
id, tipo_movimiento, mercaderia_id, deposito_origen_id, 
deposito_destino_id, cantidad, precio_unitario, motivo, 
numero_documento, usuario_id, fecha_movimiento, observaciones
```

#### ordenes_transferencia
```sql
id, numero_orden, deposito_origen_id, deposito_destino_id, 
estado, fecha_orden, fecha_completada, usuario_id, observaciones
```

### Triggers Automáticos
- **after_movimiento_stock_insert**: Actualiza automáticamente el stock después de cada movimiento

### Vistas Útiles
- **vista_stock_consolidado**: Stock total por mercadería
- **vista_stock_por_deposito**: Stock detallado por depósito
- **vista_movimientos_detallados**: Movimientos con información completa

## 🔧 Mantenimiento

### Backup Automático
```bash
# Crear backup
node -e "const BackupManager = require('./utils/backup'); new BackupManager().createBackup()"

# Listar backups
node -e "const BackupManager = require('./utils/backup'); new BackupManager().listBackups().then(console.log)"

# Limpiar backups antiguos (>30 días)
node -e "const BackupManager = require('./utils/backup'); new BackupManager().cleanOldBackups(30)"
```

### Logs
Los logs se guardan en:
- `logs/error.log` - Solo errores
- `logs/combined.log` - Todos los logs

### Monitoreo
```bash
# Verificar estado del servidor
curl http://localhost:3001/api/health

# Métricas básicas
curl http://localhost:3001/api/v1/reportes/dashboard
```

## 🐛 Solución de Problemas

### Error de Conexión a Base de Datos
```bash
# Verificar conexión
mysql -h localhost -u root -p sistema_stock

# Verificar variables de entorno
node -e "console.log(process.env.DB_HOST, process.env.DB_NAME)"
```

### Error de Permisos
```bash
# Verificar permisos de archivos
chmod -R 755 uploads/
chmod -R 755 logs/

# Verificar usuario de MySQL
GRANT ALL PRIVILEGES ON sistema_stock.* TO 'your_user'@'localhost';
```

### Error en Códigos de Barras
```bash
# Instalar dependencias del canvas
sudo apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
```

### Puerto en Uso
```bash
# Verificar qué proceso usa el puerto
lsof -i :3001

# Cambiar puerto en .env
PORT=3002
```

## 📱 Uso del Sistema

### 1. Primer Inicio
1. Acceder a `http://localhost:3001`
2. Login con credenciales de admin creadas en instalación
3. Configurar categorías, proveedores, zonas
4. Crear vendedores (se crean depósitos automáticamente)
5. Crear clientes y activar depósitos según necesidad

### 2. Flujo Típico de Trabajo

#### Recepción de Mercadería
1. **Mercaderías** → Crear nueva mercadería
2. **Stock** → Registrar compra (ingresa al depósito central)
3. **Etiquetas** → Imprimir etiquetas con código de barras

#### Envío a Vendedores
1. **Transferencias** → Nueva transferencia (Central → Vendedor)
2. Completar orden de transferencia
3. El stock se actualiza automáticamente

#### Entrega a Clientes
1. **Transferencias** → Nueva transferencia (Vendedor → Cliente)
2. Entregas parciales permitidas
3. Control automático de stock

#### Devoluciones
1. **Movimientos** → Registrar devolución
2. Especificar origen y destino
3. Stock se actualiza automáticamente

### 3. Reportes y Control
- **Dashboard**: Vista general del sistema
- **Stock**: Control de inventario y alertas
- **Reportes**: Análisis detallados
- **Movimientos**: Historial completo

## 🔄 Actualizaciones

### Aplicar Nuevas Migraciones
```bash
node scripts/migrate.js
```

### Actualizar Dependencias
```bash
npm update
npm audit fix
```

### Backup Antes de Actualizar
```bash
node -e "const BackupManager = require('./utils/backup'); new BackupManager().createBackup()"
```

## 🤝 Soporte

### Información del Sistema
- Versión: 1.0.0
- Licencia: MIT
- Node.js: >= 16.0.0
- MySQL: >= 8.0

### Contacto
- **Desarrollador**: Sistema Stock Team
- **Email**: soporte@sistemastock.com
- **Documentación**: Ver archivos incluidos

---

## 📄 Licencia

MIT License - Ver archivo LICENSE para más detalles.

## 🙏 Agradecimientos

- Bootstrap Team por el framework CSS
- Syncfusion por los componentes UI
- Node.js Community
- MySQL Team