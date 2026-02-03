-- CreateEnum
CREATE TYPE "tipo_punto" AS ENUM ('AGENCIA', 'TERMINAL');

-- CreateEnum
CREATE TYPE "estado_viaje" AS ENUM ('ABIERTO', 'CERRADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "metodo_pago" AS ENUM ('EFECTIVO', 'YAPE', 'TARJETA');

-- CreateEnum
CREATE TYPE "estado_ticket" AS ENUM ('EMITIDO', 'ANULADO');

-- CreateEnum
CREATE TYPE "estado_encomienda" AS ENUM ('REGISTRADO', 'EN_ALMACEN', 'EN_RUTA', 'LLEGO_A_DESTINO', 'RETIRADO');

-- CreateEnum
CREATE TYPE "tipo_permiso" AS ENUM ('MENU', 'ACCION', 'RECURSO');

-- CreateEnum
CREATE TYPE "tipo_entidad_media" AS ENUM ('SHIPMENT_EVENT', 'SHIPMENT');

-- CreateEnum
CREATE TYPE "tipo_archivo" AS ENUM ('FOTO_DNI_RETIRO');

-- CreateEnum
CREATE TYPE "estado_facturacion" AS ENUM ('PENDIENTE', 'EMITIDO', 'ERROR');

-- CreateEnum
CREATE TYPE "estado_comprobante" AS ENUM ('PENDIENTE', 'ENVIADO', 'ACEPTADO', 'RECHAZADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "estado_guia_remision" AS ENUM ('PENDIENTE', 'ENVIADA', 'ACEPTADA', 'RECHAZADA', 'ANULADA');

-- CreateTable
CREATE TABLE "tbl_roles" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(50) NOT NULL,
    "estado" INTEGER NOT NULL DEFAULT 1,
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "tbl_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_permisos" (
    "id" SERIAL NOT NULL,
    "codigo" VARCHAR(50) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "tipo" "tipo_permiso" NOT NULL,
    "recurso" VARCHAR(100) NOT NULL,
    "estado" INTEGER NOT NULL DEFAULT 1,
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "tbl_permisos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_roles_permisos" (
    "id" SERIAL NOT NULL,
    "id_rol" INTEGER NOT NULL,
    "id_permiso" INTEGER NOT NULL,
    "estado" INTEGER NOT NULL DEFAULT 1,
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "tbl_roles_permisos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_puntos" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "tipo" "tipo_punto" NOT NULL,
    "ciudad" VARCHAR(100) NOT NULL,
    "direccion" VARCHAR(255),
    "estado" INTEGER NOT NULL DEFAULT 1,
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "tbl_puntos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_usuarios" (
    "id" SERIAL NOT NULL,
    "nombres" VARCHAR(150) NOT NULL,
    "correo" VARCHAR(100) NOT NULL,
    "contrasena" VARCHAR(255) NOT NULL,
    "id_rol" INTEGER NOT NULL,
    "id_punto" INTEGER,
    "estado" INTEGER NOT NULL DEFAULT 1,
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "tbl_usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_rutas" (
    "id" SERIAL NOT NULL,
    "id_punto_origen" INTEGER NOT NULL,
    "id_punto_destino" INTEGER NOT NULL,
    "precio_pasaje" DECIMAL(10,2) NOT NULL,
    "estado" INTEGER NOT NULL DEFAULT 1,
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "tbl_rutas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_horarios_ruta" (
    "id" SERIAL NOT NULL,
    "id_ruta" INTEGER NOT NULL,
    "hora_salida" TIME(6) NOT NULL,
    "habilitado" BOOLEAN NOT NULL DEFAULT true,
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),
    "capacidad_total" INTEGER NOT NULL DEFAULT 40,

    CONSTRAINT "tbl_horarios_ruta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_viajes" (
    "id" SERIAL NOT NULL,
    "id_ruta" INTEGER NOT NULL,
    "id_horario" INTEGER NOT NULL,
    "fecha_servicio" DATE NOT NULL,
    "capacidad_total" INTEGER NOT NULL,
    "capacidad_vendida" INTEGER NOT NULL DEFAULT 0,
    "estado" "estado_viaje" NOT NULL DEFAULT 'ABIERTO',
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "tbl_viajes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_pasajeros" (
    "id" SERIAL NOT NULL,
    "nombre_completo" VARCHAR(150) NOT NULL,
    "documento_identidad" VARCHAR(20) NOT NULL,
    "telefono" VARCHAR(20) NOT NULL,
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),
    "email" VARCHAR(100),
    "puntos" INTEGER NOT NULL DEFAULT 0,
    "puntos_disponibles" INTEGER DEFAULT 0,
    "puntos_historicos" INTEGER DEFAULT 0,

    CONSTRAINT "tbl_pasajeros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_tickets" (
    "id" SERIAL NOT NULL,
    "id_viaje" INTEGER NOT NULL,
    "id_pasajero" INTEGER NOT NULL,
    "codigo_interno" VARCHAR(20) NOT NULL,
    "fecha_venta" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id_usuario_venta" INTEGER NOT NULL,
    "metodo_pago" "metodo_pago" NOT NULL,
    "estado" "estado_ticket" NOT NULL DEFAULT 'EMITIDO',
    "fecha_anulacion" TIMESTAMPTZ(6),
    "id_usuario_anulacion" INTEGER,
    "motivo_anulacion" VARCHAR(255),
    "invoice_status" "estado_facturacion" NOT NULL DEFAULT 'PENDIENTE',
    "invoice_ref" VARCHAR(50),
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),
    "precio_original" DECIMAL(10,2),
    "puntos_usados" INTEGER DEFAULT 0,
    "descuento_puntos" DECIMAL(10,2) DEFAULT 0,
    "precio_final" DECIMAL(10,2),
    "puntos_ganados" INTEGER DEFAULT 0,
    "id_comprobante" INTEGER,

    CONSTRAINT "tbl_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_encomiendas" (
    "id" SERIAL NOT NULL,
    "codigo_tracking" VARCHAR(20) NOT NULL,
    "id_punto_origen" INTEGER NOT NULL,
    "id_punto_destino" INTEGER NOT NULL,
    "remitente_nombre" VARCHAR(150) NOT NULL,
    "remitente_dni" VARCHAR(20) NOT NULL,
    "remitente_telefono" VARCHAR(20) NOT NULL,
    "destinatario_nombre" VARCHAR(150) NOT NULL,
    "destinatario_telefono" VARCHAR(20) NOT NULL,
    "tipo_paquete" VARCHAR(50) NOT NULL,
    "descripcion" VARCHAR(255),
    "peso" DECIMAL(10,2) NOT NULL,
    "alto" DECIMAL(10,2) NOT NULL,
    "ancho" DECIMAL(10,2) NOT NULL,
    "largo" DECIMAL(10,2) NOT NULL,
    "precio_calculado" DECIMAL(10,2) NOT NULL,
    "estado_actual" "estado_encomienda" NOT NULL DEFAULT 'REGISTRADO',
    "id_usuario_creacion" INTEGER NOT NULL,
    "invoice_status" "estado_facturacion" NOT NULL DEFAULT 'PENDIENTE',
    "invoice_ref" VARCHAR(50),
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),
    "id_cliente" INTEGER,
    "puntos_usados" INTEGER DEFAULT 0,
    "descuento_puntos" DECIMAL(10,2) DEFAULT 0,
    "precio_final" DECIMAL(10,2),
    "puntos_ganados" INTEGER DEFAULT 0,
    "id_comprobante" INTEGER,
    "id_guia_remision" INTEGER,

    CONSTRAINT "tbl_encomiendas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_eventos_encomienda" (
    "id" SERIAL NOT NULL,
    "id_encomienda" INTEGER NOT NULL,
    "estado_destino" "estado_encomienda" NOT NULL,
    "fecha_evento" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id_usuario_evento" INTEGER NOT NULL,
    "id_punto_evento" INTEGER NOT NULL,
    "nota" VARCHAR(255),
    "dni_retiro" VARCHAR(20),
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "tbl_eventos_encomienda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_archivos_media" (
    "id" SERIAL NOT NULL,
    "tipo_entidad" "tipo_entidad_media" NOT NULL,
    "id_entidad" INTEGER NOT NULL,
    "tipo_archivo" "tipo_archivo" NOT NULL,
    "url_storage" TEXT NOT NULL,
    "id_usuario_creacion" INTEGER NOT NULL,
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "tbl_archivos_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_log_auditoria" (
    "id" SERIAL NOT NULL,
    "id_usuario_actor" INTEGER,
    "accion" VARCHAR(100) NOT NULL,
    "tipo_entidad" VARCHAR(50) NOT NULL,
    "id_entidad" VARCHAR(50) NOT NULL,
    "payload_json" JSONB,
    "fecha_creacion" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_log_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_configuracion_precios_encomienda" (
    "id" SERIAL NOT NULL,
    "tarifa_base" DECIMAL(10,2) NOT NULL,
    "precio_por_kg" DECIMAL(10,2) NOT NULL,
    "precio_por_cm3" DECIMAL(10,4) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "tbl_configuracion_precios_encomienda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_configuracion_sistema" (
    "id" SERIAL NOT NULL,
    "nombre_empresa" VARCHAR(255) NOT NULL DEFAULT 'Transportes Herminio',
    "ruc" VARCHAR(11),
    "direccion" VARCHAR(500),
    "telefono" VARCHAR(50),
    "precio_base_pasaje" DECIMAL(10,2) DEFAULT 25.00,
    "precio_base_encomienda_kg" DECIMAL(10,2) DEFAULT 5.00,
    "tiempo_reserva_minutos" INTEGER DEFAULT 30,
    "capacidad_default_bus" INTEGER DEFAULT 40,
    "activo" BOOLEAN DEFAULT true,
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),
    "soles_por_punto" DECIMAL(10,2) DEFAULT 10.00,
    "puntos_por_sol_descuento" DECIMAL(10,2) DEFAULT 10.00,

    CONSTRAINT "tbl_configuracion_sistema_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_comprobante_items" (
    "id" SERIAL NOT NULL,
    "id_comprobante" INTEGER NOT NULL,
    "numero_item" INTEGER NOT NULL,
    "codigo" VARCHAR(50),
    "descripcion" VARCHAR(500) NOT NULL,
    "unidad_medida" VARCHAR(3) DEFAULT 'ZZ',
    "cantidad" DECIMAL(12,3) NOT NULL,
    "valor_unitario" DECIMAL(12,6) NOT NULL,
    "precio_unitario" DECIMAL(12,6) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "igv" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "tipo_igv" VARCHAR(2) DEFAULT '10',

    CONSTRAINT "tbl_comprobante_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_comprobantes" (
    "id" SERIAL NOT NULL,
    "tipo_comprobante" VARCHAR(2) NOT NULL,
    "serie" VARCHAR(4) NOT NULL,
    "numero" INTEGER NOT NULL,
    "numero_completo" VARCHAR(15),
    "fecha_emision" DATE NOT NULL DEFAULT CURRENT_DATE,
    "hora_emision" TIME(6) NOT NULL DEFAULT LOCALTIME,
    "cliente_tipo_doc" VARCHAR(1) NOT NULL,
    "cliente_num_doc" VARCHAR(15) NOT NULL,
    "cliente_razon_social" VARCHAR(200) NOT NULL,
    "cliente_direccion" VARCHAR(300),
    "subtotal" DECIMAL(12,2) NOT NULL,
    "igv" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "moneda" VARCHAR(3) DEFAULT 'PEN',
    "origen_tipo" VARCHAR(20),
    "origen_id" INTEGER,
    "estado" "estado_comprobante" DEFAULT 'PENDIENTE',
    "keyfacil_id" VARCHAR(100),
    "keyfacil_response" JSONB,
    "hash_cpe" VARCHAR(100),
    "codigo_qr" TEXT,
    "pdf_url" TEXT,
    "xml_url" TEXT,
    "cdr_url" TEXT,
    "mensaje_error" TEXT,
    "intentos_envio" INTEGER DEFAULT 0,
    "fecha_anulacion" TIMESTAMP(6),
    "motivo_anulacion" TEXT,
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMP(6),

    CONSTRAINT "tbl_comprobantes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_configuracion_sunat" (
    "id" SERIAL NOT NULL,
    "ruc_emisor" VARCHAR(11) NOT NULL,
    "razon_social" VARCHAR(200) NOT NULL,
    "nombre_comercial" VARCHAR(200),
    "direccion_fiscal" VARCHAR(300),
    "ubigeo" VARCHAR(6),
    "departamento" VARCHAR(100),
    "provincia" VARCHAR(100),
    "distrito" VARCHAR(100),
    "keyfacil_token" TEXT NOT NULL,
    "keyfacil_url" VARCHAR(200) DEFAULT 'https://api.vitekey.com/keyfact/integra/v1',
    "modo_produccion" BOOLEAN DEFAULT false,
    "igv_porcentaje" DECIMAL(5,2) DEFAULT 18.00,
    "activo" BOOLEAN DEFAULT true,
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMP(6),

    CONSTRAINT "tbl_configuracion_sunat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_guia_remision_items" (
    "id" SERIAL NOT NULL,
    "id_guia" INTEGER NOT NULL,
    "numero_item" INTEGER NOT NULL,
    "codigo" VARCHAR(50),
    "descripcion" VARCHAR(500) NOT NULL,
    "unidad_medida" VARCHAR(3) DEFAULT 'ZZ',
    "cantidad" DECIMAL(12,3) NOT NULL,
    "peso" DECIMAL(12,3),

    CONSTRAINT "tbl_guia_remision_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_guias_remision" (
    "id" SERIAL NOT NULL,
    "serie" VARCHAR(4) NOT NULL DEFAULT 'T001',
    "numero" INTEGER NOT NULL,
    "numero_completo" VARCHAR(15),
    "fecha_emision" DATE NOT NULL DEFAULT CURRENT_DATE,
    "fecha_inicio_traslado" DATE NOT NULL,
    "motivo_traslado" VARCHAR(2) NOT NULL DEFAULT '01',
    "descripcion_motivo" VARCHAR(200),
    "modalidad_traslado" VARCHAR(2) NOT NULL DEFAULT '01',
    "peso_bruto_total" DECIMAL(12,3) NOT NULL,
    "unidad_peso" VARCHAR(3) DEFAULT 'KGM',
    "numero_bultos" INTEGER DEFAULT 1,
    "ubigeo_partida" VARCHAR(6) NOT NULL,
    "direccion_partida" VARCHAR(300) NOT NULL,
    "ubigeo_llegada" VARCHAR(6) NOT NULL,
    "direccion_llegada" VARCHAR(300) NOT NULL,
    "destinatario_tipo_doc" VARCHAR(1) NOT NULL,
    "destinatario_num_doc" VARCHAR(15) NOT NULL,
    "destinatario_razon_social" VARCHAR(200) NOT NULL,
    "transportista_ruc" VARCHAR(11),
    "transportista_razon_social" VARCHAR(200),
    "conductor_tipo_doc" VARCHAR(1),
    "conductor_num_doc" VARCHAR(15),
    "conductor_nombres" VARCHAR(200),
    "conductor_apellidos" VARCHAR(200),
    "conductor_licencia" VARCHAR(20),
    "vehiculo_placa" VARCHAR(10),
    "id_encomienda" INTEGER,
    "estado" "estado_guia_remision" DEFAULT 'PENDIENTE',
    "keyfacil_id" VARCHAR(100),
    "keyfacil_response" JSONB,
    "pdf_url" TEXT,
    "mensaje_error" TEXT,
    "fecha_anulacion" TIMESTAMP(6),
    "motivo_anulacion" TEXT,
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMP(6),

    CONSTRAINT "tbl_guias_remision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_log_keyfacil" (
    "id" SERIAL NOT NULL,
    "fecha_hora" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "endpoint" VARCHAR(200),
    "metodo" VARCHAR(10),
    "request_body" JSONB,
    "response_status" INTEGER,
    "response_body" JSONB,
    "tiempo_respuesta_ms" INTEGER,
    "id_comprobante" INTEGER,
    "id_guia" INTEGER,

    CONSTRAINT "tbl_log_keyfacil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_series_factura" (
    "id" SERIAL NOT NULL,
    "tipo_comprobante" VARCHAR(2) NOT NULL,
    "serie" VARCHAR(4) NOT NULL,
    "numero_actual" INTEGER DEFAULT 0,
    "activo" BOOLEAN DEFAULT true,

    CONSTRAINT "tbl_series_factura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_roles_nombre_key" ON "tbl_roles"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_permisos_codigo_key" ON "tbl_permisos"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_roles_permisos_id_rol_id_permiso_key" ON "tbl_roles_permisos"("id_rol", "id_permiso");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_usuarios_correo_key" ON "tbl_usuarios"("correo");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_rutas_id_punto_origen_id_punto_destino_key" ON "tbl_rutas"("id_punto_origen", "id_punto_destino");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_horarios_ruta_id_ruta_hora_salida_key" ON "tbl_horarios_ruta"("id_ruta", "hora_salida");

-- CreateIndex
CREATE INDEX "idx_horarios_ruta_capacidad" ON "tbl_horarios_ruta"("capacidad_total");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_viajes_id_ruta_id_horario_fecha_servicio_key" ON "tbl_viajes"("id_ruta", "id_horario", "fecha_servicio");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_pasajeros_documento_identidad_key" ON "tbl_pasajeros"("documento_identidad");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_tickets_codigo_interno_key" ON "tbl_tickets"("codigo_interno");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_encomiendas_codigo_tracking_key" ON "tbl_encomiendas"("codigo_tracking");

-- CreateIndex
CREATE INDEX "idx_encomiendas_cliente" ON "tbl_encomiendas"("id_cliente");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_comprobantes_tipo_comprobante_serie_numero_key" ON "tbl_comprobantes"("tipo_comprobante", "serie", "numero");

-- CreateIndex
CREATE INDEX "idx_comprobantes_cliente" ON "tbl_comprobantes"("cliente_num_doc");

-- CreateIndex
CREATE INDEX "idx_comprobantes_estado" ON "tbl_comprobantes"("estado");

-- CreateIndex
CREATE INDEX "idx_comprobantes_fecha" ON "tbl_comprobantes"("fecha_emision");

-- CreateIndex
CREATE INDEX "idx_comprobantes_origen" ON "tbl_comprobantes"("origen_tipo", "origen_id");

-- CreateIndex
CREATE INDEX "idx_comprobantes_tipo" ON "tbl_comprobantes"("tipo_comprobante");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_guias_remision_serie_numero_key" ON "tbl_guias_remision"("serie", "numero");

-- CreateIndex
CREATE INDEX "idx_guias_encomienda" ON "tbl_guias_remision"("id_encomienda");

-- CreateIndex
CREATE INDEX "idx_guias_estado" ON "tbl_guias_remision"("estado");

-- CreateIndex
CREATE INDEX "idx_guias_fecha" ON "tbl_guias_remision"("fecha_emision");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_series_factura_tipo_comprobante_serie_key" ON "tbl_series_factura"("tipo_comprobante", "serie");

-- AddForeignKey
ALTER TABLE "tbl_roles_permisos" ADD CONSTRAINT "tbl_roles_permisos_id_permiso_fkey" FOREIGN KEY ("id_permiso") REFERENCES "tbl_permisos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_roles_permisos" ADD CONSTRAINT "tbl_roles_permisos_id_rol_fkey" FOREIGN KEY ("id_rol") REFERENCES "tbl_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_usuarios" ADD CONSTRAINT "tbl_usuarios_id_punto_fkey" FOREIGN KEY ("id_punto") REFERENCES "tbl_puntos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_usuarios" ADD CONSTRAINT "tbl_usuarios_id_rol_fkey" FOREIGN KEY ("id_rol") REFERENCES "tbl_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_rutas" ADD CONSTRAINT "tbl_rutas_id_punto_destino_fkey" FOREIGN KEY ("id_punto_destino") REFERENCES "tbl_puntos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_rutas" ADD CONSTRAINT "tbl_rutas_id_punto_origen_fkey" FOREIGN KEY ("id_punto_origen") REFERENCES "tbl_puntos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_horarios_ruta" ADD CONSTRAINT "tbl_horarios_ruta_id_ruta_fkey" FOREIGN KEY ("id_ruta") REFERENCES "tbl_rutas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_viajes" ADD CONSTRAINT "tbl_viajes_id_horario_fkey" FOREIGN KEY ("id_horario") REFERENCES "tbl_horarios_ruta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_viajes" ADD CONSTRAINT "tbl_viajes_id_ruta_fkey" FOREIGN KEY ("id_ruta") REFERENCES "tbl_rutas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_tickets" ADD CONSTRAINT "tbl_tickets_id_comprobante_fkey" FOREIGN KEY ("id_comprobante") REFERENCES "tbl_comprobantes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_tickets" ADD CONSTRAINT "tbl_tickets_id_pasajero_fkey" FOREIGN KEY ("id_pasajero") REFERENCES "tbl_pasajeros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_tickets" ADD CONSTRAINT "tbl_tickets_id_usuario_anulacion_fkey" FOREIGN KEY ("id_usuario_anulacion") REFERENCES "tbl_usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_tickets" ADD CONSTRAINT "tbl_tickets_id_usuario_venta_fkey" FOREIGN KEY ("id_usuario_venta") REFERENCES "tbl_usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_tickets" ADD CONSTRAINT "tbl_tickets_id_viaje_fkey" FOREIGN KEY ("id_viaje") REFERENCES "tbl_viajes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_encomiendas" ADD CONSTRAINT "fk_encomienda_cliente" FOREIGN KEY ("id_cliente") REFERENCES "tbl_pasajeros"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_encomiendas" ADD CONSTRAINT "tbl_encomiendas_id_comprobante_fkey" FOREIGN KEY ("id_comprobante") REFERENCES "tbl_comprobantes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_encomiendas" ADD CONSTRAINT "tbl_encomiendas_id_guia_remision_fkey" FOREIGN KEY ("id_guia_remision") REFERENCES "tbl_guias_remision"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_encomiendas" ADD CONSTRAINT "tbl_encomiendas_id_punto_destino_fkey" FOREIGN KEY ("id_punto_destino") REFERENCES "tbl_puntos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_encomiendas" ADD CONSTRAINT "tbl_encomiendas_id_punto_origen_fkey" FOREIGN KEY ("id_punto_origen") REFERENCES "tbl_puntos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_encomiendas" ADD CONSTRAINT "tbl_encomiendas_id_usuario_creacion_fkey" FOREIGN KEY ("id_usuario_creacion") REFERENCES "tbl_usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_eventos_encomienda" ADD CONSTRAINT "tbl_eventos_encomienda_id_encomienda_fkey" FOREIGN KEY ("id_encomienda") REFERENCES "tbl_encomiendas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_eventos_encomienda" ADD CONSTRAINT "tbl_eventos_encomienda_id_punto_evento_fkey" FOREIGN KEY ("id_punto_evento") REFERENCES "tbl_puntos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_eventos_encomienda" ADD CONSTRAINT "tbl_eventos_encomienda_id_usuario_evento_fkey" FOREIGN KEY ("id_usuario_evento") REFERENCES "tbl_usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_archivos_media" ADD CONSTRAINT "tbl_archivos_media_id_usuario_creacion_fkey" FOREIGN KEY ("id_usuario_creacion") REFERENCES "tbl_usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_log_auditoria" ADD CONSTRAINT "tbl_log_auditoria_id_usuario_actor_fkey" FOREIGN KEY ("id_usuario_actor") REFERENCES "tbl_usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_comprobante_items" ADD CONSTRAINT "tbl_comprobante_items_id_comprobante_fkey" FOREIGN KEY ("id_comprobante") REFERENCES "tbl_comprobantes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_guia_remision_items" ADD CONSTRAINT "tbl_guia_remision_items_id_guia_fkey" FOREIGN KEY ("id_guia") REFERENCES "tbl_guias_remision"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_guias_remision" ADD CONSTRAINT "tbl_guias_remision_id_encomienda_fkey" FOREIGN KEY ("id_encomienda") REFERENCES "tbl_encomiendas"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_log_keyfacil" ADD CONSTRAINT "tbl_log_keyfacil_id_comprobante_fkey" FOREIGN KEY ("id_comprobante") REFERENCES "tbl_comprobantes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
