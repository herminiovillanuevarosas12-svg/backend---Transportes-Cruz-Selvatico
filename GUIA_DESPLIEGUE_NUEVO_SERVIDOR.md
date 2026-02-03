# Guía de Despliegue - Transporte Herminio Backend

## Pre-requisitos

- Node.js >= 18.0.0
- PostgreSQL >= 14
- Acceso al servidor de destino

---

## Opción A: Base de datos NUEVA (sin datos previos)

### Paso 1: Configurar variables de entorno

```bash
# Copiar el archivo de ejemplo
cp .env.example .env

# Editar con los valores de producción
# IMPORTANTE: Cambiar DATABASE_URL con las credenciales del nuevo servidor PostgreSQL
```

### Paso 2: Instalar dependencias

```bash
npm install
```

### Paso 3: Aplicar migraciones

```bash
# Esto aplicará todas las migraciones en orden y generará el cliente Prisma
npx prisma migrate deploy
```

### Paso 4: (Opcional) Ejecutar seed de datos iniciales

```bash
npm run seed
```

### Paso 5: Iniciar aplicación

```bash
npm start
```

---

## Opción B: Base de datos EXISTENTE (sincronizar schema)

Si ya tienes una base de datos con datos que necesita actualizarse al schema actual:

### Paso 1: Hacer BACKUP de seguridad

```bash
# En el servidor PostgreSQL
pg_dump -U usuario -h localhost -d transporte_db > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Paso 2: Aplicar migración de sincronización

```bash
# Ejecutar la migración manualmente via psql
psql -U usuario -h localhost -d transporte_db -f prisma/migrations/20260203_sync_schema_completo/migration.sql
```

### Paso 3: Marcar migraciones como aplicadas

```bash
npx prisma migrate resolve --applied 20260118221515_migracion
npx prisma migrate resolve --applied 20260128_add_politicas_encomienda
npx prisma migrate resolve --applied 20260203_sync_schema_completo
```

### Paso 4: Regenerar cliente Prisma

```bash
npx prisma generate
```

---

## Verificación Post-Despliegue

```bash
# Verificar que el schema está sincronizado
npx prisma db pull --print

# O usar Prisma Studio para inspeccionar
npx prisma studio
```

---

## Orden de Migraciones

| # | Migración | Descripción |
|---|-----------|-------------|
| 1 | `20260118221515_migracion` | Schema inicial completo |
| 2 | `20260128_add_politicas_encomienda` | Campo políticas de encomienda |
| 3 | `20260203_sync_schema_completo` | Sincronización con schema.prisma actual |

---

## Tablas Nuevas en migración de sincronización

- `tbl_tipos_carro` - Tipos de vehículo
- `tbl_notas_venta` - Notas de venta internas
- `tbl_cache_consulta_doc` - Cache de consultas DNI/RUC
- `tbl_landing_banners` - Banners para landing page
- `tbl_configuracion_tipos_paquete` - Configuración de tipos de paquete

---

## Campos Nuevos Agregados

### tbl_rutas
- `id_tipo_carro` (FK a tbl_tipos_carro)

### tbl_pasajeros
- `tipo_documento`

### tbl_tickets
- `id_nota_venta` (FK)
- `comentario`

### tbl_encomiendas
- `id_nota_venta` (FK)
- `destinatario_dni`
- `pago_al_recojo`
- `clave_seguridad`
- `tipo_comprobante_pendiente`
- `datos_factura_pendiente`
- `comentario`

### tbl_eventos_encomienda
- `foto_evidencia_path`

### tbl_configuracion_sistema
- `slogan`
- `email_contacto`
- `whatsapp`
- `facebook_url`
- `instagram_url`
- `youtube_url`
- `tiempo_rotacion_banner`

### tbl_comprobantes
- `comentario`

### tbl_guias_remision
- `transporte_tipo`

---

## Troubleshooting

### Error: "Migration not found in prisma/migrations"

```bash
# Crear la carpeta de migración si no existe
mkdir -p prisma/migrations/20260203_sync_schema_completo
```

### Error: "Foreign key constraint violation"

Asegurarse de que existe al menos un registro en `tbl_tipos_carro` antes de actualizar `tbl_rutas`.

### Error de permisos en PostgreSQL

```sql
-- Otorgar permisos completos al usuario
GRANT ALL PRIVILEGES ON DATABASE transporte_db TO usuario;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO usuario;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO usuario;
```
