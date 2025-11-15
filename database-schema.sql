-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Nov 15, 2025 at 10:41 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `sistema_stock`
--

-- --------------------------------------------------------

--
-- Table structure for table `categorias`
--

CREATE TABLE `categorias` (
  `id` int(11) NOT NULL,
  `categoria` varchar(255) NOT NULL,
  `activo` tinyint(1) DEFAULT 1,
  `fecha_creacion` timestamp NOT NULL DEFAULT current_timestamp(),
  `ultima_modificacion` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `clientes`
--

CREATE TABLE `clientes` (
  `clienteId` int(11) NOT NULL,
  `razonSocial` varchar(255) NOT NULL,
  `cuit` varchar(20) NOT NULL,
  `condicionIVA` varchar(50) DEFAULT NULL,
  `domicilio` text DEFAULT NULL,
  `localidad` varchar(100) DEFAULT NULL,
  `provincia` varchar(100) DEFAULT NULL,
  `codigoPostal` varchar(10) DEFAULT NULL,
  `telefono` varchar(50) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `vendedorId` int(11) NOT NULL,
  `zonaId` int(11) NOT NULL,
  `tiene_deposito` tinyint(1) DEFAULT 0,
  `activo` tinyint(1) DEFAULT 1,
  `fecha_creacion` timestamp NOT NULL DEFAULT current_timestamp(),
  `ultima_modificacion` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `depositos`
--

CREATE TABLE `depositos` (
  `id` int(11) NOT NULL,
  `nombre` varchar(255) NOT NULL,
  `tipo` enum('CENTRAL','VENDEDOR','CLIENTE') NOT NULL,
  `entity_id` int(11) DEFAULT NULL,
  `direccion` text DEFAULT NULL,
  `telefono` varchar(50) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `activo` tinyint(1) DEFAULT 1,
  `fecha_creacion` timestamp NOT NULL DEFAULT current_timestamp(),
  `ultima_modificacion` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `detalle_devoluciones_proveedores`
--

CREATE TABLE `detalle_devoluciones_proveedores` (
  `id` int(11) NOT NULL,
  `devolucion_id` int(11) NOT NULL,
  `mercaderia_id` int(11) NOT NULL,
  `lote_id` int(11) DEFAULT NULL,
  `cantidad` decimal(10,2) NOT NULL,
  `precio_unitario` decimal(10,2) NOT NULL,
  `motivo_detalle` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Detalle de items devueltos a proveedores';

-- --------------------------------------------------------

--
-- Table structure for table `detalle_ordenes_compra`
--

CREATE TABLE `detalle_ordenes_compra` (
  `id` int(11) NOT NULL,
  `orden_compra_id` int(11) NOT NULL,
  `mercaderia_id` int(11) NOT NULL,
  `cantidad_solicitada` decimal(10,2) NOT NULL,
  `cantidad_recibida` decimal(10,2) DEFAULT 0.00,
  `precio_unitario` decimal(10,2) NOT NULL,
  `descuento_porcentaje` decimal(5,2) DEFAULT 0.00,
  `subtotal` decimal(12,2) NOT NULL,
  `fecha_vencimiento` date DEFAULT NULL,
  `numero_lote` varchar(100) DEFAULT NULL,
  `estado` enum('PENDIENTE','PARCIAL','COMPLETADO') DEFAULT 'PENDIENTE',
  `observaciones` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Detalle de items en órdenes de compra';

--
-- Triggers `detalle_ordenes_compra`
--
DELIMITER $$
CREATE TRIGGER `update_orden_compra_estado` AFTER UPDATE ON `detalle_ordenes_compra` FOR EACH ROW BEGIN
    DECLARE total_items INT DEFAULT 0;
    DECLARE items_completados INT DEFAULT 0;
    DECLARE items_parciales INT DEFAULT 0;
    
    SELECT COUNT(*), 
           SUM(CASE WHEN cantidad_recibida >= cantidad_solicitada THEN 1 ELSE 0 END),
           SUM(CASE WHEN cantidad_recibida > 0 AND cantidad_recibida < cantidad_solicitada THEN 1 ELSE 0 END)
    INTO total_items, items_completados, items_parciales
    FROM detalle_ordenes_compra 
    WHERE orden_compra_id = NEW.orden_compra_id;
    
    IF items_completados = total_items THEN
        UPDATE ordenes_compra SET estado = 'RECIBIDA' WHERE id = NEW.orden_compra_id;
    ELSEIF items_completados > 0 OR items_parciales > 0 THEN
        UPDATE ordenes_compra SET estado = 'PARCIAL' WHERE id = NEW.orden_compra_id;
    END IF;
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `update_orden_compra_totals` AFTER INSERT ON `detalle_ordenes_compra` FOR EACH ROW BEGIN
    UPDATE ordenes_compra 
    SET subtotal = (
        SELECT SUM(subtotal) 
        FROM detalle_ordenes_compra 
        WHERE orden_compra_id = NEW.orden_compra_id
    )
    WHERE id = NEW.orden_compra_id;
    
    UPDATE ordenes_compra 
    SET total = subtotal + impuestos
    WHERE id = NEW.orden_compra_id;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `detalle_ordenes_transferencia`
--

CREATE TABLE `detalle_ordenes_transferencia` (
  `id` int(11) NOT NULL,
  `orden_id` int(11) NOT NULL,
  `mercaderia_id` int(11) NOT NULL,
  `cantidad_solicitada` decimal(10,2) NOT NULL,
  `cantidad_enviada` decimal(10,2) DEFAULT 0.00,
  `precio_unitario` decimal(10,2) DEFAULT NULL,
  `estado` enum('PENDIENTE','PARCIAL','COMPLETADO') DEFAULT 'PENDIENTE'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `detalle_recepciones`
--

CREATE TABLE `detalle_recepciones` (
  `id` int(11) NOT NULL,
  `recepcion_id` int(11) NOT NULL,
  `detalle_orden_id` int(11) DEFAULT NULL,
  `mercaderia_id` int(11) NOT NULL,
  `cantidad_recibida` decimal(10,2) NOT NULL,
  `precio_unitario` decimal(10,2) NOT NULL DEFAULT 0.00,
  `porcentaje_iva` decimal(10,2) NOT NULL DEFAULT 0.00,
  `iva_unitario` decimal(10,2) NOT NULL DEFAULT 0.00,
  `precio_con_iva` decimal(10,2) NOT NULL DEFAULT 0.00,
  `numero_lote` varchar(100) DEFAULT NULL,
  `fecha_vencimiento` date DEFAULT NULL,
  `observaciones` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `devoluciones_proveedores`
--

CREATE TABLE `devoluciones_proveedores` (
  `id` int(11) NOT NULL,
  `numero_devolucion` varchar(50) NOT NULL,
  `proveedor_id` int(11) NOT NULL,
  `fecha_devolucion` date NOT NULL,
  `motivo` text NOT NULL,
  `estado` enum('PENDIENTE','PROCESADA','RESUELTA') DEFAULT 'PENDIENTE',
  `numero_nota_credito` varchar(100) DEFAULT NULL,
  `monto_total` decimal(12,2) DEFAULT 0.00,
  `observaciones` text DEFAULT NULL,
  `usuario_id` int(11) DEFAULT NULL,
  `fecha_creacion` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Devoluciones realizadas a proveedores';

-- --------------------------------------------------------

--
-- Table structure for table `etiquetas_historial`
--

CREATE TABLE `etiquetas_historial` (
  `id` int(11) NOT NULL,
  `mercaderia_ids` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`mercaderia_ids`)),
  `formato` varchar(50) DEFAULT NULL,
  `cantidad_total` int(11) DEFAULT NULL,
  `usuario_id` int(11) DEFAULT NULL,
  `fecha_impresion` timestamp NOT NULL DEFAULT current_timestamp(),
  `opciones` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`opciones`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `historial_impresiones`
--

CREATE TABLE `historial_impresiones` (
  `id` int(11) NOT NULL,
  `usuario_id` int(11) DEFAULT NULL,
  `tipo_impresora` enum('red','usb') DEFAULT 'red',
  `formato` varchar(20) DEFAULT 'mediana',
  `opciones` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`opciones`)),
  `total_etiquetas` int(11) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `historial_impresiones_mercaderias`
--

CREATE TABLE `historial_impresiones_mercaderias` (
  `id` int(11) NOT NULL,
  `historial_id` int(11) NOT NULL,
  `mercaderia_id` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `lotes_mercaderia`
--

CREATE TABLE `lotes_mercaderia` (
  `id` int(11) NOT NULL,
  `mercaderia_id` int(11) NOT NULL,
  `numero_lote` varchar(100) NOT NULL,
  `fecha_fabricacion` date DEFAULT NULL,
  `fecha_vencimiento` date DEFAULT NULL,
  `cantidad_inicial` decimal(10,2) NOT NULL,
  `cantidad_actual` decimal(10,2) NOT NULL,
  `precio_costo` decimal(10,2) NOT NULL,
  `proveedor_id` int(11) NOT NULL,
  `orden_compra_id` int(11) DEFAULT NULL,
  `detalle_orden_id` int(11) DEFAULT NULL,
  `activo` tinyint(1) DEFAULT 1,
  `fecha_creacion` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Control de lotes con fechas de vencimiento';

-- --------------------------------------------------------

--
-- Table structure for table `mercaderias`
--

CREATE TABLE `mercaderias` (
  `id` int(11) NOT NULL,
  `descripcion` varchar(500) NOT NULL,
  `codigo_sku` varchar(100) NOT NULL,
  `codigo_ean13` varchar(13) DEFAULT NULL,
  `precio_costo` decimal(10,2) NOT NULL DEFAULT 0.00,
  `cotizacion` decimal(10,2) NOT NULL DEFAULT 1.00,
  `precio_venta` decimal(10,2) NOT NULL DEFAULT 0.00,
  `stock_minimo` decimal(10,2) NOT NULL DEFAULT 0.00,
  `unidad_medida` varchar(50) DEFAULT NULL,
  `id_categoria` int(11) DEFAULT NULL,
  `imagen` longtext DEFAULT NULL,
  `activo` tinyint(1) DEFAULT 1,
  `fecha_creacion` timestamp NOT NULL DEFAULT current_timestamp(),
  `ultima_modificacion` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `mercaderia_proveedores`
--

CREATE TABLE `mercaderia_proveedores` (
  `id` int(11) NOT NULL,
  `mercaderia_id` int(11) NOT NULL,
  `proveedor_id` int(11) NOT NULL,
  `precio_compra` decimal(10,2) DEFAULT 0.00,
  `moneda` varchar(3) DEFAULT 'ARS',
  `es_proveedor_principal` tinyint(1) DEFAULT 0,
  `tiempo_entrega_dias` int(11) DEFAULT 7,
  `codigo_producto_proveedor` varchar(100) DEFAULT NULL,
  `cantidad_minima_pedido` int(11) DEFAULT 1,
  `descuento_porcentaje` decimal(5,2) DEFAULT 0.00,
  `condiciones_pago` varchar(255) DEFAULT NULL,
  `observaciones` text DEFAULT NULL,
  `fecha_ultimo_precio` datetime DEFAULT NULL,
  `fecha_ultima_compra` datetime DEFAULT NULL,
  `activo` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `movimientos_stock`
--

CREATE TABLE `movimientos_stock` (
  `id` int(11) NOT NULL,
  `tipo_movimiento` enum('COMPRA','VENTA','TRANSFERENCIA','AJUSTE','DEVOLUCION','FALTANTE') NOT NULL,
  `mercaderia_id` int(11) NOT NULL,
  `deposito_origen_id` int(11) DEFAULT NULL,
  `deposito_destino_id` int(11) DEFAULT NULL,
  `cantidad` decimal(10,2) NOT NULL,
  `precio_unitario` decimal(10,2) DEFAULT NULL,
  `precio_costo` decimal(10,2) DEFAULT NULL,
  `descuento` decimal(10,2) DEFAULT 0.00,
  `impuestos` decimal(10,2) DEFAULT 0.00,
  `total` decimal(12,2) DEFAULT NULL,
  `motivo` text DEFAULT NULL,
  `numero_documento` varchar(100) DEFAULT NULL,
  `usuario_id` int(11) DEFAULT NULL,
  `orden_compra_id` int(11) DEFAULT NULL,
  `recepcion_id` int(11) DEFAULT NULL,
  `lote_id` int(11) DEFAULT NULL,
  `numero_lote` varchar(100) DEFAULT NULL,
  `fecha_vencimiento` date DEFAULT NULL,
  `fecha_movimiento` timestamp NOT NULL DEFAULT current_timestamp(),
  `observaciones` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Triggers `movimientos_stock`
--
DELIMITER $$
CREATE TRIGGER `after_movimiento_stock_insert` AFTER INSERT ON `movimientos_stock` FOR EACH ROW BEGIN
    -- Actualizar stock en depósito origen (si existe)
    IF NEW.deposito_origen_id IS NOT NULL THEN
        UPDATE stock_depositos 
        SET cantidad = cantidad - NEW.cantidad
        WHERE mercaderia_id = NEW.mercaderia_id 
        AND deposito_id = NEW.deposito_origen_id;
    END IF;
    
    -- Actualizar stock en depósito destino (si existe)
    IF NEW.deposito_destino_id IS NOT NULL THEN
        INSERT INTO stock_depositos (mercaderia_id, deposito_id, cantidad)
        VALUES (NEW.mercaderia_id, NEW.deposito_destino_id, NEW.cantidad)
        ON DUPLICATE KEY UPDATE cantidad = cantidad + NEW.cantidad;
    END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `ordenes_compra`
--

CREATE TABLE `ordenes_compra` (
  `id` int(11) NOT NULL,
  `numero_orden` varchar(50) NOT NULL,
  `proveedor_id` int(11) NOT NULL,
  `fecha_orden` date NOT NULL,
  `fecha_entrega_esperada` date DEFAULT NULL,
  `estado` enum('PENDIENTE','PARCIAL','RECIBIDA','CANCELADA') DEFAULT 'PENDIENTE',
  `subtotal` decimal(12,2) DEFAULT 0.00,
  `impuestos` decimal(12,2) DEFAULT 0.00,
  `total` decimal(12,2) DEFAULT 0.00,
  `moneda` varchar(3) DEFAULT 'ARS',
  `tipo_cambio` decimal(10,4) DEFAULT 1.0000,
  `observaciones` text DEFAULT NULL,
  `usuario_id` int(11) DEFAULT NULL,
  `fecha_creacion` timestamp NOT NULL DEFAULT current_timestamp(),
  `ultima_modificacion` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Órdenes de compra a proveedores';

-- --------------------------------------------------------

--
-- Table structure for table `ordenes_transferencia`
--

CREATE TABLE `ordenes_transferencia` (
  `id` int(11) NOT NULL,
  `numero_orden` varchar(50) NOT NULL,
  `deposito_origen_id` int(11) NOT NULL,
  `deposito_destino_id` int(11) NOT NULL,
  `estado` enum('PENDIENTE','PARCIAL','COMPLETADA','CANCELADA') DEFAULT 'PENDIENTE',
  `fecha_orden` timestamp NOT NULL DEFAULT current_timestamp(),
  `fecha_completada` timestamp NULL DEFAULT NULL,
  `usuario_id` int(11) DEFAULT NULL,
  `observaciones` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `proveedores`
--

CREATE TABLE `proveedores` (
  `proveedorId` int(11) NOT NULL,
  `razonSocial` varchar(255) NOT NULL,
  `cuit` varchar(20) DEFAULT NULL,
  `telefono` varchar(50) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `domicilio` text DEFAULT NULL,
  `activo` tinyint(1) DEFAULT 1,
  `fecha_creacion` timestamp NOT NULL DEFAULT current_timestamp(),
  `ultima_modificacion` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `condicionIVA` varchar(50) NOT NULL,
  `localidad` varchar(255) NOT NULL,
  `provincia` varchar(255) NOT NULL,
  `codigoPostal` varchar(10) NOT NULL,
  `contacto` varchar(100) NOT NULL,
  `sitioWeb` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `recepciones_mercaderia`
--

CREATE TABLE `recepciones_mercaderia` (
  `id` int(11) NOT NULL,
  `numero_recepcion` varchar(50) NOT NULL,
  `orden_compra_id` int(11) DEFAULT NULL,
  `proveedor_id` int(11) NOT NULL,
  `fecha_recepcion` date NOT NULL,
  `fecha_vencimiento_documento` date DEFAULT NULL,
  `numero_remito` varchar(100) DEFAULT NULL,
  `numero_factura` varchar(100) DEFAULT NULL,
  `total` decimal(12,2) DEFAULT 0.00,
  `observaciones` text DEFAULT NULL,
  `usuario_id` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `stock_depositos`
--

CREATE TABLE `stock_depositos` (
  `id` int(11) NOT NULL,
  `mercaderia_id` int(11) NOT NULL,
  `deposito_id` int(11) NOT NULL,
  `cantidad` decimal(10,2) NOT NULL DEFAULT 0.00,
  `stock_minimo` decimal(10,2) DEFAULT 0.00,
  `fecha_actualizacion` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `stock_lotes_depositos`
--

CREATE TABLE `stock_lotes_depositos` (
  `id` int(11) NOT NULL,
  `lote_id` int(11) NOT NULL,
  `deposito_id` int(11) NOT NULL,
  `cantidad` decimal(10,2) NOT NULL DEFAULT 0.00,
  `fecha_actualizacion` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Stock por lotes en cada depósito';

-- --------------------------------------------------------

--
-- Table structure for table `usuarios`
--

CREATE TABLE `usuarios` (
  `id` int(11) NOT NULL,
  `nombre` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `rol` enum('ADMIN','OPERADOR','VENDEDOR') NOT NULL,
  `vendedor_id` int(11) DEFAULT NULL,
  `activo` tinyint(1) DEFAULT 1,
  `ultimo_login` timestamp NULL DEFAULT NULL,
  `fecha_creacion` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vendedores`
--

CREATE TABLE `vendedores` (
  `vendedorId` int(11) NOT NULL,
  `razonSocial` varchar(255) NOT NULL,
  `cuit` varchar(20) NOT NULL,
  `condicionIVA` varchar(50) DEFAULT NULL,
  `domicilio` text DEFAULT NULL,
  `localidad` varchar(100) DEFAULT NULL,
  `provincia` varchar(100) DEFAULT NULL,
  `codigoPostal` varchar(10) DEFAULT NULL,
  `telefono` varchar(50) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `activo` tinyint(1) DEFAULT 1,
  `tiene_deposito` tinyint(1) DEFAULT 1,
  `fecha_creacion` timestamp NOT NULL DEFAULT current_timestamp(),
  `ultima_modificacion` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Stand-in structure for view `vista_compras_periodo`
-- (See below for the actual view)
--
CREATE TABLE `vista_compras_periodo` (
`periodo` varchar(7)
,`total_ordenes` bigint(21)
,`monto_total` decimal(34,2)
,`proveedores_diferentes` bigint(21)
,`promedio_orden` decimal(16,6)
,`ordenes_completadas` decimal(22,0)
,`ordenes_pendientes` decimal(22,0)
);

-- --------------------------------------------------------

--
-- Stand-in structure for view `vista_mercaderias_por_vencer`
-- (See below for the actual view)
--
CREATE TABLE `vista_mercaderias_por_vencer` (
`lote_id` int(11)
,`numero_lote` varchar(100)
,`mercaderia` varchar(500)
,`codigo_sku` varchar(100)
,`fecha_vencimiento` date
,`dias_para_vencer` int(7)
,`cantidad_actual` decimal(10,2)
,`proveedor` varchar(255)
,`stock_total_lote` decimal(32,2)
,`estado_vencimiento` varchar(7)
);

-- --------------------------------------------------------

--
-- Stand-in structure for view `vista_mercaderias_proveedores`
-- (See below for the actual view)
--
CREATE TABLE `vista_mercaderias_proveedores` (
`id` int(11)
,`mercaderia_id` int(11)
,`mercaderia_descripcion` varchar(500)
,`codigo_sku` varchar(100)
,`proveedor_id` int(11)
,`proveedor_razon_social` varchar(255)
,`proveedor_cuit` varchar(20)
,`precio_compra` decimal(10,2)
,`es_principal` tinyint(1)
,`activo` tinyint(1)
,`fecha_creacion` timestamp
,`fecha_actualizacion` timestamp
,`margen_porcentaje` decimal(17,2)
);

-- --------------------------------------------------------

--
-- Stand-in structure for view `vista_movimientos_detallados`
-- (See below for the actual view)
--
CREATE TABLE `vista_movimientos_detallados` (
`id` int(11)
,`tipo_movimiento` enum('COMPRA','VENTA','TRANSFERENCIA','AJUSTE','DEVOLUCION','FALTANTE')
,`fecha_movimiento` timestamp
,`mercaderia` varchar(500)
,`codigo_sku` varchar(100)
,`deposito_origen` varchar(255)
,`deposito_destino` varchar(255)
,`cantidad` decimal(10,2)
,`precio_unitario` decimal(10,2)
,`valor_total` decimal(20,4)
,`numero_documento` varchar(100)
,`motivo` text
,`observaciones` text
);

-- --------------------------------------------------------

--
-- Stand-in structure for view `vista_ordenes_compra`
-- (See below for the actual view)
--
CREATE TABLE `vista_ordenes_compra` (
`id` int(11)
,`numero_orden` varchar(50)
,`proveedor_nombre` varchar(255)
,`fecha_orden` date
,`fecha_entrega_esperada` date
,`estado` enum('PENDIENTE','PARCIAL','RECIBIDA','CANCELADA')
,`subtotal` decimal(12,2)
,`impuestos` decimal(12,2)
,`total` decimal(12,2)
,`moneda` varchar(3)
,`total_items` bigint(21)
,`cantidad_total_solicitada` decimal(32,2)
,`cantidad_total_recibida` decimal(32,2)
,`usuario_nombre` varchar(255)
,`fecha_creacion` timestamp
);

-- --------------------------------------------------------

--
-- Stand-in structure for view `vista_stock_consolidado`
-- (See below for the actual view)
--
CREATE TABLE `vista_stock_consolidado` (
`id` int(11)
,`descripcion` varchar(500)
,`codigo_sku` varchar(100)
,`stock_total` decimal(32,2)
,`depositos_con_stock` bigint(21)
,`precio_venta` decimal(10,2)
,`precio_costo` decimal(10,2)
,`categoria` varchar(255)
);

-- --------------------------------------------------------

--
-- Stand-in structure for view `vista_stock_con_lotes`
-- (See below for the actual view)
--
CREATE TABLE `vista_stock_con_lotes` (
`mercaderia_id` int(11)
,`descripcion` varchar(500)
,`codigo_sku` varchar(100)
,`deposito_id` int(11)
,`deposito_nombre` varchar(255)
,`deposito_tipo` enum('CENTRAL','VENDEDOR','CLIENTE')
,`cantidad_total` decimal(32,2)
,`total_lotes` bigint(21)
,`proxima_fecha_vencimiento` date
,`precio_costo_promedio` decimal(14,6)
);

-- --------------------------------------------------------

--
-- Stand-in structure for view `vista_stock_por_deposito`
-- (See below for the actual view)
--
CREATE TABLE `vista_stock_por_deposito` (
`deposito_id` int(11)
,`deposito_nombre` varchar(255)
,`deposito_tipo` enum('CENTRAL','VENDEDOR','CLIENTE')
,`mercaderia_id` int(11)
,`mercaderia_descripcion` varchar(500)
,`codigo_sku` varchar(100)
,`codigo_ean13` varchar(13)
,`cantidad` decimal(10,2)
,`stock_minimo` decimal(10,2)
,`estado_stock` varchar(5)
,`precio_venta` decimal(10,2)
,`valor_stock` decimal(20,4)
);

-- --------------------------------------------------------

--
-- Table structure for table `zonas`
--

CREATE TABLE `zonas` (
  `zonaId` int(11) NOT NULL,
  `zona` varchar(255) NOT NULL,
  `activo` tinyint(1) DEFAULT 1,
  `fecha_creacion` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Structure for view `vista_compras_periodo`
--
DROP TABLE IF EXISTS `vista_compras_periodo`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `vista_compras_periodo`  AS SELECT date_format(`oc`.`fecha_orden`,'%Y-%m') AS `periodo`, count(`oc`.`id`) AS `total_ordenes`, sum(`oc`.`total`) AS `monto_total`, count(distinct `oc`.`proveedor_id`) AS `proveedores_diferentes`, avg(`oc`.`total`) AS `promedio_orden`, sum(case when `oc`.`estado` = 'RECIBIDA' then 1 else 0 end) AS `ordenes_completadas`, sum(case when `oc`.`estado` = 'PENDIENTE' then 1 else 0 end) AS `ordenes_pendientes` FROM `ordenes_compra` AS `oc` WHERE `oc`.`fecha_orden` >= curdate() - interval 12 month GROUP BY date_format(`oc`.`fecha_orden`,'%Y-%m') ORDER BY date_format(`oc`.`fecha_orden`,'%Y-%m') DESC ;

-- --------------------------------------------------------

--
-- Structure for view `vista_mercaderias_por_vencer`
--
DROP TABLE IF EXISTS `vista_mercaderias_por_vencer`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `vista_mercaderias_por_vencer`  AS SELECT `lm`.`id` AS `lote_id`, `lm`.`numero_lote` AS `numero_lote`, `m`.`descripcion` AS `mercaderia`, `m`.`codigo_sku` AS `codigo_sku`, `lm`.`fecha_vencimiento` AS `fecha_vencimiento`, to_days(`lm`.`fecha_vencimiento`) - to_days(curdate()) AS `dias_para_vencer`, `lm`.`cantidad_actual` AS `cantidad_actual`, `p`.`razonSocial` AS `proveedor`, sum(`sld`.`cantidad`) AS `stock_total_lote`, CASE WHEN to_days(`lm`.`fecha_vencimiento`) - to_days(curdate()) <= 0 THEN 'VENCIDO' WHEN to_days(`lm`.`fecha_vencimiento`) - to_days(curdate()) <= 7 THEN 'CRITICO' WHEN to_days(`lm`.`fecha_vencimiento`) - to_days(curdate()) <= 30 THEN 'PROXIMO' ELSE 'OK' END AS `estado_vencimiento` FROM (((`lotes_mercaderia` `lm` join `mercaderias` `m` on(`lm`.`mercaderia_id` = `m`.`id`)) join `proveedores` `p` on(`lm`.`proveedor_id` = `p`.`proveedorId`)) left join `stock_lotes_depositos` `sld` on(`lm`.`id` = `sld`.`lote_id`)) WHERE `lm`.`activo` = 1 AND `lm`.`fecha_vencimiento` is not null AND `lm`.`cantidad_actual` > 0 GROUP BY `lm`.`id` ORDER BY `lm`.`fecha_vencimiento` ASC ;

-- --------------------------------------------------------

--
-- Structure for view `vista_mercaderias_proveedores`
--
DROP TABLE IF EXISTS `vista_mercaderias_proveedores`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `vista_mercaderias_proveedores`  AS SELECT `mp`.`id` AS `id`, `mp`.`mercaderia_id` AS `mercaderia_id`, `m`.`descripcion` AS `mercaderia_descripcion`, `m`.`codigo_sku` AS `codigo_sku`, `mp`.`proveedor_id` AS `proveedor_id`, `p`.`razonSocial` AS `proveedor_razon_social`, `p`.`cuit` AS `proveedor_cuit`, `mp`.`precio_compra` AS `precio_compra`, `mp`.`es_proveedor_principal` AS `es_principal`, `mp`.`activo` AS `activo`, `mp`.`created_at` AS `fecha_creacion`, `mp`.`updated_at` AS `fecha_actualizacion`, CASE WHEN `mp`.`precio_compra` > 0 AND `m`.`precio_venta` > 0 THEN round((`m`.`precio_venta` - `mp`.`precio_compra`) / `mp`.`precio_compra` * 100,2) ELSE NULL END AS `margen_porcentaje` FROM ((`mercaderia_proveedores` `mp` join `mercaderias` `m` on(`mp`.`mercaderia_id` = `m`.`id`)) join `proveedores` `p` on(`mp`.`proveedor_id` = `p`.`proveedorId`)) WHERE `mp`.`activo` = 1 AND `m`.`activo` = 1 AND `p`.`activo` = 1 ;

-- --------------------------------------------------------

--
-- Structure for view `vista_movimientos_detallados`
--
DROP TABLE IF EXISTS `vista_movimientos_detallados`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `vista_movimientos_detallados`  AS SELECT `ms`.`id` AS `id`, `ms`.`tipo_movimiento` AS `tipo_movimiento`, `ms`.`fecha_movimiento` AS `fecha_movimiento`, `m`.`descripcion` AS `mercaderia`, `m`.`codigo_sku` AS `codigo_sku`, `do`.`nombre` AS `deposito_origen`, `dd`.`nombre` AS `deposito_destino`, `ms`.`cantidad` AS `cantidad`, `ms`.`precio_unitario` AS `precio_unitario`, `ms`.`cantidad`* `ms`.`precio_unitario` AS `valor_total`, `ms`.`numero_documento` AS `numero_documento`, `ms`.`motivo` AS `motivo`, `ms`.`observaciones` AS `observaciones` FROM (((`movimientos_stock` `ms` left join `mercaderias` `m` on(`ms`.`mercaderia_id` = `m`.`id`)) left join `depositos` `do` on(`ms`.`deposito_origen_id` = `do`.`id`)) left join `depositos` `dd` on(`ms`.`deposito_destino_id` = `dd`.`id`)) ORDER BY `ms`.`fecha_movimiento` DESC ;

-- --------------------------------------------------------

--
-- Structure for view `vista_ordenes_compra`
--
DROP TABLE IF EXISTS `vista_ordenes_compra`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `vista_ordenes_compra`  AS SELECT `oc`.`id` AS `id`, `oc`.`numero_orden` AS `numero_orden`, `p`.`razonSocial` AS `proveedor_nombre`, `oc`.`fecha_orden` AS `fecha_orden`, `oc`.`fecha_entrega_esperada` AS `fecha_entrega_esperada`, `oc`.`estado` AS `estado`, `oc`.`subtotal` AS `subtotal`, `oc`.`impuestos` AS `impuestos`, `oc`.`total` AS `total`, `oc`.`moneda` AS `moneda`, count(`doc`.`id`) AS `total_items`, sum(`doc`.`cantidad_solicitada`) AS `cantidad_total_solicitada`, sum(`doc`.`cantidad_recibida`) AS `cantidad_total_recibida`, `u`.`nombre` AS `usuario_nombre`, `oc`.`fecha_creacion` AS `fecha_creacion` FROM (((`ordenes_compra` `oc` left join `proveedores` `p` on(`oc`.`proveedor_id` = `p`.`proveedorId`)) left join `detalle_ordenes_compra` `doc` on(`oc`.`id` = `doc`.`orden_compra_id`)) left join `usuarios` `u` on(`oc`.`usuario_id` = `u`.`id`)) GROUP BY `oc`.`id` ;

-- --------------------------------------------------------

--
-- Structure for view `vista_stock_consolidado`
--
DROP TABLE IF EXISTS `vista_stock_consolidado`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `vista_stock_consolidado`  AS SELECT `m`.`id` AS `id`, `m`.`descripcion` AS `descripcion`, `m`.`codigo_sku` AS `codigo_sku`, sum(`sd`.`cantidad`) AS `stock_total`, count(`sd`.`deposito_id`) AS `depositos_con_stock`, `m`.`precio_venta` AS `precio_venta`, `m`.`precio_costo` AS `precio_costo`, `c`.`categoria` AS `categoria` FROM ((`mercaderias` `m` left join `stock_depositos` `sd` on(`m`.`id` = `sd`.`mercaderia_id`)) left join `categorias` `c` on(`m`.`id_categoria` = `c`.`id`)) WHERE `m`.`activo` = 1 GROUP BY `m`.`id` ;

-- --------------------------------------------------------

--
-- Structure for view `vista_stock_con_lotes`
--
DROP TABLE IF EXISTS `vista_stock_con_lotes`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `vista_stock_con_lotes`  AS SELECT `m`.`id` AS `mercaderia_id`, `m`.`descripcion` AS `descripcion`, `m`.`codigo_sku` AS `codigo_sku`, `d`.`id` AS `deposito_id`, `d`.`nombre` AS `deposito_nombre`, `d`.`tipo` AS `deposito_tipo`, sum(`sld`.`cantidad`) AS `cantidad_total`, count(distinct `lm`.`id`) AS `total_lotes`, min(`lm`.`fecha_vencimiento`) AS `proxima_fecha_vencimiento`, avg(`lm`.`precio_costo`) AS `precio_costo_promedio` FROM (((`mercaderias` `m` join `lotes_mercaderia` `lm` on(`m`.`id` = `lm`.`mercaderia_id`)) join `stock_lotes_depositos` `sld` on(`lm`.`id` = `sld`.`lote_id`)) join `depositos` `d` on(`sld`.`deposito_id` = `d`.`id`)) WHERE `m`.`activo` = 1 AND `lm`.`activo` = 1 AND `d`.`activo` = 1 GROUP BY `m`.`id`, `d`.`id` ;

-- --------------------------------------------------------

--
-- Structure for view `vista_stock_por_deposito`
--
DROP TABLE IF EXISTS `vista_stock_por_deposito`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `vista_stock_por_deposito`  AS SELECT `d`.`id` AS `deposito_id`, `d`.`nombre` AS `deposito_nombre`, `d`.`tipo` AS `deposito_tipo`, `m`.`id` AS `mercaderia_id`, `m`.`descripcion` AS `mercaderia_descripcion`, `m`.`codigo_sku` AS `codigo_sku`, `m`.`codigo_ean13` AS `codigo_ean13`, `sd`.`cantidad` AS `cantidad`, `sd`.`stock_minimo` AS `stock_minimo`, CASE WHEN `sd`.`cantidad` <= `sd`.`stock_minimo` THEN 'BAJO' WHEN `sd`.`cantidad` <= `sd`.`stock_minimo` * 1.5 THEN 'MEDIO' ELSE 'OK' END AS `estado_stock`, `m`.`precio_venta` AS `precio_venta`, `sd`.`cantidad`* `m`.`precio_venta` AS `valor_stock` FROM ((`depositos` `d` left join `stock_depositos` `sd` on(`d`.`id` = `sd`.`deposito_id`)) left join `mercaderias` `m` on(`sd`.`mercaderia_id` = `m`.`id`)) WHERE `d`.`activo` = 1 AND (`m`.`activo` = 1 OR `m`.`activo` is null) ;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `categorias`
--
ALTER TABLE `categorias`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `clientes`
--
ALTER TABLE `clientes`
  ADD PRIMARY KEY (`clienteId`),
  ADD UNIQUE KEY `cuit` (`cuit`),
  ADD KEY `vendedorId` (`vendedorId`),
  ADD KEY `zonaId` (`zonaId`);

--
-- Indexes for table `depositos`
--
ALTER TABLE `depositos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_tipo_entity` (`tipo`,`entity_id`);

--
-- Indexes for table `detalle_devoluciones_proveedores`
--
ALTER TABLE `detalle_devoluciones_proveedores`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_devolucion` (`devolucion_id`),
  ADD KEY `idx_mercaderia` (`mercaderia_id`),
  ADD KEY `idx_lote` (`lote_id`);

--
-- Indexes for table `detalle_ordenes_compra`
--
ALTER TABLE `detalle_ordenes_compra`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_orden_compra` (`orden_compra_id`),
  ADD KEY `idx_mercaderia` (`mercaderia_id`),
  ADD KEY `idx_estado` (`estado`),
  ADD KEY `idx_fecha_vencimiento` (`fecha_vencimiento`);

--
-- Indexes for table `detalle_ordenes_transferencia`
--
ALTER TABLE `detalle_ordenes_transferencia`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_orden` (`orden_id`),
  ADD KEY `idx_mercaderia` (`mercaderia_id`),
  ADD KEY `idx_estado` (`estado`);

--
-- Indexes for table `detalle_recepciones`
--
ALTER TABLE `detalle_recepciones`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_recepcion` (`recepcion_id`),
  ADD KEY `idx_detalle_orden` (`detalle_orden_id`),
  ADD KEY `idx_mercaderia` (`mercaderia_id`),
  ADD KEY `idx_fecha_vencimiento` (`fecha_vencimiento`);

--
-- Indexes for table `devoluciones_proveedores`
--
ALTER TABLE `devoluciones_proveedores`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `numero_devolucion` (`numero_devolucion`),
  ADD KEY `usuario_id` (`usuario_id`),
  ADD KEY `idx_numero_devolucion` (`numero_devolucion`),
  ADD KEY `idx_proveedor` (`proveedor_id`),
  ADD KEY `idx_fecha_devolucion` (`fecha_devolucion`),
  ADD KEY `idx_estado` (`estado`);

--
-- Indexes for table `etiquetas_historial`
--
ALTER TABLE `etiquetas_historial`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `historial_impresiones`
--
ALTER TABLE `historial_impresiones`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_usuario` (`usuario_id`),
  ADD KEY `idx_fecha` (`created_at`);

--
-- Indexes for table `historial_impresiones_mercaderias`
--
ALTER TABLE `historial_impresiones_mercaderias`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_historial_mercaderia` (`historial_id`,`mercaderia_id`),
  ADD KEY `mercaderia_id` (`mercaderia_id`);

--
-- Indexes for table `lotes_mercaderia`
--
ALTER TABLE `lotes_mercaderia`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_lote_mercaderia` (`mercaderia_id`,`numero_lote`,`proveedor_id`),
  ADD KEY `orden_compra_id` (`orden_compra_id`),
  ADD KEY `detalle_orden_id` (`detalle_orden_id`),
  ADD KEY `idx_mercaderia` (`mercaderia_id`),
  ADD KEY `idx_numero_lote` (`numero_lote`),
  ADD KEY `idx_fecha_vencimiento` (`fecha_vencimiento`),
  ADD KEY `idx_proveedor` (`proveedor_id`),
  ADD KEY `idx_activo` (`activo`),
  ADD KEY `idx_lotes_fecha_vencimiento_cantidad` (`fecha_vencimiento`,`cantidad_actual`);

--
-- Indexes for table `mercaderias`
--
ALTER TABLE `mercaderias`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `codigo_sku` (`codigo_sku`),
  ADD UNIQUE KEY `codigo_ean13` (`codigo_ean13`),
  ADD KEY `id_categoria` (`id_categoria`),
  ADD KEY `idx_codigo_sku` (`codigo_sku`),
  ADD KEY `idx_codigo_ean13` (`codigo_ean13`),
  ADD KEY `idx_activo` (`activo`),
  ADD KEY `idx_mercaderias_activo_categoria` (`activo`,`id_categoria`);

--
-- Indexes for table `mercaderia_proveedores`
--
ALTER TABLE `mercaderia_proveedores`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_mercaderia_proveedor` (`mercaderia_id`,`proveedor_id`),
  ADD KEY `idx_mercaderia` (`mercaderia_id`),
  ADD KEY `idx_proveedor` (`proveedor_id`),
  ADD KEY `idx_principal` (`es_proveedor_principal`),
  ADD KEY `idx_activo` (`activo`);

--
-- Indexes for table `movimientos_stock`
--
ALTER TABLE `movimientos_stock`
  ADD PRIMARY KEY (`id`),
  ADD KEY `deposito_destino_id` (`deposito_destino_id`),
  ADD KEY `idx_tipo_movimiento` (`tipo_movimiento`),
  ADD KEY `idx_mercaderia` (`mercaderia_id`),
  ADD KEY `idx_fecha` (`fecha_movimiento`),
  ADD KEY `idx_depositos` (`deposito_origen_id`,`deposito_destino_id`),
  ADD KEY `idx_movimientos_fecha_tipo` (`fecha_movimiento`,`tipo_movimiento`),
  ADD KEY `recepcion_id` (`recepcion_id`),
  ADD KEY `idx_movimientos_orden_compra` (`orden_compra_id`),
  ADD KEY `idx_movimientos_lote` (`lote_id`);

--
-- Indexes for table `ordenes_compra`
--
ALTER TABLE `ordenes_compra`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `numero_orden` (`numero_orden`),
  ADD KEY `usuario_id` (`usuario_id`),
  ADD KEY `idx_numero_orden` (`numero_orden`),
  ADD KEY `idx_proveedor` (`proveedor_id`),
  ADD KEY `idx_estado` (`estado`),
  ADD KEY `idx_fecha_orden` (`fecha_orden`),
  ADD KEY `idx_ordenes_compra_fecha_estado` (`fecha_orden`,`estado`);

--
-- Indexes for table `ordenes_transferencia`
--
ALTER TABLE `ordenes_transferencia`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `numero_orden` (`numero_orden`),
  ADD KEY `deposito_origen_id` (`deposito_origen_id`),
  ADD KEY `deposito_destino_id` (`deposito_destino_id`),
  ADD KEY `idx_numero_orden` (`numero_orden`),
  ADD KEY `idx_estado` (`estado`),
  ADD KEY `idx_fecha_orden` (`fecha_orden`);

--
-- Indexes for table `proveedores`
--
ALTER TABLE `proveedores`
  ADD PRIMARY KEY (`proveedorId`),
  ADD UNIQUE KEY `cuit` (`cuit`);

--
-- Indexes for table `recepciones_mercaderia`
--
ALTER TABLE `recepciones_mercaderia`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `numero_recepcion` (`numero_recepcion`),
  ADD KEY `idx_numero_recepcion` (`numero_recepcion`),
  ADD KEY `idx_orden_compra` (`orden_compra_id`),
  ADD KEY `idx_proveedor` (`proveedor_id`),
  ADD KEY `idx_fecha_recepcion` (`fecha_recepcion`),
  ADD KEY `idx_usuario` (`usuario_id`);

--
-- Indexes for table `stock_depositos`
--
ALTER TABLE `stock_depositos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_mercaderia_deposito` (`mercaderia_id`,`deposito_id`),
  ADD KEY `idx_mercaderia` (`mercaderia_id`),
  ADD KEY `idx_deposito` (`deposito_id`),
  ADD KEY `idx_stock_minimo` (`cantidad`,`stock_minimo`),
  ADD KEY `idx_stock_cantidad_minimo` (`cantidad`,`stock_minimo`);

--
-- Indexes for table `stock_lotes_depositos`
--
ALTER TABLE `stock_lotes_depositos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_lote_deposito` (`lote_id`,`deposito_id`),
  ADD KEY `idx_lote` (`lote_id`),
  ADD KEY `idx_deposito` (`deposito_id`);

--
-- Indexes for table `usuarios`
--
ALTER TABLE `usuarios`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`),
  ADD KEY `vendedor_id` (`vendedor_id`);

--
-- Indexes for table `vendedores`
--
ALTER TABLE `vendedores`
  ADD PRIMARY KEY (`vendedorId`),
  ADD UNIQUE KEY `cuit` (`cuit`),
  ADD UNIQUE KEY `email` (`email`);

--
-- Indexes for table `zonas`
--
ALTER TABLE `zonas`
  ADD PRIMARY KEY (`zonaId`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `categorias`
--
ALTER TABLE `categorias`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `clientes`
--
ALTER TABLE `clientes`
  MODIFY `clienteId` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `depositos`
--
ALTER TABLE `depositos`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `detalle_devoluciones_proveedores`
--
ALTER TABLE `detalle_devoluciones_proveedores`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `detalle_ordenes_compra`
--
ALTER TABLE `detalle_ordenes_compra`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `detalle_ordenes_transferencia`
--
ALTER TABLE `detalle_ordenes_transferencia`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `detalle_recepciones`
--
ALTER TABLE `detalle_recepciones`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `devoluciones_proveedores`
--
ALTER TABLE `devoluciones_proveedores`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `etiquetas_historial`
--
ALTER TABLE `etiquetas_historial`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `historial_impresiones`
--
ALTER TABLE `historial_impresiones`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `historial_impresiones_mercaderias`
--
ALTER TABLE `historial_impresiones_mercaderias`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `lotes_mercaderia`
--
ALTER TABLE `lotes_mercaderia`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `mercaderias`
--
ALTER TABLE `mercaderias`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `mercaderia_proveedores`
--
ALTER TABLE `mercaderia_proveedores`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `movimientos_stock`
--
ALTER TABLE `movimientos_stock`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `ordenes_compra`
--
ALTER TABLE `ordenes_compra`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `ordenes_transferencia`
--
ALTER TABLE `ordenes_transferencia`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `proveedores`
--
ALTER TABLE `proveedores`
  MODIFY `proveedorId` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `recepciones_mercaderia`
--
ALTER TABLE `recepciones_mercaderia`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `stock_depositos`
--
ALTER TABLE `stock_depositos`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `stock_lotes_depositos`
--
ALTER TABLE `stock_lotes_depositos`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `usuarios`
--
ALTER TABLE `usuarios`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vendedores`
--
ALTER TABLE `vendedores`
  MODIFY `vendedorId` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `zonas`
--
ALTER TABLE `zonas`
  MODIFY `zonaId` int(11) NOT NULL AUTO_INCREMENT;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `clientes`
--
ALTER TABLE `clientes`
  ADD CONSTRAINT `clientes_ibfk_1` FOREIGN KEY (`vendedorId`) REFERENCES `vendedores` (`vendedorId`),
  ADD CONSTRAINT `clientes_ibfk_2` FOREIGN KEY (`zonaId`) REFERENCES `zonas` (`zonaId`);

--
-- Constraints for table `detalle_devoluciones_proveedores`
--
ALTER TABLE `detalle_devoluciones_proveedores`
  ADD CONSTRAINT `detalle_devoluciones_proveedores_ibfk_1` FOREIGN KEY (`devolucion_id`) REFERENCES `devoluciones_proveedores` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `detalle_devoluciones_proveedores_ibfk_2` FOREIGN KEY (`mercaderia_id`) REFERENCES `mercaderias` (`id`),
  ADD CONSTRAINT `detalle_devoluciones_proveedores_ibfk_3` FOREIGN KEY (`lote_id`) REFERENCES `lotes_mercaderia` (`id`);

--
-- Constraints for table `detalle_ordenes_compra`
--
ALTER TABLE `detalle_ordenes_compra`
  ADD CONSTRAINT `detalle_ordenes_compra_ibfk_1` FOREIGN KEY (`orden_compra_id`) REFERENCES `ordenes_compra` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `detalle_ordenes_compra_ibfk_2` FOREIGN KEY (`mercaderia_id`) REFERENCES `mercaderias` (`id`);

--
-- Constraints for table `detalle_ordenes_transferencia`
--
ALTER TABLE `detalle_ordenes_transferencia`
  ADD CONSTRAINT `detalle_ordenes_transferencia_ibfk_1` FOREIGN KEY (`orden_id`) REFERENCES `ordenes_transferencia` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `detalle_ordenes_transferencia_ibfk_2` FOREIGN KEY (`mercaderia_id`) REFERENCES `mercaderias` (`id`);

--
-- Constraints for table `detalle_recepciones`
--
ALTER TABLE `detalle_recepciones`
  ADD CONSTRAINT `detalle_recepciones_ibfk_1` FOREIGN KEY (`recepcion_id`) REFERENCES `recepciones_mercaderia` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `detalle_recepciones_ibfk_2` FOREIGN KEY (`detalle_orden_id`) REFERENCES `detalle_ordenes_compra` (`id`),
  ADD CONSTRAINT `detalle_recepciones_ibfk_3` FOREIGN KEY (`mercaderia_id`) REFERENCES `mercaderias` (`id`);

--
-- Constraints for table `devoluciones_proveedores`
--
ALTER TABLE `devoluciones_proveedores`
  ADD CONSTRAINT `devoluciones_proveedores_ibfk_1` FOREIGN KEY (`proveedor_id`) REFERENCES `proveedores` (`proveedorId`),
  ADD CONSTRAINT `devoluciones_proveedores_ibfk_2` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`);

--
-- Constraints for table `historial_impresiones`
--
ALTER TABLE `historial_impresiones`
  ADD CONSTRAINT `historial_impresiones_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `historial_impresiones_mercaderias`
--
ALTER TABLE `historial_impresiones_mercaderias`
  ADD CONSTRAINT `historial_impresiones_mercaderias_ibfk_1` FOREIGN KEY (`historial_id`) REFERENCES `historial_impresiones` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `historial_impresiones_mercaderias_ibfk_2` FOREIGN KEY (`mercaderia_id`) REFERENCES `mercaderias` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `lotes_mercaderia`
--
ALTER TABLE `lotes_mercaderia`
  ADD CONSTRAINT `lotes_mercaderia_ibfk_1` FOREIGN KEY (`mercaderia_id`) REFERENCES `mercaderias` (`id`),
  ADD CONSTRAINT `lotes_mercaderia_ibfk_2` FOREIGN KEY (`proveedor_id`) REFERENCES `proveedores` (`proveedorId`),
  ADD CONSTRAINT `lotes_mercaderia_ibfk_3` FOREIGN KEY (`orden_compra_id`) REFERENCES `ordenes_compra` (`id`),
  ADD CONSTRAINT `lotes_mercaderia_ibfk_4` FOREIGN KEY (`detalle_orden_id`) REFERENCES `detalle_ordenes_compra` (`id`);

--
-- Constraints for table `mercaderias`
--
ALTER TABLE `mercaderias`
  ADD CONSTRAINT `mercaderias_ibfk_1` FOREIGN KEY (`id_categoria`) REFERENCES `categorias` (`id`);

--
-- Constraints for table `mercaderia_proveedores`
--
ALTER TABLE `mercaderia_proveedores`
  ADD CONSTRAINT `mercaderia_proveedores_ibfk_1` FOREIGN KEY (`mercaderia_id`) REFERENCES `mercaderias` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `mercaderia_proveedores_ibfk_2` FOREIGN KEY (`proveedor_id`) REFERENCES `proveedores` (`proveedorId`) ON DELETE CASCADE;

--
-- Constraints for table `movimientos_stock`
--
ALTER TABLE `movimientos_stock`
  ADD CONSTRAINT `movimientos_stock_ibfk_1` FOREIGN KEY (`mercaderia_id`) REFERENCES `mercaderias` (`id`),
  ADD CONSTRAINT `movimientos_stock_ibfk_2` FOREIGN KEY (`deposito_origen_id`) REFERENCES `depositos` (`id`),
  ADD CONSTRAINT `movimientos_stock_ibfk_3` FOREIGN KEY (`deposito_destino_id`) REFERENCES `depositos` (`id`),
  ADD CONSTRAINT `movimientos_stock_ibfk_4` FOREIGN KEY (`orden_compra_id`) REFERENCES `ordenes_compra` (`id`),
  ADD CONSTRAINT `movimientos_stock_ibfk_5` FOREIGN KEY (`recepcion_id`) REFERENCES `recepciones_mercaderia` (`id`),
  ADD CONSTRAINT `movimientos_stock_ibfk_6` FOREIGN KEY (`lote_id`) REFERENCES `lotes_mercaderia` (`id`);

--
-- Constraints for table `ordenes_compra`
--
ALTER TABLE `ordenes_compra`
  ADD CONSTRAINT `ordenes_compra_ibfk_1` FOREIGN KEY (`proveedor_id`) REFERENCES `proveedores` (`proveedorId`),
  ADD CONSTRAINT `ordenes_compra_ibfk_2` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`);

--
-- Constraints for table `ordenes_transferencia`
--
ALTER TABLE `ordenes_transferencia`
  ADD CONSTRAINT `ordenes_transferencia_ibfk_1` FOREIGN KEY (`deposito_origen_id`) REFERENCES `depositos` (`id`),
  ADD CONSTRAINT `ordenes_transferencia_ibfk_2` FOREIGN KEY (`deposito_destino_id`) REFERENCES `depositos` (`id`);

--
-- Constraints for table `recepciones_mercaderia`
--
ALTER TABLE `recepciones_mercaderia`
  ADD CONSTRAINT `recepciones_mercaderia_ibfk_1` FOREIGN KEY (`orden_compra_id`) REFERENCES `ordenes_compra` (`id`),
  ADD CONSTRAINT `recepciones_mercaderia_ibfk_2` FOREIGN KEY (`proveedor_id`) REFERENCES `proveedores` (`proveedorId`),
  ADD CONSTRAINT `recepciones_mercaderia_ibfk_3` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`);

--
-- Constraints for table `stock_depositos`
--
ALTER TABLE `stock_depositos`
  ADD CONSTRAINT `stock_depositos_ibfk_1` FOREIGN KEY (`mercaderia_id`) REFERENCES `mercaderias` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `stock_depositos_ibfk_2` FOREIGN KEY (`deposito_id`) REFERENCES `depositos` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `stock_lotes_depositos`
--
ALTER TABLE `stock_lotes_depositos`
  ADD CONSTRAINT `stock_lotes_depositos_ibfk_1` FOREIGN KEY (`lote_id`) REFERENCES `lotes_mercaderia` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `stock_lotes_depositos_ibfk_2` FOREIGN KEY (`deposito_id`) REFERENCES `depositos` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `usuarios`
--
ALTER TABLE `usuarios`
  ADD CONSTRAINT `usuarios_ibfk_1` FOREIGN KEY (`vendedor_id`) REFERENCES `vendedores` (`vendedorId`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
