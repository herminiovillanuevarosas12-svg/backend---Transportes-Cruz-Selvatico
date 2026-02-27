-- Migración de sincronización completa para desarrollo local
-- Fecha: 2026-02-25
-- Propósito: Agregar columnas y tablas que fueron creadas directamente en Railway

-- ============================================
-- 1. COLUMNAS FALTANTES EN tbl_configuracion_sistema
-- ============================================
ALTER TABLE "tbl_configuracion_sistema" ADD COLUMN IF NOT EXISTS "imagen_experiencia" VARCHAR(500);
ALTER TABLE "tbl_configuracion_sistema" ADD COLUMN IF NOT EXISTS "experiencia_titulo" VARCHAR(200);
ALTER TABLE "tbl_configuracion_sistema" ADD COLUMN IF NOT EXISTS "experiencia_descripcion" TEXT;
ALTER TABLE "tbl_configuracion_sistema" ADD COLUMN IF NOT EXISTS "experiencia_badge_numero" VARCHAR(20);
ALTER TABLE "tbl_configuracion_sistema" ADD COLUMN IF NOT EXISTS "experiencia_badge_texto" VARCHAR(100);
ALTER TABLE "tbl_configuracion_sistema" ADD COLUMN IF NOT EXISTS "experiencia_features" TEXT;
ALTER TABLE "tbl_configuracion_sistema" ADD COLUMN IF NOT EXISTS "tiktok_url" VARCHAR(255);

-- ============================================
-- 2. CREAR TABLA tbl_precios_base_encomienda
-- ============================================
CREATE TABLE IF NOT EXISTS "tbl_precios_base_encomienda" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),
    CONSTRAINT "tbl_precios_base_encomienda_pkey" PRIMARY KEY ("id")
);

-- ============================================
-- 3. COLUMNA id_precio_base EN tbl_encomiendas
-- ============================================
ALTER TABLE "tbl_encomiendas" ADD COLUMN IF NOT EXISTS "id_precio_base" INTEGER;

ALTER TABLE "tbl_encomiendas"
ADD CONSTRAINT "fk_encomienda_precio_base"
FOREIGN KEY ("id_precio_base") REFERENCES "tbl_precios_base_encomienda"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================
-- 4. CREAR TABLA tbl_festividades
-- ============================================
CREATE TABLE IF NOT EXISTS "tbl_festividades" (
    "id" SERIAL NOT NULL,
    "id_punto" INTEGER NOT NULL,
    "titulo" VARCHAR(200) NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER DEFAULT 0,
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),
    CONSTRAINT "tbl_festividades_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_festividades_activo" ON "tbl_festividades"("activo", "orden");
CREATE INDEX IF NOT EXISTS "idx_festividades_punto" ON "tbl_festividades"("id_punto");

ALTER TABLE "tbl_festividades"
ADD CONSTRAINT "tbl_festividades_id_punto_fkey"
FOREIGN KEY ("id_punto") REFERENCES "tbl_puntos"("id")
ON DELETE CASCADE ON UPDATE NO ACTION;

-- ============================================
-- 5. CREAR TABLA tbl_landing_servicios
-- ============================================
CREATE TABLE IF NOT EXISTS "tbl_landing_servicios" (
    "id" SERIAL NOT NULL,
    "clave" VARCHAR(50) NOT NULL,
    "titulo" VARCHAR(200) NOT NULL,
    "descripcion" TEXT NOT NULL,
    "features" TEXT NOT NULL,
    "cta_texto" VARCHAR(100) NOT NULL,
    "cta_link" VARCHAR(200) NOT NULL,
    "orden" INTEGER DEFAULT 0,
    "activo" BOOLEAN DEFAULT true,
    CONSTRAINT "tbl_landing_servicios_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tbl_landing_servicios_clave_key" ON "tbl_landing_servicios"("clave");

-- ============================================
-- 6. CREAR TABLA tbl_festividades_imagenes
-- ============================================
CREATE TABLE IF NOT EXISTS "tbl_festividades_imagenes" (
    "id" SERIAL NOT NULL,
    "id_festividad" INTEGER NOT NULL,
    "imagen_path" VARCHAR(500) NOT NULL,
    "orden" INTEGER DEFAULT 0,
    "date_time_registration" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tbl_festividades_imagenes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_fest_img_festividad" ON "tbl_festividades_imagenes"("id_festividad", "orden");

ALTER TABLE "tbl_festividades_imagenes"
ADD CONSTRAINT "tbl_festividades_imagenes_id_festividad_fkey"
FOREIGN KEY ("id_festividad") REFERENCES "tbl_festividades"("id")
ON DELETE CASCADE ON UPDATE NO ACTION;

-- ============================================
-- FIN DE LA MIGRACIÓN
-- ============================================
