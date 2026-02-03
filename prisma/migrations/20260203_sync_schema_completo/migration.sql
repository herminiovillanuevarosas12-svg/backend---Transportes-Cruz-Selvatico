-- Migración de sincronización completa con schema.prisma
-- Fecha: 2026-02-03
-- Propósito: Homologar base de datos para despliegue en nuevo servidor

-- ============================================
-- 1. CREAR TABLA tbl_tipos_carro
-- ============================================
CREATE TABLE IF NOT EXISTS "tbl_tipos_carro" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "descripcion" TEXT,
    "estado" INTEGER DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6),
    "updated_by" INTEGER,
    CONSTRAINT "tbl_tipos_carro_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_tipos_carro_estado" ON "tbl_tipos_carro"("estado");

-- ============================================
-- 2. CREAR TABLA tbl_notas_venta
-- ============================================
CREATE TABLE IF NOT EXISTS "tbl_notas_venta" (
    "id" SERIAL NOT NULL,
    "serie" VARCHAR(4) NOT NULL,
    "numero" INTEGER NOT NULL,
    "numero_completo" VARCHAR(15),
    "fecha_emision" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cliente_nombre" VARCHAR(200) NOT NULL,
    "cliente_documento" VARCHAR(20) NOT NULL,
    "descripcion" VARCHAR(500) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "origen_tipo" VARCHAR(20) NOT NULL,
    "origen_id" INTEGER NOT NULL,
    "estado" INTEGER NOT NULL DEFAULT 1,
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),
    "comentario" VARCHAR(500),
    CONSTRAINT "tbl_notas_venta_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_notas_venta_serie_numero" ON "tbl_notas_venta"("serie", "numero");
CREATE INDEX IF NOT EXISTS "idx_notas_venta_fecha" ON "tbl_notas_venta"("fecha_emision");
CREATE INDEX IF NOT EXISTS "idx_notas_venta_origen" ON "tbl_notas_venta"("origen_tipo", "origen_id");

-- Trigger para calcular numero_completo automaticamente
CREATE OR REPLACE FUNCTION calcular_numero_completo_nota_venta()
RETURNS TRIGGER AS $$
BEGIN
    NEW.numero_completo := NEW.serie || '-' || lpad(NEW.numero::text, 8, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calcular_numero_completo ON "tbl_notas_venta";
CREATE TRIGGER trg_calcular_numero_completo
    BEFORE INSERT OR UPDATE ON "tbl_notas_venta"
    FOR EACH ROW
    EXECUTE FUNCTION calcular_numero_completo_nota_venta();

-- ============================================
-- 3. CREAR TABLA tbl_cache_consulta_doc
-- ============================================
CREATE TABLE IF NOT EXISTS "tbl_cache_consulta_doc" (
    "id" SERIAL NOT NULL,
    "tipo_documento" VARCHAR(3) NOT NULL,
    "numero_documento" VARCHAR(15) NOT NULL,
    "datos_respuesta" JSONB NOT NULL,
    "fecha_consulta" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "fecha_expiracion" TIMESTAMPTZ(6) NOT NULL,
    "consultas_count" INTEGER DEFAULT 1,
    CONSTRAINT "tbl_cache_consulta_doc_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_cache_tipo_numero" ON "tbl_cache_consulta_doc"("tipo_documento", "numero_documento");
CREATE INDEX IF NOT EXISTS "idx_cache_doc_expiracion" ON "tbl_cache_consulta_doc"("fecha_expiracion");
CREATE INDEX IF NOT EXISTS "idx_cache_doc_lookup" ON "tbl_cache_consulta_doc"("tipo_documento", "numero_documento");

-- ============================================
-- 4. CREAR TABLA tbl_landing_banners
-- ============================================
CREATE TABLE IF NOT EXISTS "tbl_landing_banners" (
    "id" SERIAL NOT NULL,
    "titulo" VARCHAR(200),
    "subtitulo" VARCHAR(300),
    "imagen_path" VARCHAR(500) NOT NULL,
    "url_destino" VARCHAR(500),
    "orden" INTEGER DEFAULT 0,
    "activo" BOOLEAN DEFAULT true,
    "fecha_inicio" DATE,
    "fecha_fin" DATE,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "user_id_registration" INTEGER,
    "tipo" VARCHAR(20) DEFAULT 'banner',
    CONSTRAINT "tbl_landing_banners_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_landing_banners_orden" ON "tbl_landing_banners"("orden", "activo");
CREATE INDEX IF NOT EXISTS "idx_landing_banners_tipo" ON "tbl_landing_banners"("tipo", "activo", "orden");

-- AddForeignKey para landing_banners
ALTER TABLE "tbl_landing_banners"
ADD CONSTRAINT "tbl_landing_banners_user_id_registration_fkey"
FOREIGN KEY ("user_id_registration") REFERENCES "tbl_usuarios"("id")
ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ============================================
-- 5. CREAR TABLA tbl_configuracion_tipos_paquete
-- ============================================
CREATE TABLE IF NOT EXISTS "tbl_configuracion_tipos_paquete" (
    "id" SERIAL NOT NULL,
    "tipo_paquete" VARCHAR(50) NOT NULL,
    "talla" VARCHAR(30),
    "nombre_display" VARCHAR(100) NOT NULL,
    "alto_default" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "ancho_default" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "largo_default" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "activo" BOOLEAN DEFAULT true,
    "orden" INTEGER DEFAULT 0,
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),
    CONSTRAINT "tbl_configuracion_tipos_paquete_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tbl_configuracion_tipos_paquete_tipo_paquete_talla_key" ON "tbl_configuracion_tipos_paquete"("tipo_paquete", "talla");
CREATE INDEX IF NOT EXISTS "idx_config_tipos_paquete_activo" ON "tbl_configuracion_tipos_paquete"("activo", "orden");

-- ============================================
-- 6. MODIFICAR TABLA tbl_rutas - Agregar id_tipo_carro
-- ============================================
-- Primero insertar un tipo de carro por defecto si no existe
INSERT INTO "tbl_tipos_carro" ("id", "nombre", "descripcion", "estado")
VALUES (1, 'Bus Estándar', 'Tipo de carro por defecto', 1)
ON CONFLICT DO NOTHING;

-- Agregar columna id_tipo_carro
ALTER TABLE "tbl_rutas" ADD COLUMN IF NOT EXISTS "id_tipo_carro" INTEGER;

-- Asignar valor por defecto a registros existentes
UPDATE "tbl_rutas" SET "id_tipo_carro" = 1 WHERE "id_tipo_carro" IS NULL;

-- Hacer la columna NOT NULL después de asignar valores
ALTER TABLE "tbl_rutas" ALTER COLUMN "id_tipo_carro" SET NOT NULL;

-- Agregar foreign key
ALTER TABLE "tbl_rutas"
ADD CONSTRAINT "fk_ruta_tipo_carro"
FOREIGN KEY ("id_tipo_carro") REFERENCES "tbl_tipos_carro"("id")
ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Crear índice
CREATE INDEX IF NOT EXISTS "idx_rutas_tipo_carro" ON "tbl_rutas"("id_tipo_carro");

-- Eliminar el constraint único anterior si existe
ALTER TABLE "tbl_rutas" DROP CONSTRAINT IF EXISTS "tbl_rutas_id_punto_origen_id_punto_destino_key";

-- Crear nuevo constraint único que incluye tipo_carro
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tbl_rutas_origen_destino_tipo_key'
    ) THEN
        ALTER TABLE "tbl_rutas" ADD CONSTRAINT "tbl_rutas_origen_destino_tipo_key"
        UNIQUE ("id_punto_origen", "id_punto_destino", "id_tipo_carro");
    END IF;
END $$;

-- ============================================
-- 7. MODIFICAR TABLA tbl_pasajeros
-- ============================================
ALTER TABLE "tbl_pasajeros" ADD COLUMN IF NOT EXISTS "tipo_documento" VARCHAR(1) DEFAULT '1';
CREATE INDEX IF NOT EXISTS "idx_pasajeros_tipo_documento" ON "tbl_pasajeros"("tipo_documento");

-- ============================================
-- 8. MODIFICAR TABLA tbl_tickets
-- ============================================
ALTER TABLE "tbl_tickets" ADD COLUMN IF NOT EXISTS "id_nota_venta" INTEGER;
ALTER TABLE "tbl_tickets" ADD COLUMN IF NOT EXISTS "comentario" VARCHAR(500);

-- AddForeignKey para nota_venta en tickets
ALTER TABLE "tbl_tickets"
ADD CONSTRAINT "fk_tickets_nota_venta"
FOREIGN KEY ("id_nota_venta") REFERENCES "tbl_notas_venta"("id")
ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ============================================
-- 9. MODIFICAR TABLA tbl_encomiendas
-- ============================================
ALTER TABLE "tbl_encomiendas" ADD COLUMN IF NOT EXISTS "id_nota_venta" INTEGER;
ALTER TABLE "tbl_encomiendas" ADD COLUMN IF NOT EXISTS "destinatario_dni" VARCHAR(20);
ALTER TABLE "tbl_encomiendas" ADD COLUMN IF NOT EXISTS "pago_al_recojo" BOOLEAN DEFAULT false;
ALTER TABLE "tbl_encomiendas" ADD COLUMN IF NOT EXISTS "clave_seguridad" VARCHAR(4);
ALTER TABLE "tbl_encomiendas" ADD COLUMN IF NOT EXISTS "tipo_comprobante_pendiente" VARCHAR(15);
ALTER TABLE "tbl_encomiendas" ADD COLUMN IF NOT EXISTS "datos_factura_pendiente" JSONB;
ALTER TABLE "tbl_encomiendas" ADD COLUMN IF NOT EXISTS "comentario" VARCHAR(500);

-- AddForeignKey para nota_venta en encomiendas
ALTER TABLE "tbl_encomiendas"
ADD CONSTRAINT "fk_encomiendas_nota_venta"
FOREIGN KEY ("id_nota_venta") REFERENCES "tbl_notas_venta"("id")
ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ============================================
-- 10. MODIFICAR TABLA tbl_eventos_encomienda
-- ============================================
ALTER TABLE "tbl_eventos_encomienda" ADD COLUMN IF NOT EXISTS "foto_evidencia_path" VARCHAR(500);

-- ============================================
-- 11. MODIFICAR TABLA tbl_configuracion_sistema
-- ============================================
-- politicas_encomienda ya fue agregado en migración anterior, pero lo validamos
ALTER TABLE "tbl_configuracion_sistema" ADD COLUMN IF NOT EXISTS "politicas_encomienda" TEXT;
ALTER TABLE "tbl_configuracion_sistema" ADD COLUMN IF NOT EXISTS "slogan" VARCHAR(200) DEFAULT 'Viaja seguro, envía confiado';
ALTER TABLE "tbl_configuracion_sistema" ADD COLUMN IF NOT EXISTS "email_contacto" VARCHAR(100);
ALTER TABLE "tbl_configuracion_sistema" ADD COLUMN IF NOT EXISTS "whatsapp" VARCHAR(20);
ALTER TABLE "tbl_configuracion_sistema" ADD COLUMN IF NOT EXISTS "facebook_url" VARCHAR(200);
ALTER TABLE "tbl_configuracion_sistema" ADD COLUMN IF NOT EXISTS "instagram_url" VARCHAR(200);
ALTER TABLE "tbl_configuracion_sistema" ADD COLUMN IF NOT EXISTS "youtube_url" VARCHAR(200);
ALTER TABLE "tbl_configuracion_sistema" ADD COLUMN IF NOT EXISTS "tiempo_rotacion_banner" INTEGER DEFAULT 5;

-- ============================================
-- 12. MODIFICAR TABLA tbl_comprobantes
-- ============================================
ALTER TABLE "tbl_comprobantes" ADD COLUMN IF NOT EXISTS "comentario" VARCHAR(500);

-- Ajustar tipos de timestamp a TIMESTAMPTZ si es necesario
ALTER TABLE "tbl_comprobantes"
ALTER COLUMN "fecha_anulacion" TYPE TIMESTAMPTZ(6) USING "fecha_anulacion"::TIMESTAMPTZ(6);

ALTER TABLE "tbl_comprobantes"
ALTER COLUMN "date_time_registration" TYPE TIMESTAMPTZ(6) USING "date_time_registration"::TIMESTAMPTZ(6);

ALTER TABLE "tbl_comprobantes"
ALTER COLUMN "date_time_modification" TYPE TIMESTAMPTZ(6) USING "date_time_modification"::TIMESTAMPTZ(6);

-- ============================================
-- 13. MODIFICAR TABLA tbl_guias_remision
-- ============================================
ALTER TABLE "tbl_guias_remision" ADD COLUMN IF NOT EXISTS "transporte_tipo" VARCHAR(2) DEFAULT '01';

-- Cambiar valor por defecto de serie a TZ74
ALTER TABLE "tbl_guias_remision" ALTER COLUMN "serie" SET DEFAULT 'TZ74';

-- Ajustar tipos de timestamp a TIMESTAMPTZ
ALTER TABLE "tbl_guias_remision"
ALTER COLUMN "fecha_anulacion" TYPE TIMESTAMPTZ(6) USING "fecha_anulacion"::TIMESTAMPTZ(6);

ALTER TABLE "tbl_guias_remision"
ALTER COLUMN "date_time_registration" TYPE TIMESTAMPTZ(6) USING "date_time_registration"::TIMESTAMPTZ(6);

ALTER TABLE "tbl_guias_remision"
ALTER COLUMN "date_time_modification" TYPE TIMESTAMPTZ(6) USING "date_time_modification"::TIMESTAMPTZ(6);

-- ============================================
-- 14. AJUSTES EN tbl_log_keyfacil
-- ============================================
ALTER TABLE "tbl_log_keyfacil"
ALTER COLUMN "fecha_hora" TYPE TIMESTAMPTZ(6) USING "fecha_hora"::TIMESTAMPTZ(6);

-- ============================================
-- 15. AJUSTES EN tbl_configuracion_sunat
-- ============================================
ALTER TABLE "tbl_configuracion_sunat"
ALTER COLUMN "date_time_registration" TYPE TIMESTAMPTZ(6) USING "date_time_registration"::TIMESTAMPTZ(6);

ALTER TABLE "tbl_configuracion_sunat"
ALTER COLUMN "date_time_modification" TYPE TIMESTAMPTZ(6) USING "date_time_modification"::TIMESTAMPTZ(6);

-- ============================================
-- FIN DE LA MIGRACIÓN
-- ============================================
