-- Agregar campo politicas_encomienda a la tabla de configuracion del sistema
ALTER TABLE tbl_configuracion_sistema
ADD COLUMN IF NOT EXISTS politicas_encomienda TEXT;

-- Insertar politicas por defecto en la configuracion activa
UPDATE tbl_configuracion_sistema
SET politicas_encomienda = 'El remitente será responsable de la veracidad de los datos brindados.
La empresa no se responsabiliza por deterioro debido al mal embalado ni por descomposición de artículos susceptibles.
Plazo para retirar su encomienda: 48 horas desde que llegó. Caso contrario será evacuado al almacén por 15 días (si es perecible 3 días). Se dará por abandono y será desechable sin lugar a reclamo.
Todo producto ilegal o prohibido será puesto a disposición de las autoridades competentes.
El pago por pérdida de un envío se hará de acuerdo a la ley de ferrocarriles (art. 8): diez veces el valor del flete pagado.
La clave de seguridad es personal y privada para el recojo de sus envíos.
Recibido sin verificación de contenido.'
WHERE activo = true AND politicas_encomienda IS NULL;
